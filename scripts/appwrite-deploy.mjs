#!/usr/bin/env node
/**
 * Deploy the Appwrite Function.
 *
 *   node scripts/appwrite-deploy.mjs
 *
 * The CLI packages the function directory itself and uploads it as a new
 * deployment, then activates it as soon as the build finishes, so the old
 * code never keeps running.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FN = resolve(ROOT, "appwrite/functions/premium-api");

const FUNCTION_ID = "premium-api";

/** Run an appwrite CLI command. */
function aw(args) {
  console.log(`  $ appwrite ${args.join(" ")}`);
  const out = execFileSync("appwrite", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (out.trim()) {
    console.log(out.trim().split("\n").map((l) => `    ${l}`).join("\n"));
  }
  return out;
}

console.log("CHECKING THE FUNCTION\n");

// The catalogue has to be in the bundle, or the function has no data.
if (!existsSync(resolve(FN, "src/catalog.js"))) {
  console.error(
    "error: the function's catalogue is missing.\n" +
      "       run: node scripts/build-appwrite-function.mjs"
  );
  process.exit(2);
}

console.log("\nDEPLOYING\n");

// The CLI packages the directory itself, so there is no need to build a
// tarball by hand. --activate swaps the new deployment in as soon as the
// build finishes, so the old code never keeps running.
aw([
  "functions",
  "create-deployment",
  "--function-id",
  FUNCTION_ID,
  "--entrypoint",
  "src/main.js",
  "--commands",
  "npm install",
  "--code",
  "appwrite/functions/premium-api",
  "--activate",
]);

console.log("\nDeployed. Check it with:\n");
console.log("  appwrite functions list-executions --function-id premium-api");
