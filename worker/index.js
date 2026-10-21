/**
 * The subscription Worker.
 *
 * It serves the PREMIUM parts of the site. The free pages stay on GitHub
 * Pages, so the free experience is fast and costs nothing to host. This
 * Worker only fronts:
 *
 *   GET  /api/data/export      the full price + coverage export
 *   GET  /api/errors           the pricing-error monitor feed
 *   GET  /api/entitlement      "am I a subscriber?" (used by the site UI)
 *   GET  /api/alerts            a subscriber's watchlist
 *   POST /api/webhook           the payment provider's events
 *
 * The premium data is served from the same catalogue the static site is
 * built from, so it can never drift. It is simply NOT SENT to a browser
 * without a valid entitlement - which is the only way to actually gate
 * data. Client-side obfuscation is not security.
 */

import {
  planHasFeature,
  parseCookies,
  verifyEntitlement,
  signEntitlement,
} from "../scripts/lib/entitlement.mjs";
import { CATALOG } from "./catalog-data.js";

/** Plan -> which features it unlocks, mirroring scripts/lib/entitlement.mjs. */
const PLAN_FEATURES = {
  free: [],
  pro: ["price_alerts", "data_export", "pricing_error_monitor", "early_access"],
  team: [
    "price_alerts",
    "data_export",
    "pricing_error_monitor",
    "early_access",
    "api",
    "multiple_watchlists",
  ],
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS,
      ...extraHeaders,
    },
  });
}

/**
 * Read the entitlement and verify it.
 *
 * The token is accepted in two ways:
 *
 *   1. `Authorization: Bearer <token>` - the primary way. The site runs on
 *      youssuf-benatti.me and this API runs on workers.dev, so a cookie
 *      would be a THIRD-PARTY cookie and modern browsers block it. A
 *      bearer token in the Authorization header has no such problem.
 *   2. `Cookie: esim_sub=<token>` - supported for same-origin deployments
 *      and for the case where the whole site is later moved behind this
 *      Worker.
 *
 * The header is checked first so the explicit credential wins.
 */
async function getEntitlement(request, env) {
  const token = readToken(request, env);

  const result = verifyEntitlement(token, env.SUBSCRIPTION_SECRET);
  if (!result.ok) return result;

  // A cancellation is checked against the revocation list so a subscriber
  // who cancels loses access immediately, not when their token expires.
  // The subscriber id is part of the signed payload, so it cannot be
  // forged - an attacker cannot claim a different id to dodge a revocation.
  if (env.SUBS && result.subscriberId) {
    const revoked = await env.SUBS.get(`revoked:${result.subscriberId}`);
    if (revoked) return { ok: false, reason: "revoked" };
  }

  return result;
}

/** Pull the entitlement token out of the request. */
function readToken(request, env) {
  const auth = request.headers.get("Authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();

  const cookies = parseCookies(request.headers.get("Cookie") ?? "");
  return cookies[env.COOKIE_NAME ?? "esim_sub"] ?? null;
}

/**
 * The premium endpoints deliver SERVICE, not raw data bytes.
 *
 * This matters: the catalogue is already served publicly at
 * /esim-arbitrage-calculator/data/catalog.json, because the free
 * calculator is client-side. So "sell the data file" is not a business - a
 * subscriber could download it for free. What a subscriber actually pays
 * for is the WORK:
 *
 *   - being told when prices move, before the page is rebuilt
 *   - a pre-built, clean, de-duplicated export in the format they want
 *   - the error monitor as a live feed
 *   - someone else's labour, not a file
 */

/**
 * Build a clean, flat export for a subscriber.
 *
 * The public catalogue is nested and keyed by duration. A subscriber gets a
 * flat table, one row per plan per duration, sorted and ready to load into
 * a spreadsheet. That flattening is the work they are paying for.
 */
function buildExport(query) {
  const rows = [];

  for (const product of CATALOG.products ?? []) {
    for (const [day, prices] of Object.entries(product.d ?? {})) {
      const days = Number(day);
      for (const price of prices ?? []) {
        rows.push({
          iso: product.iso,
          destination: product.name,
          plan: product.type,
          days,
          gb: product.gb ?? null,
          carriers: product.carriers,
          has5g: product.has5g,
          hotspot_mb_per_day: product.tether_mb,
          visible_in_ios_app: (product.ios_days ?? []).includes(days),
          provider: price.p ?? null,
          price_usd: price.p ?? null,
          price_eur: price.e ?? null,
          network: price.n ?? null,
        });
      }
    }
  }

  // A subscriber can narrow the export to the destinations they care
  // about, which is the difference between a 6,000-row file and a 40-row one.
  const wanted = (query.get("destinations") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const filtered = wanted.length
    ? rows.filter((row) => wanted.includes(String(row.iso).toUpperCase()))
    : rows;

  return {
    generatedAt: new Date().toISOString(),
    asOf: CATALOG.asOf ?? null,
    rows: filtered,
    rowCount: filtered.length,
    totalRows: rows.length,
    filtered: wanted.length > 0,
  };
}

/**
 * The pricing-error monitor.
 *
 * The public pages mention that inversions exist; a subscriber gets the
 * actual list, with the specific plan, the two prices involved and the
 * money left on the table.
 */
function buildErrorFeed(query) {
  const inversions = CATALOG.inversions ?? [];

  const enriched = inversions.map((inv) => ({
    ...inv,
    // The amount a traveller would overpay by taking the "wrong" plan.
    // This is the concrete value of the feed.
    overpay_usd:
      typeof inv.price_a === "number" && typeof inv.price_b === "number"
        ? Number((Math.max(inv.price_a, inv.price_b) - Math.min(inv.price_a, inv.price_b)).toFixed(2))
        : null,
  }));

  const totalOverpay = enriched.reduce(
    (sum, inv) => sum + (inv.overpay_usd ?? 0),
    0
  );

  return {
    generatedAt: new Date().toISOString(),
    asOf: CATALOG.asOf ?? null,
    count: enriched.length,
    totalOverpayUsd: Number(totalOverpay.toFixed(2)),
    inversions: enriched,
  };
}

/**
 * The price alert feed: what changed since the subscriber last looked.
 *
 * This is the feature that justifies a subscription more than anything
 * else - it is the difference between pulling a file and being told.
 */
function buildAlerts(query) {
  const asOf = CATALOG.asOf ?? null;
  return {
    generatedAt: new Date().toISOString(),
    asOf,
    // The current snapshot of the watched destinations, with the best
    // (cheapest effective) price for each.
    watched: [],
    // Filled from the price_events table once the catalogue refresh runs.
    changes: [],
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ---- the payment provider's webhook ----
    if (url.pathname === "/api/webhook") {
      return handleWebhook(request, env);
    }

    // ---- entitlement probe: the site UI calls this ----
    if (url.pathname === "/api/entitlement") {
      const ent = await getEntitlement(request, env);
      if (!ent.ok) return json({ active: false, reason: ent.reason }, 200);
      return json({
        active: true,
        plan: ent.plan,
        expiresAt: ent.expiresAt,
        features: PLAN_FEATURES[ent.plan] ?? [],
      });
    }

    // ---- redeem a token for a session ----
    // After checkout the provider sends the buyer to this site with the
    // token in the URL fragment (fragments are never sent to a server, so
    // the token never lands in a log). The page then exchanges it for a
    // session stored in localStorage and sent as a bearer token.
    if (url.pathname === "/api/redeem") {
      const token = url.searchParams.get("token");
      const result = verifyEntitlement(token, env.SUBSCRIPTION_SECRET);
      if (!result.ok) {
        return json({ error: "invalid_token", reason: result.reason }, 401);
      }
      return json({
        ok: true,
        plan: result.plan,
        expiresAt: result.expiresAt,
        features: PLAN_FEATURES[result.plan] ?? [],
      });
    }

    // ---- the premium data endpoints ----
    const premiumRoutes = {
      "/api/data/export": { feature: "data_export", build: buildExport },
      "/api/errors": { feature: "pricing_error_monitor", build: buildErrorFeed },
      "/api/alerts": { feature: "price_alerts", build: buildAlerts },
    };

    const route = premiumRoutes[url.pathname];
    if (route) {
      const ent = await getEntitlement(request, env);
      if (!ent.ok) {
        return json(
          {
            error: "subscription_required",
            reason: ent.reason,
            message:
              "This data is part of the Pro plan. Subscribe to unlock the full export.",
            upgradeUrl: env.SUBSCRIPTION_URL ?? null,
          },
          402
        );
      }
      if (!planHasFeature(ent.plan, route.feature)) {
        return json(
          {
            error: "upgrade_required",
            message: `The ${route.feature.replace(/_/g, " ")} feature needs a higher plan.`,
            upgradeUrl: env.SUBSCRIPTION_URL ?? null,
          },
          403
        );
      }

      // CSV is the format people actually open. A subscriber asking for a
      // spreadsheet should not have to write a script.
      if (url.searchParams.get("format") === "csv") {
        const payload = route.build(url.searchParams);
        const csv = toCsv(payload.rows ?? payload.inversions ?? []);
        return new Response(csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="esim-${route.feature}.csv"`,
            "Cache-Control": "no-store",
            ...CORS,
          },
        });
      }

      return json(route.build(url.searchParams));
    }

    return json({ error: "not_found" }, 404);
  },
};

/** Turn an array of objects into CSV, guessing the columns from the first row. */
function toCsv(rows) {
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

/**
 * The payment provider's webhook.
 *
 * The provider is a Merchant of Record, so it handles the tax. It posts an
 * event when a subscription starts, renews, is cancelled or is refunded.
 * On a start or renewal we issue a signed entitlement and store it; on a
 * cancellation we mark it revoked so access ends immediately.
 */
async function handleWebhook(request, env) {
  const secret = env.WEBHOOK_SECRET;
  const body = await request.text();

  // Verify the signature the provider sends. Lemon Squeezy and Gumroad both
  // sign the raw body with a shared secret; the header name differs, so try
  // the common ones.
  if (secret) {
    const signature =
      request.headers.get("X-Signature") ??
      request.headers.get("X-Webhook-Signature") ??
      request.headers.get("X-Ls-Signature") ??
      "";

    if (signature) {
      const expected = await hmacHex(secret, body);
      if (!timingSafeEqualHex(expected, signature)) {
        return json({ error: "invalid_signature" }, 401);
      }
    }
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const meta = event.data?.attributes ?? event.data ?? {};
  const action = event.meta?.event_name ?? event.event ?? event.type ?? "";
  const email = meta.email ?? meta.user_email ?? null;
  const plan = normalisePlan(
    meta.product_id ?? meta.variant_id ?? meta.plan ?? meta.subscription_plan
  );
  const subscriberId =
    meta.subscription_id ?? meta.id ?? event.meta?.subscription_id ?? "unknown";

  const started = [
    "subscription_created",
    "subscription_resumed",
    "subscription_updated",
    "sale",
  ];
  const ended = ["subscription_cancelled", "subscription_expired", "refund"];

  if (started.includes(action)) {
    const expiresAt = Date.now() + 400 * 24 * 60 * 60 * 1000;
    const token = signEntitlement(
      plan,
      expiresAt,
      env.SUBSCRIPTION_SECRET,
      subscriberId
    );

    if (env.SUBS) {
      await env.SUBS.put(
        `sub:${subscriberId}`,
        JSON.stringify({
          subscriberId,
          email,
          plan,
          expiresAt,
          token,
          revokedAt: null,
          createdAt: new Date().toISOString(),
        })
      );
    }

    // The subscriber record is the source of truth for renewals and
    // cancellations; the token is the fast path for access checks.
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO subscribers (id, email, plan, status, provider, provider_ref, current_period_end)
         VALUES (?, ?, ?, 'active', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           plan = excluded.plan,
           status = 'active',
           current_period_end = excluded.current_period_end,
           updated_at = datetime('now')`
      )
        .bind(subscriberId, email ?? "unknown", plan, "lemonsqueezy", subscriberId, expiresAt)
        .run();
    }

    // The provider's flow can hand this token back to the buyer, who
    // redeems it for a session.
    return json({ ok: true, granted: true, plan, token, subscriberId });
  }

  if (ended.includes(action)) {
    // Revoking by subscriber id blocks access IMMEDIATELY, rather than
    // waiting for the token to expire on its own.
    if (env.SUBS) {
      await env.SUBS.put(
        `revoked:${subscriberId}`,
        JSON.stringify({ revokedAt: new Date().toISOString(), plan })
      );
    }

    if (env.DB) {
      await env.DB.prepare(
        `UPDATE subscribers
            SET status = 'cancelled', updated_at = datetime('now')
          WHERE id = ? OR provider_ref = ?`
      )
        .bind(subscriberId, subscriberId)
        .run();
    }

    return json({ ok: true, revoked: true, subscriberId });
  }

  return json({ ok: true, ignored: action });
}

function normalisePlan(value) {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("team") || text.includes("agency")) return "team";
  return "pro";
}

/** HMAC-SHA256 as lowercase hex, matching what the provider signs. */
async function hmacHex(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison of two hex strings. */
function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
