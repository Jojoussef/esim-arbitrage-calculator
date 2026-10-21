/**
 * Entitlement logic for the subscription model.
 *
 * This module is deliberately shared between the static site and the Worker:
 * the site uses it to decide what to SHOW, the Worker uses it to decide what
 * to SERVE. Both must agree, so both read the same config and the same
 * helper functions.
 *
 * The rule: the calculator is ALWAYS free. Only the premium DATA is gated,
 * and it is gated server-side - the premium data is simply not sent to a
 * browser without a valid entitlement. Nothing is hidden by making the
 * client-side source hard to read.
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

/**
 * Sign an entitlement payload.
 *
 * The payload is "plan.expiresAt.subscriberId" plus a signature over it.
 * The subscriber id is inside the signed payload on purpose: it is what
 * the revocation list is keyed on, so a cancelled subscription can be
 * blocked immediately instead of waiting for the token to expire.
 *
 * The signature is an HMAC over the payload, so the Worker can verify it
 * without a database round-trip. A database is only needed for revocation.
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
  const order = { free: 0, pro: 1, team: 2 };
  return (order[plan] ?? -1) >= (order[required] ?? 99);
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

/**
 * Build the subscriber record that is stored in KV or D1.
 * The token is the source of truth; the record exists so a cancellation can
 * be checked.
 */
export function buildSubscriberRecord({
  subscriberId,
  plan,
  email,
  expiresAt,
  token,
  provider,
}) {
  return {
    subscriberId,
    plan,
    email: email ?? null,
    expiresAt,
    token,
    provider: provider ?? null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Check whether a subscriber is still entitled.
 *
 * The signature is verified first (cheap, no I/O). Only then is the
 * revocation list consulted, so a revoked subscriber is rejected even if
 * their token has not yet expired.
 */
export async function checkEntitlement(token, { secret, revoked }) {
  const result = verifyEntitlement(token, secret);
  if (!result.ok) return result;

  if (revoked) {
    const isRevoked = await revoked(result);
    if (isRevoked) return { ok: false, reason: "revoked" };
  }

  return result;
}
