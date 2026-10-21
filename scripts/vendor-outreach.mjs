#!/usr/bin/env node
/**
 * Vendor outreach tracker.
 *
 *   node scripts/vendor-outreach.mjs [list|add|note|next]
 *
 * The affiliate programmes rejected the publisher, so sponsorship is now
 * the primary revenue route. That route is won by outreach, and outreach
 * needs tracking or it does not happen.
 *
 * The tracker state lives in config/monetization.json under
 * models.lead_gen.providers, so it is versioned and reviewable.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = resolve(ROOT, "config/monetization.json");

const STATES = {
  not_contacted: { label: "Not contacted", order: 0 },
  emailed: { label: "Emailed", order: 1 },
  replied: { label: "Replied", order: 2 },
  negotiating: { label: "Negotiating", order: 3 },
  won: { label: "Won - paying", order: 4 },
  lost: { label: "Lost", order: 5 },
};

function load() {
  return JSON.parse(readFileSync(CONFIG, "utf8"));
}

function save(config) {
  writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function list(config) {
  const providers = config.models?.lead_gen?.providers ?? [];
  console.log(`\nVENDOR OUTREACH\n`);
  console.log(`  ${"VENDOR".padEnd(12)} ${"STATE".padEnd(16)} NOTES`);
  console.log(`  ${"-".repeat(12)} ${"-".repeat(16)} ${"-".repeat(30)}`);
  for (const provider of providers) {
    const state = STATES[provider.state]?.label ?? provider.state;
    console.log(
      `  ${provider.name.padEnd(12)} ${state.padEnd(16)} ${(provider.note ?? "").slice(0, 44)}`
    );
  }

  const contacted = providers.filter((p) => p.state !== "not_contacted").length;
  const won = providers.filter((p) => p.state === "won").length;
  console.log(
    `\n  ${contacted}/${providers.length} contacted · ${won} won\n`
  );
}

function setState(config, name, state, note) {
  const providers = config.models?.lead_gen?.providers ?? [];
  const provider = providers.find(
    (p) => p.name.toLowerCase() === name.toLowerCase() || p.key === name
  );
  if (!provider) {
    console.error(`error: no vendor named "${name}"`);
    console.error(`known: ${providers.map((p) => p.name).join(", ")}`);
    process.exit(1);
  }
  if (!STATES[state]) {
    console.error(`error: unknown state "${state}"`);
    console.error(`known: ${Object.keys(STATES).join(", ")}`);
    process.exit(1);
  }
  provider.state = state;
  if (note !== undefined) provider.note = note;
  save(config);
  console.log(`${provider.name} -> ${STATES[state].label}`);
}

function next(config) {
  const providers = config.models?.lead_gen?.providers ?? [];
  const sorted = [...providers].sort(
    (a, b) =>
      (STATES[a.state]?.order ?? 9) - (STATES[b.state]?.order ?? 9)
  );
  const upcoming = sorted.find((p) => p.state === "not_contacted");
  if (!upcoming) {
    console.log("\nEveryone has been contacted. Follow up on the replies:\n");
    for (const p of sorted.filter((x) => ["emailed", "replied", "negotiating"].includes(x.state))) {
      console.log(`  ${p.name.padEnd(12)} ${STATES[p.state]?.label}${p.note ? ` - ${p.note}` : ""}`);
    }
    console.log("");
    return;
  }
  const contact = config.models?.lead_gen?.contact ?? "";
  console.log(`\nNEXT: ${upcoming.name}`);
  console.log(`  Site:  ${config.models?.lead_gen?.site ?? ""}`);
  console.log(`  Mail:  ${contact}`);
  console.log(`  Kit:   ${config.models?.lead_gen?.site ?? ""}/advertise/kit.txt\n`);
}

const [command = "list", ...args] = process.argv.slice(2);
const config = load();

switch (command) {
  case "list":
    list(config);
    break;
  case "add":
    setState(config, args[0], args[1] ?? "emailed", args.slice(2).join(" "));
    break;
  case "note": {
    const provider = config.models.lead_gen.providers.find(
      (p) => p.name.toLowerCase() === args[0]?.toLowerCase() || p.key === args[0]
    );
    if (!provider) {
      console.error(`error: no vendor named "${args[0]}"`);
      process.exit(1);
    }
    setState(config, args[0], provider.state, args.slice(1).join(" "));
    break;
  }
  case "next":
    next(config);
    break;
  default:
    console.log("usage: vendor-outreach.mjs [list|add <vendor> <state> [note]|note <vendor> <note>|next]");
    console.log(`states: ${Object.keys(STATES).join(", ")}`);
}
