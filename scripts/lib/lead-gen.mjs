/**
 * Lead generation - the primary monetisation model.
 *
 * The affiliate programmes rejected the publisher, so there is no
 * commission-per-click to earn. What there IS, and what a vendor actually
 * wants, is a QUALIFIED INTENT SIGNAL: a person who has picked a
 * destination, a trip length, a currency and a data need. That is someone
 * minutes away from buying.
 *
 * Two ways this monetises:
 *
 *   1. SPONSORED SLOT - a vendor pays a flat monthly fee for a clearly
 *      labelled placement. No cookie, no approval queue, no network.
 *      The placement is visually separated from the comparison results and
 *      is always labelled "Sponsored" (FTC + Google policy).
 *
 *   2. LEAD POSTBACK - the same intent signal is forwarded to a lead
 *      network or CRM. Nothing is transmitted unless an endpoint is
 *      configured, so the default build sends nothing anywhere.
 *
 * PRIVACY: the site already documents that it collects nothing. This
 * module keeps that promise. The intent signal is held in the visitor's
 * own browser unless an explicit endpoint is configured, and when it is,
 * only the fields listed in config/monetization.json are sent - never
 * anything identifying the visitor.
 */

import { esc } from "./analysis.mjs";

/**
 * Build the sponsored-slot card.
 *
 * @param {object} options
 * @param {object} options.slot  { name, blurb, href, cta } from config
 */
export function renderSponsorSlot(slot) {
  return `
  <aside class="card p-4 sm:p-5 border-2 border-dashed" aria-label="Sponsored placement">
    <div class="flex items-center gap-2 mb-2">
      <span class="pill pill-warn">Sponsored</span>
      <span class="text-[10px] text-muted uppercase tracking-wider">Paid placement</span>
    </div>
    <h2 class="text-sm font-bold text-strong">${esc(slot.name)}</h2>
    <p class="text-xs text-muted mt-1">${esc(slot.blurb)}</p>
    <a href="${esc(slot.href)}" target="_blank" rel="sponsored noopener noreferrer" class="btn-primary mt-3 inline-block text-xs font-semibold px-4 py-2 transition">
      ${esc(slot.cta ?? "See plans")}
    </a>
  </aside>`;
}

/**
 * The "advertise with us" block for the guides and hub pages.
 * It is the acquisition channel for the sponsorship model: a vendor who
 * sees the traffic lands here and buys a slot.
 */
export function renderAdvertiseBlock(config) {
  const lead = config.models?.lead_gen ?? {};
  if (!lead.enabled) return "";

  return `
  <section class="card p-5 sm:p-6 mt-8" aria-label="Advertise with us">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0 max-w-2xl">
        <span class="pill pill-info">For eSIM providers</span>
        <h2 class="text-lg font-bold text-strong mt-3">Reach travellers who have already decided</h2>
        <p class="text-sm text-muted mt-2">${esc(lead.blurb ?? "")} Every view of the calculator is a traveller who has picked a destination, a trip length and a currency. We do not sell personal data, we do not run cookies, and we do not ask visitors to create an account.</p>
        <p class="text-xs text-muted mt-3">${esc(lead.pricing_note ?? "")}</p>
      </div>
      <a href="mailto:${esc(lead.contact ?? "")}" class="btn-accent shrink-0 text-sm font-semibold px-5 py-2.5 transition">${esc(lead.label ?? "Get in touch")}</a>
    </div>
  </section>`;
}

/**
 * The data-licence block. Sells the dataset itself to travel and telecom
 * products, which is the one asset no vendor can produce for themselves.
 */
export function renderDataLicenseBlock(config) {
  const license = config.models?.data_license ?? {};
  if (!license.enabled) return "";

  const products = (license.products ?? [])
    .map(
      (product) => `<li class="py-2">
        <div class="text-sm font-semibold text-strong">${esc(product.name)}</div>
        <div class="text-xs text-muted mt-0.5">${esc(product.description)}</div>
        <div class="text-[10px] text-muted mt-1 font-mono">${esc(product.format)}</div>
      </li>`
    )
    .join("");

  return `
  <section class="card p-5 sm:p-6 mt-8" aria-label="Licence the dataset">
    <span class="pill pill-brand">Data licensing</span>
    <h2 class="text-lg font-bold text-strong mt-3">${esc(license.label ?? "Licence the dataset")}</h2>
    <p class="text-sm text-muted mt-2">${esc(license.blurb ?? "")}</p>
    <ul class="mt-4 divide-y divide-slate-200 border-t border-slate-200">
      ${products}
    </ul>
    <a href="mailto:${esc(license.contact ?? "")}" class="btn-primary mt-4 inline-block text-sm font-semibold px-5 py-2.5 transition">Request the data sheet</a>
  </section>`;
}
