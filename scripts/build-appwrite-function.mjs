#!/usr/bin/env node
/**
 * Build the Appwrite Function's embedded catalogue.
 *
 *   node scripts/build-appwrite-function.mjs
 *
 * The function needs the catalogue at runtime, so it is embedded as a
 * module the function imports. Generating it here means the premium data
 * and the static site are always built from the SAME source - they can
 * never drift.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "appwrite/functions/premium-api/src");
const OUT = resolve(OUT_DIR, "catalog.js");

const catalog = JSON.parse(readFileSync(resolve(ROOT, "data/catalog.json"), "utf8"));
const stats = JSON.parse(readFileSync(resolve(ROOT, "data/stats.json"), "utf8"));
const site = JSON.parse(readFileSync(resolve(ROOT, "config/site.json"), "utf8"));

const payload = {
  asOf: site.data_as_of ?? null,
  // The catalogue lists prices in currency order, so the currency list has
  // to travel with it or the export cannot label a price.
  currencies: catalog.ccys ?? [],
  products: catalog.products,
  inversions: catalog.inversions,
  duplicates: catalog.duplicates,
  stats,
};

const source = `/**
 * GENERATED FILE - do not edit.
 * Built by scripts/build-appwrite-function.mjs from data/catalog.json.
 *
 * The premium API serves exactly the dataset the static site is built from,
 * so a subscriber can never receive data that disagrees with the page.
 */
export const CATALOG = ${JSON.stringify(payload)};
`;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, source, "utf8");

const size = (Buffer.byteLength(source) / 1024).toFixed(0);
console.log(
  `built appwrite/functions/premium-api/src/catalog.js (${size} KB, ${payload.products.length} destinations, ${payload.inversions.length} inversions)`
);
