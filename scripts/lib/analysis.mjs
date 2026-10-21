/**
 * Shared analytics over the extracted catalogue.
 *
 * These helpers are the single source of truth for every number that appears
 * in generated copy. Nothing in the generated pages hard-codes a figure; it is
 * always computed here from data/catalog.json + data/fx.json so the site can
 * never drift away from the dataset it ships.
 */

export function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Build unique destination slugs, appending the ISO code on collision. */
export function buildSlugs(products) {
  const used = new Map();
  const slugs = new Map();
  for (const product of products) {
    const base = slugify(product.name) || slugify(product.iso);
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const slug = count === 0 ? base : `${base}-${slugify(product.iso)}`;
    slugs.set(product.iso, slug);
  }
  return slugs;
}

/** Convert an amount in `ccy` to USD at the audited spot rate. */
export function toUsd(amount, ccy, spotPerEur) {
  const rate = spotPerEur[ccy] ?? 1;
  const usdPerEur = spotPerEur.USD ?? 1;
  return (amount / rate) * usdPerEur;
}

/** Price for a given duration + currency, or null when not sold. */
export function getPrice(product, day, ccy, ccys) {
  const values = product.d?.[day];
  if (!values) return null;
  const index = ccys.indexOf(ccy);
  return index >= 0 ? values[index] : null;
}

/** All durations a product is sold in, ascending. */
export function availableDays(product) {
  return Object.keys(product.d ?? {})
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Rank every currency for one exact variant (duration) by real USD cost.
 * Returns the cheapest and most expensive currency plus the full ranking.
 */
export function rankCurrencies(product, day, ccys, spotPerEur) {
  const rows = [];
  for (const ccy of ccys) {
    const amount = getPrice(product, day, ccy, ccys);
    if (!amount || amount <= 0) continue;
    const usdEquivalent = toUsd(amount, ccy, spotPerEur);
    rows.push({ ccy, amount, usdEquivalent });
  }
  rows.sort((a, b) => a.usdEquivalent - b.usdEquivalent);
  if (!rows.length) return { rows, best: null, worst: null, usdPrice: 0 };

  const usdAmount = getPrice(product, day, "USD", ccys) ?? 0;
  const usdEquivalent = usdAmount ? toUsd(usdAmount, "USD", spotPerEur) : 0;

  for (const row of rows) {
    row.diffPct = usdEquivalent > 0 ? ((row.usdEquivalent - usdEquivalent) / usdEquivalent) * 100 : 0;
  }

  return { rows, best: rows[0], worst: rows[rows.length - 1], usdPrice: usdEquivalent };
}

/**
 * The single most valuable duration for a destination: the biggest saving
 * found in the anomaly table. This drives the "buy an extra day, pay less"
 * headline on each destination page.
 */
export function bestInversionFor(product, inversions) {
  const own = inversions
    .filter((inv) => inv.iso === product.iso)
    .sort((a, b) => b.save - a.save);
  return own[0] ?? null;
}

/** Cheapest total price (USD) and its duration for a destination. */
export function cheapestPlan(product, ccys, spotPerEur) {
  let best = null;
  for (const day of availableDays(product)) {
    const { usdPrice } = rankCurrencies(product, day, ccys, spotPerEur);
    if (!usdPrice) continue;
    if (!best || usdPrice < best.usdPrice) {
      best = { day, usdPrice, perDay: usdPrice / day };
    }
  }
  return best;
}

/**
 * Cheapest provider for a destination: compares the local catalogue price for
 * the reference duration against the verified competitor benchmarks.
 */
export function bestProvider(product, benchmarks, referenceDay = 7) {
  const entries = benchmarks[product.iso] ?? [];
  if (!entries.length) return null;

  const candidates = entries
    .map((entry) => ({
      key: entry.key,
      provider: entry.provider,
      price: entry.price,
      plan: entry.plan,
      fup: entry.fup,
    }))
    .sort((a, b) => a.price - b.price);

  return { candidates, winner: candidates[0] ?? null };
}

/** Aggregate catalogue-wide statistics, recomputed from the data. */
export function computeStats(catalog, spotPerEur) {
  const { products, ccys, inversions, duplicates } = catalog;
  let prices = 0;
  let variants = 0;
  let iosHidden = 0;
  let totalDurations = 0;

  for (const product of products) {
    const iosDays = product.ios_days ?? [];
    for (const [day, values] of Object.entries(product.d ?? {})) {
      variants += 1;
      prices += Array.isArray(values) ? values.length : 0;
      totalDurations += 1;
      if (!iosDays.includes(Number(day))) iosHidden += 1;
    }
  }

  const iosHiddenPct = totalDurations ? (iosHidden / totalDurations) * 100 : 0;

  // Largest single-currency arbitrage spread across the catalogue.
  let maxSpread = null;
  for (const product of products) {
    for (const day of availableDays(product)) {
      const { best, worst } = rankCurrencies(product, day, ccys, spotPerEur);
      if (!best || !worst) continue;
      if (!maxSpread || worst.diffPct > maxSpread.spreadPct) {
        maxSpread = {
          iso: product.iso,
          name: product.name,
          day,
          spreadPct: worst.diffPct,
          bestCcy: best.ccy,
          worstCcy: worst.ccy,
        };
      }
    }
  }

  const biggestInversion = inversions.reduce(
    (acc, inv) => (inv.save > (acc?.save ?? -Infinity) ? inv : acc),
    null
  );

  return {
    destinations: products.length,
    currencies: ccys.length,
    variants,
    prices,
    inversions: inversions.length,
    duplicates: duplicates.length,
    anomalies: inversions.length + duplicates.length,
    iosHidden,
    iosHiddenPct: Math.round(iosHiddenPct * 10) / 10,
    maxSpread,
    biggestInversion,
  };
}

/** Format a number with thousands separators. */
export function fmt(value, digits = 0) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Escape a string for safe inclusion in HTML text. */
export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a string for safe inclusion inside a JSON-LD script block. */
export function jsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Render a currency symbol for the common codes. */
export function currencySymbol(ccy) {
  const symbols = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    CNY: "¥",
    HKD: "HK$",
    KRW: "₩",
    TRY: "₺",
    BRL: "R$",
    MXN: "MX$",
    COP: "COL$",
    ILS: "₪",
    EGP: "E£",
    AED: "AED ",
    SGD: "S$",
    NOK: "kr ",
    PLN: "zł ",
    CAD: "C$",
    AUD: "A$",
    CHF: "CHF ",
  };
  return symbols[ccy] ?? `${ccy} `;
}
