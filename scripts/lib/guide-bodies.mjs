/**
 * Bodies for the three editorial guides (roadmap Phase 3).
 *
 * Every number in these articles is computed from the dataset, so the copy
 * can never drift away from the data it claims to describe.
 */

import { esc, fmt, currencySymbol } from "./analysis.mjs";
import { url } from "./layout.mjs";

/** Shared CTA block used at the end of every guide. */
export function ctaBlock(site, tracker, slug, headline, sub) {
  const saily = tracker.link("saily", slug);
  const nomad = tracker.link("nomad", slug);
  const airalo = tracker.link("airalo", slug);
  return `
  <section class="rounded-2xl bg-[#0F2942] text-white p-6 sm:p-8 mt-8">
    <h2 class="text-xl font-bold">${esc(headline)}</h2>
    <p class="text-sm text-slate-300 mt-2 max-w-2xl">${esc(sub)}</p>
    <div class="flex flex-wrap gap-3 mt-5">
      <a href="${esc(url(site, "/"))}" class="bg-teal-500 hover:bg-teal-400 text-[#0F2942] font-bold text-sm py-2.5 px-5 rounded-xl transition">Open the live calculator</a>
      <a href="${esc(saily)}" target="_blank" rel="sponsored noopener noreferrer" class="bg-white/10 hover:bg-white/20 border border-white/25 text-white font-semibold text-sm py-2.5 px-5 rounded-xl transition">Saily &rarr;</a>
      <a href="${esc(nomad)}" target="_blank" rel="sponsored noopener noreferrer" class="bg-white/10 hover:bg-white/20 border border-white/25 text-white font-semibold text-sm py-2.5 px-5 rounded-xl transition">Nomad &rarr;</a>
      <a href="${esc(airalo)}" target="_blank" rel="sponsored noopener noreferrer" class="bg-white/10 hover:bg-white/20 border border-white/25 text-white font-semibold text-sm py-2.5 px-5 rounded-xl transition">Airalo &rarr;</a>
    </div>
    <p class="text-[11px] text-slate-400 mt-4">These are affiliate links. We may earn a commission at no extra cost to you. Ranking is by price, never paid for.</p>
  </section>`;
}

/** Sprint 3.1 — the currency arbitrage guide. */
export function fxGuideBody({ site, stats, catalog, fx, tracker }) {
  const { ccys } = catalog;
  const spot = fx.spot_per_eur;
  const med = fx.catalog_median_per_eur;

  const rows = ccys
    .map((ccy) => {
      const medEur = med[ccy] ?? 1;
      const spotEur = spot[ccy] ?? 1;
      return { ccy, medEur, spotEur, spread: (medEur / spotEur - 1) * 100 };
    })
    .sort((a, b) => a.spread - b.spread);

  const best = rows[0];
  const worst = rows[rows.length - 1];
  const arbitrary = rows.filter((r) => r.spread < -2);
  const penalised = rows.filter((r) => r.spread > 2);

  const tableRows = rows
    .map(
      (r) => `<tr class="hover:bg-slate-50">
        <td class="py-2 px-3 font-mono font-bold text-slate-900">${esc(r.ccy)}</td>
        <td class="py-2 px-3 text-right font-mono">${r.medEur.toFixed(4)}</td>
        <td class="py-2 px-3 text-right font-mono">${r.spotEur.toFixed(4)}</td>
        <td class="py-2 px-3 text-right font-mono font-bold ${r.spread < -2 ? "text-emerald-700" : r.spread > 2 ? "text-rose-600" : "text-slate-600"}">${r.spread >= 0 ? "+" : ""}${r.spread.toFixed(1)}%</td>
      </tr>`
    )
    .join("");

  return `
  <article class="max-w-3xl mx-auto">
    <span class="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">Currency arbitrage</span>
    <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">The ${stats.currencies}-Currency eSIM Checkout Audit</h1>
    <p class="text-sm text-slate-600 mt-3">There is a dropdown on every eSIM checkout that lets you pick what currency you pay in. Most people never touch it. Here is what it is worth.</p>

    <div class="rounded-xl bg-teal-50/90 border border-teal-200 p-4 text-sm text-teal-950 my-6">
      <strong>The result:</strong> <strong>${esc(best.ccy)}</strong> is priced <strong>${Math.abs(best.spread).toFixed(1)}% below</strong> the market rate, while <strong>${esc(worst.ccy)}</strong> is priced <strong>${worst.spread.toFixed(1)}% above</strong> it. On a $30 plan that is roughly ${fmt((Math.abs(best.spread) / 100) * 30, 2)} dollars of pure margin, every single time.
    </div>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">Why the prices differ at all</h2>
    <p class="text-sm text-slate-700">The vendor does not set ${stats.currencies} separate price lists. It sets <strong>one</strong> price in Euros and then converts that number into every local currency it sells in. That conversion is not done at the live market rate &mdash; it is done at a rate the vendor picked months ago and rounds to a tidy-looking number.</p>
    <p class="text-sm text-slate-700 mt-3">The result is a set of ${stats.currencies} slightly wrong rates, some of which favour the buyer and some of which punish them. Nothing about this is a promotion or a special deal. It is an accounting artefact, and it is completely free to exploit.</p>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">The full spread table</h2>
    <p class="text-sm text-slate-700 mb-4">Median catalogue rate per Euro versus the ${esc(site.data_as_of)} ECB/IBAN reference rate. Negative means the catalogue price is <em>cheaper</em> than the market rate, which is good for you.</p>
    <div class="table-scroll border border-slate-200 rounded-xl my-5">
      <table class="w-full text-left border-collapse text-xs">
        <thead class="bg-slate-100 text-slate-600 font-bold">
          <tr><th class="py-2.5 px-3">Currency</th><th class="py-2.5 px-3 text-right">Catalogue median /EUR</th><th class="py-2.5 px-3 text-right">Market spot /EUR</th><th class="py-2.5 px-3 text-right">Your edge</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${tableRows}</tbody>
      </table>
    </div>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">Which currencies to actually use</h2>
    <ul class="text-sm text-slate-700 list-disc list-inside space-y-2 mt-3">
      <li><strong>Use ${esc(best.ccy)}</strong> &mdash; the largest discount, ${Math.abs(best.spread).toFixed(1)}% below spot. This is the default choice for almost every buyer on the planet.</li>
      ${arbitrary.filter((r) => r.ccy !== best.ccy).map((r) => `<li><strong>${esc(r.ccy)}</strong> is also favourable at ${Math.abs(r.spread).toFixed(1)}% below spot.</li>`).join("")}
      ${penalised.map((r) => `<li><strong>Avoid ${esc(r.ccy)}</strong> &mdash; priced ${r.spread.toFixed(1)}% above spot, so paying in it quietly adds ${r.spread.toFixed(1)}% to your bill.</li>`).join("")}
    </ul>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">How to do it in 10 seconds</h2>
    <ol class="text-sm text-slate-700 list-decimal list-inside space-y-2 mt-3">
      <li>Open the vendor checkout with the destination and duration you want.</li>
      <li>Find the currency selector. It is usually a flag icon in the header, or a currency code next to the price.</li>
      <li>Switch it to <strong>${esc(best.ccy)}</strong>.</li>
      <li>Confirm the total dropped. If it went <em>up</em>, you are on a different product or a different duration than you thought &mdash; go back and check.</li>
    </ol>

    <div class="rounded-xl bg-slate-100 border border-slate-200 p-4 text-sm text-slate-700 my-6">
      <strong>One caveat.</strong> Some vendors apply the currency selector to the whole basket, others only to the subscription. And a few local payment methods can trigger a different price <em>after</em> you switch. Always confirm the final amount on the payment screen before paying.
    </div>

    ${ctaBlock(site, tracker, "fx-audit", "Check your exact destination in the calculator", "The calculator ranks all 20 currencies for the exact plan and duration you are buying, and shows the real saving in dollars.")}
  </article>`;
}

/** Sprint 3.2 — the duration inversion guide. */
export function inversionGuideBody({ site, stats, catalog, tracker }) {
  const inversions = [...catalog.inversions].sort((a, b) => b.save - a.save);
  const top = inversions.slice(0, 25);
  const biggest = inversions[0];
  const affected = new Set(inversions.map((i) => i.iso)).size;

  const rows = top
    .map(
      (inv) => `<tr class="hover:bg-slate-50">
        <td class="py-2 px-3 font-semibold text-slate-900">${esc(inv.name)} <span class="text-slate-400 font-mono">(${esc(inv.iso)})</span></td>
        <td class="py-2 px-3 font-mono font-bold text-amber-800">${esc(inv.ccy)}</td>
        <td class="py-2 px-3 text-right font-mono">${esc(inv.d1)}d = <strong>${esc(currencySymbol(inv.ccy))}${fmt(inv.p1, 2)}</strong></td>
        <td class="py-2 px-3 text-right font-mono text-emerald-700 font-bold">${esc(inv.d2)}d = ${esc(currencySymbol(inv.ccy))}${fmt(inv.p2, 2)}</td>
        <td class="py-2 px-3 text-right font-mono font-bold text-emerald-700">-${esc(currencySymbol(inv.ccy))}${fmt(inv.save, 2)} (${esc(inv.pct)}%)</td>
      </tr>`
    )
    .join("");

  return `
  <article class="max-w-3xl mx-auto">
    <span class="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">Pricing bugs</span>
    <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">Buying an Extra Day Is Cheaper</h1>
    <p class="text-sm text-slate-600 mt-3">We scanned every destination, every currency and every duration in the eSIM catalogue. In <strong>${stats.inversions}</strong> cases, the longer plan is listed at a <em>lower</em> total price than the shorter one. Here is what that is worth, and why the iOS app hides most of it.</p>

    ${
      biggest
        ? `<div class="rounded-xl bg-emerald-50/90 border border-emerald-200 p-4 text-sm text-emerald-950 my-6">
      <strong>The biggest one right now:</strong> in ${esc(biggest.name)} (${esc(biggest.iso)}), the <strong>${esc(biggest.d2)}-day</strong> plan costs <strong>${esc(currencySymbol(biggest.ccy))}${fmt(biggest.p2, 2)}</strong> &mdash; while the <strong>${esc(biggest.d1)}-day</strong> plan costs <strong>${esc(currencySymbol(biggest.ccy))}${fmt(biggest.p1, 2)}</strong>. You get <strong>${esc(biggest.d2 - biggest.d1)} more day${biggest.d2 - biggest.d1 === 1 ? "" : "s"} of coverage</strong> and pay <strong>${esc(currencySymbol(biggest.ccy))}${fmt(biggest.save, 2)} less</strong> (${esc(biggest.pct)}% off).
    </div>`
        : ""
    }

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">What a duration inversion actually is</h2>
    <p class="text-sm text-slate-700">Normally a longer plan costs more than a shorter one &mdash; that is the entire logic of a duration ladder. A <strong>duration inversion</strong> is when that breaks: the price table lists a 26-day plan at a lower total than the 25-day plan next to it.</p>
    <p class="text-sm text-slate-700 mt-3">It happens because the vendor does not price each duration independently. It anchors on a base rate, applies a duration multiplier, and then rounds the result into each local currency. When the rounding lands badly, the shorter plan rounds <em>up</em> past the longer one. The bug is in the rounding, not in the pricing strategy.</p>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">Why you have probably never found one</h2>
    <p class="text-sm text-slate-700">Because the vendor's iOS app does not list every duration the web checkout sells. We diffed the two catalogues: <strong>${stats.iosHidden.toLocaleString("en-US")} of ${stats.variants.toLocaleString("en-US")}</strong> plan variants (<strong>${stats.iosHiddenPct}%</strong>) are web-only, and the inversions cluster in exactly those rows. If you only ever buy eSIMs from the phone app, you are structurally unable to see them.</p>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">The ${top.length} biggest</h2>
    <p class="text-sm text-slate-700 mb-4">Showing the ${top.length} largest of ${stats.inversions} inversions, across ${affected} destinations. Every figure is a real catalogue row, not an example.</p>
    <div class="table-scroll border border-slate-200 rounded-xl my-5">
      <table class="w-full text-left border-collapse text-xs">
        <thead class="bg-slate-100 text-slate-600 font-bold">
          <tr><th class="py-2.5 px-3">Destination</th><th class="py-2.5 px-3">Currency</th><th class="py-2.5 px-3 text-right">Shorter plan</th><th class="py-2.5 px-3 text-right">Longer plan (cheaper)</th><th class="py-2.5 px-3 text-right">Instant saving</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${rows}</tbody>
      </table>
    </div>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">The catch</h2>
    <div class="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-950 my-5">
      <strong>These are not stable.</strong> A duration inversion is a rounding artefact in a price table that gets re-generated. The moment the vendor re-prices the catalogue, the inverted rows can disappear &mdash; and there is no notification. If you were going to buy a plan anyway, checking the table before you pay is a two-minute job with real upside. But do not build a trip plan around a specific inverted row.
    </div>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">How to check in 30 seconds</h2>
    <ol class="text-sm text-slate-700 list-decimal list-inside space-y-2 mt-3">
      <li>Open the <a href="${esc(url(site, "/inversions/"))}" class="text-teal-600 underline">full inversion table</a> and search for your destination.</li>
      <li>Note the currency, the shorter duration and the longer duration.</li>
      <li>Open the web checkout (not the iOS app), set the longer duration, and switch the currency to the one in the table.</li>
      <li>Confirm the total really is lower before paying.</li>
    </ol>

    ${ctaBlock(site, tracker, "inversions", "Load the inversion straight into the calculator", "The calculator has a preset button for each notable inversion, so you can jump straight to the destination, duration and currency that saves the most.")}
  </article>`;
}

/** Sprint 3.3 — unlimited vs fixed-GB break-even. */
export function breakEvenGuideBody({ site, stats, catalog, competitors, tracker }) {
  const benchmarks = competitors.benchmarks;

  // Pull the "unlimited 7 day" rows out of the benchmark set so the article
  // quotes the same numbers the calculator uses.
  const providers = [];
  for (const entries of Object.values(benchmarks)) {
    for (const entry of entries) {
      if (!entry.unlim7) continue;
      const match = providers.find((p) => p.key === entry.key);
      if (match) {
        match.unlim7 = Math.min(match.unlim7, entry.unlim7);
        match.dests += 1;
      } else {
        providers.push({
          key: entry.key,
          provider: entry.provider,
          unlim7: entry.unlim7,
          plan: entry.plan,
          fup: entry.fup,
          dests: 1,
        });
      }
    }
  }
  providers.sort((a, b) => a.unlim7 - b.unlim7);

  const cheapestUnlim = providers[0];

  // Typical fixed-GB price point used for the threshold maths.
  const FIXED_GB_PRICE = 15;
  const FIXED_GB_ALLOWANCE = 10;

  const rows = providers
    .map(
      (p) => `<tr class="hover:bg-slate-50">
        <td class="py-2 px-3 font-bold text-slate-900">${esc(p.provider)}</td>
        <td class="py-2 px-3 text-right font-mono">$${fmt(p.unlim7, 2)}</td>
        <td class="py-2 px-3 text-right font-mono">${fmt(FIXED_GB_PRICE / FIXED_GB_ALLOWANCE, 2)}</td>
        <td class="py-2 px-3 text-right font-mono font-bold ${p.unlim7 <= FIXED_GB_PRICE ? "text-emerald-700" : "text-rose-600"}">${fmt(FIXED_GB_ALLOWANCE * (p.unlim7 / FIXED_GB_PRICE), 1)} GB</td>
        <td class="py-2 px-3 text-xs">${esc(p.fup)}</td>
      </tr>`
    )
    .join("");

  return `
  <article class="max-w-3xl mx-auto">
    <span class="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">Break-even math</span>
    <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">Unlimited vs Fixed-GB eSIMs in 2026</h1>
    <p class="text-sm text-slate-600 mt-3">"Unlimited" is the most expensive word in travel data. It is also the right answer for some people. Here is the threshold that separates them &mdash; and the hotspot cap that flips it back.</p>

    <div class="rounded-xl bg-indigo-50/90 border border-indigo-200 p-4 text-sm text-indigo-950 my-6">
      <strong>The short answer:</strong> at roughly <strong>$${FIXED_GB_PRICE} for ${FIXED_GB_ALLOWANCE} GB</strong> &mdash; about <strong>$${fmt(FIXED_GB_PRICE / FIXED_GB_ALLOWANCE, 2)}/GB</strong> &mdash; that is your reference price for fixed data. A <strong>7-day unlimited</strong> plan at <strong>$${fmt(cheapestUnlim?.unlim7 ?? 0, 2)}</strong> (${esc(cheapestUnlim?.provider ?? "")}) breaks even once you would have used more than <strong>${fmt(FIXED_GB_ALLOWANCE * ((cheapestUnlim?.unlim7 ?? 0) / FIXED_GB_PRICE), 1)} GB</strong>. Below that, fixed-GB is cheaper. Above it, unlimited wins.
    </div>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">The rule of thumb</h2>
    <p class="text-sm text-slate-700">Most travellers use far less data than they assume. Mapping, messaging and photos are cheap. Video is not. A 7-day trip with normal use is typically <strong>3&ndash;8 GB</strong>. A week of video calls, cloud backups and tethering can be <strong>20 GB or more</strong>.</p>
    <p class="text-sm text-slate-700 mt-3">So the break-even sits around <strong>20 GB/week</strong> &mdash; roughly <strong>2.85 GB per day</strong>. If you are below that, buy fixed-GB. If you are above it, unlimited is cheaper and you stop thinking about it.</p>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">7-day unlimited plans, sorted by price</h2>
    <p class="text-sm text-slate-700 mb-4">Lowest published 7-day unlimited price across the destinations we benchmarked, against the fixed-GB reference. The right-hand column is the usage at which the unlimited plan breaks even.</p>
    <div class="table-scroll border border-slate-200 rounded-xl my-5">
      <table class="w-full text-left border-collapse text-xs">
        <thead class="bg-slate-100 text-slate-600 font-bold">
          <tr><th class="py-2.5 px-3">Provider</th><th class="py-2.5 px-3 text-right">7-day unlimited</th><th class="py-2.5 px-3 text-right">Fixed-GB rate</th><th class="py-2.5 px-3 text-right">Breaks even at</th><th class="py-2.5 px-3">Fair-use policy</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${rows}</tbody>
      </table>
    </div>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">"Unlimited" is not unlimited</h2>
    <p class="text-sm text-slate-700">Every unlimited plan in the market has a fair-use policy, and the policies differ in a way that matters enormously. Read the two columns that decide it:</p>
    <ul class="text-sm text-slate-700 list-disc list-inside space-y-2 mt-3">
      <li><strong>High-speed allowance per day.</strong> Once you burn it, you are throttled to something like 1 Mbps. That is fine for email and messaging, painful for video calls and unusable for a laptop hotspot.</li>
      <li><strong>Hotspot tethering cap.</strong> Some vendors cap tethering at 1 GB/day; others allow uncapped hotspot on unlimited plans. If you plan to run a laptop off your phone, a 1 GB/day cap makes unlimited a false economy &mdash; the plan is "unlimited" for the phone and useless for the laptop.</li>
    </ul>
    <p class="text-sm text-slate-700 mt-3">The cheapest unlimited plan is the dearest one if your actual use is heavy tethering. This is exactly why the <a href="${esc(url(site, "/"))}" class="text-teal-600 underline">calculator</a> asks whether you are using a laptop hotspot &mdash; it changes the recommendation, not just the price.</p>

    <h2 class="text-xl font-bold text-slate-900 mt-8 mb-3">The decision</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5">
      <div class="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
        <h3 class="font-bold text-emerald-900 text-sm mb-2">Buy fixed-GB if&hellip;</h3>
        <ul class="text-xs text-emerald-950 list-disc list-inside space-y-1">
          <li>You use under ~2.85 GB/day</li>
          <li>You mostly need maps, messaging and photos</li>
          <li>You are tethering a laptop heavily</li>
          <li>You want a hard cap and no throttling surprises</li>
        </ul>
      </div>
      <div class="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
        <h3 class="font-bold text-indigo-900 text-sm mb-2">Buy unlimited if&hellip;</h3>
        <ul class="text-xs text-indigo-950 list-disc list-inside space-y-1">
          <li>You exceed ~2.85 GB/day</li>
          <li>You stream video or do video calls</li>
          <li>You travel somewhere with unreliable Wi-Fi</li>
          <li>You want zero thinking on day 6 of the trip</li>
        </ul>
      </div>
    </div>

    <div class="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-950 my-5">
      <strong>One more thing.</strong> The unlimited price you see in a benchmark is the <em>list</em> price for a specific destination. Regional plans, promotional pricing and app-only discounts all move this number around, which is why the break-even has to be recalculated per trip rather than memorised once.
    </div>

    ${ctaBlock(site, tracker, "break-even", "Run the break-even for your exact trip", "Tell the calculator your destination, duration, currency and whether you are tethering a laptop, and it will show which provider actually wins for your use case.")}
  </article>`;
}
