/**
 * Editorial guide posts (roadmap Phase 3, Sprints 3.1 - 3.3).
 *
 * These are the shareable, linkable articles that drive traffic back to the
 * calculator. Each one is written from the dataset so every claim is backed
 * by a real row, and each ends with a monetised CTA to the cheapest option.
 */

import { esc, fmt, currencySymbol, toUsd, getPrice } from "./analysis.mjs";
import { renderPage, url } from "./layout.mjs";
import { statCard } from "./pages-destinations.mjs";
import {
  fxGuideBody,
  inversionGuideBody,
  breakEvenGuideBody,
} from "./guide-bodies.mjs";

/**
 * Build all guides.
 * @returns {{files: {path: string, html: string}[], pages: object[], index: object[]}}
 */
export function buildGuides({ site, stats, catalog, fx, competitors, tracker, slugs }) {
  const files = [];
  const pages = [];
  const index = [];

  const build = (slug, meta, body, schema) => {
    const path = `guides/${slug}/index.html`;
    const page = {
      path: `/guides/${slug}/`,
      title: meta.title,
      description: withSuffix(meta.description),
      nav: "guides",
      priority: 0.75,
      schema,
    };
    files.push({ path, html: renderPage({ site, page, stats, body }) });
    pages.push(page);
    index.push({ slug, ...meta });
  };

  // Guide descriptions are written per-post; pad any that are too short to
  // be a valid meta description with a factual suffix.
  const withSuffix = (text) => {
    const base = String(text ?? "").trim();
    const suffix = ` Built from ${stats.prices.toLocaleString("en-US")} audited prices across ${stats.destinations} destinations.`;
    return base.length >= 120 ? base : `${base}${suffix}`;
  };

  // ---------------------------------------------- Sprint 3.1: FX audit --
  build(
    "fx-audit-checkout-currency",
    {
      tag: "Currency arbitrage",
      title: "The 20-Currency eSIM Checkout Audit: How to Pay 15% Less by Changing One Dropdown",
      excerpt:
        "The eSIM catalogue is priced off a single Euro base and then re-rounded into 20 local currencies. We measured the gap against the ECB reference rate for every single one.",
    },
    fxGuideBody({ site, stats, catalog, fx, tracker }),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "The 20-Currency eSIM Checkout Audit: How to Pay 15% Less by Changing One Dropdown",
      datePublished: site.data_as_of,
      dateModified: site.data_as_of,
      author: { "@type": "Person", name: site.author },
      publisher: { "@type": "Person", name: site.author },
      mainEntityOfPage: url(site, "/guides/fx-audit-checkout-currency/"),
    }
  );

  // --------------------------------------- Sprint 3.2: duration inversion --
  build(
    "buying-extra-days-is-cheaper",
    {
      tag: "Pricing bugs",
      title: `Buying an Extra Day Is Cheaper: ${stats.inversions} eSIM Plans Priced Backwards`,
      excerpt:
        "In hundreds of destinations the longer plan is listed at a lower total price than the shorter one — and the iOS app hides most of them.",
    },
    inversionGuideBody({ site, stats, catalog, tracker }),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `Buying an Extra Day Is Cheaper: ${stats.inversions} eSIM Plans Priced Backwards`,
      datePublished: site.data_as_of,
      dateModified: site.data_as_of,
      author: { "@type": "Person", name: site.author },
      publisher: { "@type": "Person", name: site.author },
      mainEntityOfPage: url(site, "/guides/buying-extra-days-is-cheaper/"),
    }
  );

  // ------------------------------------- Sprint 3.3: unlimited break-even --
  build(
    "unlimited-vs-fixed-gb-break-even",
    {
      tag: "Break-even math",
      title: "Unlimited vs Fixed-GB eSIMs in 2026: The Break-Even Math That Decides It",
      excerpt:
        "Unlimited plans are not automatically better. Here is the usage threshold where a fixed-GB plan starts costing you more — and the hotspot caps that make the answer differ by vendor.",
    },
    breakEvenGuideBody({ site, stats, catalog, competitors, tracker }),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Unlimited vs Fixed-GB eSIMs in 2026: The Break-Even Math That Decides It",
      datePublished: site.data_as_of,
      dateModified: site.data_as_of,
      author: { "@type": "Person", name: site.author },
      publisher: { "@type": "Person", name: site.author },
      mainEntityOfPage: url(site, "/guides/unlimited-vs-fixed-gb-break-even/"),
    }
  );

  return { files, pages, index };
}

/** Shared CTA block used at the end of every guide. */
export { ctaBlock } from "./guide-bodies.mjs";
