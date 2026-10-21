#!/usr/bin/env node
/**
 * Build the whole site into dist/.
 *
 *   node scripts/build.mjs
 *
 * Inputs
 *   src/app.html            the original calculator, transformed at build time
 *   data/*.json             the extracted catalogue
 *   config/site.json        site metadata
 *   config/affiliates.json  affiliate tracking URLs
 *
 * Output
 *   dist/index.html                 the calculator
 *   dist/destinations/<slug>/       one page per destination
 *   dist/guides/<slug>/             editorial posts (roadmap sprints 3.1-3.3)
 *   dist/fx-audit/ dist/inversions/ dist/destinations/
 *   dist/methodology/ dist/privacy/ dist/disclosure/
 *   dist/sitemap.xml dist/robots.txt dist/data/*.json
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { esc, fmt, buildSlugs, computeStats } from "./lib/analysis.mjs";
import { createAffiliateTracker } from "./lib/affiliates.mjs";
import { renderPage, url } from "./lib/layout.mjs";
import { transformApp, hardenApp } from "./lib/app-transform.mjs";
import { analyseDestination, renderDestinationBody } from "./lib/pages-destinations.mjs";
import {
  buildDestinationsIndex,
  buildInversionsPage,
  buildFxAuditPage,
  buildGuidesIndex,
  buildStaticPage,
  buildMethodologyPage,
  privacyBody,
  disclosureBody,
} from "./lib/pages-content.mjs";
import { buildGuides } from "./lib/pages-guides.mjs";
import { buildSitemap } from "./lib/sitemap.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");

const readJson = (rel) => JSON.parse(readFileSync(resolve(ROOT, rel), "utf8"));

function write(relPath, content) {
  // Strip any leading slash so the path is always treated as relative to dist/.
  const rel = String(relPath).replace(/^\/+/, "");
  const target = resolve(DIST, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function main() {
  const started = Date.now();

  // ------------------------------------------------------------ inputs --
  const site = readJson("config/site.json");
  const affiliateConfig = readJson("config/affiliates.json");
  const catalog = readJson("data/catalog.json");
  const fx = readJson("data/fx.json");
  const competitors = readJson("data/competitors.json");

  const stats = computeStats(catalog, fx.spot_per_eur);
  const tracker = createAffiliateTracker(affiliateConfig, site);
  const slugs = buildSlugs(catalog.products);
  const builtAt = new Date().toISOString();

  // Fill {placeholders} in the site description from the real dataset, so the
  // headline numbers in the copy can never drift from the data.
  site.description = String(site.description ?? "")
    .replace(/\{prices\}/g, stats.prices.toLocaleString("en-US"))
    .replace(/\{destinations\}/g, String(stats.destinations))
    .replace(/\{currencies\}/g, String(stats.currencies))
    .replace(/\{variants\}/g, stats.variants.toLocaleString("en-US"))
    .replace(/\{inversions\}/g, String(stats.inversions));

  console.log(
    `dataset: ${stats.destinations} destinations · ${stats.currencies} currencies · ` +
      `${stats.variants.toLocaleString("en-US")} variants · ${stats.prices.toLocaleString("en-US")} prices · ` +
      `${stats.inversions} inversions`
  );

  // ------------------------------------------------------------- reset --
  if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // ------------------------------------------------ 1. the calculator --
  const appSource = readFileSync(resolve(ROOT, "src/app.html"), "utf8");
  let appHtml = transformApp({
    source: appSource,
    site,
    affiliateConfig,
    stats,
    builtAt,
    tracker,
  }).html;
  appHtml = hardenApp(appHtml, { site, stats });
  write("index.html", appHtml);

  // ------------------------------------ 2. programmatic destination pages --
  const analyses = catalog.products.map((product) =>
    analyseDestination({ catalog, fx, competitors, product })
  );

  const pages = [];
  for (const a of analyses) {
    const slug = slugs.get(a.product.iso);
    const related = analyses
      .filter((other) => other.product.iso !== a.product.iso)
      .map((other) => ({
        slug: slugs.get(other.product.iso),
        name: other.product.name,
        summary: other.bestCcy
          ? `Pay in ${other.bestCcy.ccy} · from $${fmt(other.cheapestDuration?.usdEq ?? 0, 2)}`
          : other.product.type,
      }))
      .slice(0, 6);

    const body = renderDestinationBody({ site, stats, a, slug, tracker, related });

    const title = `eSIM Prices in ${a.product.name} (${a.product.iso}) — Cheapest Checkout Currency & Duration | 2026`;
    const description = `Compare eSIM prices in ${a.product.name} across ${stats.currencies} currencies, find the cheapest checkout currency and catch duration price inversions. ${stats.prices.toLocaleString("en-US")} audited prices across ${stats.destinations} destinations.`;

    const page = {
      path: `/destinations/${slug}/`,
      title,
      description,
      nav: "destinations",
      priority: 0.8,
      schema: {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        url: url(site, `/destinations/${slug}/`),
        datePublished: site.data_as_of,
        dateModified: site.data_as_of,
        author: { "@type": "Person", name: site.author },
        publisher: { "@type": "Person", name: site.author },
        mainEntityOfPage: url(site, `/destinations/${slug}/`),
      },
    };

    write(`destinations/${slug}/index.html`, renderPage({ site, page, stats, body }));
    pages.push(page);
  }
  console.log(`generated ${pages.length} destination pages`);

  // ------------------------------------------- 3. editorial guide posts --
  const guidePages = buildGuides({ site, stats, catalog, fx, competitors, tracker, slugs });
  for (const { path, html } of guidePages.files) {
    write(path, html);
  }
  pages.push(...guidePages.pages);
  console.log(`generated ${guidePages.files.length} guide pages`);

  // ------------------------------------------------ 4. index/hub pages --
  const hubs = [
    buildDestinationsIndex({ site, stats, catalog, analyses, slugs, tracker }),
    buildInversionsPage({ site, stats, catalog, tracker }),
    buildFxAuditPage({ site, stats, catalog, fx, tracker }),
    buildGuidesIndex({ site, stats, guideIndex: guidePages.index }),
    buildMethodologyPage({ site, stats, catalog, fx, competitors, tracker }),
    buildStaticPage({
      site,
      stats,
      slug: "privacy",
      title: "Privacy Policy — eSIM Arbitrage & Break-Even Engine",
      description:
        "How the eSIM Arbitrage & Break-Even Engine handles data: no accounts, no tracking cookies, no server-side collection.",
      nav: "",
      body: privacyBody(site, stats),
    }),
    buildStaticPage({
      site,
      stats,
      slug: "disclosure",
      title: "Affiliate Disclosure — eSIM Arbitrage & Break-Even Engine",
      description:
        "Full affiliate disclosure: which eSIM vendors we earn a commission from, how the ranking works, and why the order is not paid placement.",
      nav: "",
      body: disclosureBody(site, stats, affiliateConfig),
    }),
  ];

  for (const hub of hubs) {
    write(hub.path, hub.html);
    pages.push(hub.page);
  }
  console.log(`generated ${hubs.length} hub pages`);

  // ------------------------------------------------------- 5. assets --
  cpSync(resolve(ROOT, "src/styles.css"), resolve(DIST, "styles.css"));
  if (existsSync(resolve(ROOT, "src/assets"))) {
    cpSync(resolve(ROOT, "src/assets"), resolve(DIST, "assets"), { recursive: true });
  }
  // GitHub Pages runs Jekyll by default, which strips files and directories
  // starting with an underscore. .nojekyll disables that so the published
  // tree matches dist/ exactly.
  write(".nojekyll", "");

  // Public JSON copies so the dataset is inspectable and reusable.
  mkdirSync(resolve(DIST, "data"), { recursive: true });
  for (const name of ["catalog.json", "fx.json", "competitors.json", "stats.json"]) {
    cpSync(resolve(ROOT, "data", name), resolve(DIST, "data", name));
  }

  // ------------------------------------------------- 6. sitemap/robots --
  write("sitemap.xml", buildSitemap(site, pages));
  write(
    "robots.txt",
    `User-agent: *\nAllow: /\n\nSitemap: ${site.canonical_base}/sitemap.xml\n`
  );

  // ------------------------------------------------------- 7. 404 page --
  write("404.html", renderPage({
    site,
    page: {
      path: "/404.html",
      title: "Page not found — eSIM Arbitrage Engine",
      description: "The page you were looking for does not exist.",
      nav: "",
    },
    stats,
    body: `
  <section class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
    <div class="text-5xl font-extrabold text-[#0F2942]">404</div>
    <h1 class="text-xl font-bold text-slate-900 mt-3">That page has moved or never existed</h1>
    <p class="text-sm text-slate-600 mt-2 max-w-md mx-auto">Try the calculator, or browse all ${stats.destinations} destinations we have audited.</p>
    <div class="mt-6 flex flex-wrap gap-3 justify-center">
      <a href="${esc(url(site, "/"))}" class="bg-[#0F2942] hover:bg-slate-800 text-white font-semibold text-sm py-2.5 px-5 rounded-xl transition">Open the calculator</a>
      <a href="${esc(url(site, "/destinations/"))}" class="bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 font-semibold text-sm py-2.5 px-5 rounded-xl transition">All destinations</a>
    </div>
  </section>`,
  }));

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nbuilt ${pages.length} indexable pages in ${elapsed}s -> dist/`);
  console.log(`canonical base: ${site.canonical_base}`);
}

main();
