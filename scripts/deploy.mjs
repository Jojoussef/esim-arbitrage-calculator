#!/usr/bin/env node
/**
 * Deploy dist/ to GitHub Pages.
 *
 *   node scripts/deploy.mjs
 *
 * Strategy: the built site is published from the `gh-pages` branch of the
 * repository. That keeps the source branch clean (no 7 MB of generated HTML
 * in the history) and gives GitHub Pages a dedicated publishing root.
 *
 * The script is idempotent and safe to re-run.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const BRANCH = "gh-pages";

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    ...options,
  });
}

function gh(args, options = {}) {
  return execFileSync("gh", args, { cwd: ROOT, encoding: "utf8", ...options });
}

/**
 * Mirror the built site into the user site repository at /<mirror_path>/.
 *
 * The user site (Jojoussef.github.io) is the one that owns the custom domain
 * CNAME, so this is what makes youssef-benatti.me/<mirror_path>/ resolve.
 */
function mirrorToUserSite(site, work) {
  const userRepo = site.mirror_to;
  const target = resolve(ROOT, ".deploy-mirror");
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });

  // Clone the user site, preserving its existing content (CNAME, README, ...).
  execFileSync("git", ["clone", "--depth", "1", "--branch", "main",
    `https://github.com/${userRepo}.git`, target], { stdio: "inherit" });

  // Replace only the mirror subdirectory.
  const dest = resolve(target, site.mirror_path);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  execFileSync("cp", ["-R", `${DIST}/.`, dest]);

  const git = (args) =>
    execFileSync("git", args, { cwd: target, stdio: "inherit" });

  git(["add", "-A", site.mirror_path]);
  git([
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "--quiet",
    "-m",
    `Deploy eSIM arbitrage site to /${site.mirror_path}/ (${new Date().toISOString()})`,
  ]);
  git(["push", "--quiet", "origin", "main"]);

  rmSync(target, { recursive: true, force: true });
}

function main() {
  if (!existsSync(resolve(DIST, "index.html"))) {
    console.error("error: dist/index.html not found - run `node scripts/build.mjs` first");
    process.exit(1);
  }

  const site = JSON.parse(readFileSync(resolve(ROOT, "config/site.json"), "utf8"));
  const repo = site.repo;
  const remote = `https://github.com/${repo}.git`;
  console.log(`deploying ${repo} (branch: ${BRANCH})\n`);

  // The built site is committed from a THROWAWAY git repository in a temp
  // directory. This keeps the source branch completely untouched: no orphan
  // branch juggling in the working tree, and no generated HTML in the history
  // of the branch you actually edit.
  const work = resolve(ROOT, ".deploy-worktree");
  if (existsSync(work)) rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  // Copy the built site into the temp repo.
  execFileSync("cp", ["-R", `${DIST}/.`, work]);

  const git = (args) =>
    execFileSync("git", args, { cwd: work, stdio: "inherit" });

  git(["init", "--quiet", "--initial-branch", BRANCH]);
  git(["add", "-A"]);
  git([
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "commit",
    "--quiet",
    "-m",
    `Deploy site (${new Date().toISOString()})`,
  ]);
  git(["remote", "add", "origin", remote]);
  git(["push", "--force", "--quiet", "origin", `${BRANCH}:${BRANCH}`]);

  rmSync(work, { recursive: true, force: true });
  console.log(`\npushed ${BRANCH} to ${repo}`);

  // ---- mirror the same build to the user site at /esim/ ----
  // GitHub serves project pages under the user site's custom domain
  // (youssef-benatti.me/<repo>/). The short /esim/ path is a nicer URL to
  // put in social posts, so the identical build is mirrored there too.
  // Both copies declare the same canonical URL, so there is no duplicate
  // content problem - search engines consolidate on one.
  if (site.mirror_to) {
    console.log(`mirroring to ${site.mirror_to} at /${site.mirror_path}/ ...`);
    try {
      mirrorToUserSite(site, work);
      console.log(`mirrored to /${site.mirror_path}/`);
    } catch (error) {
      console.warn(`mirror step failed (the main deploy is unaffected):\n${error.message}`);
    }
  }

  // ---- enable / update GitHub Pages ----
  console.log("enabling GitHub Pages on the gh-pages branch...");
  try {
    gh([
      "api",
      "--method",
      "PUT",
      `repos/${repo}/pages`,
      "-f",
      "source[branch]=gh-pages",
      "-f",
      "source[path]=/",
      "--silent",
    ]);
    console.log("Pages configured (source: gh-pages /)");
  } catch (error) {
    const stderr = String(error.stderr ?? error.message);
    if (stderr.includes("already") || stderr.includes("422")) {
      console.log("Pages already configured - nothing to change");
    } else {
      console.warn(`could not update Pages settings automatically:\n${stderr}`);
      console.warn("set it manually: repo Settings -> Pages -> Source: gh-pages branch / root");
    }
  }

  console.log(`\nlive URLs:`);
  console.log(`  ${site.canonical_base}/`);
  console.log(`  https://${repo.split("/")[0]}.github.io/${repo.split("/")[1]}/`);
}

main();

