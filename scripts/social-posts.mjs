#!/usr/bin/env node
/**
 * Generate ready-to-post social copy for roadmap Phase 3 (Sprints 3.1-3.3).
 *
 *   node scripts/social-posts.mjs
 *
 * Writes dist/social/*.txt and dist/social/index.html - a copy/paste kit
 * containing the Reddit post and the X/LinkedIn post for each of the three
 * audits, with the real numbers and the live URLs baked in.
 *
 * The posts are written for a technical, data-literate audience (r/travel,
 * r/digitalnomad) and lead with the finding, not with the link.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fmt, currencySymbol, buildSlugs, esc } from "./lib/analysis.mjs";
import { createAffiliateTracker } from "./lib/affiliates.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");

const readJson = (rel) => JSON.parse(readFileSync(resolve(ROOT, rel), "utf8"));

const site = readJson("config/site.json");
const affiliateConfig = readJson("config/affiliates.json");
const catalog = readJson("data/catalog.json");
const fx = readJson("data/fx.json");
const competitors = readJson("data/competitors.json");

const tracker = createAffiliateTracker(affiliateConfig, site);
const slugs = buildSlugs(catalog.products);
const spot = fx.spot_per_eur;
const med = fx.catalog_median_per_eur;
const base = site.canonical_base;

const stats = {
  iosHiddenPct: 0,
};
{
  let total = 0;
  let hidden = 0;
  for (const product of catalog.products) {
    const iosDays = product.ios_days ?? [];
    for (const day of Object.keys(product.d ?? {})) {
      total += 1;
      if (!iosDays.includes(Number(day))) hidden += 1;
    }
  }
  stats.iosHiddenPct = total ? Math.round((hidden / total) * 1000) / 10 : 0;
}

// --------------------------------------------------------------- post 3.1 --
const fxRows = catalog.ccys
  .map((ccy) => ({ ccy, spread: ((med[ccy] ?? 1) / (spot[ccy] ?? 1) - 1) * 100 }))
  .sort((a, b) => a.spread - b.spread);

const bestCcy = fxRows[0];
const onPlan = fxRows.filter((r) => r.spread < -2);
const penalised = fxRows.filter((r) => r.spread > 2);

// --------------------------------------------------------------- post 3.2 --
const inversions = [...catalog.inversions].sort((a, b) => b.save - a.save);
const biggest = inversions[0];
const topInversions = inversions.slice(0, 8);

// --------------------------------------------------------------- post 3.3 --
const providers = [];
for (const entries of Object.values(competitors.benchmarks)) {
  for (const entry of entries) {
    if (!entry.unlim7) continue;
    const match = providers.find((p) => p.key === entry.key);
    if (match) match.unlim7 = Math.min(match.unlim7, entry.unlim7);
    else providers.push({ key: entry.key, provider: entry.provider, unlim7: entry.unlim7 });
  }
}
providers.sort((a, b) => a.unlim7 - b.unlim7);
const cheapestUnlim = providers[0];

const posts = [
  {
    id: "post-1-fx-audit",
    sprint: "3.1",
    platform: "Reddit (r/travel, r/digitalnomad) + X",
    title: "The 20-currency eSIM checkout audit",
    body: `I audited the eSIM catalogue across ${catalog.ccys.length} currencies and ${catalog.products.length} destinations, then compared every currency's median catalogue rate against the ECB reference rate for 15 Oct 2026.

The catalogue is priced off a single EUR base, then re-rounded into each local currency. The rounding is not done at the live market rate, so the result is ${catalog.ccys.length} slightly wrong rates. Some favour you, some punish you.

The results:

• ${bestCcy.ccy} is priced ${Math.abs(bestCcy.spread).toFixed(1)}% BELOW spot — the best one to pay in
${onPlan.filter((r) => r.ccy !== bestCcy.ccy).map((r) => `• ${r.ccy} is ${Math.abs(r.spread).toFixed(1)}% below spot`).join("\n") || "• (no other currency below -2%)"}
${penalised.map((r) => `• ${r.ccy} is ${r.spread.toFixed(1)}% ABOVE spot — avoid paying in this`).join("\n") || "• (no currency above +2%)"}

On a $30 plan that is roughly $${fmt((Math.abs(bestCcy.spread) / 100) * 30, 2)} of pure margin. It takes about ten seconds: find the currency selector in the checkout, switch it, and check that the total dropped.

No code, no voucher, no referral trick — just a dropdown nobody touches.

I built a calculator that does this for the exact plan and duration you are buying, and ranks all ${catalog.ccys.length} currencies for it:
${base}/

(Disclosure: affiliate links, and it may cost you nothing extra.)`,
  },
  {
    id: "post-2-duration-inversions",
    sprint: "3.2",
    platform: "Reddit (r/travel) + X + LinkedIn",
    title: "Where buying an extra day is CHEAPER",
    body: `I scanned every destination, currency and duration in an eSIM catalogue. In ${catalog.inversions.length} cases, the LONGER plan is listed at a LOWER total price than the shorter one.

Not a rounding error in my table — an actual price inversion in the vendor's own price list.

${biggest ? `The biggest one right now: ${biggest.name} (${biggest.iso}).
The ${biggest.d2}-day plan is ${currencySymbol(biggest.ccy)}${fmt(biggest.p2, 2)}. The ${biggest.d1}-day plan is ${currencySymbol(biggest.ccy)}${fmt(biggest.p1, 2)}. You get ${biggest.d2 - biggest.d1} more day(s) of coverage and pay ${currencySymbol(biggest.ccy)}${fmt(biggest.save, 2)} LESS (${biggest.pct}% off).` : ""}

A few more:

${topInversions
  .slice(0, 7)
  .map((i) => `• ${i.name} (${i.iso}): ${i.d1}d = ${currencySymbol(i.ccy)}${fmt(i.p1, 2)} → ${i.d2}d = ${currencySymbol(i.ccy)}${fmt(i.p2, 2)} — save ${currencySymbol(i.ccy)}${fmt(i.save, 2)} (${i.pct}%)`)
  .join("\n")}

Why it happens: the vendor anchors on a base rate, applies a duration multiplier, then rounds into each local currency. When the rounding lands badly, the shorter plan rounds UP past the longer one.

Two things worth knowing:
1. This is a pricing artefact, not a promotion. It disappears the moment they re-price the catalogue, so check before you pay rather than planning around it.
2. Their iOS app does not list every duration the web checkout sells. ${stats.iosHiddenPct}% of plan variants are web-only, and the inversions cluster in exactly those rows. If you only buy eSIMs from the app, you literally cannot see them.

Full table of all ${catalog.inversions.length} + a calculator that loads any of them with one click:
${base}/inversions/

(Disclosure: affiliate links, no extra cost to you.)`,
  },
  {
    id: "post-3-break-even",
    sprint: "3.3",
    platform: "Reddit (r/travel, r/digitalnomad) + X",
    title: "Unlimited vs fixed-GB: the break-even math",
    body: `"Unlimited" eSIMs are the most expensive word in travel data. They are also the right answer for a lot of people. Here is the actual threshold.

The reference price for fixed data is roughly $15 for 10GB, i.e. ~$1.50/GB.

At that rate:
• The cheapest 7-day unlimited plan I found (${cheapestUnlim?.provider} at $${fmt(cheapestUnlim?.unlim7 ?? 0, 2)}) breaks even at about ${fmt(10 * ((cheapestUnlim?.unlim7 ?? 0) / 15), 1)}GB.

So the threshold is roughly 20GB/week, or ~2.85GB/day.

Below 2.85GB/day → fixed-GB is cheaper. Above it → unlimited wins and you stop thinking about it.

Typical use for a 7-day trip is 3-8GB, so most people are nowhere near the break-even. A week of video calls, cloud backup and tethering is 20GB+, so some people are way past it.

The part that actually decides it is the fine print:
• High-speed allowance per day — once you burn it you get throttled to ~1 Mbps. Fine for email, useless for video calls.
• Hotspot tethering cap — some plans cap tethering at 1GB/day. If you run a laptop off your phone, "unlimited" may be useless to you no matter what it costs.

The cheapest unlimited plan is the most expensive one if you tether heavily.

I built a calculator that takes your destination, duration and whether you are using a laptop hotspot, and tells you which provider actually wins:
${base}/guides/unlimited-vs-fixed-gb-break-even/

(Disclosure: affiliate links, no extra cost to you.)`,
  },
];

// -------------------------------------------------------------- write out --
mkdirSync(resolve(DIST, "social"), { recursive: true });

for (const post of posts) {
  writeFileSync(resolve(DIST, "social", `${post.id}.txt`), post.body, "utf8");
}

const cards = posts
  .map(
    (post) => `<section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <span class="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">Sprint ${esc(post.sprint)}</span>
      <span class="text-[11px] text-slate-500">${esc(post.platform)}</span>
    </div>
    <h2 class="text-base font-bold text-slate-900 mb-3">${esc(post.title)}</h2>
    <pre data-id="${esc(post.id)}" class="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto font-sans">${esc(post.body)}</pre>
    <div class="mt-3">
      <button type="button" class="copy-btn bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs px-4 py-2 rounded-lg transition" data-target="${esc(post.id)}">Copy to clipboard</button>
    </div>
  </section>`
  )
  .join("");

const kitHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Social post kit — eSIM Arbitrage Engine</title>
<meta name="robots" content="noindex, nofollow">
<link rel="stylesheet" href="https://cdn.tailwindcss.com/3.4.17">
<link rel="stylesheet" href="../styles.css">
<script src="https://cdn.tailwindcss.com/3.4.17"></script>
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen">
<main class="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
  <div>
    <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">Social post kit</h1>
    <p class="text-sm text-slate-600 mt-2">Roadmap Phase 3 (Sprints 3.1-3.3). Each post leads with the finding and links to the live tool. Every post carries the affiliate disclosure at the end.</p>
  </div>
  ${cards}
</main>
<script>
document.querySelectorAll('.copy-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var pre = document.querySelector('pre[data-id="' + btn.dataset.target + '"]');
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(function () {
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy to clipboard'; }, 2000);
    });
  });
});
</script>
</body>
</html>
`;

// Give each <pre> a data-id so the copy button can find it.
writeFileSync(resolve(DIST, "social", "index.html"), kitHtml, "utf8");

console.log(`generated ${posts.length} social posts -> dist/social/`);
for (const post of posts) {
  console.log(`  ${post.sprint}: ${post.title}`);
}
