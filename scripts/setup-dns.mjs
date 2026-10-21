#!/usr/bin/env node
/**
 * Configure the custom domain's DNS for GitHub Pages.
 *
 *   node scripts/setup-dns.mjs [--dry-run]
 *
 * The domain must serve the site from GitHub's Pages IPs before GitHub can
 * issue a TLS certificate for it. This script writes the correct records
 * through whichever registrar API credentials are available:
 *
 *   Namecheap  -> NAMECHEAP_API_USER, NAMECHEAP_API_KEY
 *                 (and optionally NAMECHEAP_CLIENT_IP)
 *   Spaceship  -> SPACESHIP_API_KEY, SPACESHIP_API_SECRET
 *
 * With no credentials it prints the exact records to add by hand and exits
 * with code 2, so it is safe to run anywhere.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(readFileSync(resolve(ROOT, "config/site.json"), "utf8"));
const domain = site.domain;
const repoOwner = site.repo.split("/")[0];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

// GitHub Pages' published IP ranges (apex A records).
const GITHUB_PAGES_IPS = [
  "185.199.108.153",
  "185.199.109.153",
  "185.199.110.153",
  "185.199.111.153",
];

/** The records we want, in the order they should be applied. */
function desiredRecords() {
  const records = [];

  // Apex -> GitHub Pages (A records are required for an apex domain).
  for (const ip of GITHUB_PAGES_IPS) {
    records.push({ host: "@", type: "A", value: ip, ttl: 1800 });
  }

  // www -> the apex (GitHub Pages serves both once the CNAME is in place).
  records.push({ host: "www", type: "CNAME", value: domain, ttl: 1800 });

  return records;
}

function currentRecords() {
  const out = execFileSync(
    "dig",
    ["+short", `@dns1.registrar-servers.com`, domain, "A"],
    { encoding: "utf8" }
  );
  return out.split("\n").map((l) => l.trim()).filter(Boolean);
}

function hasNamecheap() {
  return Boolean(process.env.NAMECHEAP_API_USER && process.env.NAMECHEAP_API_KEY);
}

function hasSpaceship() {
  return Boolean(process.env.SPACESHIP_API_KEY && process.env.SPACESHIP_API_SECRET);
}

function publicIp() {
  try {
    return execFileSync("curl", ["-s", "--max-time", "10", "https://api.ipify.org"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "127.0.0.1";
  }
}

/** Namecheap XML API. */
function namecheapSetRecords(records) {
  const user = process.env.NAMECHEAP_API_USER;
  const key = process.env.NAMECHEAP_API_KEY;
  const clientIp = process.env.NAMECHEAP_CLIENT_IP || publicIp();
  const [sld, ...tld] = domain.split(".");

  // Namecheap's setHosts REPLACES the record set for one host, so the
  // parking A record is replaced by the GitHub Pages IPs. www is set as a
  // CNAME to the apex in a second call.
  for (const ip of GITHUB_PAGES_IPS) {
    execFileSync("curl", [
      "-s", "--max-time", "30", "-X", "POST", "https://api.namecheap.com/xml.response",
      "-d", `ApiUser=${user}`, "-d", `ApiKey=${key}`, "-d", `UserName=${user}`,
      "-d", `ClientIp=${clientIp}`, "-d", "Command=namecheap.domains.dns.setHosts",
      "-d", `SLD=${sld}`, "-d", `TLD=${tld.join(".")}`,
      "-d", "Host=@", "-d", "RecordType=A", "-d", `Address=${ip}`, "-d", "TTL=1800",
    ], { encoding: "utf8" });
  }

  execFileSync("curl", [
    "-s", "--max-time", "30", "-X", "POST", "https://api.namecheap.com/xml.response",
    "-d", `ApiUser=${user}`, "-d", `ApiKey=${key}`, "-d", `UserName=${user}`,
    "-d", `ClientIp=${clientIp}`, "-d", "Command=namecheap.domains.dns.setHosts",
    "-d", `SLD=${sld}`, "-d", `TLD=${tld.join(".")}`,
    "-d", "Host=www", "-d", "RecordType=CNAME", "-d", `Address=${domain}`, "-d", "TTL=1800",
  ], { encoding: "utf8" });
}

/** Spaceship JSON API. */
function spaceshipSetRecords(records) {
  const key = process.env.SPACESHIP_API_KEY;
  const secret = process.env.SPACESHIP_API_SECRET;

  execFileSync("curl", [
    "-s", "--max-time", "30", "-X", "PUT",
    `https://spaceship.dev/api/v1/dns/records/${domain}`,
    "-H", `X-Api-Key: ${key}`, "-H", `X-Api-Secret: ${secret}`,
    "-H", "Content-Type: application/json",
    "-d", JSON.stringify({
      records: records.map((r) => ({
        type: r.type,
        name: r.host,
        address: r.value,
        ttl: r.ttl,
      })),
      mode: "override",
    }),
  ], { encoding: "utf8" });
}

function printManualInstructions() {
  console.log(`\nNo registrar API credentials found. Add these records by hand in the\nregistrar DNS panel for ${domain}:\n`);
  for (const r of desiredRecords()) {
    console.log(`  ${r.type.padEnd(6)} ${r.host.padEnd(6)} ${r.value}`);
  }
  console.log(`\nThen verify:  node scripts/check-dns.mjs`);
  console.log(`Then enable HTTPS:`);
  console.log(`  gh api --method PUT repos/${repoOwner}/${repoOwner}.github.io/pages \\`);
  console.log(`    --input - <<'JSON'\n  {"https_enforced": true}\nJSON`);
}

function main() {
  console.log(`DNS setup for ${domain}\n`);

  const current = currentRecords();
  console.log(`  current A records: ${current.join(", ") || "(none)"}`);

  const desired = desiredRecords();
  const alreadyCorrect = GITHUB_PAGES_IPS.every((ip) => current.includes(ip));
  if (alreadyCorrect) {
    console.log("  apex already points at GitHub Pages - nothing to change");
  }

  if (dryRun) {
    console.log("\n[dry run] would set:");
    for (const r of desired) {
      console.log(`  ${r.type.padEnd(6)} ${r.host.padEnd(6)} ${r.value}`);
    }
    return;
  }

  if (hasNamecheap()) {
    console.log("  applying via the Namecheap API...");
    namecheapSetRecords(desired);
    console.log("  done - records submitted (propagation takes a few minutes)");
    return;
  }

  if (hasSpaceship()) {
    console.log("  applying via the Spaceship API...");
    spaceshipSetRecords(desired);
    console.log("  done - records submitted (propagation takes a few minutes)");
    return;
  }

  printManualInstructions();
  process.exitCode = 2;
}

main();
