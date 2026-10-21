#!/usr/bin/env node
/**
 * Check that the custom domain is serving the site over HTTPS.
 *
 *   node scripts/check-dns.mjs
 *
 * The domain is registered at Namecheap and fronted by Namecheap's proxy,
 * which terminates TLS with its own certificate and forwards to GitHub
 * Pages. So the domain's A record does NOT have to be one of GitHub's
 * Pages IPs - what matters is that the response actually comes from
 * GitHub Pages (it carries an x-github-request-id header) and that the
 * certificate is valid for the hostname.
 *
 * Exits non-zero when the site is not reachable over a valid HTTPS
 * connection.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(readFileSync(resolve(ROOT, "config/site.json"), "utf8"));
const domain = site.domain;

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

console.log(`checking ${domain}\n`);

// ---- 1. DNS resolves ----
for (const resolver of [null, ...resolvers]) {
  const label = resolver ?? "system";
  const records = digA(domain, resolver);
  if (!records.length) {
    console.log(`  ${label.padEnd(8)} -> no A record`);
    allGood = false;
    continue;
  }
  console.log(`  ${label.padEnd(8)} -> ${records.join(", ")}`);
}

// ---- 2. HTTPS works and the certificate is valid ----
console.log("");
const httpsUrl = `https://${domain}${site.base_path}/`;

try {
  const headers = execFileSync(
    "curl",
    ["-sI", "-L", "--max-time", "25", httpsUrl],
    { encoding: "utf8" }
  );
  const status = (headers.match(/HTTP\/\S+\s+(\d{3})/g) ?? [])
    .map((s) => s.split(/\s+/).pop())
    .join(" -> ");
  const servedByGithub = /x-github-request-id|x-github-revision/i.test(headers);

  console.log(`  https status:   ${status}`);
  console.log(`  served by:      ${servedByGithub ? "GitHub Pages" : "NOT GitHub Pages"}`);

  if (!/200/.test(status)) allGood = false;
  if (!servedByGithub) allGood = false;
} catch (error) {
  console.log(`  HTTPS request failed: ${error.message}`);
  allGood = false;
}

// ---- 3. Certificate is valid and covers the hostname ----
console.log("");
try {
  // Pull the leaf certificate. LibreSSL's `x509` prints a bare PEM without
  // the subject block, so the fields are requested explicitly.
  const pem = execFileSync(
    "bash",
    [
      "-c",
      `echo | openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -subject -issuer -dates`,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  );

  const subject = pem.match(/subject=\s*(.+)/)?.[1]?.trim() ?? "(unknown)";
  const issuer = pem.match(/issuer=\s*(.+)/)?.[1]?.trim() ?? "(unknown)";
  const notAfter = pem.match(/notAfter=(.+)/)?.[1]?.trim() ?? "(unknown)";

  const sanText = execFileSync(
    "bash",
    [
      "-c",
      `echo | openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -text`,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  );
  // LibreSSL's `x509` has no -ext flag, so the SAN list is read from -text.
  const sanBlock = sanText.match(/X509v3 Subject Alternative Name[\s\S]{0,400}/)?.[0] ?? "";
  const covers = new RegExp(`DNS:${domain.replace(/\./g, "\\.")}(,|\\s|$)`).test(sanBlock);

  console.log(`  cert subject:   ${subject}`);
  console.log(`  cert issuer:    ${issuer}`);
  console.log(`  cert expires:   ${notAfter}`);
  console.log(`  covers host:    ${covers ? "yes" : "NO"}`);

  if (!covers) allGood = false;
} catch (error) {
  console.log(`  could not read the certificate: ${error.message}`);
  allGood = false;
}

// ---- 4. The page content is the real site ----
console.log("");
try {
  const body = execFileSync(
    "curl",
    ["-sL", "--max-time", "25", httpsUrl],
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
    ? "\nOK: the domain is serving the site over a valid HTTPS connection."
    : "\nPROBLEM: the domain is not fully serving the site. See notes in docs/DEPLOYMENT.md."
);

process.exit(allGood ? 0 : 1);
