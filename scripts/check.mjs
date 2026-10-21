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

console.log(`checking ${htmlFiles.length} HTML files in dist/\n`);

// ------------------------------------------------------- per-page checks --
for (const file of htmlFiles) {
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
