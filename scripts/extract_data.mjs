#!/usr/bin/env node
/**
 * Extract the embedded dataset from the original single-file calculator into
 * structured JSON files under data/.
 *
 * The source of truth is the original HTML produced by the "catalogue_all.jsonl"
 * scrape. Once extracted, the dataset becomes a first-class build input so the
 * whole site (calculator + programmatic destination pages) is reproducible from
 * data/ without ever re-opening the 1 MB HTML blob.
 *
 * Node is used here because the dataset blocks are JavaScript object literals
 * with unquoted keys (e.g. `USD: 1.1208`) that are not valid JSON.
 *
 * Usage:
 *   node scripts/extract_data.mjs "<path to source html>"
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = resolve(ROOT, "data");

const BLOCK_PATTERNS = {
  APP_DATA: /const APP_DATA = (\{[\s\S]*?\});\s*\n/,
  SPOT_PER_EUR: /const SPOT_PER_EUR = (\{[\s\S]*?\});\s*\n/,
  CATALOG_MED_EUR: /const CATALOG_MED_EUR = (\{[\s\S]*?\});\s*\n/,
  COMPETITOR_BENCHMARKS: /const COMPETITOR_BENCHMARKS = (\{[\s\S]*?\});\s*\n/,
};

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const sourceArg = process.argv[2];
if (!sourceArg) {
  console.error("usage: node scripts/extract_data.mjs <source html>");
  process.exit(2);
}

const source = resolve(sourceArg.replace(/^~(?=\/)/, process.env.HOME));
let html;
try {
  html = readFileSync(source, "utf8");
} catch {
  fail(`source HTML not found: ${source}`);
}

const sandbox = Object.create(null);
for (const [name, pattern] of Object.entries(BLOCK_PATTERNS)) {
  const match = html.match(pattern);
  if (!match) fail(`could not locate '${name}' in ${source}`);
  try {
    sandbox[name] = vm.runInNewContext(`(${match[1]})`, Object.create(null), {
      timeout: 30_000,
    });
  } catch (error) {
    fail(`failed to evaluate '${name}': ${error.message}`);
  }
}

const { APP_DATA, SPOT_PER_EUR, CATALOG_MED_EUR, COMPETITOR_BENCHMARKS } = sandbox;
const products = APP_DATA.products ?? [];
const inversions = APP_DATA.inversions ?? [];
const duplicates = APP_DATA.duplicates ?? [];

if (!products.length) fail("APP_DATA contained no products");

mkdirSync(DATA_DIR, { recursive: true });

// ---- catalog.json : the full dataset the calculator renders from ----
writeFileSync(
  resolve(DATA_DIR, "catalog.json"),
  JSON.stringify({
    ccys: APP_DATA.ccys,
    products,
    inversions,
    duplicates,
  }),
  "utf8"
);

// ---- fx.json : spot rates + catalog medians powering the FX audit ----
writeFileSync(
  resolve(DATA_DIR, "fx.json"),
  JSON.stringify(
    {
      spot_per_eur: SPOT_PER_EUR,
      catalog_median_per_eur: CATALOG_MED_EUR,
      as_of: "2026-10-15",
      sources: [
        "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
        "https://www.iban.com/exchange-rates",
      ],
    },
    null,
    2
  ),
  "utf8"
);

// ---- competitors.json : verified rival pricing used for break-even ----
writeFileSync(
  resolve(DATA_DIR, "competitors.json"),
  JSON.stringify(
    { as_of: "2026-10", benchmarks: COMPETITOR_BENCHMARKS },
    null,
    2
  ),
  "utf8"
);

// ---- stats.json : headline counters used in copy, OG images and JSON-LD ----
let totalVariants = 0;
let totalPrices = 0;
let iosHidden = 0;
for (const product of products) {
  const iosDays = product.ios_days ?? [];
  for (const [day, values] of Object.entries(product.d ?? {})) {
    totalVariants += 1;
    totalPrices += Array.isArray(values) ? values.length : 0;
    if (!iosDays.includes(Number(day))) iosHidden += 1;
  }
}

const stats = {
  destinations: products.length,
  countries_and_regions: products.length,
  currencies: (APP_DATA.ccys ?? []).length,
  variants: totalVariants,
  prices: totalPrices,
  inversions: inversions.length,
  duplicates: duplicates.length,
  ios_hidden_durations: iosHidden,
};

writeFileSync(
  resolve(DATA_DIR, "stats.json"),
  JSON.stringify(stats, null, 2),
  "utf8"
);

console.log("extracted -> data/");
for (const [key, value] of Object.entries(stats)) {
  console.log(`  ${key}: ${value}`);
}
