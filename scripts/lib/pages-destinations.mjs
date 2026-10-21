/**
 * Programmatic destination pages (roadmap Sprint 4.1).
 *
 * One static page per destination, generated from the catalogue. Each page is
 * a real comparison page: cheapest duration, currency ranking, the duration
 * inversion for that destination, competitor break-even, and monetised CTAs
 * pointing at the cheapest provider.
 */

import {
  esc,
  fmt,
  rankCurrencies,
  availableDays,
  bestInversionFor,
  cheapestPlan,
  bestProvider,
  toUsd,
  getPrice,
  currencySymbol,
} from "./analysis.mjs";
import { url } from "./layout.mjs";

/** Small stat tile used at the top of destination pages. */
export function statCard(label, value, tone = "slate") {
  const tones = {
    slate: "text-slate-900",
    teal: "text-teal-700",
    rose: "text-rose-600",
    amber: "text-amber-700",
  };
  return `<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-500">${esc(label)}</div>
    <div class="text-lg font-extrabold ${tones[tone] ?? tones.slate}">${esc(value)}</div>
  </div>`;
}

/**
 * Analyse a destination once, producing every figure the page needs.
 * Kept separate from the markup so the same analysis can be reused by the
 * sitemap, the JSON-LD and the destination index.
 */
export function analyseDestination({ catalog, fx, competitors, product }) {
  const { ccys } = catalog;
  const spot = fx.spot_per_eur;

  const inversion = bestInversionFor(product, catalog.inversions);
  const headlineDay = inversion?.d2 ?? 7;
  const ranking = rankCurrencies(product, headlineDay, ccys, spot);
  const provider = bestProvider(product, competitors.benchmarks);

  const usdPrice = getPrice(product, headlineDay, "USD", ccys) ?? 0;
  const usdEquiv = toUsd(usdPrice, "USD", spot);
  const bestCcy = ranking.best;
  const worstCcy = ranking.worst;

  const savingAbs = bestCcy ? usdEquiv - bestCcy.usdEquivalent : 0;
  const savingPct = usdEquiv > 0 ? (savingAbs / usdEquiv) * 100 : 0;

  const days = availableDays(product);
  const durationRows = days
    .map((day) => {
      const usd = getPrice(product, day, "USD", ccys);
      if (!usd) return null;
      const usdEq = toUsd(usd, "USD", spot);
      return {
        day,
        usd,
        usdEq,
        perDay: day > 0 ? usdEq / day : 0,
        iosVisible: (product.ios_days ?? []).includes(day),
      };
    })
    .filter(Boolean);

  const cheapestDuration = durationRows.reduce(
    (acc, row) => (!acc || row.usdEq < acc.usdEq ? row : acc),
    null
  );
  const bestPerDay = durationRows.reduce(
    (acc, row) => (!acc || row.perDay < acc.perDay ? row : acc),
    null
  );

  const destInversions = catalog.inversions
    .filter((inv) => inv.iso === product.iso)
    .sort((a, b) => b.save - a.save)
    .slice(0, 12);

  const iosDays = product.ios_days ?? [];
  const hiddenCount = days.filter((day) => !iosDays.includes(day)).length;

  return {
    product,
    ccys,
    spot,
    inversion,
    headlineDay,
    ranking,
    provider,
    usdPrice,
    usdEquiv,
    bestCcy,
    worstCcy,
    savingAbs,
    savingPct,
    days,
    durationRows,
    cheapestDuration,
    bestPerDay,
    destInversions,
    hiddenCount,
  };
}

/** Render the per-destination comparison body. */
export function renderDestinationBody({ site, stats, a, slug, tracker, related }) {
  const { product, bestCcy, worstCcy, headlineDay } = a;
  // The headline is the 7-day plan: a 1-day plan is the cheapest total but
  // is not what a traveller is shopping for.
  const headlineRow =
    a.durationRows.find((row) => row.day === 7) ?? a.cheapestDuration;
  const headlinePrice = headlineRow ? `$${fmt(headlineRow.usdEq, 2)}` : "—";
  const headlineDays = headlineRow?.day ?? headlineDay;
  const carrierList = product.carriers.split(" - ").slice(0, 4).join(", ");

  const currencyRows = a.ranking.rows
    .map(
      (row, index) => `
              <tr class="${index === 0 ? "bg-teal-50/70 font-semibold" : ""}">
                <td class="py-1.5 px-3 font-mono font-bold">${esc(row.ccy)}${index === 0 ? " &#9733;" : ""}</td>
                <td class="py-1.5 px-3 text-right font-mono">${esc(currencySymbol(row.ccy))}${fmt(row.amount, 2)}</td>
                <td class="py-1.5 px-3 text-right font-mono">$${fmt(row.usdEquivalent, 2)}</td>
                <td class="py-1.5 px-3 text-right font-mono ${row.diffPct < -3 ? "text-emerald-700 font-bold" : row.diffPct > 4 ? "text-rose-600 font-bold" : "text-slate-600"}">${row.diffPct >= 0 ? "+" : ""}${fmt(row.diffPct, 1)}%</td>
              </tr>`
    )
    .join("");

  const durationRows = a.durationRows
    .map(
      (row) => `
              <tr class="${row.day === a.bestPerDay?.day ? "bg-emerald-50/70" : ""}">
                <td class="py-1.5 px-3 font-mono font-bold">${esc(row.day)}d</td>
                <td class="py-1.5 px-3 text-right font-mono">$${fmt(row.usd, 2)}</td>
                <td class="py-1.5 px-3 text-right font-mono">$${fmt(row.usdEq, 2)}</td>
                <td class="py-1.5 px-3 text-right font-mono">$${fmt(row.perDay, 2)}</td>
                <td class="py-1.5 px-3 text-right">${row.iosVisible ? '<span class="text-emerald-700 font-semibold">Visible</span>' : '<span class="text-amber-700 font-semibold">Web only</span>'}</td>
              </tr>`
    )
    .join("");

  const inversionRows = a.destInversions.length
    ? a.destInversions
        .map(
          (inv) => `
              <tr class="hover:bg-slate-50">
                <td class="py-2 px-3 font-mono font-bold">${esc(inv.ccy)}</td>
                <td class="py-2 px-3 text-right font-mono">${esc(inv.d1)}d = <strong>${esc(currencySymbol(inv.ccy))}${fmt(inv.p1, 2)}</strong></td>
                <td class="py-2 px-3 text-right font-mono text-emerald-700 font-bold">${esc(inv.d2)}d = ${esc(currencySymbol(inv.ccy))}${fmt(inv.p2, 2)}</td>
                <td class="py-2 px-3 text-right font-mono font-bold text-emerald-700">-${esc(currencySymbol(inv.ccy))}${fmt(inv.save, 2)} (${esc(inv.pct)}%)</td>
              </tr>`
        )
        .join("")
    : `<tr><td colspan="4" class="py-3 px-3 text-slate-500">No duration inversion recorded for this destination &mdash; prices rise monotonically here, so pick the duration you actually need.</td></tr>`;

  const providerRows = a.provider
    ? a.provider.candidates
        .map((candidate) => {
          const isWinner = a.provider.winner?.key === candidate.key;
          const href = tracker.link(candidate.key, slug);
          return `
              <div class="p-3 rounded-xl border ${isWinner ? "border-emerald-300 bg-emerald-50/70" : "border-slate-200 bg-slate-50/70"} flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-sm text-slate-900">${esc(candidate.provider)}</span>
                    ${isWinner ? '<span class="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded">Cheapest</span>' : ""}
                  </div>
                  <div class="text-[11px] text-slate-600 truncate">${esc(candidate.plan)}</div>
                  <div class="text-[10px] text-slate-500 truncate">${esc(candidate.fup)}</div>
                </div>
                <a href="${esc(href)}" target="_blank" rel="sponsored noopener noreferrer" class="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition">$${fmt(candidate.price, 2)} &rarr;</a>
              </div>`;
        })
        .join("")
    : `<p class="text-xs text-slate-500">No verified competitor benchmark for this destination yet. Use the <a href="${esc(url(site, "/"))}" class="text-teal-600 underline">calculator</a> for the live price table.</p>`;

  const relatedLinks = related.length
    ? related
        .map(
          (item) =>
            `<a href="${esc(url(site, `/destinations/${item.slug}/`))}" class="block rounded-xl border border-slate-200 bg-white hover:border-teal-300 hover:shadow-sm transition p-3">
              <div class="font-bold text-sm text-slate-900">${esc(item.name)}</div>
              <div class="text-[11px] text-slate-500">${esc(item.summary)}</div>
            </a>`
        )
        .join("")
    : "";

  const holaflyHref = tracker.link("holafly", slug);

  return `
  <nav aria-label="Breadcrumb" class="text-xs text-slate-500 mb-4">
    <a href="${esc(url(site, "/"))}" class="hover:text-teal-700">Calculator</a>
    <span class="mx-1.5">/</span>
    <a href="${esc(url(site, "/destinations/"))}" class="hover:text-teal-700">Destinations</a>
    <span class="mx-1.5">/</span>
    <span class="font-semibold text-slate-700">${esc(product.name)}</span>
  </nav>

  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 mb-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <span class="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">${esc(product.type)} &middot; ${esc(product.iso)}</span>
        <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-3 tracking-tight">How Much Does an eSIM Cost in ${esc(product.name)}?</h1>
        <p class="text-sm text-slate-600 mt-2 max-w-2xl">The cheapest ${esc(product.plantype)} plan for ${esc(product.name)} is <strong>${esc(headlinePrice)}</strong> for ${esc(headlineDays)} days. Pay in ${esc(bestCcy?.ccy ?? "USD")} at checkout to save another ${fmt(a.savingPct, 1)}%. Works on ${esc(carrierList)}${product.has5g ? ", 5G" : ", 4G"}. Hotspot capped at ${esc(product.tether_mb)} MB/day${product.tether_accum ? ", with rollover" : ""}.</p>
      </div>
      <div class="text-right">
        <div class="text-xs font-bold uppercase tracking-wider text-slate-500">Cheapest ${esc(product.plantype)} plan</div>
        <div class="text-3xl font-extrabold text-[#0F2942]">${esc(headlinePrice)}</div>
        <div class="text-xs text-slate-500">${esc(headlineDays)}-day &middot; USD equivalent</div>
      </div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
      ${statCard("Trip lengths available", String(a.days.length))}
      ${statCard("Pay in", bestCcy ? bestCcy.ccy : "—", "teal")}
      ${statCard("Save by switching currency", bestCcy ? `${fmt(a.savingPct, 0)}%` : "—", "teal")}
      ${statCard("Only in the web checkout", String(a.hiddenCount), a.hiddenCount ? "amber" : "slate")}
    </div>
  </section>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2 space-y-6">

      <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
        <span class="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">Save money at checkout</span>
        <h2 class="text-lg font-bold text-slate-900 mt-3 mb-1">Pay in ${esc(bestCcy?.ccy ?? "USD")}, not ${esc(worstCcy?.ccy ?? "USD")}</h2>
        <p class="text-xs text-slate-500 mb-4">The same ${esc(headlineDay)}-day ${esc(product.name)} plan is sold in ${a.ranking.rows.length} currencies. Here is what each one costs in dollars, so you can pick the cheapest one at checkout.</p>
        <div class="rounded-xl bg-teal-50/90 border border-teal-200 p-3.5 text-xs text-teal-900 mb-4">
          <strong>Switch the currency selector to ${esc(bestCcy?.ccy ?? "—")} and you save $${fmt(a.savingAbs, 2)} (${fmt(a.savingPct, 1)}% off)}</strong> compared with paying in USD. Avoid ${esc(worstCcy?.ccy ?? "—")} &mdash; it costs $${fmt(worstCcy?.usdEquivalent ?? 0, 2)}, ${fmt(worstCcy?.diffPct ?? 0, 1)}% more.
        </div>
        <div class="table-scroll border border-slate-200 rounded-xl">
          <table class="w-full text-left border-collapse text-xs">
            <thead class="bg-slate-100 text-slate-600 font-bold">
              <tr><th class="py-2 px-3">Currency</th><th class="py-2 px-3 text-right">Local price</th><th class="py-2 px-3 text-right">USD equiv.</th><th class="py-2 px-3 text-right">vs. USD</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">${currencyRows}</tbody>
          </table>
        </div>
      </section>
      <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
        <span class="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">Longer plans, lower price</span>
        <h2 class="text-lg font-bold text-slate-900 mt-3 mb-1">${a.destInversions.length ? `Some longer plans cost less than shorter ones` : `Prices rise with trip length here`}</h2>
        <p class="text-xs text-slate-500 mb-4">${a.destInversions.length ? `${a.destInversions.length} trip length${a.destInversions.length === 1 ? "" : "s"} in ${esc(product.name)} ${a.destInversions.length === 1 ? "is" : "are"} cheaper than the shorter option. Each row below means you get more data for less.` : `Every longer plan in ${esc(product.name)} costs more, so pick the trip length you actually need.`}</p>
        <div class="table-scroll border border-slate-200 rounded-xl">
          <table class="w-full text-left border-collapse text-xs">
            <thead class="bg-slate-100 text-slate-600 font-bold">
              <tr><th class="py-2 px-3">Currency</th><th class="py-2 px-3 text-right">Shorter plan</th><th class="py-2 px-3 text-right">Longer plan (cheaper)</th><th class="py-2 px-3 text-right">Instant saving</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">${inversionRows}</tbody>
          </table>
        </div>
        <div class="rounded-xl bg-amber-50/80 border border-amber-200 p-3.5 text-xs text-amber-950 mt-4">
          <strong>Why this happens:</strong> the vendor prices its catalogue off a single Euro base and re-rounds into each local currency. When the rounding lands badly, a longer plan can land under a shorter one. It is a pricing artefact, not a promotion &mdash; and it disappears the moment the catalogue is re-priced, so grab it while the table looks like this.
        </div>
      </section>

      <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
        <h2 class="text-lg font-bold text-slate-900 mb-1">Every trip length, priced</h2>
        <p class="text-xs text-slate-500 mb-4">What each plan costs in total, in dollars, and per day &mdash; so you can see which length works out best for your trip.</p>
        <div class="table-scroll border border-slate-200 rounded-xl">
          <table class="w-full text-left border-collapse text-xs">
            <thead class="bg-slate-100 text-slate-600 font-bold">
              <tr><th class="py-2 px-3">Duration</th><th class="py-2 px-3 text-right">List price</th><th class="py-2 px-3 text-right">USD equiv.</th><th class="py-2 px-3 text-right">Per day</th><th class="py-2 px-3 text-right">iOS app</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">${durationRows}</tbody>
          </table>
        </div>
        ${a.hiddenCount ? `<p class="text-[11px] text-slate-500 mt-3"><strong class="text-amber-700">Buy on the web:</strong> ${a.hiddenCount} of these ${a.days.length} trip lengths are not available in the vendor's iOS app &mdash; only on the website checkout. The currency saving above still applies there.</p>` : ""}
      </section>
    </div>

    <aside class="space-y-6">
      <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sticky top-24">
        <h2 class="text-base font-bold text-slate-900 mb-1">Who to buy from</h2>
        <p class="text-xs text-slate-500 mb-4">The same trip priced by each provider, so you can see who is cheapest. We may earn a commission if you buy &mdash; it costs you nothing extra.</p>
        <div class="space-y-2.5">${providerRows}</div>
        <a href="${esc(holaflyHref)}" target="_blank" rel="sponsored noopener noreferrer" class="mt-4 block w-full text-center bg-[#0F2942] hover:bg-slate-800 text-white font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition">
          Get ${esc(product.name)} from ${esc(headlinePrice)} &rarr;
        </a>
        <a href="${esc(url(site, `/?dest=${product.iso}`))}" class="mt-2 block w-full text-center bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 font-semibold text-xs sm:text-sm py-2.5 px-4 rounded-xl transition">
          Check a different trip length
        </a>
      </section>

      ${relatedLinks ? `<section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <h2 class="text-base font-bold text-slate-900 mb-3">Compare nearby destinations</h2>
        <div class="space-y-2">${relatedLinks}</div>
      </section>` : ""}
    </aside>
  </div>`;
}
