/**
 * Entitlement logic for the Appwrite + Stripe stack.
 *
 * This is the SAME scheme the static site uses, kept in one place so the
 * signature format can never drift between the site and the function.
 * `scripts/lib/entitlement.mjs` is the canonical copy; this file is the
 * function-local copy, and `scripts/check.mjs` verifies the two agree.
 *
 * The rule: the calculator is ALWAYS free. Only the premium DATA is gated,
 * and it is gated server-side - the premium data is simply not sent to a
 * browser without a valid entitlement.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** The premium capabilities, and which plan unlocks each. */
export const FEATURES = {
  price_alerts: "pro",
  data_export: "pro",
  pricing_error_monitor: "pro",
  api: "team",
  early_access: "pro",
  multiple_watchlists: "team",
};

const PLAN_ORDER = { free: 0, pro: 1, team: 2 };

/**
 * Sign an entitlement payload.
 *
 * The payload is "plan.expiresAt.subscriberId" plus a signature over it.
 * The subscriber id is inside the signed payload on purpose: it is what the
 * revocation list is keyed on, so a cancelled subscription can be blocked
 * immediately instead of waiting for the token to expire.
 */
export function signEntitlement(plan, expiresAt, secret, subscriberId = "anonymous") {
  const payload = `${plan}.${expiresAt}.${subscriberId}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verify an entitlement string.
 * @returns {{ok: boolean, plan?: string, expiresAt?: number, subscriberId?: string, reason?: string}}
 */
export function verifyEntitlement(token, secret) {
  if (!token) return { ok: false, reason: "missing" };

  const parts = String(token).split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };

  const [plan, expiresRaw, subscriberId, signature] = parts;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt)) return { ok: false, reason: "malformed" };

  const expected = createHmac("sha256", secret)
    .update(`${plan}.${expiresRaw}.${subscriberId}`)
    .digest("base64url");

  // Constant-time compare so a timing oracle cannot leak the signature.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad-signature" };
  }

  if (Date.now() > expiresAt) return { ok: false, reason: "expired" };

  return { ok: true, plan, expiresAt, subscriberId };
}

/** Does a plan include a feature? */
export function planHasFeature(plan, feature) {
  const required = FEATURES[feature];
  if (!required) return false;
  return (PLAN_ORDER[plan] ?? -1) >= (PLAN_ORDER[required] ?? 99);
}

/** All features a plan unlocks. */
export function planFeatures(plan) {
  return Object.entries(FEATURES)
    .filter(([, required]) => planHasFeature(plan, required) || required === plan)
    .map(([feature]) => feature);
}

/** Parse a Cookie header into an object. */
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}
