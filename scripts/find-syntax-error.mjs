#!/usr/bin/env node
/**
 * Locate a JavaScript syntax error in a built HTML page.
 *
 *   node scripts/find-syntax-error.mjs dist/index.html
 *
 * Prints the offending line and its surroundings. Used when the build
 * produces HTML whose inline script will not parse.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const target = process.argv[2] ?? "dist/index.html";
const html = readFileSync(resolve(target), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

if (!scripts.length) {
  console.log("no inline script found");
  process.exit(2);
}

let failed = false;

scripts.forEach((code, index) => {
  const lines = code.split("\n");
  let error = null;
  try {
    new vm.Script(code, { filename: `inline${index}.js` });
    console.log(`script ${index}: parses cleanly (${code.length} chars)`);
    return;
  } catch (err) {
    failed = true;
    error = err;
    console.log(`script ${index}: ${error.message}`);
  }

  // The stack trace points at a line number in the generated code.
  const lineMatch = error.stack?.match(/inline\d+\.js:(\d+)/);
  if (lineMatch) {
    const lineNo = Number(lineMatch[1]);
    console.log(`\n--- around line ${lineNo} ---`);
    for (let i = Math.max(0, lineNo - 10); i < Math.min(lines.length, lineNo + 6); i += 1) {
      const marker = i + 1 === lineNo ? ">>" : "  ";
      console.log(`${marker} ${String(i + 1).padStart(5)} | ${lines[i]}`);
    }
  }
});

process.exit(failed ? 1 : 0);

// The stack trace points at a line number in the generated code.
const lineMatch = error.stack?.match(/inline\.js:(\d+)/);
if (lineMatch) {
  const lineNo = Number(lineMatch[1]);
  console.log(`\n--- around line ${lineNo} ---`);
  for (let i = Math.max(0, lineNo - 8); i < Math.min(lines.length, lineNo + 6); i += 1) {
    const marker = i + 1 === lineNo ? ">>" : "  ";
    console.log(`${marker} ${String(i + 1).padStart(5)} | ${lines[i]}`);
  }
  process.exit(1);
}

// Fall back to a bisect: find the first prefix that fails to parse.
let low = 1;
let high = lines.length;
while (low < high) {
  const mid = Math.floor((low + high) / 2);
  try {
    new vm.Script(lines.slice(0, mid).join("\n"));
    low = mid + 1;
  } catch {
    high = mid;
  }
}

console.log(`\n--- first failing prefix ends at line ${low} ---`);
for (let i = Math.max(0, low - 10); i < Math.min(lines.length, low + 4); i += 1) {
  console.log(`   ${String(i + 1).padStart(5)} | ${lines[i]}`);
}
process.exit(1);
