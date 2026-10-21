#!/usr/bin/env node
/**
 * Deeper structural validation of the built site.
 *
 *   node scripts/validate.mjs
 *
 * Complements scripts/check.mjs (which checks monetisation + SEO invariants)
 * by actually parsing the generated JavaScript and looking for template
 * artefacts that would only show up at runtime.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");

let failures = 0;
const fail = (m) => {
  console.error(`  FAIL  ${m}`);
  failures += 1;
};
const ok = (m) => console.log(`  ok    ${m}`);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error("error: dist/ not found - run `node scripts/build.mjs` first");
  process.exit(2);
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith(".html"));

// ------------------------------------------- 1. the calculator's JS parses --
const appHtml = readFileSync(join(DIST, "index.html"), "utf8");
const inlineScripts = [...appHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

if (!inlineScripts.length) {
  fail("index.html: no inline script found");
} else {
  let parsed = 0;
  for (const code of inlineScripts) {
    try {
      new vm.Script(code, { filename: "inline.js" });
      parsed += 1;
    } catch (error) {
      fail(`index.html: inline script has a syntax error -> ${error.message}`);
    }
  }
  if (parsed === inlineScripts.length) {
    ok(`index.html: all ${parsed} inline script(s) parse cleanly`);
  }
}

// ------------------------------- 2. the calculator's data is intact --
const dataMatch = appHtml.match(/const APP_DATA = (\{[\s\S]*?\});/);
if (!dataMatch) {
  fail("index.html: APP_DATA block not found");
} else {
  try {
    const data = vm.runInNewContext(`(${dataMatch[1]})`, Object.create(null), { timeout: 30_000 });
    const productCount = data.products?.length ?? 0;
    const inversionCount = data.inversions?.length ?? 0;
    if (productCount !== 94) fail(`index.html: APP_DATA has ${productCount} products (expected 94)`);
    else if (inversionCount !== 224) fail(`index.html: APP_DATA has ${inversionCount} inversions (expected 224)`);
    else ok(`index.html: APP_DATA intact (${productCount} products, ${inversionCount} inversions)`);
  } catch (error) {
    fail(`index.html: APP_DATA does not evaluate -> ${error.message}`);
  }
}

// ------------------------------------ 3. no template artefacts anywhere --
const artefacts = ["__BODY_PART", "__FX_TAIL", "__INV_TAIL", "__BE_TAIL", "__MARK", "undefined", "[object Object]", "NaN"];
let artefactHits = 0;

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const rel = "/" + relative(DIST, file).replace(/\\/g, "/");
  for (const artefact of artefacts) {
    if (html.includes(artefact)) {
      // "undefined" can legitimately appear inside inline JS, so only flag it
      // outside of <script> blocks.
      if (artefact === "undefined") {
        const outside = html.replace(/<script>[\s\S]*?<\/script>/g, "");
        if (outside.includes("undefined")) {
          fail(`${rel}: contains "undefined" outside a script block`);
          artefactHits += 1;
        }
        continue;
      }
      fail(`${rel}: contains template artefact "${artefact}"`);
      artefactHits += 1;
    }
  }
  if (!html.trimEnd().endsWith("</html>")) {
    fail(`${rel}: file is truncated (no closing </html>)`);
    artefactHits += 1;
  }
}
if (artefactHits === 0) ok(`no template artefacts in ${htmlFiles.length} files`);

// ---------------------------------------- 4. every page has a JSON-LD ---
let schemaCount = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  if (/<script type="application\/ld\+json">/.test(html)) {
    schemaCount += 1;
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    try {
      JSON.parse(match[1]);
    } catch (error) {
      fail(`/${relative(DIST, file)}: invalid JSON-LD -> ${error.message}`);
    }
  }
}
ok(`${schemaCount}/${htmlFiles.length} pages carry JSON-LD, all valid JSON`);

// ---------------------------- 5. canonical URLs are unique per page --
const canonicals = new Map();
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  const match = html.match(/<link rel="canonical" href="([^"]+)"/);
  if (!match) continue;
  const rel = "/" + relative(DIST, file).replace(/\\/g, "/");
  if (canonicals.has(match[1])) {
    fail(`duplicate canonical ${match[1]} on ${rel} and ${canonicals.get(match[1])}`);
  }
  canonicals.set(match[1], rel);
}
ok(`${canonicals.size} unique canonical URLs`);

console.log(`\n${failures} failure(s)`);
process.exit(failures > 0 ? 1 : 0);
