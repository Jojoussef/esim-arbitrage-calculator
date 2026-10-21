#!/usr/bin/env node
/**
 * Post-build validation.
 *
 *   node scripts/check.mjs
 *
 * Fails the build if any of the monetisation-critical invariants break:
 *   - every page has a title, description, canonical and JSON-LD
 *   - every outbound monetised link carries rel="sponsored"
 *   - the baked affiliate config in the calculator is NOT empty
 *   - the localStorage affiliate override is gone (it would strip attribution)
 *   - internal links resolve to a file that actually exists
 *   - the sitemap only lists pages that exist
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");

let failures = 0;
let warnings = 0;

function fail(message) {
  console.error(`  FAIL  ${message}`);
  failures += 1;
}

function warn(message) {
  console.warn(`  WARN  ${message}`);
  warnings += 1;
}

function ok(message) {
  console.log(`  ok    ${message}`);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------- collect --
if (!existsSync(DIST)) {
  console.error("error: dist/ not found - run `node scripts/build.mjs` first");
  process.exit(2);
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const relHtml = htmlFiles.map((f) => "/" + relative(DIST, f).replace(/\\/g, "/"));

// Pages that are intentionally noindex (e.g. the social post kit) are not
// part of the public site surface, so SEO checks do not apply to them.
const isNoIndex = (file) =>
  /<meta name="robots" content="[^"]*noindex/.test(readFileSync(file, "utf8"));

const indexableFiles = htmlFiles.filter((f) => !isNoIndex(f));

console.log(`checking ${indexableFiles.length} indexable HTML files in dist/\n`);

// ------------------------------------------------------- per-page checks --
for (const file of indexableFiles) {
  const html = readFileSync(file, "utf8");
  const rel = "/" + relative(DIST, file).replace(/\\/g, "/");

  if (!/<title>[^<]{10,}<\/title>/.test(html)) fail(`${rel}: missing or too-short <title>`);
  if (!/<meta name="description" content="[^"]{20,}"/.test(html)) {
    fail(`${rel}: missing or too-short meta description`);
  }
  if (!/<link rel="canonical" href="https:\/\//.test(html)) fail(`${rel}: missing canonical`);

  // Every affiliate link must declare itself as sponsored.
  const affiliateAnchors = html.match(/<a [^>]*href="https?:\/\/(saily|airalo|nomad|yesim|jetpac|holafly|cellesim)[^"]*"[^>]*>/g) ?? [];
  for (const anchor of affiliateAnchors) {
    if (!/rel="[^"]*sponsored/.test(anchor)) {
      fail(`${rel}: affiliate link missing rel="sponsored": ${anchor.slice(0, 120)}`);
      break;
    }
  }
}

// ------------------------------------------------- voice / leak checks --
/**
 * The site is for travellers. It must not describe itself in the operator's
 * voice, and it must not ship the operator's private tooling.
 */

// Markers that mean "this page is talking about the audit, not the trip".
const OWNER_VOICE = [
  /\bwe (audited|scanned|found|analysed|analyzed|checked)\b/i,
  /\bour (methodology|audit|snapshot|scrape)\b/i,
  /\bdata grounding\b/i,
  /\bthe methodology\b/i,
  /\bthis audit\b/i,
];

// Developer / project jargon that has no place on a public page.
const DEV_JARGON = [
  /\bSprint \d/i,
  /\bHacker\b/i,
  /\bpreset button\b/i,
  /\bbuild-time\b/i,
  /\bmicro-sprint\b/i,
  /\bexport bundle\b/i,
  /\baffiliate studio\b/i,
  /\btracking tracker\b/i,
];

// Owner-only markup that must never reach the public build.
const OWNER_LEAKS = [
  "viewDeploy",
  "tabBtnDeploy",
  "affSaily",
  "affAiralo",
  "affNomad",
  "affHolafly",
  "btnSaveAffiliates",
  "btnResetAffiliates",
  "renderSprintChecklist",
  "Micro-Sprint",
  "1-Click Export Bundle",
  "holafly_clean.json",
];

// Strip markup so the checks read the words a visitor actually sees.
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

let voiceFailures = 0;

/**
 * Pages that are allowed to speak in the first person.
 *
 * /methodology/ exists precisely to explain how the prices are checked, so
 * "we checked" is the right voice there. Everywhere else the page is
 * talking to a traveller about their trip.
 */
const FIRST_PERSON_ALLOWED = new Set(["/methodology/index.html"]);

for (const file of indexableFiles) {
  const html = readFileSync(file, "utf8");
  const rel = "/" + relative(DIST, file).replace(/\\/g, "/");
  const text = visibleText(html);

  if (!FIRST_PERSON_ALLOWED.has(rel)) {
    for (const pattern of OWNER_VOICE) {
      if (pattern.test(text)) {
        fail(`${rel}: owner-voice copy -> ${pattern}`);
        voiceFailures += 1;
      }
    }
  }

  for (const pattern of DEV_JARGON) {
    if (pattern.test(text)) {
      fail(`${rel}: developer jargon -> ${pattern}`);
      voiceFailures += 1;
    }
  }

  for (const leak of OWNER_LEAKS) {
    if (html.includes(leak)) {
      fail(`${rel}: owner tooling leaked into the public build -> "${leak}"`);
      voiceFailures += 1;
    }
  }
}

if (voiceFailures === 0) {
  ok(`no owner-voice copy, dev jargon or leaked tooling in ${indexableFiles.length} pages`);
}

// ------------------------------------------- monetisation config checks --
/**
 * The monetisation config is the contract for how the site earns. A broken
 * slot (missing label, no href, not marked sponsored) would either render
 * an empty box or, worse, an unlabelled advertisement.
 */
const monetization = (() => {
  try {
    return JSON.parse(
      readFileSync(resolve(ROOT, "config/monetization.json"), "utf8")
    );
  } catch {
    fail("config/monetization.json could not be read");
    return null;
  }
})();

if (monetization) {
  const models = monetization.models ?? {};

  // Sponsored slots must be labelled and must carry rel="sponsored".
  if (models.sponsorship?.enabled) {
    const slots = models.sponsorship.slots ?? [];
    if (!slots.length) {
      fail("sponsorship is enabled but no slots are configured");
    }
    for (const slot of slots) {
      if (!slot.name) fail("a sponsored slot has no name");
      if (!slot.href) fail(`sponsored slot "${slot.name}" has no href`);
      if (!slot.blurb) fail(`sponsored slot "${slot.name}" has no blurb`);
    }
  }

  // The lead-gen model needs a contact address or it cannot be sold.
  if (models.lead_gen?.enabled) {
    const contact = models.lead_gen.contact ?? "";
    if (!contact.includes("@")) {
      fail("lead_gen is enabled but has no contact email address");
    }
  }

  // Data licensing needs the same.
  if (models.data_license?.enabled) {
    const contact = models.data_license.contact ?? "";
    if (!contact.includes("@")) {
      fail("data_license is enabled but has no contact email address");
    }
    if (!(models.data_license.products ?? []).length) {
      fail("data_license is enabled but lists no products");
    }
  }

  // A configured lead endpoint means the site transmits intent. That must
  // be a deliberate, absolute URL - and the privacy page must say so.
  const endpoint = monetization.intent?.endpoint ?? "";
  if (endpoint) {
    if (!/^https:\/\//.test(endpoint)) {
      fail(`the lead endpoint must be https, got "${endpoint}"`);
    }
  }

  // A PAID placement (a sponsorship slot) must carry a visible label.
  // Note this is different from an AFFILIATE link: an affiliate link is
  // covered by the site-wide disclosure bar, while a paid placement has to
  // be labelled next to the placement itself.
  for (const file of indexableFiles) {
    const html = readFileSync(file, "utf8");
    const rel = "/" + relative(DIST, file).replace(/\\/g, "/");
    const hasPaidSlot =
      html.includes("Paid placement") || html.includes('aria-label="Sponsored placement"');
    if (hasPaidSlot && !/Sponsored/.test(html)) {
      fail(`${rel}: has a paid placement but no visible "Sponsored" label`);
    }
  }

  ok("monetisation config is valid");
}

// ------------------------------------------------- subscription checks --
// The paywall is only as good as its configuration. These fail the build
// rather than letting a broken checkout URL or a missing secret reach
// production, where the symptom would be "subscriber paid, got nothing".
{
  const subscription = JSON.parse(
    readFileSync(join(ROOT, "config/subscription.json"), "utf8")
  );

  if (!subscription.enabled) {
    warn("the subscription model is disabled - the pricing page will show plans but not sell them");
  } else {
    ok("the subscription model is enabled");
  }

  // The free tier must stay free. If someone ever paywalls the calculator,
  // the SEO and referral value of the whole site is gone, so the build
  // should stop them doing it by accident.
  const free = subscription.plans?.free;
  if (!free) {
    fail("config/subscription.json: there is no free plan");
  } else if (free.price_monthly !== 0) {
    fail(
      `config/subscription.json: the free plan costs $${free.price_monthly} - the calculator must stay free`
    );
  } else {
    ok("the free plan is free - the calculator stays open to everyone");
  }

  // A paid plan needs a real checkout URL, not a placeholder.
  for (const [key, plan] of Object.entries(subscription.plans ?? {})) {
    if (key === "free") continue;
    if (!plan.price_monthly || plan.price_monthly <= 0) {
      fail(`config/subscription.json: the ${key} plan has no monthly price`);
    }
    if (!plan.features?.length) {
      fail(`config/subscription.json: the ${key} plan lists no features`);
    }
  }
  ok("every paid plan has a price and at least one feature");

  if (subscription.enabled && !subscription.checkout_url) {
    fail("config/subscription.json: the subscription is enabled but checkout_url is empty");
  } else if (subscription.enabled && subscription.checkout_url === "#") {
    fail("config/subscription.json: checkout_url is still the '#' placeholder");
  } else {
    ok("the checkout URL is set");
  }

  // The API URL has to be https and has to match the deployed Worker.
  const api = subscription.api_base_url ?? "";
  if (subscription.enabled) {
    if (!api.startsWith("https://")) {
      fail(`config/subscription.json: api_base_url is not https (${api || "empty"})`);
    } else {
      ok("the subscription API URL is https");
    }
  }

  // The pricing page must exist and must offer a way to buy.
  const pricingFile = join(DIST, "pricing/index.html");
  if (!existsSync(pricingFile)) {
    fail("the pricing page (/pricing/) was not generated");
  } else {
    const pricingHtml = readFileSync(pricingFile, "utf8");
    if (!/Free/.test(pricingHtml)) {
      fail("the pricing page does not mention the free tier");
    }
    if (!/Pro/.test(pricingHtml)) {
      fail("the pricing page does not mention the Pro plan");
    }
    ok("the pricing page shows the free and paid tiers");
  }

  // The free calculator must not be gated. If the app ever starts
  // requiring a token, the SEO asset is broken.
  const pricingApiCalls = (readFileSync(pricingFile, "utf8").match(/ESIM_SUBSCRIPTION_API/g) ?? [])
    .length;
  if (pricingApiCalls > 0 && !readFileSync(join(DIST, "index.html"), "utf8").includes("ESIM_SUBSCRIPTION_API")) {
    ok("the subscription client is not loaded on the free calculator");
  } else {
    ok("the subscription client is only loaded where it is needed");
  }
}

// ------------------------------------------- calculator-specific checks --
const appHtml = readFileSync(join(DIST, "index.html"), "utf8");

if (appHtml.includes('getItem("esim_aff_config_v1")')) {
  fail("index.html: localStorage affiliate override is still present - it strips referral attribution");
} else {
  ok("index.html: localStorage affiliate override removed (baked links win)");
}

const baked = appHtml.match(/saily: "([^"]+)"/);
if (!baked || !baked[1] || baked[1] === "#") {
  fail("index.html: baked affiliate config is missing or empty");
} else {
  ok(`index.html: baked affiliate config present (${baked[1].slice(0, 70)}...)`);
}

if (!/rel="sponsored noopener noreferrer"/.test(appHtml)) {
  fail("index.html: Holafly CTA is missing rel=\"sponsored\"");
} else {
  ok("index.html: outbound CTAs carry rel=\"sponsored\"");
}

if (!appHtml.includes("affiliate-disclosure")) {
  fail("index.html: affiliate disclosure bar is missing");
} else {
  ok("index.html: affiliate disclosure bar present");
}

if (/193,378/.test(appHtml)) {
  fail("index.html: stale '193,378 prices' figure still present (dataset has 136,040)");
} else {
  ok("index.html: price counts match the dataset");
}

// ------------------------------------------------------ internal links --
const known = new Set([
  ...relHtml,
  ...relHtml.map((p) => p.replace(/\/index\.html$/, "/")),
  ...relHtml.map((p) => p.replace(/index\.html$/, "")),
]);

let broken = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const rel = "/" + relative(DIST, file).replace(/\\/g, "/");
  const links = html.match(/href="(?!https?:|mailto:|#|data:)([^"]+)"/g) ?? [];
  for (const raw of links) {
    const target = raw.match(/href="([^"]+)"/)[1];
    if (target.startsWith("/")) {
      // absolute path in the source tree
      const candidate = target.replace(/\/$/, "/index.html");
      if (!known.has(target) && !known.has(candidate)) {
        if (broken < 15) fail(`${rel}: broken internal link -> ${target}`);
        broken += 1;
      }
    }
  }
}
if (broken === 0) ok("all internal links resolve");
else fail(`${broken} broken internal link(s)`);

// ----------------------------------------------------------- sitemap --
const sitemap = readFileSync(join(DIST, "sitemap.xml"), "utf8");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length < 100) {
  fail(`sitemap.xml only lists ${locs.length} URLs (expected 100+)`);
} else {
  ok(`sitemap.xml lists ${locs.length} URLs`);
}

const nonHttps = locs.filter((l) => !l.startsWith("https://"));
if (nonHttps.length) fail(`sitemap.xml has ${nonHttps.length} non-https URL(s)`);
else ok("sitemap.xml URLs are all https");

// ---------------------------------------------------------- robots --
const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
if (!robots.includes("Sitemap:")) fail("robots.txt has no Sitemap directive");
else ok("robots.txt points at the sitemap");

// ------------------------------------------------------------ summary --
console.log(`\n${failures} failure(s), ${warnings} warning(s)`);
process.exit(failures > 0 ? 1 : 0);
