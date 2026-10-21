/**
 * The homepage hero.
 *
 * The original app opened with a tool-name H1 and four control boxes. A
 * visitor arriving from a search result ("cheapest esim japan") was given no
 * reason to stay and no idea what the page would tell them.
 *
 * The hero answers that in one screen: a promise, the proof behind it, and
 * the three numbers that make the tool worth using. The calculator controls
 * stay directly underneath, so the next action is always one scroll away.
 */

import { esc, fmt } from "./analysis.mjs";

/**
 * Build the hero block.
 * @param {object} options
 * @param {object} options.site     site config (brand block)
 * @param {object} options.stats    computed catalogue statistics
 * @param {Array}  options.quick    quick-pick destinations [{name, slug}]
 */
export function buildHero({ site, stats, quick = [] }) {
  const brand = site.brand ?? {};

  const proofPoints = [
    {
      value: `up to ${Math.round(stats.maxFxSaving ?? 0)}%`,
      label: "saved by changing checkout currency",
    },
    {
      value: String(stats.inversions),
      label: "plans priced cheaper for longer",
    },
    {
      value: `${stats.iosHiddenPct}%`,
      label: "of plans missing from the iOS app",
    },
  ];

  const quickChips = quick.length
    ? quick
        .map(
          (item) => `<a href="${esc(item.url)}" class="btn-outline-light text-xs px-3 py-1.5 rounded-lg transition whitespace-nowrap">${esc(item.name)}</a>`
        )
        .join("")
    : "";

  return `
  <section class="hero rounded-2xl p-6 sm:p-8 mb-6">
    <div class="max-w-3xl">
      <h1 class="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
        ${esc(brand.hero_headline ?? "Find the cheapest eSIM for your trip")}
      </h1>
      <p class="text-sm sm:text-base text-slate-200 mt-3 max-w-2xl">
        ${esc(brand.hero_sub ?? "Pick your destination and trip length.")}
      </p>
      <div class="hero-rule h-1 w-24 rounded-full mt-5"></div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
        ${proofPoints
          .map(
            (point) => `<div class="hero-stat px-4 py-3">
          <div class="text-xl font-extrabold text-white">${esc(point.value)}</div>
          <div class="text-[11px] text-slate-300 mt-0.5 leading-snug">${esc(point.label)}</div>
        </div>`
          )
          .join("")}
      </div>

      ${
        quickChips
          ? `<div class="mt-6">
        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-2">Popular destinations</div>
        <div class="flex flex-wrap gap-2">${quickChips}</div>
      </div>`
          : ""
      }
    </div>
  </section>`;
}

/**
 * Pick the quick-destination chips: the most searched destinations, so the
 * hero gives a first-time visitor an immediate way in.
 */
export function pickQuickDestinations(products, slugs, limit = 8) {
  // Ordered by how likely a traveller is to be searching for them.
  const popular = [
    "USA",
    "JPN",
    "THA",
    "TUR",
    "FJI",
    "ESP",
    "ITA",
    "GBR",
    "FRA",
    "PRT",
    "GRC",
    "MEX",
    "BRA",
    "AUS",
    "NZL",
    "IDN",
    "VNM",
    "IND",
    "ARE",
    "EGY",
  ];

  const byIso = new Map(products.map((product) => [product.iso, product]));
  const picked = [];

  for (const iso of popular) {
    const product = byIso.get(iso);
    if (!product) continue;
    picked.push({
      iso,
      name: product.name,
      slug: slugs.get(iso),
    });
    if (picked.length >= limit) break;
  }

  // Fall back to whatever exists if the curated list did not match.
  if (picked.length < limit) {
    for (const product of products) {
      if (picked.some((p) => p.iso === product.iso)) continue;
      picked.push({
        iso: product.iso,
        name: product.name,
        slug: slugs.get(product.iso),
      });
      if (picked.length >= limit) break;
    }
  }

  return picked;
}
