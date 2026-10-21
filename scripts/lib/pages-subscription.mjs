/**
 * The pricing / subscribe page.
 *
 * The free tier stays genuinely free - the calculator is the SEO and
 * referral asset, and paywalling it would destroy both. What is paid is
 * the part that takes work to use: alerts, the full data export, and the
 * pricing-error monitor.
 */

import { esc } from "./analysis.mjs";
import { renderPage, url } from "./layout.mjs";

/** Build the pricing page. */
export function buildPricingPage({ site, stats, subscription }) {
  const plans = subscription.plans ?? {};
  const order = ["free", "pro", "team"];

  const cards = order
    .filter((key) => plans[key])
    .map((key) => {
      const plan = plans[key];
      const features = (plan.features ?? [])
        .map(
          (feature) =>
            `<li class="text-xs text-muted flex gap-2"><span class="text-accent shrink-0">&#10003;</span><span>${esc(feature)}</span></li>`
        )
        .join("");

      const isPro = key === "pro";
      const price = plan.price_monthly
        ? `$${plan.price_monthly}<span class="text-xs font-normal text-muted">/mo</span>`
        : "Free";

      // Each plan links to its own checkout URL. Until the payment
      // provider is set up, they fall back to the shared one.
      const checkout = subscription.checkout_urls?.[key] ?? subscription.checkout_url ?? "#";

      return `<div class="card p-5 sm:p-6 flex flex-col ${isPro ? "border-2 border-accent" : ""}">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-bold text-strong">${esc(plan.label)}</h2>
          ${isPro ? '<span class="pill">Most popular</span>' : ""}
        </div>
        <div class="text-3xl font-extrabold text-brand mt-3">${price}</div>
        ${
          plan.price_yearly
            ? `<div class="text-xs text-muted mt-1">or $${plan.price_yearly}/year</div>`
            : `<div class="text-xs text-muted mt-1">forever</div>`
        }
        <ul class="mt-4 space-y-2 flex-1">${features}</ul>
        ${
          key === "free"
            ? `<a href="${esc(url(site, "/"))}" class="btn-ghost mt-5 block text-center text-sm font-semibold px-5 py-2.5 transition">Start free</a>`
            : `<a href="${esc(checkout)}" target="_blank" rel="noopener noreferrer" class="${isPro ? "btn-accent" : "btn-primary"} mt-5 block text-center text-sm font-semibold px-5 py-2.5 transition">Subscribe</a>`
        }
      </div>`;
    })
    .join("");

  const body = `
  <section class="card p-5 sm:p-8 mb-6 text-center">
    <span class="pill pill-info">Pricing</span>
    <h1 class="text-2xl sm:text-3xl font-extrabold text-strong mt-3 tracking-tight">The calculator stays free. The data does not have to be.</h1>
    <p class="text-sm text-muted mt-3 max-w-2xl mx-auto">Every price comparison, every currency and every trip length is free, for everyone, with no account. Subscribe if you want to be told when prices move, or if you want the underlying dataset.</p>
  </section>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
    ${cards}
  </div>

  <section class="card p-5 sm:p-6 mt-6">
    <h2 class="text-base font-bold text-strong">What Pro actually adds</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
      <div>
        <h3 class="text-sm font-semibold text-strong">Price alerts</h3>
        <p class="text-xs text-muted mt-1">Follow a destination and get an email when its prices change. The catalogue is re-checked every month, and the alerts tell you what moved.</p>
      </div>
      <div>
        <h3 class="text-sm font-semibold text-strong">The full data export</h3>
        <p class="text-xs text-muted mt-1">Every plan variant, every duration and every currency price point, plus the carrier coverage matrix, as CSV or JSON. ${stats.prices.toLocaleString("en-US")} price points across ${stats.destinations} destinations.</p>
      </div>
      <div>
        <h3 class="text-sm font-semibold text-strong">The pricing-error monitor</h3>
        <p class="text-xs text-muted mt-1">${stats.inversions} plans are currently priced backwards - longer and cheaper. Pro subscribers get the feed as it is found, not when the page happens to be rebuilt.</p>
      </div>
      <div>
        <h3 class="text-sm font-semibold text-strong">Early access</h3>
        <p class="text-xs text-muted mt-1">Each month's catalogue refresh lands in the export first, before the public pages are rebuilt.</p>
      </div>
    </div>
  </section>

  <section class="card p-5 sm:p-6 mt-6">
    <h2 class="text-base font-bold text-strong">Questions</h2>
    <div class="mt-4 space-y-3 text-xs text-muted">
      <p><strong class="text-strong">Do I need an account to use the calculator?</strong> No. There is no sign-up, no cookie and no tracking of what you search. Open it and use it.</p>
      <p><strong class="text-strong">Can I cancel?</strong> Any time. Access ends the moment you cancel, not when your billing period ends.</p>
      <p><strong class="text-strong">Is the data the same as the site?</strong> Exactly the same dataset - it is generated from one source, so a subscriber can never get data that disagrees with the page.</p>
      <p><strong class="text-strong">Do you sell my data?</strong> No. The site collects nothing, and the subscription does not change that.</p>
    </div>
  </section>`;

  const page = {
    path: "/pricing/",
    title: "Pricing — eSIM Price Truth (Free Calculator, Pro Data)",
    description:
      "The eSIM price comparison is free for everyone. Subscribe for price alerts, the full data export and the pricing-error monitor.",
    nav: "",
    priority: 0.5,
  };

  // The subscription client is only loaded on the pages that need it, so
  // the free pages stay completely free of subscription code.
  const scripts = subscription.enabled
    ? `<script>window.ESIM_SUBSCRIPTION_API=${JSON.stringify(
        subscription.api_base_url ?? ""
      )};</script>
<script src="${url(site, "/assets/subscription.js")}" defer></script>`
    : "";

  return {
    path: "pricing/index.html",
    page,
    html: renderPage({ site, page, stats, body, scripts }),
  };
}
