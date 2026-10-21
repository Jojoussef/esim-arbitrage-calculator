/**
 * Hub / index pages plus the static legal pages.
 */

import { esc, fmt, rankCurrencies, toUsd, currencySymbol } from "./analysis.mjs";
import { renderPage, url } from "./layout.mjs";
import { statCard } from "./pages-destinations.mjs";

/** A simple static page wrapper (privacy, disclosure, ...). */
export function buildStaticPage({ site, stats, slug, title, description, nav, body, priority = 0.4 }) {
  const path = `/${slug}/index.html`;
  const page = {
    path: `/${slug}/`,
    title,
    description,
    nav,
    priority,
  };
  return { path, page, html: renderPage({ site, page, stats, body }) };
}

/** The destinations index: every audited destination, sorted by name. */
export function buildDestinationsIndex({ site, stats, catalog, analyses, slugs, tracker }) {
  const sorted = [...analyses].sort((a, b) =>
    a.product.name.localeCompare(b.product.name)
  );

  const cards = sorted
    .map((a) => {
      const slug = slugs.get(a.product.iso);
      const cheapest = a.cheapestDuration;
      return `<a href="${esc(url(site, `/destinations/${slug}/`))}" class="block rounded-xl border border-slate-200 bg-white hover:border-teal-300 hover:shadow-sm transition p-3.5">
        <div class="flex items-center justify-between gap-2">
          <span class="font-bold text-sm text-slate-900">${esc(a.product.name)}</span>
          <span class="text-[10px] font-mono text-slate-400">${esc(a.product.iso)}</span>
        </div>
        <div class="text-[11px] text-slate-500 mt-1">${esc(a.product.type)} &middot; ${a.days.length} durations</div>
        <div class="text-xs mt-2 font-semibold text-[#0F2942]">from $${fmt(cheapest?.usdEq ?? 0, 2)}${a.bestCcy ? ` <span class="text-emerald-700">· pay in ${esc(a.bestCcy.ccy)}</span>` : ""}</div>
      </a>`;
    })
    .join("");

  const body = `
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 mb-6">
    <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">All ${stats.destinations} audited destinations</h1>
    <p class="text-sm text-slate-600 mt-2 max-w-3xl">Every destination in the Oct 2026 vendor catalogue, with the cheapest checkout currency and the cheapest plan we found. Each page shows the full duration price ladder, currency ranking and the cheapest competing provider.</p>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
      ${statCard("Destinations", String(stats.destinations))}
      ${statCard("Currencies", String(stats.currencies), "teal")}
      ${statCard("Price points", stats.prices.toLocaleString("en-US"), "teal")}
      ${statCard("Duration inversions", String(stats.inversions), "amber")}
    </div>
  </section>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    ${cards}
  </div>`;

  return buildStaticPage({
    site,
    stats,
    slug: "destinations",
    title: `All ${stats.destinations} eSIM Destinations Audited — Cheapest Prices & Currencies | 2026`,
    description: `Browse all ${stats.destinations} eSIM destinations we audited: ${stats.prices.toLocaleString("en-US")} prices across ${stats.currencies} currencies, with the cheapest checkout currency for every country and region.`,
    nav: "destinations",
    body,
    priority: 0.9,
  });
}

/** The inversions hub: every duration price inversion, sorted by saving. */
export function buildInversionsPage({ site, stats, catalog, tracker }) {
  const inversions = [...catalog.inversions].sort((a, b) => b.save - a.save);
  const top = inversions.slice(0, 60);
  const biggest = inversions[0];

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

  const body = `
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 mb-6">
    <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">${stats.inversions} places where buying an extra day costs less</h1>
    <p class="text-sm text-slate-600 mt-2 max-w-3xl">A duration inversion is a pricing bug in the vendor catalogue: the longer plan is listed at a lower total price than the shorter one. These are real, live rows from the ${esc(site.data_as_of)} catalogue, converted for readability.</p>
    ${
      biggest
        ? `<div class="rounded-xl bg-emerald-50/90 border border-emerald-200 p-4 text-sm text-emerald-950 mt-5">
      <strong>Biggest one right now:</strong> in ${esc(biggest.name)} (${esc(biggest.iso)}), the <strong>${esc(biggest.d2)}-day</strong> plan costs <strong>${esc(currencySymbol(biggest.ccy))}${fmt(biggest.p2, 2)}</strong> while the <strong>${esc(biggest.d1)}-day</strong> plan costs <strong>${esc(currencySymbol(biggest.ccy))}${fmt(biggest.p1, 2)}</strong>. That is ${esc(currencySymbol(biggest.ccy))}${fmt(biggest.save, 2)} cheaper (${esc(biggest.pct)}%) for <strong>more</strong> coverage.
    </div>`
        : ""
    }
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
      ${statCard("Inversions", String(stats.inversions), "amber")}
      ${statCard("Duplicate conflicts", String(stats.duplicates), "rose")}
      ${statCard("Destinations hit", String(new Set(inversions.map((i) => i.iso)).size))}
      ${statCard("Currencies affected", String(new Set(inversions.map((i) => i.ccy)).size), "teal")}
    </div>
  </section>

  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
    <h2 class="text-lg font-bold text-slate-900 mb-1">Top ${top.length} inversions by absolute saving</h2>
    <p class="text-xs text-slate-500 mb-4">Showing the ${top.length} largest of ${stats.inversions}. The <a href="${esc(url(site, "/"))}" class="text-teal-600 underline">calculator</a> lets you load any of them directly.</p>
    <div class="table-scroll border border-slate-200 rounded-xl">
      <table class="w-full text-left border-collapse text-xs">
        <thead class="bg-slate-100 text-slate-600 font-bold">
          <tr><th class="py-2.5 px-3">Destination</th><th class="py-2.5 px-3">Currency</th><th class="py-2.5 px-3 text-right">Shorter plan</th><th class="py-2.5 px-3 text-right">Longer plan (cheaper)</th><th class="py-2.5 px-3 text-right">Instant saving</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${rows}</tbody>
      </table>
    </div>
  </section>`;

  return buildStaticPage({
    site,
    stats,
    slug: "inversions",
    title: `${stats.inversions} eSIM Duration Price Inversions — Where More Days Cost Less | 2026`,
    description: `We found ${stats.inversions} duration price inversions in the eSIM catalogue: plans where buying more days is cheaper than buying fewer. Full table with real savings.`,
    nav: "",
    body,
    priority: 0.8,
  });
}

/** The FX audit: catalogue median vs. Oct 2026 spot, for every currency. */
export function buildFxAuditPage({ site, stats, catalog, fx, tracker }) {
  const { ccys } = catalog;
  const spot = fx.spot_per_eur;
  const med = fx.catalog_median_per_eur;

  const rows = ccys
    .map((ccy) => {
      const medEur = med[ccy] ?? 1;
      const medUsd = medEur / (med.USD ?? 1);
      const spotEur = spot[ccy] ?? 1;
      const spotUsd = spotEur / (spot.USD ?? 1);
      const spreadEur = (medEur / spotEur - 1) * 100;
      const spreadUsd = (medUsd / spotUsd - 1) * 100;
      let rec;
      if (spreadEur < -5) rec = "Strong arbitrage currency — use at checkout";
      else if (spreadEur > 5) rec = "Overpriced local table — avoid";
      else rec = "Near market parity";
      return { ccy, medEur, medUsd, spotEur, spreadEur, spreadUsd, rec };
    })
    .sort((a, b) => a.spreadEur - b.spreadEur);

  const best = rows[0];
  const worst = rows[rows.length - 1];

  const tableRows = rows
    .map(
      (r) => `<tr class="hover:bg-slate-50">
        <td class="py-2 px-3 font-mono font-bold text-slate-900">${esc(r.ccy)}</td>
        <td class="py-2 px-3 text-right font-mono">${r.medEur.toFixed(4)}</td>
        <td class="py-2 px-3 text-right font-mono">${r.medUsd.toFixed(4)}</td>
        <td class="py-2 px-3 text-right font-mono">${r.spotEur.toFixed(4)}</td>
        <td class="py-2 px-3 text-right font-mono ${r.spreadEur < -2 ? "text-emerald-700 font-bold" : r.spreadEur > 3 ? "text-rose-600 font-bold" : "text-slate-700"}">${r.spreadEur >= 0 ? "+" : ""}${r.spreadEur.toFixed(1)}%</td>
        <td class="py-2 px-3 text-right font-mono ${r.spreadUsd < -2 ? "text-emerald-700 font-bold" : r.spreadUsd > 3 ? "text-rose-600 font-bold" : "text-slate-700"}">${r.spreadUsd >= 0 ? "+" : ""}${r.spreadUsd.toFixed(1)}%</td>
        <td class="py-2 px-3 text-xs">${esc(r.rec)}</td>
      </tr>`
    )
    .join("");

  const body = `
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 mb-6">
    <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">${stats.currencies}-currency FX audit</h1>
    <p class="text-sm text-slate-600 mt-2 max-w-3xl">The vendor prices its whole catalogue off a single Euro base, then re-rounds into each local currency. We compared the median catalogue rate for every currency against the ${esc(site.data_as_of)} ECB/IBAN reference rate. The gap is your margin.</p>
    <div class="rounded-xl bg-teal-50/90 border border-teal-200 p-4 text-sm text-teal-950 mt-5">
      <strong>The headline:</strong> <strong>${esc(best.ccy)}</strong> is priced ${Math.abs(best.spreadEur).toFixed(1)}% <strong>below</strong> spot, while <strong>${esc(worst.ccy)}</strong> is priced ${worst.spreadEur.toFixed(1)}% <strong>above</strong> it. Switch the checkout currency to ${esc(best.ccy)} and you keep the difference &mdash; on every single plan, in every destination.
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
      ${statCard("Currencies audited", String(stats.currencies))}
      ${statCard("Cheapest currency", best.ccy, "teal")}
      ${statCard("Most expensive", worst.ccy, "rose")}
      ${statCard("Median spread", `${rows[Math.floor(rows.length / 2)].spreadEur.toFixed(1)}%`)}
    </div>
  </section>

  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
    <h2 class="text-lg font-bold text-slate-900 mb-1">Catalogue median vs. market spot</h2>
    <p class="text-xs text-slate-500 mb-4">Spot rates from <a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline">ECB reference rates</a> and <a href="https://www.iban.com/exchange-rates" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline">IBAN</a>, as of ${esc(site.data_as_of)}.</p>
    <div class="table-scroll border border-slate-200 rounded-xl">
      <table class="w-full text-left border-collapse text-xs">
        <thead class="bg-slate-100 text-slate-600 font-bold">
          <tr><th class="py-2.5 px-3">Currency</th><th class="py-2.5 px-3 text-right">Catalog median /EUR</th><th class="py-2.5 px-3 text-right">Catalog median /USD</th><th class="py-2.5 px-3 text-right">Spot /EUR</th><th class="py-2.5 px-3 text-right">Spread vs EUR</th><th class="py-2.5 px-3 text-right">Spread vs USD</th><th class="py-2.5 px-3">Recommendation</th></tr>
        </thead>
        <tbody class="divide-y divide-slate-100">${tableRows}</tbody>
      </table>
    </div>
  </section>`;

  return buildStaticPage({
    site,
    stats,
    slug: "fx-audit",
    title: `${stats.currencies}-Currency eSIM FX Audit — Find the Cheapest Checkout Currency | 2026`,
    description: `The eSIM catalogue is priced off a Euro base. We compared every currency's median rate against the Oct 2026 ECB/IBAN spot rate to find where checkout currency arbitrage is real.`,
    nav: "fx",
    body,
    priority: 0.85,
  });
}

/** Methodology: how the audit is produced, so the numbers are defensible. */
export function buildMethodologyPage({ site, stats, catalog, fx, competitors, tracker }) {
  const body = `
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 mb-6">
    <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Methodology</h1>
    <p class="text-sm text-slate-600 mt-2 max-w-3xl">Everything on this site comes from one static catalogue snapshot, cross-checked against public reference rates. No estimates, no scraped competitor pages, no models.</p>
  </section>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
      <h2 class="text-base font-bold text-slate-900 mb-3">1. The catalogue snapshot</h2>
      <p class="text-xs text-slate-600">The vendor publishes a per-plan price table for every destination, in ${stats.currencies} currencies, across every duration they sell. We captured the full table on ${esc(site.data_as_of)}: <strong>${stats.destinations}</strong> destinations, <strong>${stats.variants.toLocaleString("en-US")}</strong> plan variants, <strong>${stats.prices.toLocaleString("en-US")}</strong> individual price points.</p>
    </section>

    <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
      <h2 class="text-base font-bold text-slate-900 mb-3">2. FX normalisation</h2>
      <p class="text-xs text-slate-600">Every price is converted to USD using the ${esc(site.data_as_of)} ECB euro reference rate and IBAN rates. The rate table is published in full on the <a href="${esc(url(site, "/fx-audit/"))}" class="text-teal-600 underline">FX audit page</a>, so every conversion on this site can be re-checked by hand.</p>
    </section>

    <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
      <h2 class="text-base font-bold text-slate-900 mb-3">3. Inversion detection</h2>
      <p class="text-xs text-slate-600">For every destination and currency we sort the durations ascending and flag any adjacent pair where the longer plan's total price is lower than the shorter one's. We found <strong>${stats.inversions}</strong> such pairs plus <strong>${stats.duplicates}</strong> duplicate rows where the same currency key carries two conflicting prices.</p>
    </section>

    <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
      <h2 class="text-base font-bold text-slate-900 mb-3">4. iOS visibility</h2>
      <p class="text-xs text-slate-600">The vendor's iOS app does not list every duration the web checkout sells. We diff the two catalogues: <strong>${stats.iosHidden.toLocaleString("en-US")}</strong> of ${stats.variants.toLocaleString("en-US")} plan variants (${stats.iosHiddenPct}%) are web-only. Those durations are often where the inversions hide.</p>
    </section>

    <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
      <h2 class="text-base font-bold text-slate-900 mb-3">5. Competitor benchmarks</h2>
      <p class="text-xs text-slate-600">For ${Object.keys(competitors.benchmarks).length} destinations we recorded the published list price of competing eSIM products (Nomad, Saily, Airalo, Yesim, Jetpac) so the calculator can show a genuine break-even rather than a brand ranking. Benchmarks are ${esc(competitors.as_of)} list prices and move often.</p>
    </section>

    <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6">
      <h2 class="text-base font-bold text-slate-900 mb-3">6. How this site earns money</h2>
      <p class="text-xs text-slate-600">Through affiliate links. We earn a commission when you buy through them, at no extra cost to you. <strong>Ranking is never paid for.</strong> The "cheapest provider" card is sorted by price, and a paid placement would have to be labelled as such. Full details on the <a href="${esc(url(site, "/disclosure/"))}" class="text-teal-600 underline">disclosure page</a>.</p>
    </section>
  </div>

  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-6 mt-6">
    <h2 class="text-base font-bold text-slate-900 mb-3">The raw data</h2>
    <p class="text-xs text-slate-600 mb-3">The entire dataset is published as JSON so anyone can verify it, and the build scripts that produced this site are on <a href="https://github.com/${esc(site.repo)}" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline">GitHub</a>.</p>
    <div class="flex flex-wrap gap-2">
      <a href="${esc(url(site, "/data/catalog.json"))}" class="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">catalog.json</a>
      <a href="${esc(url(site, "/data/fx.json"))}" class="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">fx.json</a>
      <a href="${esc(url(site, "/data/competitors.json"))}" class="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">competitors.json</a>
      <a href="${esc(url(site, "/data/stats.json"))}" class="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200">stats.json</a>
    </div>
  </section>`;

  return buildStaticPage({
    site,
    stats,
    slug: "methodology",
    title: "Methodology — How the eSIM Price Audit Works",
    description:
      "Exactly how the eSIM arbitrage audit is produced: the catalogue snapshot, FX normalisation, inversion detection, iOS visibility diff and competitor benchmarks.",
    nav: "",
    body,
    priority: 0.5,
  });
}

/** The guides hub: links to the editorial posts. */
export function buildGuidesIndex({ site, stats, guideIndex }) {
  const cards = guideIndex
    .map(
      (guide) => `<a href="${esc(url(site, `/guides/${guide.slug}/`))}" class="block rounded-2xl border border-slate-200 bg-white hover:border-teal-300 hover:shadow-md transition p-5">
        <span class="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">${esc(guide.tag)}</span>
        <h2 class="text-base font-bold text-slate-900 mt-3">${esc(guide.title)}</h2>
        <p class="text-xs text-slate-600 mt-2">${esc(guide.excerpt)}</p>
        <div class="text-[11px] text-slate-400 mt-3 font-semibold">Read the analysis &rarr;</div>
      </a>`
    )
    .join("");

  const body = `
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7 mb-6">
    <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Guides &amp; audits</h1>
    <p class="text-sm text-slate-600 mt-2 max-w-3xl">Long-form write-ups built from the same ${stats.prices.toLocaleString("en-US")}-price dataset that powers the calculator. Every claim links back to the rows it came from.</p>
  </section>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
    ${cards}
  </div>`;

  return buildStaticPage({
    site,
    stats,
    slug: "guides",
    title: "eSIM Guides & Audits — Checkout Currency, Duration Inversions, Break-Even Math",
    description:
      "Data-driven eSIM buying guides: the currency arbitrage audit, where buying an extra day costs less, and the unlimited vs fixed-GB break-even math.",
    nav: "guides",
    body,
    priority: 0.85,
  });
}

/** Privacy policy body. */
export function privacyBody(site, stats) {
  return `
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7">
    <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">Privacy Policy</h1>
    <p class="text-xs text-slate-500 mt-2">Last updated ${esc(site.data_as_of)}</p>

    <div class="mt-6 space-y-5 text-sm text-slate-700">
      <section>
        <h2 class="font-bold text-slate-900 mb-1">The short version</h2>
        <p class="text-xs text-slate-600">This site has no accounts, no login, no database and no server-side collection. We do not know who you are and we do not build a profile of you.</p>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-1">What we collect</h2>
        <p class="text-xs text-slate-600">Nothing directly. The calculator runs entirely in your browser. Your selections (destination, duration, currency) are held in page memory and are never transmitted anywhere. We deliberately removed the tool's local-storage save feature from the public deployment so that no behavioural data accumulates in your browser either.</p>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-1">Third parties</h2>
        <p class="text-xs text-slate-600">Two categories of third party are involved:</p>
        <ul class="text-xs text-slate-600 list-disc list-inside mt-2 space-y-1">
          <li><strong>Content delivery:</strong> Tailwind CSS, Chart.js, Google Fonts and the Inter typeface are loaded from CDNs. Those providers will see your IP address as part of serving the file.</li>
          <li><strong>Affiliate links:</strong> when you click a "buy" button you are sent to a vendor (Holafly, Nomad, Saily, Airalo, Yesim, Jetpac or Cellesim) and their own privacy policy applies from that point on. We receive a referral notification from them; we do not receive your personal data.</li>
        </ul>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-1">Cookies</h2>
        <p class="text-xs text-slate-600">This site sets no cookies of its own. The affiliate links carry UTM parameters in the query string; these are read by the destination vendor, not stored here.</p>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-1">Hosting and logs</h2>
        <p class="text-xs text-slate-600">The site is hosted on GitHub Pages. As with any web host, standard technical logs (IP address, user agent, requested path) may be processed for security and abuse prevention, in line with the GitHub privacy statement.</p>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-1">Contact</h2>
        <p class="text-xs text-slate-600">Questions about this policy can go to <a href="https://github.com/${esc(site.repo)}/issues" target="_blank" rel="noopener noreferrer" class="text-teal-600 underline">the public issue tracker</a> on the source repository.</p>
      </section>
    </div>
  </section>`;
}

/** Affiliate disclosure body — the FTC-mandated explanation. */
export function disclosureBody(site, stats, affiliateConfig) {
  const programs = Object.entries(affiliateConfig.programs ?? {}).map(
    ([key, program]) => `
        <tr class="hover:bg-slate-50">
          <td class="py-2 px-3 font-bold text-slate-900">${esc(program.name)}</td>
          <td class="py-2 px-3 text-xs">${esc(program.rate)}</td>
          <td class="py-2 px-3 text-xs font-mono">${esc(program.program_url.replace(/^https?:\/\//, ""))}</td>
          <td class="py-2 px-3 text-xs">${program.url !== program.fallback ? '<span class="text-emerald-700 font-semibold">Tracking link active</span>' : '<span class="text-amber-700 font-semibold">Awaiting tracking link</span>'}</td>
        </tr>`
  );

  return `
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 sm:p-7">
    <h1 class="text-2xl font-extrabold text-slate-900 tracking-tight">Affiliate Disclosure</h1>
    <p class="text-xs text-slate-500 mt-2">Last updated ${esc(site.data_as_of)}</p>

    <div class="mt-6 space-y-5 text-sm text-slate-700">
      <section class="rounded-xl bg-amber-50 border border-amber-200 p-4">
        <p class="text-sm text-amber-950"><strong>In plain English:</strong> this site is free to use and we make money when you buy an eSIM through the links on it. If you click one of our links and buy something, the vendor may pay us a commission. <strong>You pay exactly the same price either way</strong> &mdash; the commission comes out of the vendor's margin, never out of your pocket.</p>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-2">Which vendors we earn from</h2>
        <div class="table-scroll border border-slate-200 rounded-xl">
          <table class="w-full text-left border-collapse text-xs">
            <thead class="bg-slate-100 text-slate-600 font-bold">
              <tr><th class="py-2 px-3">Vendor</th><th class="py-2 px-3">Commission</th><th class="py-2 px-3">Programme</th><th class="py-2 px-3">Status</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100">${programs.join("")}</tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-1">Ranking is never paid for</h2>
        <p class="text-xs text-slate-600">When the calculator shows a "cheapest provider" card, that list is sorted by <strong>price</strong> and nothing else. We do not accept payment to appear in a list, to be placed first, or to be labelled as a recommendation. If a paid placement ever existed it would be labelled as an advertisement directly next to the link.</p>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-1">How the price data is collected</h2>
        <p class="text-xs text-slate-600">Prices come from the vendor's own published catalogue, captured on ${esc(site.data_as_of)}, and converted to USD using the ECB euro reference rate and IBAN rates. We do not receive special pricing, hidden discounts or preferential treatment. If our affiliate relationship ever did change a price, we would not show that price. The full method is on the <a href="${esc(url(site, "/methodology/"))}" class="text-teal-600 underline">methodology page</a>.</p>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-1">What we do not do</h2>
        <ul class="text-xs text-slate-600 list-disc list-inside space-y-1">
          <li>We do not insert fake review scores or fabricated "recommended" badges.</li>
          <li>We do not edit the vendor's price to make our preferred vendor look cheaper than it is.</li>
          <li>We do not claim to be independent of the vendors while accepting their commissions &mdash; this disclosure exists precisely because we are not.</li>
        </ul>
      </section>

      <section>
        <h2 class="font-bold text-slate-900 mb-1">Accuracy</h2>
        <p class="text-xs text-slate-600">Prices, availability and product features change constantly and are outside our control. Everything here reflects the catalogue as of ${esc(site.data_as_of)}. Always confirm the final price on the vendor's checkout page before buying.</p>
      </section>
    </div>
  </section>`;
}
