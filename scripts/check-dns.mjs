#!/usr/bin/env node
/**
 * Check that the custom domain still points at GitHub Pages.
 *
 *   node scripts/check-dns.mjs
 *
 * GitHub Pages serves the site from 185.199.108-111.153. If the domain
 * stops resolving to those addresses the site is still built and served
 * correctly by GitHub, but nobody can reach it - so this is worth checking
 * after any DNS change at the registrar.
 *
 * Exits non-zero when the domain is not pointing at GitHub Pages.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(readFileSync(resolve(ROOT, "config/site.json"), "utf8"));
const domain = site.domain;

const GITHUB_PAGES_RANGES = ["185.199.108.", "185.199.109.", "185.199.110.", "185.199.111."];

function digA(host, resolver) {
  const args = resolver
    ? ["+short", `@${resolver}`, host, "A"]
    : ["+short", host, "A"];
  try {
    return execFileSync("dig", args, { encoding: "utf8" })
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+\.\d+\.\d+\.\d+$/.test(l));
  } catch {
    return [];
  }
}

const resolvers = ["1.1.1.1", "8.8.8.8"];
let allGood = true;

console.log(`checking DNS for ${domain}\n`);

for (const resolver of [null, ...resolvers]) {
  const label = resolver ?? "system";
  const records = digA(domain, resolver);
  if (!records.length) {
    console.log(`  ${label.padEnd(8)} -> no A record`);
    allGood = false;
    continue;
  }
  const onGitHub = records.filter((ip) =>
    GITHUB_PAGES_RANGES.some((range) => ip.startsWith(range))
  );
  if (onGitHub.length) {
    console.log(`  ${label.padEnd(8)} -> ${records.join(", ")}  (GitHub Pages OK)`);
  } else {
    console.log(`  ${label.padEnd(8)} -> ${records.join(", ")}  (NOT GitHub Pages)`);
    allGood = false;
  }
}

// The site itself must still be reachable and serving the calculator.
console.log("");
try {
  const body = execFileSync(
    "curl",
    ["-sL", "--max-time", "20", `http://${domain}${site.base_path}/`],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  const hasTitle = /<title>[^<]{10,}<\/title>/.test(body);
  const hasAffiliate = /saily: "https:\/\/saily\.com/.test(body);
  const hasDisclosure = /affiliate-disclosure/.test(body);
  console.log(`  page title present:      ${hasTitle ? "yes" : "NO"}`);
  console.log(`  affiliate links baked:   ${hasAffiliate ? "yes" : "NO"}`);
  console.log(`  disclosure bar present:  ${hasDisclosure ? "yes" : "NO"}`);
  if (!hasTitle || !hasAffiliate || !hasDisclosure) allGood = false;
} catch (error) {
  console.log(`  could not fetch the page: ${error.message}`);
  allGood = false;
}

console.log(
  allGood
    ? "\nOK: the domain resolves to GitHub Pages and the site is serving correctly."
    : "\nPROBLEM: the domain is not fully serving the site. See notes in docs/DEPLOYMENT.md."
);

process.exit(allGood ? 0 : 1);
