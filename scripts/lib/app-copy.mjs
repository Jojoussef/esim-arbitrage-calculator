/**
 * User-facing copy for the app shell.
 *
 * The original app was written by the operator, for the operator. Its tab
 * names ("235 Inversions & Bugs", "Affiliate & Export Studio"), its headings
 * ("Data Grounding", "Duration Pricing & Inversion Scan") and its subtitles
 * talk about the tool and the method.
 *
 * A traveller does not care about any of that. They want to know:
 *   - what will this cost me?
 *   - which currency should I pay in?
 *   - am I about to overpay?
 *
 * This module rewrites the shell into that voice. Every replacement is
 * anchored on the exact source string, so a change to src/app.html fails
 * the build loudly rather than silently leaving the old copy in place.
 */

import { replaceOnce } from "./app-transform.mjs";

/** Rewrite the app shell into traveller-facing language. */
export function applyUserVoice(html, { site, stats }) {
  const brand = site.brand ?? {};
  const replacements = [];

  const swap = (from, to, label) => {
    if (!html.includes(from)) {
      replacements.push({ label, ok: false });
      return;
    }
    html = replaceOnce(html, from, to, label);
    replacements.push({ label, ok: true });
  };

  // ---- brand in the header ----
  // The header brand becomes a <div>, not an <h1>: the hero carries the only
  // <h1> on the page, which is what search engines expect.
  swap(
    `<h1 class="font-bold text-base sm:text-lg tracking-tight text-white">eSIM Arbitrage &amp; Break-Even Engine</h1>`,
    `<div class="font-bold text-base sm:text-lg tracking-tight text-white">${brand.name ?? "eSIM Price Truth"}</div>`,
    "header brand name"
  );

  swap(
    `<p class="text-xs text-slate-300 hidden sm:block">Live FX Checkout Optimizer, 235 Duration Inversion Finder &amp; 2026 Competitor Benchmark</p>`,
    `<p class="text-xs text-slate-300 hidden sm:block">${brand.tagline ?? "Find the cheapest eSIM for your trip."}</p>`,
    "header tagline"
  );

  // ---- tab names: what the tool does, in the traveller's words ----
  swap(`          1. Smart Calculator`, `          1. Trip Calculator`, "tab 1 name");
  swap(
    `          2. 235 Inversions &amp; Bugs`,
    `          2. Where Prices Look Wrong`,
    "tab 2 name"
  );
  swap(
    `          3. 28-Currency FX Audit`,
    `          3. Which Currency to Pay In`,
    "tab 3 name"
  );

  // ---- the "Data Grounding" footer line ----
  swap(
    `<strong>Data Grounding:</strong> 94 products, 6,802 variants &amp; 193,378 localized prices audited against Oct 2026 <a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline">ECB Reference Rates</a> &amp; <a href="https://www.iban.com/exchange-rates" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline">IBAN FX Rates</a>.`,
    `<strong>Prices checked:</strong> ${stats.prices.toLocaleString("en-US")} prices across ${stats.destinations} destinations, compared against the Oct 2026 <a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline">ECB reference rates</a>.`,
    "footer price note"
  );

  // ---- card headings inside the calculator ----
  swap(
    `<h2 id="card1Title" class="text-base font-bold text-slate-900 mb-1">Switch Storefront Currency to Save</h2>`,
    `<h2 id="card1Title" class="text-base font-bold text-slate-900 mb-1">Pay in ${stats.maxFxSavingCcy ?? "a cheaper currency"} and save</h2>`,
    "card 1 title"
  );

  swap(
    `<p id="card1Subtitle" class="text-xs text-slate-500 mb-4">Comparing your selected checkout currency against all 28 localized price tables for this exact SKU.</p>`,
    `<p id="card1Subtitle" class="text-xs text-slate-500 mb-4">The same plan, priced in ${stats.currencies} currencies. We show what each one really costs in dollars so you can pick the cheapest at checkout.</p>`,
    "card 1 subtitle"
  );

  swap(
    `<h2 class="text-base font-bold text-slate-900 mb-1">Duration Pricing &amp; Inversion Scan</h2>`,
    `<h2 class="text-base font-bold text-slate-900 mb-1">What each trip length costs</h2>`,
    "card 2 title"
  );

  swap(
    `<h2 id="card3Title" class="text-base font-bold text-slate-900 mb-1">Rival Unlimited &amp; Fixed-GB Matchup</h2>`,
    `<h2 id="card3Title" class="text-base font-bold text-slate-900 mb-1">How this compares to other eSIMs</h2>`,
    "card 3 title"
  );

  swap(
    `<p id="card3Subtitle" class="text-xs text-slate-500 mb-3">Verified October 2026 pricing from Nomad, Saily, Airalo, Yesim &amp; Jetpac.</p>`,
    `<p id="card3Subtitle" class="text-xs text-slate-500 mb-3">The same trip, priced by Nomad, Saily, Airalo, Yesim and Jetpac &mdash; so you can see if you are about to overpay.</p>`,
    "card 3 subtitle"
  );

  // ---- the two big tab headings ----
  swap(
    `<h2 class="text-lg font-bold text-slate-900">224+ Duration Price Inversions &amp; 1,001 Duplicate Currency Conflicts</h2>`,
    `<h2 class="text-lg font-bold text-slate-900">Plans that are cheaper for longer</h2>`,
    "inversions tab heading"
  );

  swap(
    `<h2 class="text-lg font-bold text-slate-900">28-Currency Systematic Spread vs. ECB / Market Spot Rates (Oct 2026)</h2>`,
    `<h2 class="text-lg font-bold text-slate-900">What each currency really costs</h2>`,
    "fx tab heading"
  );

  // ---- the CTA button: say what the user gets, not "checkout" ----
  swap(
    `              Open Holafly &amp; Checkout in Optimal Currency &rarr;`,
    `              Get this plan &rarr;`,
    "holafly CTA label"
  );

  // ---- the header: theme toggle + token-based classes ----
  swap(
    `<header class="bg-[#0F2942] text-white border-b border-slate-800 sticky top-0 z-30">`,
    `<header class="app-header sticky top-0 z-30">`,
    "header classes"
  );

  swap(
    `        <div class="w-9 h-9 rounded-lg bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300 font-extrabold text-lg">
          eS
        </div>`,
    `        <div class="brand-mark w-9 h-9 rounded-lg border flex items-center justify-center font-extrabold text-lg">
          eS
        </div>`,
    "brand mark"
  );

  swap(
    `            <span class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">${stats.destinations} destinations · ${stats.prices.toLocaleString(
      "en-US"
    )} prices</span>`,
    `            <span class="brand-badge text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border">${stats.destinations} destinations · ${stats.prices.toLocaleString(
      "en-US"
    )} prices</span>`,
    "brand badge"
  );

  swap(
    `      <nav class="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-700/70 overflow-x-auto max-w-full">`,
    `      <nav class="nav-shell flex items-center gap-1 p-1 rounded-xl border overflow-x-auto max-w-full">
        <button id="themeToggle" type="button" class="theme-toggle mr-1" title="Theme" aria-label="Change theme">&#9681;</button>`,
    "nav shell + theme toggle"
  );

  return { html, replacements };
}
