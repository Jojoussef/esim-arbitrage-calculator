#!/usr/bin/env node
/**
 * Report the commercial asset the site owns.
 *
 *   node scripts/lib/asset-report.mjs
 *
 * When the affiliate programmes reject a publisher, the question becomes
 * "what is actually worth something here?". This prints the numbers that
 * answer it: the size of the dataset, the unique findings in it, and the
 * intent signal the site can produce.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const catalog = read("data/catalog.json");
const competitors = read("data/competitors.json");

let prices = 0;
let variants = 0;
let hidden = 0;
let iosInvisible = 0;

for (const product of catalog.products) {
  const ios = new Set(product.ios_days ?? []);
  for (const [day, values] of Object.entries(product.d ?? {})) {
    variants += 1;
    prices += values.length;
    if (!ios.has(Number(day))) hidden += 1;
  }
  if (ios.size === 0) iosInvisible += 1;
}

const carriers = new Set();
for (const product of catalog.products) {
  for (const carrier of product.carriers.split(" - ")) carriers.add(carrier.trim());
}

const lines = [
  ["destinations", catalog.products.length],
  ["currencies", catalog.ccys.length],
  ["plan variants", variants],
  ["price points", prices],
  ["named carriers", carriers.size],
  ["duration inversions", catalog.inversions.length],
  ["duplicate-price conflicts", catalog.duplicates.length],
  ["destinations benchmarked vs rivals", Object.keys(competitors.benchmarks).length],
  ["iOS-hidden plan variants", `${hidden} (${((hidden / variants) * 100).toFixed(1)}%)`],
  ["destinations invisible in the iOS app", iosInvisible],
];

console.log("ASSET\n");
for (const [label, value] of lines) {
  console.log(`  ${String(label).padEnd(36)} ${value}`);
}

console.log("\nWHY THIS IS NOT REPLICABLE BY A VENDOR\n");
console.log("  A vendor cannot publish the pricing errors in their own");
console.log("  catalogue, and cannot publish the list of durations their");
console.log("  own app hides. A comparison site can - and can prove it.");
