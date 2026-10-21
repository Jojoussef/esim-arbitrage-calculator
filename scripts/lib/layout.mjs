/**
 * Shared HTML shell for every generated page.
 *
 * Keeping the shell in one place guarantees that the calculator, the
 * programmatic destination pages and the editorial posts all share the same
 * header, navigation, affiliate disclosure, footer and SEO plumbing.
 */

import { esc, jsonLd } from "./analysis.mjs";
import { themeBootstrapScript, themeToggleScript } from "./theme.mjs";

/** Absolute URL for a path relative to the site root. */
export function url(site, path = "/") {
  const base = site.canonical_base.replace(/\/$/, "");
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean === "/" ? "/" : clean}`;
}

function headBlock(site, page) {
  const canonical = url(site, page.path);
  const ogImage = url(site, page.ogImage ?? "/assets/og-default.svg");
  const title = page.title;
  const description = page.description;

  return `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="author" content="${esc(site.author)}">
  <meta name="theme-color" content="${esc(site.theme_color)}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(site.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:locale" content="${esc(site.locale)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  ${site.twitter ? `<meta name="twitter:creator" content="${esc(site.twitter)}">` : ""}

  <link rel="icon" href="${esc(url(site, "/assets/favicon.svg"))}" type="image/svg+xml">
  <link rel="stylesheet" href="https://cdn.tailwindcss.com/3.4.17">
  <link rel="stylesheet" href="${esc(url(site, "/theme.css"))}">
  <link rel="stylesheet" href="${esc(url(site, "/styles.css"))}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com/3.4.17"></script>
  <script>${themeBootstrapScript()}</script>`;
}

function headerBlock(site, page) {
  const home = url(site, "/");
  const item = (href, label, key) =>
    `<a href="${esc(href)}" class="nav-link px-3 py-1.5 rounded-lg transition whitespace-nowrap ${page.nav === key ? "is-active" : ""}">${label}</a>`;

  return `  <a href="#main" class="skip-link">Skip to main content</a>
  <header class="app-header sticky top-0 z-30">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
      <a href="${esc(home)}" class="flex items-center gap-3">
        <span class="brand-mark w-9 h-9 rounded-lg border flex items-center justify-center font-extrabold text-lg">eS</span>
        <span>
          <span class="font-bold text-base sm:text-lg tracking-tight text-white">${esc(site.name ?? "eSIM Price Truth")}</span>
          <span class="brand-sub block text-xs hidden sm:block">${esc(site.tagline ?? "Find the cheapest eSIM for your trip.")}</span>
        </span>
      </a>
      <nav aria-label="Main" class="nav-shell flex items-center gap-1 p-1 rounded-xl border overflow-x-auto max-w-full text-xs sm:text-sm font-semibold">
        <button id="themeToggle" type="button" class="theme-toggle mr-1" title="Theme" aria-label="Change theme">&#9681;</button>
        ${item(url(site, "/"), "Calculator", "home")}
        ${item(url(site, "/destinations/"), "Destinations", "destinations")}
        ${item(url(site, "/guides/"), "Guides", "guides")}
        ${item(url(site, "/fx-audit/"), "FX Audit", "fx")}
        ${item(url(site, "/pricing/"), "Pricing", "pricing")}
      </nav>
    </div>
  </header>`;
}

function disclosureBlock(site) {
  return `  <div class="affiliate-disclosure no-print" role="note">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 py-2">
      <strong>Affiliate disclosure:</strong> this page contains affiliate links. If you buy an eSIM through them we may earn a commission at no extra cost to you. Prices shown are audited from the vendor catalogue on ${esc(site.data_as_of)} and change often &mdash; always confirm the final price at checkout.
    </div>
  </div>`;
}

function footerBlock(site, stats) {
  return `  <footer class="card rounded-none border-x-0 border-b-0 mt-10 py-8 px-4 sm:px-6 text-xs text-muted">
    <div class="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
      <div>
        <div class="font-bold text-strong text-sm mb-2">${esc(site.name ?? "eSIM Price Truth")}</div>
        <p>${esc(stats.destinations)} destinations &middot; ${esc(stats.currencies)} currencies &middot; ${esc(stats.variants.toLocaleString("en-US"))} plan variants &middot; ${esc(stats.prices.toLocaleString("en-US"))} prices checked.</p>
        <p class="mt-2">Cross-checked against the <a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noopener noreferrer" class="text-accent underline">ECB reference rates</a> and <a href="https://www.iban.com/exchange-rates" target="_blank" rel="noopener noreferrer" class="text-accent underline">IBAN FX</a>.</p>
      </div>
      <div>
        <div class="font-bold text-strong text-sm mb-2">Explore</div>
        <ul class="space-y-1">
          <li><a href="${esc(url(site, "/"))}" class="hover:text-accent">Interactive calculator</a></li>
          <li><a href="${esc(url(site, "/destinations/"))}" class="hover:text-accent">All ${esc(stats.destinations)} destinations</a></li>
          <li><a href="${esc(url(site, "/inversions/"))}" class="hover:text-accent">${esc(stats.inversions)} plans priced backwards</a></li>
          <li><a href="${esc(url(site, "/fx-audit/"))}" class="hover:text-accent">Which currency to pay in</a></li>
          <li><a href="${esc(url(site, "/guides/"))}" class="hover:text-accent">Traveler guides</a></li>
          <li><a href="${esc(url(site, "/pricing/"))}" class="hover:text-accent">Pro subscription</a></li>
        </ul>
      </div>
      <div>
        <div class="font-bold text-strong text-sm mb-2">How &amp; legal</div>
        <ul class="space-y-1">
          <li><a href="${esc(url(site, "/methodology/"))}" class="hover:text-accent">How we check prices</a></li>
          <li><a href="${esc(url(site, "/privacy/"))}" class="hover:text-accent">Privacy</a></li>
          <li><a href="${esc(url(site, "/disclosure/"))}" class="hover:text-accent">Affiliate disclosure</a></li>
          <li><a href="https://github.com/${esc(site.repo)}" target="_blank" rel="noopener noreferrer" class="hover:text-accent">Source on GitHub</a></li>
        </ul>
      </div>
    </div>
    <div class="max-w-7xl mx-auto mt-6 pt-4 border-t border-slate-100 text-[11px] text-muted">
      &copy; ${new Date().getFullYear()} ${esc(site.author)}. Prices and availability are the vendor's and can change without notice. This tool is independent and is not affiliated with or endorsed by Holafly, Nomad, Saily, Airalo, Yesim, Jetpac or Cellesim.
    </div>
  </footer>`;
}

/**
 * Render a full page.
 * @param {object} options  site, page, stats, body, headExtra, bodyExtra, scripts
 */
export function renderPage({ site, page, stats, body, headExtra = "", bodyExtra = "", scripts = "" }) {
  const schema = page.schema
    ? `<script type="application/ld+json">${jsonLd(page.schema)}</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
${headBlock(site, page)}
${headExtra}
${schema}
</head>
<body class="bg-slate-50 text-slate-800 min-h-screen flex flex-col">
${headerBlock(site, page)}
${disclosureBlock(site)}
<main id="main" class="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
${body}
</main>
${footerBlock(site, stats)}
<script>${themeToggleScript()}</script>
${scripts}
${bodyExtra}
</body>
</html>
`;
}
