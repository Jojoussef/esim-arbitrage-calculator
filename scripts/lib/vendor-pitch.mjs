/**
 * The vendor pitch: a media kit page a vendor can read to decide.
 *
 * The affiliate programmes rejected the publisher, so the route to revenue is
 * direct: approach the vendors (and their affiliate networks) with the
 * asset and let them buy placement.
 *
 * The kit is generated from the real dataset, so the numbers in it are
 * always true.
 */

import { esc } from "./analysis.mjs";
import { renderPage } from "./layout.mjs";
import { renderDataLicenseBlock } from "./lead-gen.mjs";

/** Compute the asset figures used by the page and the text kit. */
export function computeAssetFigures(catalog, stats) {
  const carriers = new Set();
  let prices = 0;
  let variants = 0;
  let hidden = 0;

  for (const product of catalog.products) {
    const ios = new Set(product.ios_days ?? []);
    for (const [day, values] of Object.entries(product.d ?? {})) {
      variants += 1;
      prices += values.length;
      if (!ios.has(Number(day))) hidden += 1;
    }
    for (const carrier of product.carriers.split(" - ")) carriers.add(carrier.trim());
  }

  return { carriers: carriers.size, prices, variants, hidden };
}

/** Build the public media-kit page. */
export function buildAdvertisePage({ site, stats, catalog, monetization }) {
  const fig = computeAssetFigures(catalog, stats);
  const contact = monetization?.models?.lead_gen?.contact ?? "";

  const body = `
  <section class="card p-5 sm:p-8 mb-6">
    <span class="pill pill-info">Media kit</span>
    <h1 class="text-2xl sm:text-3xl font-extrabold text-strong mt-3 tracking-tight">Reach travellers who have already decided</h1>
    <p class="text-sm text-muted mt-3 max-w-3xl">eSIM Price Truth is a comparison site covering ${stats.destinations} destinations and ${stats.currencies} currencies, built on ${stats.prices.toLocaleString("en-US")} audited prices. Every visitor who uses the calculator has chosen a destination, a trip length, a currency and a data need. That is a qualified lead, and it is the thing eSIM providers actually want.</p>
  </section>

  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
    <div class="stat-tile px-4 py-3">
      <div class="stat-label">Destinations covered</div>
      <div class="text-xl font-extrabold text-strong mt-1">${stats.destinations}</div>
    </div>
    <div class="stat-tile px-4 py-3">
      <div class="stat-label">Price points checked</div>
      <div class="text-xl font-extrabold text-strong mt-1">${stats.prices.toLocaleString("en-US")}</div>
    </div>
    <div class="stat-tile px-4 py-3">
      <div class="stat-label">Currencies compared</div>
      <div class="text-xl font-extrabold text-strong mt-1">${stats.currencies}</div>
    </div>
    <div class="stat-tile px-4 py-3">
      <div class="stat-label">Carriers mapped</div>
      <div class="text-xl font-extrabold text-strong mt-1">${fig.carriers}</div>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <section class="card p-5 sm:p-6">
      <h2 class="text-base font-bold text-strong">What we can offer</h2>
      <ul class="text-sm text-muted mt-3 space-y-3">
        <li><strong class="text-strong">Sponsored placement</strong> &mdash; a labelled slot on every destination page and on the guide pages. Flat monthly fee, no commission tracking, no cookie, no approval queue.</li>
        <li><strong class="text-strong">Lead postback</strong> &mdash; destination, trip length, currency and data need forwarded to your endpoint in real time. No personal data, no identifiers, no cookies.</li>
        <li><strong class="text-strong">Data licensing</strong> &mdash; the cleaned price and coverage matrices, refreshed monthly.</li>
      </ul>
    </section>

    <section class="card p-5 sm:p-6">
      <h2 class="text-base font-bold text-strong">Why the data is worth paying for</h2>
      <ul class="text-sm text-muted mt-3 space-y-3">
        <li><strong class="text-strong">${stats.inversions} pricing errors.</strong> Plans in the catalogue that cost <em>less</em> at a longer duration. No vendor will publish these about themselves.</li>
        <li><strong class="text-strong">${fig.hidden.toLocaleString("en-US")} plan variants (${((fig.hidden / fig.variants) * 100).toFixed(0)}%)</strong> that are purchasable on the web but hidden in the vendor's own iOS app.</li>
        <li><strong class="text-strong">${stats.currencies} currency rates</strong> against the ECB reference rate, so the checkout-currency effect is measured, not guessed.</li>
      </ul>
    </section>
  </div>

  <section class="card p-5 sm:p-6 mt-6">
    <h2 class="text-base font-bold text-strong">How to get started</h2>
    <ol class="text-sm text-muted mt-3 list-decimal list-inside space-y-2">
      <li>Email <a href="mailto:${esc(contact)}" class="text-accent underline">${esc(contact)}</a> with the destinations and trip lengths you care about.</li>
      <li>We will send a rate card and a placement mock-up within two working days.</li>
      <li>Placement goes live within a week of agreement, and we will report clicks and lead volume monthly.</li>
    </ol>
    <a href="mailto:${esc(contact)}" class="btn-accent mt-5 inline-block text-sm font-semibold px-5 py-2.5 transition">Request the rate card</a>
  </section>

  ${renderDataLicenseBlock(monetization ?? {})}`;

  const page = {
    path: "/advertise/",
    title: "Advertise With eSIM Price Truth — Media Kit for eSIM Providers",
    description:
      "Reach travellers who have already chosen a destination, trip length and budget. Sponsored placements, lead postback and connectivity data licensing for eSIM providers.",
    nav: "",
    priority: 0.3,
  };

  return {
    path: "advertise/index.html",
    page,
    html: renderPage({ site, page, stats, body }),
  };
}

/**
 * A plain-text briefing that can be pasted straight into an email.
 * Generated from the real dataset so it can never contain a stale number.
 */
export function buildMediaKitText({ site, stats, catalog, monetization }) {
  const fig = computeAssetFigures(catalog, stats);
  const contact = monetization?.models?.lead_gen?.contact ?? "";

  return `MEDIA KIT - eSIM Price Truth
==================================================

WHAT IT IS
An independent comparison site for travel eSIMs. It answers the
question every traveller asks: "how much will this actually cost me,
and am I about to overpay?"

REACH
  ${stats.destinations} destinations covered
  ${stats.currencies} currencies compared at checkout
  ${stats.prices.toLocaleString("en-US")} individual price points checked
  ${stats.variants.toLocaleString("en-US")} plan variants
  ${fig.carriers} carriers mapped
  ${stats.inversions} pricing errors identified

WHAT VISITORS DO
They pick a destination, a trip length, a currency and a data need,
then see what it costs in every currency. That is a qualified lead
minutes away from buying.

THE ASSET NO VENDOR CAN PUBLISH
  - ${stats.inversions} plans that cost LESS at a longer duration
  - ${fig.hidden.toLocaleString("en-US")} plan variants sold on the web
    but hidden in the vendor's own iOS app
  - checkout-currency rates measured against the ECB reference rate

WHAT WE OFFER
  1. Sponsored placement - a labelled slot on every destination page.
     Flat monthly fee. No cookie, no commission tracking, no approval
     queue, no network. You are buying attention, not attribution.
  2. Lead postback - destination, trip length, currency and data need
     forwarded to your endpoint. No personal data, no identifiers.
  3. Data licensing - the cleaned price and coverage matrices, refreshed
     monthly, as JSON or CSV.

GETTING STARTED
Email ${contact} with the destinations and trip lengths you care about.
Rate card and placement mock-up within two working days.
Placement live within a week.

--
${site.canonical_base}/advertise/
`;
}
