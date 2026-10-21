/**
 * Transform the original single-file calculator into the production page.
 *
 * The original was a private, localStorage-driven tool. On a public site the
 * affiliate links MUST be baked in at build time, otherwise every visitor
 * clicks a bare vendor URL and the operator earns nothing. This module makes
 * that change, plus the SEO, compliance and navigation plumbing.
 */

import { esc } from "./analysis.mjs";

/** Replace `oldText` exactly once, throwing if the anchor is not found. */
export function replaceOnce(html, oldText, newText, label) {
  const index = html.indexOf(oldText);
  if (index === -1) {
    throw new Error(`transform "${label}": anchor not found in source HTML`);
  }
  if (html.indexOf(oldText, index + 1) !== -1) {
    throw new Error(`transform "${label}": anchor is not unique in source HTML`);
  }
  return html.slice(0, index) + newText + html.slice(index + oldText.length);
}

/** Replace every occurrence of `oldText`. */
export function replaceAll(html, oldText, newText) {
  return html.split(oldText).join(newText);
}

/**
 * Build the baked-in affiliate configuration block.
 *
 * `tracker` is used (rather than reading program.url directly) so the baked
 * links carry the same UTM tagging as every other monetised link on the site.
 */
function affiliateConfigBlock(affiliateConfig, tracker) {
  const entries = Object.entries(affiliateConfig.programs ?? {})
    .map(([key]) => `      ${key}: ${JSON.stringify(tracker.link(key, "calculator"))},`)
    .join("\n");

  const wired = Object.entries(affiliateConfig.programs ?? {})
    .map(([key, program]) => `      ${key}: ${program.url !== program.fallback}`)
    .join(",\n");

  const meta = Object.entries(affiliateConfig.programs ?? {})
    .map(
      ([key, program]) =>
        `      ${key}: { name: ${JSON.stringify(program.name)}, rate: ${JSON.stringify(
          program.rate
        )}, wired: ${program.url !== program.fallback} },`
    )
    .join("\n");

  return `    // ---- BUILD-TIME BAKED AFFILIATE CONFIG (do not hand-edit) ----
    // These URLs are the OPERATOR's tracking links. Every visitor who clicks
    // a CTA below is attributed to this site. Never move this to localStorage
    // only - that would strip attribution for 100% of visitors.
    let affiliateConfig = {
${entries}
      promo: ""
    };
    // Which programs have a real tracking URL wired (vs. the bare vendor URL).
    const AFFILIATE_WIRED = {
${wired}
    };
    const AFFILIATE_META = {
${meta}
    };
    // UTM tagging for outgoing referral traffic.
    const UTM = ${JSON.stringify(affiliateConfig.utm ?? {})};`;
}

export function transformApp({
  source,
  site,
  affiliateConfig,
  stats,
  builtAt,
  tracker,
}) {
  let html = source;

  // ---------------------------------------------------------------- head --
  const oldTitle = "<title>eSIM Arbitrage, FX Optimizer &amp; Competitor Break-Even Calculator (2026)</title>";
  const newHead = `<title>${esc(site.title ?? "eSIM Arbitrage, FX Optimizer & Competitor Break-Even Calculator (2026)")}</title>
  <meta name="description" content="${esc(site.description)}">
  <link rel="canonical" href="${esc(site.canonical_base)}/">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="author" content="${esc(site.author)}">
  <meta name="theme-color" content="${esc(site.theme_color)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(site.name)}">
  <meta property="og:title" content="${esc(site.title ?? site.name)}">
  <meta property="og:description" content="${esc(site.description)}">
  <meta property="og:url" content="${esc(site.canonical_base)}/">
  <meta property="og:image" content="${esc(site.canonical_base)}/assets/og-default.svg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(site.title ?? site.name)}">
  <meta name="twitter:description" content="${esc(site.description)}">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="styles.css">
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: site.name,
    description: site.description,
    url: `${site.canonical_base}/`,
    applicationCategory: "TravelApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Checkout currency arbitrage across 20 currencies",
      "Duration price inversion detection",
      "Competitor break-even analysis",
      "iOS app visibility check",
    ],
    author: { "@type": "Person", name: site.author },
  }).replace(/</g, "\\u003c")}</script>`;
  html = replaceOnce(html, oldTitle, newHead, "title/meta");

  // --------------------------------------------------- affiliate config --
  const oldConfig = `    let affiliateConfig = {
      saily: "https://saily.com/",
      airalo: "https://www.airalo.com/",
      nomad: "https://www.nomadesim.com/",
      yesim: "https://yesim.app/regions/europe-esim/",
      jetpac: "https://www.jetpacglobal.com/",
      holafly: "https://esim.holafly.com/",
      promo: ""
    };`;
  html = replaceOnce(
    html,
    oldConfig,
    affiliateConfigBlock(affiliateConfig, tracker),
    "affiliate config"
  );

  // ------------------------------------------- sponsored link attributes --
  html = replaceAll(
    html,
    `target="_blank" rel="noopener noreferrer" class="block w-full text-center bg-[#0F2942]`,
    `target="_blank" rel="sponsored noopener noreferrer" class="block w-full text-center bg-[#0F2942]`
  );
  html = replaceAll(
    html,
    `"<a href='" + affLink + "' target='_blank' rel='noopener noreferrer' class='shrink-0`,
    `"<a href='" + affLink + "' target='_blank' rel='sponsored noopener noreferrer' class='shrink-0`
  );

  return { html, builtAt, stats };
}

/**
 * Additional production hardening applied to the app shell:
 *  - a top-of-page affiliate disclosure bar (FTC / Google policy)
 *  - a skip-to-content link (accessibility)
 *  - removal of the localStorage override, which would otherwise silently
 *    replace the baked tracking links in the visitor's browser
 *  - corrected headline figures (the original claimed 193,378 prices; the
 *    dataset actually contains 136,040)
 *  - links out to the generated destination pages and guides
 */
export function hardenApp(html, { site, stats }) {
  // ---- skip link + affiliate disclosure, injected right after <body> ----
  const bodyOpen = `<body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col">`;
  const injection = `<body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col">
  <a href="#main" class="skip-link">Skip to main content</a>
  <div class="affiliate-disclosure no-print" role="note">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-2">
      <strong>Affiliate disclosure:</strong> the buttons below are affiliate links. If you buy an eSIM through them we may earn a commission at no extra cost to you. Prices are audited from the vendor catalogue on ${esc(
        site.data_as_of
      )} and change often &mdash; always confirm the final price at checkout.
    </div>
  </div>`;
  html = replaceOnce(html, bodyOpen, injection, "body disclosure");

  // ---- main landmark target for the skip link ----
  html = replaceOnce(
    html,
    `<main class="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">`,
    `<main id="main" class="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1 space-y-6">`,
    "main landmark"
  );

  // ---- the localStorage override must NOT win over the baked links ----
  const oldStorage = `      // Load saved affiliate config from localStorage if available
      try {
        const saved = localStorage.getItem("esim_aff_config_v1");
        if (saved) {
          affiliateConfig = Object.assign(affiliateConfig, JSON.parse(saved));
          document.getElementById("affSaily").value = affiliateConfig.saily;
          document.getElementById("affAiralo").value = affiliateConfig.airalo;
          document.getElementById("affNomad").value = affiliateConfig.nomad;
          document.getElementById("affYesim").value = affiliateConfig.yesim;
          document.getElementById("affJetpac").value = affiliateConfig.jetpac;
          document.getElementById("affHolafly").value = affiliateConfig.holafly;
          document.getElementById("affPromoCode").value = affiliateConfig.promo || "";
        }
      } catch (e) {}`;
  const newStorage = `      // NOTE: affiliate URLs are baked in at build time so every visitor is
      // attributed. We deliberately do NOT restore a localStorage override
      // here - a stale browser value would strip referral attribution.
      // The inputs below are still populated so the operator can see and
      // copy the exact tracking URLs that are live on this deployment.
      try {
        document.getElementById("affSaily").value = affiliateConfig.saily;
        document.getElementById("affAiralo").value = affiliateConfig.airalo;
        document.getElementById("affNomad").value = affiliateConfig.nomad;
        document.getElementById("affYesim").value = affiliateConfig.yesim;
        document.getElementById("affJetpac").value = affiliateConfig.jetpac;
        document.getElementById("affHolafly").value = affiliateConfig.holafly;
        document.getElementById("affPromoCode").value = affiliateConfig.promo || "";
      } catch (e) {}`;
  html = replaceOnce(html, oldStorage, newStorage, "localStorage override");

  // ---- header: the stale "193,378 Prices" badge ----
  // (the footer stats line is rewritten in traveller voice by app-copy.mjs)
  html = replaceOnce(
    html,
    `<span class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">94 Dests · 193,378 Prices</span>`,
    `<span class="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">${stats.destinations} destinations · ${stats.prices.toLocaleString(
      "en-US"
    )} prices</span>`,
    "header badge"
  );

  // ---- navigation links to the generated sub-pages ----
  html = replaceOnce(
    html,
    `        <button id="tabBtnDeploy" type="button" class="tab-inactive text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center gap-1.5">
          <span>4. Affiliate &amp; Export Studio</span>
          <span class="w-2 h-2 rounded-full bg-amber-400"></span>
        </button>`,
    `        <button id="tabBtnDeploy" type="button" class="tab-inactive text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center gap-1.5">
          <span>4. Affiliate &amp; Export Studio</span>
          <span class="w-2 h-2 rounded-full bg-amber-400"></span>
        </button>
        <a href="destinations/" class="text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap text-slate-300 hover:bg-slate-800 hover:text-white">
          Destinations
        </a>
        <a href="guides/" class="text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap text-slate-300 hover:bg-slate-800 hover:text-white">
          Guides
        </a>`,
    "header nav links"
  );

  return html;
}
