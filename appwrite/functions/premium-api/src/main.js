/**
 * The premium API.
 *
 * An Appwrite Function that serves the PAID tier of eSIM Price Truth.
 * The free calculator stays on GitHub Pages; this function only fronts
 * what needs an entitlement check.
 *
 * The premium data is served from the same catalogue the static site is
 * built from, so it can never drift. It is simply NOT SENT to a browser
 * without a valid entitlement - which is the only way to actually gate
 * data. Client-side obfuscation is not security.
 *
 * Routes (all invoked with an Appwrite session, so the user is known):
 *
 *   GET  /entitlement   "am I a subscriber?" - used by the site UI
 *   GET  /export        the full price + coverage export (JSON or CSV)
 *   GET  /errors        the pricing-error monitor feed
 *   GET  /alerts        a subscriber's watchlist
 *   POST /watch         add or remove a destination from the watchlist
 *   POST /checkout      create a Stripe Checkout session
 *   POST /portal        create a Stripe customer portal session
 *   POST /webhook       Stripe's subscription events
 *
 * The webhook is the only route that does NOT require a session, because
 * Stripe is not an Appwrite user. It is authenticated by Stripe's own
 * signature instead.
 */

import { ID } from "node-appwrite";
import Stripe from "stripe";

import {
  planHasFeature,
  planFeatures,
  verifyEntitlement,
} from "./entitlement.js";
import { CATALOG } from "./catalog.js";
import { buildExport, buildErrorFeed, buildAlerts, toCsv } from "./data.js";
import { createTables } from "./db.js";

/* --------------------------------------------------------------- setup -- */

const endpoint =
  process.env.APPWRITE_FUNCTION_API_ENDPOINT ??
  process.env.APPWRITE_ENDPOINT ??
  "https://cloud.appwrite.io/v1";
const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID;

/**
 * The database handle.
 *
 * The client is built PER REQUEST, because Appwrite gives each function
 * execution its own ephemeral key in the `x-appwrite-key` header. That
 * key is scoped to the execution and is the only credential that works
 * from inside the function - the static `APPWRITE_FUNCTION_API_KEY`
 * environment variable is a BUILD-time value and is not valid at runtime.
 *
 * The escape hatch exists so the local test harness can inject a fake
 * database - see scripts/test-appwrite-function.mjs. It is a global
 * rather than an environment variable on purpose: Node coerces every
 * `process.env` value to a string, so an object injected that way would
 * silently become "[object Object]".
 */
function databaseFor(req) {
  if (globalThis.__APPWRITE_TEST_TABLES) return globalThis.__APPWRITE_TEST_TABLES;

  const key =
    req.headers["x-appwrite-key"] ?? process.env.APPWRITE_FUNCTION_API_KEY;
  if (!key) {
    throw new Error("no API key for this execution");
  }
  if (!endpoint) {
    throw new Error(
      "no API endpoint: APPWRITE_FUNCTION_API_ENDPOINT and APPWRITE_ENDPOINT are both unset"
    );
  }
  if (!projectId) {
    throw new Error("no project id: APPWRITE_FUNCTION_PROJECT_ID is unset");
  }

  return createTables(key, projectId);
}

/** The Stripe client. Only needed for the billing routes. */
function stripe() {
  // The test harness injects a stub, so the billing logic can be tested
  // without a network call or a real Stripe account. It is a global
  // rather than an environment variable on purpose: Node coerces every
  // `process.env` value to a string, so an object injected that way would
  // silently become "[object Object]".
  if (globalThis.__APPWRITE_TEST_STRIPE) return globalThis.__APPWRITE_TEST_STRIPE;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    // The Stripe API version is pinned so a dashboard-side change can
    // never silently alter the shape of the objects we read.
    //
    // It must match the version scripts/stripe-setup.mjs uses to create
    // the prices and the webhook, because the SHAPE of a subscription
    // differs between versions: `current_period_end` moved from the
    // subscription to its item in 2025-03-31.basil.
    apiVersion: "2025-10-29.clover",
    typescript: true,
  });
}

/**
 * The Stripe price id for a plan and a billing period.
 *
 * The yearly prices exist because the pricing page advertises "or $59/year",
 * so a plan has two prices and the caller has to say which one it wants.
 */
function priceFor(plan, period) {
  const key =
    plan === "team"
      ? period === "yearly"
        ? "STRIPE_PRICE_TEAM_YEARLY"
        : "STRIPE_PRICE_TEAM"
      : period === "yearly"
        ? "STRIPE_PRICE_PRO_YEARLY"
        : "STRIPE_PRICE_PRO";

  const value = process.env[key];
  // A placeholder means "not set up yet", and offering it to Stripe would
  // fail at the checkout - so it is treated as absent.
  if (!value || value.startsWith("price_replace_me")) return null;
  return value;
}

/**
 * The caller's Appwrite user id, or null.
 *
 * This is the IDENTITY check, and it is deliberately weaker than
 * `resolveEntitlement`: it only proves WHO is calling, not WHAT they paid
 * for. The billing routes need exactly this - a customer who has never
 * subscribed has no record at all, so demanding an active subscription
 * there would mean nobody could ever buy one.
 */
function sessionUserId(req) {
  return userId(req);
}

/* ------------------------------------------------------------- helpers -- */

const PLANS = { free: "free", pro: "pro", team: "team" };

const DB = () => process.env.SUBSCRIBERS_DATABASE_ID;
const SUBSCRIBERS_TABLE = () => process.env.SUBSCRIBERS_TABLE_ID;
const WATCHLIST_TABLE = () => process.env.WATCHLIST_TABLE_ID;

/**
 * Read a JSON body from an Appwrite function request.
 *
 * The runtime exposes `bodyJson` as a LAZY getter that runs JSON.parse on
 * the raw body. A GET request has no body, so the raw body is "" and
 * JSON.parse("") THROWS "Unexpected end of JSON input". Touching
 * `bodyJson` unguarded therefore breaks every GET route, so the getter is
 * only used inside a try/catch and the raw text is preferred.
 */
function body(req) {
  // Every source is read defensively: in the runtime these are LAZY
  // getters, and a getter that throws would take the whole request down.
  let text = null;
  try {
    if (typeof req.bodyText === "string") text = req.bodyText;
  } catch {
    /* ignore */
  }
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      /* not JSON - fall through */
    }
  }

  try {
    if (req.bodyJson) return req.bodyJson;
  } catch {
    /* the runtime could not parse an empty body - that is not an error */
  }

  try {
    return req.body ?? {};
  } catch {
    return {};
  }
}

/**
 * The Appwrite user id for this call, or null for an anonymous caller.
 *
 * Appwrite authenticates the caller BEFORE it dispatches the execution, so
 * the user id arrives in a platform-set header. Those headers cannot be
 * spoofed: Appwrite strips every `x-appwrite-*` header the CLIENT sent
 * (see Appwrite\Functions\Validator\Headers::stripReserved), so anything
 * that arrives with that prefix was put there by the platform.
 *
 * The platform sets `x-appwrite-user-id` for a session-authenticated call.
 * Some Appwrite versions instead sign a JWT and pass it as
 * `x-appwrite-jwt`, so that is decoded as a fallback. The user id is only
 * ever used to LOOK UP the subscriber record - it never grants anything by
 * itself, so even a wrong guess cannot escalate a privilege.
 */
function userId(req) {
  const direct =
    req.headers["x-appwrite-user-id"] ||
    req.headers["x-appwrite-user"] ||
    null;
  if (direct) return direct;

  const jwt =
    req.headers["x-appwrite-user-jwt"] ||
    req.headers["x-appwrite-jwt"] ||
    null;
  if (jwt) {
    const decoded = decodeJwtSubject(jwt);
    if (decoded) return decoded;
  }

  return null;
}

/** Read the user id out of a JWT payload. Not a verification - see above. */
function decodeJwtSubject(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    return payload.sub ?? payload.userId ?? payload.user_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up the caller's subscription.
 *
 * The row is keyed on the Appwrite user id, so the function never has to
 * trust anything the client sends about who the subscriber is.
 */
async function findSubscription(tables, appwriteUserId) {
  if (!appwriteUserId) return null;

  let result;
  try {
    result = await tables.listRows({
      databaseId: DB(),
      tableId: SUBSCRIBERS_TABLE(),
      queries: [
        { method: "equal", attribute: "userId", values: [appwriteUserId] },
        { method: "limit", values: [1] },
      ],
    });
  } catch (err) {
    throw new Error(
      `listRows failed: ${err?.message ?? err} ` +
        `(endpoint=${endpoint}, database=${DB()}, table=${SUBSCRIBERS_TABLE()})`
    );
  }

  return result.rows?.[0] ?? null;
}

/**
 * Resolve the caller's entitlement.
 *
 * The Appwrite session is what proves WHO the caller is, and the
 * subscriber record is the source of truth for WHAT they paid for. A
 * cancelled subscription is refused even if its token has not expired.
 */
async function resolveEntitlement(req, tables) {
  const appwriteUserId = userId(req);
  if (!appwriteUserId) {
    return { ok: false, reason: "no-session", status: 401 };
  }

  const row = await findSubscription(tables, appwriteUserId);
  if (!row) {
    return { ok: false, reason: "no-subscription", status: 403 };
  }
  if (row.status !== "active") {
    return { ok: false, reason: row.status ?? "inactive", status: 403 };
  }

  // The signed token is a fast path, and it is checked so a client
  // cannot upgrade its own plan by editing a field.
  const token =
    req.headers["x-esim-entitlement"] ?? body(req).entitlement ?? null;
  if (token) {
    const verified = verifyEntitlement(token, process.env.ENTITLEMENT_SECRET);
    if (verified.ok && verified.plan !== row.plan) {
      // The token and the record disagree - trust the record, because
      // the record is what Stripe last told us.
      return {
        ok: true,
        plan: row.plan,
        userId: appwriteUserId,
        row,
        reason: "plan-changed",
      };
    }
  }

  return { ok: true, plan: row.plan, userId: appwriteUserId, row };
}

/** Send a JSON response. */
function json(res, payload, status = 200) {
  return res.json(payload, status);
}

/* -------------------------------------------------------------- routes -- */

/** GET /entitlement - what can this caller do? */
async function handleEntitlement(req, res, tables) {
  const ent = await resolveEntitlement(req, tables);
  if (!ent.ok) {
    return json(res, { active: false, reason: ent.reason });
  }
  return json(res, {
    active: true,
    plan: ent.plan,
    features: planFeatures(ent.plan),
    currentPeriodEnd: ent.row?.currentPeriodEnd ?? null,
    customerPortalAvailable: Boolean(ent.row?.stripeCustomerId),
  });
}

/** GET /export - the full price + coverage export. */
async function handleExport(req, res, query, tables) {
  const ent = await resolveEntitlement(req, tables);
  if (!ent.ok) {
    return json(
      res,
      { error: "subscription_required", reason: ent.reason },
      ent.status ?? 402
    );
  }
  if (!planHasFeature(ent.plan, "data_export")) {
    return json(res, { error: "upgrade_required" }, 403);
  }

  const payload = buildExport(query);

  if (query.get("format") === "csv") {
    const csv = toCsv(payload.rows);
    return res.text(csv, 200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="esim-price-export.csv"',
      // The CSV is one page of the export, so the client is told where the
      // next page starts.
      "X-Export-Total-Rows": String(payload.totalRows),
      "X-Export-Next-Offset": String(payload.nextOffset ?? ""),
    });
  }

  return json(res, payload);
}

/** GET /errors - the pricing-error monitor. */
async function handleErrors(req, res, tables) {
  const ent = await resolveEntitlement(req, tables);
  if (!ent.ok) {
    return json(
      res,
      { error: "subscription_required", reason: ent.reason },
      ent.status ?? 402
    );
  }
  if (!planHasFeature(ent.plan, "pricing_error_monitor")) {
    return json(res, { error: "upgrade_required" }, 403);
  }
  return json(res, buildErrorFeed());
}

/** GET /alerts - the subscriber's watchlist. */
async function handleAlerts(req, res, tables) {
  const ent = await resolveEntitlement(req, tables);
  if (!ent.ok) {
    return json(
      res,
      { error: "subscription_required", reason: ent.reason },
      ent.status ?? 402
    );
  }
  if (!planHasFeature(ent.plan, "price_alerts")) {
    return json(res, { error: "upgrade_required" }, 403);
  }

  const result = await tables.listRows({
    databaseId: DB(),
    tableId: WATCHLIST_TABLE(),
    queries: [
      { method: "equal", attribute: "userId", values: [ent.userId] },
      { method: "limit", values: [200] },
    ],
  });

  const destinations = result.rows.map((row) => row.destination);
  const alerts = buildAlerts(destinations);

  return json(res, {
    plan: ent.plan,
    destinations,
    asOf: alerts.asOf,
    watched: alerts.watched,
    changes: alerts.changes,
  });
}

/** POST /watch - add or remove a destination from the watchlist. */
async function handleWatch(req, res, tables) {
  const ent = await resolveEntitlement(req, tables);
  if (!ent.ok) {
    return json(
      res,
      { error: "subscription_required", reason: ent.reason },
      ent.status ?? 402
    );
  }
  if (!planHasFeature(ent.plan, "price_alerts")) {
    return json(res, { error: "upgrade_required" }, 403);
  }

  const { destination, action } = body(req);
  if (!destination) {
    return json(res, { error: "destination_required" }, 400);
  }

  const iso = String(destination).trim().toUpperCase();

  const existing = await tables.listRows({
    databaseId: DB(),
    tableId: WATCHLIST_TABLE(),
    queries: [
      { method: "equal", attribute: "userId", values: [ent.userId] },
      { method: "equal", attribute: "destination", values: [iso] },
      { method: "limit", values: [1] },
    ],
  });

  if (action === "remove") {
    for (const row of existing.rows) {
      await tables.deleteRow({
        databaseId: DB(),
        tableId: WATCHLIST_TABLE(),
        rowId: row.$id,
      });
    }
    return json(res, { ok: true, destination: iso, action: "removed" });
  }

  if (existing.rows.length === 0) {
    await tables.createRow({
      databaseId: DB(),
      tableId: WATCHLIST_TABLE(),
      rowId: ID.unique(),
      data: { userId: ent.userId, destination: iso },
    });
  }

  return json(res, { ok: true, destination: iso, action: "added" });
}

/* ------------------------------------------------------------- billing -- */

/** POST /checkout - create a Stripe Checkout session. */
async function handleCheckout(req, res, tables) {
  // A checkout only needs IDENTITY, not an existing subscription: the
  // customer buying here is by definition someone who has NOT subscribed
  // yet. Demanding an active subscription would make it impossible to
  // become a subscriber in the first place.
  const appwriteUserId = sessionUserId(req);
  if (!appwriteUserId) {
    return json(res, { error: "sign_in_required" }, 401);
  }

  const client_ = stripe();
  if (!client_) {
    return json(res, { error: "billing_not_configured" }, 503);
  }

  // The caller does not get to choose the price, the return URL or the
  // metadata - only the plan and the billing period.
  const { plan, period, email } = body(req);
  const key = String(plan ?? "pro").toLowerCase();
  if (!PLANS[key] || key === "free") {
    return json(res, { error: "unknown_plan" }, 400);
  }

  const cadence = period === "yearly" ? "yearly" : "monthly";
  const priceId = priceFor(key, cadence);
  if (!priceId) {
    return json(res, { error: "unknown_plan" }, 400);
  }

  // The site is the only thing allowed to send the browser to Stripe, so
  // the return URLs are pinned to the site's own origin. A caller-supplied
  // URL would turn the checkout into an open redirect.
  const site = String(process.env.PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const pricingUrl = `${site}/esim-arbitrage-calculator/pricing/`;

  const session = await client_.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email ?? undefined,
    // The Appwrite user id travels with the subscription, so the webhook
    // can link the two without asking the user to match an email.
    client_reference_id: appwriteUserId,
    success_url: `${pricingUrl}?checkout=success`,
    cancel_url: `${pricingUrl}?checkout=cancelled`,
    subscription_data: {
      metadata: { appwriteUserId, plan: key, period: cadence },
    },
    metadata: { appwriteUserId, plan: key, period: cadence },
    allow_promotion_codes: true,
  });

  return json(res, {
    url: session.url,
    sessionId: session.id,
    plan: key,
    period: cadence,
  });
}

/** POST /portal - create a Stripe customer portal session. */
async function handlePortal(req, res, tables) {
  // The portal is for someone who ALREADY has a customer record, so the
  // session is enough - but the record has to exist, otherwise there is no
  // customer to open a portal for.
  const appwriteUserId = sessionUserId(req);
  if (!appwriteUserId) {
    return json(res, { error: "sign_in_required" }, 401);
  }

  const client_ = stripe();
  if (!client_) {
    return json(res, { error: "billing_not_configured" }, 503);
  }

  const row = await findSubscription(tables, appwriteUserId);
  const customerId = row?.stripeCustomerId;
  if (!customerId) {
    return json(res, { error: "no_customer" }, 404);
  }

  const site = String(process.env.PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  const session = await client_.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${site}/esim-arbitrage-calculator/pricing/`,
  });

  return json(res, { url: session.url });
}

/* ------------------------------------------------------------- webhook -- */

/**
 * Stripe's subscription events.
 *
 * The provider tells us when a subscription starts, renews, is cancelled
 * or is refunded. On a start or renewal we create the subscriber record;
 * on a cancellation we mark it cancelled so access ends immediately.
 */
async function handleWebhook(req, res, tables) {
  const client_ = stripe();
  if (!client_) {
    return json(res, { error: "billing_not_configured" }, 503);
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];
  const raw = req.bodyText ?? "";

  let event;
  try {
    if (secret) {
      // Stripe signs the RAW body. Re-serialising the parsed JSON would
      // change the bytes and break the signature.
      //
      // A missing signature is a FAILURE, not a reason to fall through to
      // an unsigned parse: the webhook is a public endpoint, so accepting
      // an unverified body would let anyone POST a forged event and grant
      // themselves a subscription.
      if (!signature) {
        return json(res, { error: "missing_signature" }, 400);
      }
      event = client_.webhooks.constructEvent(raw, signature, secret);
    } else {
      // Only reachable when the webhook secret has not been set up yet.
      // Stripe's own events still work, but nothing is verified.
      event = JSON.parse(raw);
    }
  } catch {
    return json(res, { error: "invalid_signature" }, 400);
  }

  const object = event.data?.object ?? {};

  switch (event.type) {
    case "checkout.session.completed": {
      const appwriteUserId =
        object.metadata?.appwriteUserId ?? object.client_reference_id;
      if (!appwriteUserId) break;
      await upsertSubscription(tables, {
        userId: appwriteUserId,
        customerId: object.customer,
        subscriptionId: object.subscription,
        plan: object.metadata?.plan ?? "pro",
        status: "active",
        email: object.customer_details?.email ?? null,
        currentPeriodEnd: null,
      });
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const appwriteUserId = object.metadata?.appwriteUserId;
      if (!appwriteUserId) break;

      const item = object.items?.data?.[0];
      await upsertSubscription(tables, {
        userId: appwriteUserId,
        customerId: object.customer,
        subscriptionId: object.id,
        plan: planFromPrice(item?.price),
        status:
          object.status === "active" || object.status === "trialing"
            ? "active"
            : object.status,
        email: null,
        currentPeriodEnd: periodEndOf(object, item),
      });
      break;
    }

    case "customer.subscription.deleted": {
      const appwriteUserId = object.metadata?.appwriteUserId;
      if (!appwriteUserId) break;
      // The access ends HERE, not when the period ends - the pricing page
      // promises exactly that.
      await setStatus(tables, appwriteUserId, "cancelled");
      break;
    }

    case "invoice.payment_failed": {
      if (object.customer) await setStatusByCustomer(tables, object.customer, "past_due");
      break;
    }

    case "invoice.paid": {
      // A paid invoice is a renewal, so the new period end is worth
      // recording. The invoice carries the subscription it is for, and
      // that subscription's item carries the period end.
      if (!object.customer) break;

      const subscriptionId =
        typeof object.subscription === "string"
          ? object.subscription
          : object.subscription?.id ?? null;

      let periodEnd = null;
      if (subscriptionId) {
        const client_ = stripe();
        if (client_) {
          try {
            const subscription = await client_.subscriptions.retrieve(subscriptionId);
            periodEnd = periodEndOf(subscription, subscription.items?.data?.[0]);
          } catch {
            // The subscription may already be gone. The status update
            // below still matters, so this is not fatal.
          }
        }
      }

      await setStatusByCustomer(tables, object.customer, "active", periodEnd);
      break;
    }

    default:
      break;
  }

  // Always answer 2xx quickly, or Stripe will retry.
  return json(res, { received: true, type: event.type });
}

/**
 * Which plan does a Stripe price belong to?
 *
 * The price's own metadata is the source of truth, because the price ids
 * are different for the monthly and the yearly cadence of the same plan.
 * The environment variables are the fallback for a price created by hand.
 */
function planFromPrice(price) {
  const id = typeof price === "string" ? price : price?.id;
  const meta = typeof price === "string" ? null : price?.metadata;

  if (meta?.esim_plan === "team" || meta?.plan === "team") return "team";
  if (meta?.esim_plan === "pro" || meta?.plan === "pro") return "pro";

  const team = [process.env.STRIPE_PRICE_TEAM, process.env.STRIPE_PRICE_TEAM_YEARLY];
  const pro = [process.env.STRIPE_PRICE_PRO, process.env.STRIPE_PRICE_PRO_YEARLY];

  if (id && team.includes(id)) return "team";
  if (id && pro.includes(id)) return "pro";
  return "pro";
}

/**
 * When the current billing period ends.
 *
 * Since API version 2025-03-31.basil the field lives on the subscription's
 * ITEM, not on the subscription itself, so both are read. Without this the
 * period end would always be null on a modern API version.
 */
function periodEndOf(subscription, item) {
  const seconds =
    item?.current_period_end ??
    subscription?.current_period_end ??
    null;

  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/** Create or update the subscriber record. */
async function upsertSubscription(tables, {
  userId,
  customerId,
  subscriptionId,
  plan,
  status,
  email,
  currentPeriodEnd,
}) {
  const existing = await tables.listRows({
    databaseId: DB(),
    tableId: SUBSCRIBERS_TABLE(),
    queries: [
      { method: "equal", attribute: "userId", values: [userId] },
      { method: "limit", values: [1] },
    ],
  });

  const row = existing.rows[0] ?? null;

  // A field that this event does not know about is KEPT, not blanked.
  //
  // Stripe sends several events for one purchase, and they do not all
  // carry the same details: `checkout.session.completed` knows the email
  // but not the period end, while `customer.subscription.created` knows
  // the period end but not the email. Writing null for what an event does
  // not know would erase what another event already told us.
  const data = {
    userId,
    plan: PLANS[plan] ?? row?.plan ?? "pro",
    status: status ?? row?.status ?? "active",
    stripeCustomerId: customerId ?? row?.stripeCustomerId ?? null,
    stripeSubscriptionId: subscriptionId ?? row?.stripeSubscriptionId ?? null,
    email: email ?? row?.email ?? null,
    currentPeriodEnd: currentPeriodEnd ?? row?.currentPeriodEnd ?? null,
  };

  if (row) {
    await tables.updateRow({
      databaseId: DB(),
      tableId: SUBSCRIBERS_TABLE(),
      rowId: row.$id,
      data,
    });
    return row.$id;
  }

  const created = await tables.createRow({
    databaseId: DB(),
    tableId: SUBSCRIBERS_TABLE(),
    rowId: ID.unique(),
    data,
  });
  return created.$id;
}

/** Set the status of a subscriber record. */
async function setStatus(tables, userId, status) {
  const existing = await tables.listRows({
    databaseId: DB(),
    tableId: SUBSCRIBERS_TABLE(),
    queries: [
      { method: "equal", attribute: "userId", values: [userId] },
      { method: "limit", values: [1] },
    ],
  });

  for (const row of existing.rows) {
    await tables.updateRow({
      databaseId: DB(),
      tableId: SUBSCRIBERS_TABLE(),
      rowId: row.$id,
      data: { status },
    });
  }
}

/** Set the status of a subscriber record, found by Stripe customer id. */
async function setStatusByCustomer(tables, customerId, status, currentPeriodEnd = null) {
  const existing = await tables.listRows({
    databaseId: DB(),
    tableId: SUBSCRIBERS_TABLE(),
    queries: [
      { method: "equal", attribute: "stripeCustomerId", values: [customerId] },
      { method: "limit", values: [1] },
    ],
  });

  for (const row of existing.rows) {
    await tables.updateRow({
      databaseId: DB(),
      tableId: SUBSCRIBERS_TABLE(),
      rowId: row.$id,
      data: {
        status,
        // The period end is only written when it is known, so an invoice
        // that cannot be resolved does not blank the stored value.
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      },
    });
  }
}

/* --------------------------------------------------------------- entry -- */

export default async ({ req, res, log, error }) => {
  const path = (req.path ?? "").replace(/\/+$/, "") || "/";

  try {
    // Appwrite gives each execution its own ephemeral key, so the database
    // handle is built per request rather than once at module load.
    const tables = databaseFor(req);

    if (path === "/webhook" && req.method === "POST") {
      return await handleWebhook(req, res, tables);
    }
    if (path === "/entitlement" && req.method === "GET") {
      return await handleEntitlement(req, res, tables);
    }
    if (path === "/export" && req.method === "GET") {
      return await handleExport(req, res, new URLSearchParams(req.query ?? {}), tables);
    }
    if (path === "/errors" && req.method === "GET") {
      return await handleErrors(req, res, tables);
    }
    if (path === "/alerts" && req.method === "GET") {
      return await handleAlerts(req, res, tables);
    }
    if (path === "/watch" && req.method === "POST") {
      return await handleWatch(req, res, tables);
    }
    if (path === "/checkout" && req.method === "POST") {
      return await handleCheckout(req, res, tables);
    }
    if (path === "/portal" && req.method === "POST") {
      return await handlePortal(req, res, tables);
    }

    if (path === "/_diag" && req.method === "GET") {
      // Reports which identity headers the platform actually set. It
      // returns only the NAMES of the headers, never their values, so it
      // cannot leak a session token or the ephemeral API key.
      const names = Object.keys(req.headers ?? {}).sort();
      return json(res, {
        headerNames: names,
        hasUserId: Boolean(userId(req)),
        resolvedUserId: userId(req),
        hasEphemeralKey: Boolean(req.headers?.["x-appwrite-key"]),
        hasProject: Boolean(req.headers?.["x-appwrite-project"]),
        query: req.query ?? {},
        method: req.method,
      });
    }

    return json(res, { error: "not_found", path }, 404);
  } catch (err) {
    // The stack is logged, because a bare message is not enough to debug a
    // failure that only happens inside the deployed runtime.
    error(`premium-api failed on ${path}: ${err?.message ?? err}`);
    error(`stack: ${err?.stack ?? "(none)"}`);
    return json(res, { error: "internal_error" }, 500);
  }
};
