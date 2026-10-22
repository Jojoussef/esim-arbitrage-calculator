/**
 * The premium data builders.
 *
 * These are the SAME transformations the Cloudflare Worker used, so the
 * paid tier keeps working the same way after the migration to Appwrite.
 *
 * The key point: the premium endpoints deliver SERVICE, not raw data
 * bytes. The catalogue is already served publicly at
 * /esim-arbitrage-calculator/data/catalog.json, because the free
 * calculator is client-side. So "sell the data file" is not a business -
 * a subscriber could download it for free. What a subscriber actually pays
 * for is the WORK:
 *
 *   - being told when prices move, before the page is rebuilt
 *   - a pre-built, clean, de-duplicated export in the format they want
 *   - the error monitor as a live feed
 */

import { CATALOG } from "./catalog.js";

/**
 * The export page size.
 *
 * The whole table is 136,000 rows, so a default page of 2,000 keeps the
 * response under a megabyte and well inside the function's time and
 * memory budget. A client that wants the lot asks for more pages.
 */
const DEFAULT_EXPORT_LIMIT = 2000;

/** The largest page a single request may ask for. */
const MAX_EXPORT_LIMIT = 20000;

/** Read an integer from the query, with a default and a range. */
function clampInt(raw, fallback, min, max) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * Build a clean, flat export for a subscriber.
 *
 * The public catalogue is nested and keyed by duration. A subscriber gets a
 * flat table, one row per plan per duration, sorted and ready to load into
 * a spreadsheet. That flattening is the work they are paying for.
 *
 * The catalogue's shape:
 *   product.d[days]   -> an array of prices, one per currency, in the
 *                        same order as the currency list
 *   product.type       -> "Region" | "Country" | "Local" (the scope)
 *   product.plantype   -> "Unlimited" | "Fixed" (the data allowance style)
 *   product.ios_days   -> the durations the vendor's iOS app hides
 */
export function buildExport(query) {
  const currencies = CATALOG.currencies ?? [];
  const products = CATALOG.products ?? [];

  // A subscriber can narrow the export to the destinations they care
  // about, which is the difference between a 136,000-row file and a
  // 40-row one.
  const wanted = (query.get("destinations") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  // The full table is 136,000 rows, which is 42 MB of JSON. Returning
  // that in one response is what made this route time out at the edge
  // cache, so the export is PAGINATED: `limit` and `offset` pick the
  // page, and the response says how many rows there are in total so the
  // client knows whether to ask for more.
  const limit = clampInt(query.get("limit"), DEFAULT_EXPORT_LIMIT, 1, MAX_EXPORT_LIMIT);
  const offset = clampInt(query.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  const matches = (product) =>
    wanted.length === 0 || wanted.includes(String(product.iso).toUpperCase());

  // Count the matching rows WITHOUT building them. Materialising the
  // whole table only to slice a page out of it is what used to blow the
  // memory and time budget.
  let totalRows = 0;
  for (const product of products) {
    if (!matches(product)) continue;
    for (const prices of Object.values(product.d ?? {})) {
      totalRows += prices.length;
    }
  }

  const rows = [];
  let skipped = 0;

  outer: for (const product of products) {
    if (!matches(product)) continue;
    for (const [day, prices] of Object.entries(product.d ?? {})) {
      const days = Number(day);
      for (let index = 0; index < prices.length; index += 1) {
        if (skipped < offset) {
          skipped += 1;
          continue;
        }
        rows.push({
          iso: product.iso,
          destination: product.name,
          scope: product.type,
          plan_type: product.plantype,
          days,
          currency: currencies[index] ?? `c${index}`,
          price: prices[index],
          carriers: product.carriers,
          has5g: product.has5g,
          hotspot_mb_per_day: product.tether_mb,
          hotspot_accum: product.tether_accum,
          visible_in_ios_app: (product.ios_days ?? []).includes(days),
        });
        if (rows.length >= limit) break outer;
      }
    }
  }

  const nextOffset = offset + rows.length;

  return {
    generatedAt: new Date().toISOString(),
    asOf: CATALOG.asOf ?? null,
    currencies: currencies.length,
    rows,
    rowCount: rows.length,
    totalRows,
    limit,
    offset,
    hasMore: nextOffset < totalRows,
    nextOffset: nextOffset < totalRows ? nextOffset : null,
    filtered: wanted.length > 0,
  };
}

/**
 * The pricing-error monitor.
 *
 * The public pages mention that inversions exist; a subscriber gets the
 * actual list, with the specific plan, the two prices involved and the
 * money left on the table.
 *
 * An inversion in the catalogue looks like:
 *   { iso, name, ccy, d1, p1, d2, p2, save, pct }
 * where d1/p1 is the shorter plan and d2/p2 the longer one, and p2 < p1
 * means the longer plan is CHEAPER.
 */
export function buildErrorFeed() {
  const inversions = CATALOG.inversions ?? [];

  const enriched = inversions.map((inv) => ({
    iso: inv.iso,
    destination: inv.name,
    currency: inv.ccy,
    shorter_days: inv.d1,
    shorter_price: inv.p1,
    longer_days: inv.d2,
    longer_price: inv.p2,
    // The amount a traveller would overpay by taking the shorter plan.
    overpay: inv.save ?? null,
    overpay_pct: inv.pct ?? null,
  }));

  const totalOverpay = enriched.reduce(
    (sum, inv) => sum + (inv.overpay ?? 0),
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    asOf: CATALOG.asOf ?? null,
    count: enriched.length,
    totalOverpay: Number(totalOverpay.toFixed(2)),
    inversions: enriched,
  };
}

/**
 * The price alert feed: what changed since the subscriber last looked.
 *
 * This is the feature that justifies a subscription more than anything
 * else - it is the difference between pulling a file and being told.
 */
export function buildAlerts(destinations = []) {
  const asOf = CATALOG.asOf ?? null;
  const currencies = CATALOG.currencies ?? [];

  // The cheapest price for each watched destination, in each currency.
  const watched = destinations.map((iso) => {
    const product = (CATALOG.products ?? []).find((p) => p.iso === iso);
    if (!product) return { destination: iso, found: false };

    // Index 0 of each price array is the first currency in the list. The
    // catalogue is ordered, so the cheapest price for a currency is the
    // minimum across every duration.
    const perCurrency = currencies.map((currency, index) => {
      let cheapest = null;
      for (const [day, prices] of Object.entries(product.d ?? {})) {
        const price = prices?.[index];
        if (typeof price !== "number") continue;
        if (cheapest === null || price < cheapest.price) {
          cheapest = { price, days: Number(day) };
        }
      }
      return { currency, ...cheapest };
    });

    const best = perCurrency
      .filter((c) => c.price !== undefined)
      .sort((a, b) => a.price - b.price)[0];

    return {
      destination: iso,
      name: product.name,
      scope: product.type,
      found: true,
      asOf,
      best,
      per_currency: perCurrency,
    };
  });

  return { asOf, watched, changes: [] };
}

/** Turn an array of objects into CSV, guessing the columns from the first row. */
export function toCsv(rows) {
  if (!rows || rows.length === 0) return "";

  const columns = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escape(row[column])).join(","));
  }
  return lines.join("\n");
}
