#!/usr/bin/env node
/**
 * Provision the Stripe side of the subscription.
 *
 *   node scripts/stripe-setup.mjs
 *
 * Creates the products, the recurring prices, the billing-portal
 * configuration and the webhook endpoint, then pushes the ids and the
 * secrets to the Appwrite Function and writes the price ids back into
 * config/subscription.json.
 *
 * It is idempotent: anything that already exists is reused, so it is safe
 * to re-run after a partial failure. That matters because the Stripe
 * webhook's SIGNING SECRET can only be read at creation time - it is never
 * shown again - so a re-run must not create a second endpoint and orphan
 * the first one.
 *
 * The Stripe secret key is read from the environment:
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
 *
 * It is never written to disk and never committed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = resolve(ROOT, "config/subscription.json");

const FUNCTION_ID = "premium-api";

/** The function's public domain. Stripe posts the webhook here. */
const FUNCTION_DOMAIN = "premium-api.fra.appwrite.run";
const WEBHOOK_URL = `https://${FUNCTION_DOMAIN}/webhook`;

/** The Stripe events the function acts on. */
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

/**
 * The Stripe API version the function's SDK is pinned to.
 *
 * It must match the version in appwrite/functions/premium-api/src/main.js,
 * because the object SHAPES differ between versions - `current_period_end`
 * moved from the subscription to its item in 2025-03-31.basil.
 */
const API_VERSION = "2025-10-29.clover";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error(
    "error: STRIPE_SECRET_KEY is not set.\n" +
      "       run: STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs"
  );
  process.exit(2);
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const plans = config.plans ?? {};

/* ------------------------------------------------------------- the client -- */

/**
 * Call the Stripe API.
 *
 * A plain fetch is used rather than the Stripe SDK: this script runs on the
 * build machine, which has no dependencies installed, and the SDK would
 * have to be added to the root package.json just for a one-off script.
 */
async function stripe(path, { method = "GET", form } = {}) {
  // The path is given without the version prefix, e.g. "/products".
  const url = `https://api.stripe.com/v1${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": API_VERSION,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Stripe ${method} ${path} returned a non-JSON body: ${text.slice(0, 200)}`
    );
  }

  if (!response.ok) {
    const message = data?.error?.message ?? text.slice(0, 200);
    throw new Error(`Stripe ${method} ${path} failed (${response.status}): ${message}`);
  }

  return data;
}

/* ---------------------------------------------------------------- helpers -- */

/** List every object of a kind, following the pagination cursor. */
async function listAll(path) {
  const out = [];
  let url = path;
  for (let page = 0; page < 20; page += 1) {
    const result = await stripe(url);
    out.push(...(result.data ?? []));
    if (!result.has_more) break;
    url = `${path}${path.includes("?") ? "&" : "?"}starting_after=${result.data.at(-1).id}`;
  }
  return out;
}

/** Run an appwrite CLI command. */
function aw(args) {
  console.log(`  $ appwrite ${args.join(" ")}`);
  try {
    const out = execFileSync("appwrite", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (out.trim()) {
      console.log(out.trim().split("\n").map((l) => `    ${l}`).join("\n"));
    }
    return out;
  } catch (err) {
    const message = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    throw new Error(`appwrite ${args.join(" ")} failed:\n${message}`);
  }
}

/** The function's variables, as the CLI currently has them. */
function currentVariables() {
  return JSON.parse(
    execFileSync(
      "appwrite",
      ["functions", "list-variables", "--function-id", FUNCTION_ID, "--json"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    )
  ).variables ?? [];
}

/**
 * Set a function variable, creating it or updating it.
 *
 * The CLI's `create-variable` fails when the variable already exists, and
 * `update-variable` needs the variable's id, so the current state is read
 * first and the right command is chosen.
 */
function setVariable(key, value, { secret = false } = {}) {
  const found = currentVariables().find((v) => v.key === key);

  const args = [
    "functions",
    found ? "update-variable" : "create-variable",
    "--function-id",
    FUNCTION_ID,
    "--variable-id",
    found?.$id ?? `var_${key.toLowerCase()}`,
    "--key",
    key,
    "--value",
    value,
  ];
  if (secret) args.push("--secret");

  aw(args);
}

/* ------------------------------------------------------------------ main -- */

console.log("STRIPE SETUP\n");

/* ---- 1. the products and prices ---- */
console.log("1. the products and prices");

/**
 * The products, one per plan, and the prices under them.
 *
 * The prices are keyed by the plan's name in config/subscription.json, so
 * the amounts on the pricing page and the amounts Stripe charges can never
 * drift apart: both come from the same file.
 */
const prices = {};
const currency = config.stripe?.currency ?? "usd";

for (const [planKey, plan] of Object.entries(plans)) {
  if (planKey === "free") continue;

  const existingProducts = await listAll("/products?limit=100");
  let product = existingProducts.find((p) => p.metadata?.esim_plan === planKey);

  if (!product) {
    console.log(`  creating the product for the ${planKey} plan`);
    product = await stripe("/products", {
      method: "POST",
      form: {
        name: `eSIM Price Truth ${plan.label}`,
        description: `The ${plan.label} plan of eSIM Price Truth.`,
        // The metadata is how the product is FOUND on a re-run, so it
        // has to be set on creation.
        "metadata[esim_plan]": planKey,
      },
    });
  } else {
    console.log(`  reusing the product for the ${planKey} plan (${product.id})`);
  }

  // Both cadences are priced: the site advertises "or $59/year", so the
  // yearly price has to exist or the page would promise something that
  // cannot be bought.
  for (const [cadence, amount] of [
    ["monthly", plan.price_monthly],
    ["yearly", plan.price_yearly],
  ]) {
    if (!amount) continue;

    const existingPrices = await listAll(`/prices?product=${product.id}&limit=100`);
    const found = existingPrices.find(
      (p) =>
        p.metadata?.esim_cadence === cadence &&
        p.unit_amount === Math.round(amount * 100) &&
        p.currency === currency
    );

    if (found) {
      console.log(`  reusing the ${planKey} ${cadence} price (${found.id})`);
      prices[`${planKey}_${cadence}`] = found.id;
      continue;
    }

    console.log(`  creating the ${planKey} ${cadence} price (${amount} ${currency})`);
    const created = await stripe("/prices", {
      method: "POST",
      form: {
        product: product.id,
        currency,
        unit_amount: String(Math.round(amount * 100)),
        "recurring[interval]": cadence === "yearly" ? "year" : "month",
        "metadata[esim_plan]": planKey,
        "metadata[esim_cadence]": cadence,
      },
    });
    prices[`${planKey}_${cadence}`] = created.id;
  }
}

/* ---- 2. the billing portal ---- */
console.log("\n2. the billing portal");
const portalConfigs = await listAll("/billing_portal/configurations?limit=100");
let portal = portalConfigs.find((c) => c.active);

if (!portal) {
  console.log("  creating the portal configuration");
  portal = await stripe("/billing_portal/configurations", {
    method: "POST",
    form: {
      "business_profile[headline]": "Manage your eSIM Price Truth subscription",
      "features[subscription_cancel][enabled]": "true",
      "features[payment_method_update][enabled]": "true",
      "features[customer_update][enabled]": "true",
      "features[customer_update][allowed_updates][0]": "email",
      "features[invoice_history][enabled]": "true",
      "default_return_url": config.checkout_url,
    },
  });
} else {
  console.log(`  reusing the portal configuration (${portal.id})`);
}

/* ---- 3. the webhook endpoint ---- */
console.log("\n3. the webhook endpoint");
const endpoints = await listAll("/webhook_endpoints?limit=100");
let endpoint = endpoints.find((e) => e.url === WEBHOOK_URL);

// An existing endpoint's SIGNING SECRET cannot be read back, so if one
// already exists for this URL its secret has to come from the function's
// own variables. If it is not there either, the endpoint is recreated and
// the old one is removed - otherwise Stripe would keep delivering to an
// endpoint whose secret we no longer know.
let webhookSecret = null;
let endpointSecretIsNew = false;

if (endpoint) {
  console.log(`  reusing the webhook endpoint (${endpoint.id})`);
  const stored = currentVariables().find((v) => v.key === "STRIPE_WEBHOOK_SECRET");
  if (stored) {
    console.log("  keeping the signing secret already stored on the function");
  } else {
    console.log("  no signing secret is stored, so the endpoint is recreated");
    await stripe(`/webhook_endpoints/${endpoint.id}`, { method: "DELETE" });
    endpoint = null;
  }
}

if (!endpoint) {
  console.log(`  creating the webhook endpoint for ${WEBHOOK_URL}`);
  endpoint = await stripe("/webhook_endpoints", {
    method: "POST",
    form: {
      url: WEBHOOK_URL,
      description: "eSIM Price Truth subscription events",
      "metadata[esim]": "1",
      // Stripe takes an array as indexed keys, not as a repeated one.
      ...Object.fromEntries(
        WEBHOOK_EVENTS.map((event, index) => [`enabled_events[${index}]`, event])
      ),
    },
  });
  // The signing secret is only ever returned here, at creation time.
  webhookSecret = endpoint.secret;
  endpointSecretIsNew = true;
  console.log("  the signing secret was returned by Stripe (it is never shown again)");
}

/* ---- 4. push everything to the function ---- */
console.log("\n4. the function's variables");
setVariable("STRIPE_SECRET_KEY", secretKey, { secret: true });
setVariable("STRIPE_PRICE_PRO", prices.pro_monthly);
setVariable("STRIPE_PRICE_PRO_YEARLY", prices.pro_yearly);
setVariable("STRIPE_PRICE_TEAM", prices.team_monthly);
setVariable("STRIPE_PRICE_TEAM_YEARLY", prices.team_yearly);
setVariable(
  "PUBLIC_SITE_URL",
  config.appwrite?.site_origin ?? "https://youssef-benatti.me"
);

if (endpointSecretIsNew) {
  setVariable("STRIPE_WEBHOOK_SECRET", webhookSecret, { secret: true });
} else {
  console.log("  (the webhook secret is already on the function and is left alone)");
}

/* ---- 5. write the ids back into the config ---- */
console.log("\n5. config/subscription.json");
config.stripe = {
  ...(config.stripe ?? {}),
  price_pro: prices.pro_monthly,
  price_pro_yearly: prices.pro_yearly,
  price_team: prices.team_monthly,
  price_team_yearly: prices.team_yearly,
  webhook_url: WEBHOOK_URL,
  portal_configuration_id: portal.id,
};
writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log("  the price ids and the webhook url are written");

console.log("\nDone.\n");
console.log("Next:\n");
console.log("  node scripts/build-appwrite-function.mjs");
console.log("  node scripts/appwrite-deploy.mjs");
console.log("  node scripts/build.mjs && node scripts/deploy.mjs\n");
console.log(`The webhook listens on: ${WEBHOOK_URL}`);
