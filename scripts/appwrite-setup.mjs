#!/usr/bin/env node
/**
 * Provision the Appwrite backend.
 *
 *   node scripts/appwrite-setup.mjs
 *
 * Creates the database, the two tables, their indexes, and the function.
 * It is idempotent: anything that already exists is left alone, so it is
 * safe to re-run after a partial failure.
 *
 * It needs an Appwrite session and a project. Sign in with:
 *
 *   appwrite login
 *   appwrite client --endpoint <ENDPOINT> --project-id <ID> --key <KEY>
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DATABASE_ID = "esim_subscriptions";
const PROJECT_ID = "6ad9062200163d93497b";

/** The site's own host, registered as a web platform so a browser can call the API. */
const SITE_HOST = "youssef-benatti.me";
const SUBSCRIBERS_TABLE = "subscribers";
const WATCHLIST_TABLE = "watchlist";
const FUNCTION_ID = "premium-api";

/** Run an appwrite CLI command. */
function aw(args, { tolerateFailure = false } = {}) {
  console.log(`  $ appwrite ${args.join(" ")}`);
  try {
    const out = execFileSync("appwrite", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (out.trim()) console.log(out.trim().split("\n").map((l) => `    ${l}`).join("\n"));
    return { ok: true, out };
  } catch (err) {
    const message = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    if (tolerateFailure) {
      console.log(`    (skipped: ${message.split("\n")[0]})`);
      return { ok: false, out: message };
    }
    console.error(message);
    throw err;
  }
}

/**
 * Build the `--columns` arguments.
 *
 * The CLI's `--columns` is a stringArray, so each column is its own
 * argument holding one JSON object - NOT one argument holding an array.
 */
function columnArgs(columns) {
  return columns.flatMap((column) => ["--columns", JSON.stringify(column)]);
}

console.log("PROVISIONING THE APPWRITE BACKEND\n");

// ---- the database ----
console.log("1. the database");
aw(["tablesdb", "create", "--database-id", DATABASE_ID, "--name", "eSIM Subscriptions"], {
  tolerateFailure: true,
});

// ---- the subscribers table ----
console.log("\n2. the subscribers table");
aw(
  [
    "tablesdb",
    "create-table",
    "--database-id",
    DATABASE_ID,
    "--table-id",
    SUBSCRIBERS_TABLE,
    "--name",
    "Subscribers",
    ...columnArgs([
      { key: "userId", type: "string", size: 64, required: true },
      { key: "plan", type: "string", size: 16, required: true },
      { key: "status", type: "string", size: 32, required: true },
      { key: "stripeCustomerId", type: "string", size: 64, required: false },
      { key: "stripeSubscriptionId", type: "string", size: 64, required: false },
      { key: "email", type: "string", size: 128, required: false },
      { key: "currentPeriodEnd", type: "datetime", required: false },
    ]),
    // No table-level permissions: only the function's API key may read or
    // write. The client never touches the database directly.
    "--permissions",
    "[]",
  ],
  { tolerateFailure: true }
);

aw(
  [
    "tablesdb",
    "create-index",
    "--database-id",
    DATABASE_ID,
    "--table-id",
    SUBSCRIBERS_TABLE,
    "--key",
    "userId_unique",
    "--type",
    "unique",
    "--columns",
    "userId",
  ],
  { tolerateFailure: true }
);

aw(
  [
    "tablesdb",
    "create-index",
    "--database-id",
    DATABASE_ID,
    "--table-id",
    SUBSCRIBERS_TABLE,
    "--key",
    "stripeCustomerId_idx",
    "--type",
    "key",
    "--columns",
    "stripeCustomerId",
  ],
  { tolerateFailure: true }
);

// ---- the watchlist table ----
console.log("\n3. the watchlist table");
aw(
  [
    "tablesdb",
    "create-table",
    "--database-id",
    DATABASE_ID,
    "--table-id",
    WATCHLIST_TABLE,
    "--name",
    "Watchlist",
    ...columnArgs([
      { key: "userId", type: "string", size: 64, required: true },
      { key: "destination", type: "string", size: 8, required: true },
    ]),
    "--permissions",
    "[]",
  ],
  { tolerateFailure: true }
);

aw(
  [
    "tablesdb",
    "create-index",
    "--database-id",
    DATABASE_ID,
    "--table-id",
    WATCHLIST_TABLE,
    "--key",
    "user_destination_unique",
    "--type",
    "unique",
    "--columns",
    "userId,destination",
  ],
  { tolerateFailure: true }
);

// ---- the function ----
console.log("\n4. the function");
aw(
  [
    "functions",
    "create",
    "--function-id",
    FUNCTION_ID,
    "--name",
    "Premium API",
    "--runtime",
    "node-22",
    "--entrypoint",
    "src/main.js",
    "--commands",
    "npm install",
    // The function checks the caller's session ITSELF and refuses anyone
    // without a valid subscription, so it has to be executable by any
    // signed-in user. Without this, Appwrite answers "No permissions
    // provided for action 'execute'" before the code ever runs.
    "--execute",
    "any",
  ],
  { tolerateFailure: true }
);

// `create` is skipped when the function already exists, so the execute
// permission is (re)applied separately - otherwise an existing function
// keeps whatever it was created with. `update` requires the name.
aw(
  [
    "functions",
    "update",
    "--function-id",
    FUNCTION_ID,
    "--name",
    "Premium API",
    "--execute",
    "any",
  ],
  { tolerateFailure: true }
);

// ---- the web platform ----
// A browser can only call the API if the site's origin is registered.
// Without it Appwrite answers "Invalid Origin" and the site cannot sign
// in at all.
console.log("\n5. the web platform");
aw(
  [
    "project",
    "create-web-platform",
    "--project-id",
    PROJECT_ID,
    "--platform-id",
    "esim-site",
    "--name",
    "eSIM Price Truth",
    "--hostname",
    SITE_HOST,
  ],
  { tolerateFailure: true }
);

console.log("\n5. the function's variables");
const variables = [
  ["SUBSCRIBERS_DATABASE_ID", DATABASE_ID],
  ["SUBSCRIBERS_TABLE_ID", SUBSCRIBERS_TABLE],
  ["WATCHLIST_TABLE_ID", WATCHLIST_TABLE],
  ["PUBLIC_SITE_URL", "https://youssef-benatti.me"],
  ["STRIPE_PRICE_PRO", "price_replace_me"],
  ["STRIPE_PRICE_TEAM", "price_replace_me"],
];

for (const [key, value] of variables) {
  aw(
    [
      "functions",
      "create-variable",
      "--function-id",
      FUNCTION_ID,
      "--variable-id",
      `var_${key.toLowerCase()}`,
      "--key",
      key,
      "--value",
      value,
    ],
    { tolerateFailure: true }
  );
}

console.log(
  "\nDone.\n\n" +
    "Next, set the secrets (these are NOT set by this script, because a\n" +
    "secret can only be created once and can never be read back):\n\n" +
    "  appwrite functions create-variable --function-id premium-api \\\n" +
    "    --variable-key ENTITLEMENT_SECRET --variable-value <random> --secret\n" +
    "  appwrite functions create-variable --function-id premium-api \\\n" +
    "    --variable-key STRIPE_SECRET_KEY --variable-value sk_live_... --secret\n" +
    "  appwrite functions create-variable --function-id premium-api \\\n" +
    "    --variable-key STRIPE_WEBHOOK_SECRET --variable-value whsec_... --secret\n\n" +
    "Then build and deploy:\n\n" +
    "  node scripts/build-appwrite-function.mjs\n" +
    "  node scripts/appwrite-deploy.mjs\n"
);
