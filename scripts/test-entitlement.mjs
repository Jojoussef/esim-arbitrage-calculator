#!/usr/bin/env node
/**
 * Entitlement tests.
 *
 *   node scripts/test-entitlement.mjs
 *
 * The paywall is the only thing standing between the public and the paid
 * data, so it gets real tests: valid tokens, tampered tokens, expired
 * tokens, wrong plans, and the feature matrix.
 */

import {
  signEntitlement,
  verifyEntitlement,
  planHasFeature,
  planFeatures,
  parseCookies,
  checkEntitlement,
} from "./lib/entitlement.mjs";

const SECRET = "test-secret-not-a-real-one";
let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

console.log("ENTITLEMENT TESTS\n");

// ---- signing and verification ----
const future = Date.now() + 86_400_000;
const token = signEntitlement("pro", future, SECRET, "sub_123");
check("a signed token verifies", verifyEntitlement(token, SECRET).ok);
check(
  "the plan is read back",
  verifyEntitlement(token, SECRET).plan === "pro"
);
check(
  "the subscriber id is read back",
  verifyEntitlement(token, SECRET).subscriberId === "sub_123"
);

// ---- tampering ----
const [plan, expires, subscriber, sig] = token.split(".");
check(
  "a tampered plan is rejected",
  !verifyEntitlement(`${plan}x.${expires}.${subscriber}.${sig}`, SECRET).ok
);
check(
  "a tampered expiry is rejected",
  !verifyEntitlement(`${plan}.${Number(expires) + 1}.${subscriber}.${sig}`, SECRET).ok
);
check(
  "a tampered subscriber id is rejected",
  !verifyEntitlement(`${plan}.${expires}.someone_else.${sig}`, SECRET).ok
);
check(
  "a tampered signature is rejected",
  !verifyEntitlement(`${plan}.${expires}.${subscriber}.${sig.slice(0, -2)}xx`, SECRET).ok
);
check(
  "a token signed with another secret is rejected",
  !verifyEntitlement(signEntitlement("pro", future, "other-secret", "sub_123"), SECRET).ok
);
check(
  "a garbage token is rejected",
  !verifyEntitlement("not.a.token", SECRET).ok
);
check("a missing token is rejected", !verifyEntitlement("", SECRET).ok);
check("an undefined token is rejected", !verifyEntitlement(undefined, SECRET).ok);

// ---- expiry ----
const expired = signEntitlement("pro", Date.now() - 1000, SECRET, "sub_123");
const expiredResult = verifyEntitlement(expired, SECRET);
check(
  "an expired token is rejected",
  !expiredResult.ok && expiredResult.reason === "expired",
  expiredResult.reason
);

// ---- the feature matrix ----
check("pro unlocks data_export", planHasFeature("pro", "data_export"));
check("pro unlocks price_alerts", planHasFeature("pro", "price_alerts"));
check("pro does NOT unlock api", !planHasFeature("pro", "api"));
check("team unlocks api", planHasFeature("team", "api"));
check("free unlocks nothing", !planHasFeature("free", "data_export"));
check(
  "planFeatures(pro) contains data_export",
  planFeatures("pro").includes("data_export")
);
check(
  "planFeatures(free) is empty",
  planFeatures("free").length === 0
);

// ---- cookie parsing ----
const cookies = parseCookies("a=1; esim_sub=abc.def.ghi; other=hello%20world");
check("cookies parse", cookies.a === "1" && cookies.esim_sub === "abc.def.ghi");
check("cookie values are url-decoded", cookies.other === "hello world");
check("a missing cookie header is empty", Object.keys(parseCookies("")).length === 0);

// ---- revocation ----
const revoked = await checkEntitlement(token, {
  secret: SECRET,
  revoked: async () => true,
});
check(
  "a revoked subscriber is rejected even with a valid token",
  !revoked.ok && revoked.reason === "revoked",
  revoked.reason
);

const notRevoked = await checkEntitlement(token, {
  secret: SECRET,
  revoked: async () => false,
});
check("a non-revoked subscriber is allowed", notRevoked.ok);

// ---- the two copies of the scheme must not drift ----
// The canonical copy is scripts/lib/entitlement.mjs; the function has its
// own copy because it is deployed as a separate bundle. If they ever
// disagree, a signed token would verify in one place and not the other.
{
  const canonical = await import("./lib/entitlement.mjs");
  const functionCopy = await import(
    "../appwrite/functions/premium-api/src/entitlement.js"
  );

  const token = canonical.signEntitlement(
    "pro",
    Date.now() + 86_400_000,
    SECRET,
    "sub_drift"
  );

  check(
    "the function accepts a token signed by the canonical module",
    functionCopy.verifyEntitlement(token, SECRET).ok
  );

  const canonicalToken = functionCopy.signEntitlement(
    "team",
    Date.now() + 86_400_000,
    SECRET,
    "sub_drift"
  );
  check(
    "the canonical module accepts a token signed by the function",
    canonical.verifyEntitlement(canonicalToken, SECRET).ok
  );

  check(
    "both copies have the same feature matrix",
    JSON.stringify(canonical.FEATURES) === JSON.stringify(functionCopy.FEATURES),
    `${JSON.stringify(canonical.FEATURES)} vs ${JSON.stringify(functionCopy.FEATURES)}`
  );

  for (const plan of ["free", "pro", "team"]) {
    for (const feature of Object.keys(canonical.FEATURES)) {
      check(
        `both copies agree: ${plan} / ${feature}`,
        canonical.planHasFeature(plan, feature) ===
          functionCopy.planHasFeature(plan, feature)
      );
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
