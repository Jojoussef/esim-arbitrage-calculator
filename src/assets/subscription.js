/**
 * The subscription client.
 *
 * The free calculator never needs this file. It only activates when the
 * reader is a subscriber, and it handles three things:
 *
 *   1. Redeeming a token the payment provider put in the URL fragment.
 *   2. Remembering the session in localStorage.
 *   3. Calling the premium API with a bearer token.
 *
 * The token is in localStorage rather than a cookie because the API runs on
 * a different origin (workers.dev) to the site, and a cookie across two
 * origins is a third-party cookie - which browsers block by default.
 */
(function () {
  "use strict";

  var API =
    (window.ESIM_SUBSCRIPTION_API || "").replace(/\/$/, "");
  var STORAGE_KEY = "esim_sub_token";
  var PLAN_KEY = "esim_sub_plan";

  if (!API) return;

  /** Read the stored session. */
  function session() {
    try {
      return {
        token: localStorage.getItem(STORAGE_KEY),
        plan: localStorage.getItem(PLAN_KEY),
      };
    } catch (e) {
      return { token: null, plan: null };
    }
  }

  /** Store the session. */
  function save(token, plan) {
    try {
      localStorage.setItem(STORAGE_KEY, token);
      localStorage.setItem(PLAN_KEY, plan);
    } catch (e) {
      /* private mode: the session just will not persist */
    }
  }

  /** Clear the session. */
  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PLAN_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  /** Call the API, attaching the bearer token when there is one. */
  function api(path, options) {
    var opts = options || {};
    var headers = { Accept: "application/json" };
    var current = session();

    if (current.token) headers.Authorization = "Bearer " + current.token;
    if (opts.body) headers["Content-Type"] = "application/json";

    return fetch(API + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body,
    })
      .then(function (response) {
        if (response.status === 401 || response.status === 402) {
          // The token is no longer valid - a cancelled or expired plan.
          clear();
          document.dispatchEvent(
            new CustomEvent("esim:subscription-lost", { detail: response.status })
          );
        }
        return response.json().then(function (data) {
          return { ok: response.ok, status: response.status, data: data };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, data: { error: "network" } };
      });
  }

  /**
   * Redeem a token from the URL fragment.
   * The fragment never reaches a server, so the token is not in any log.
   */
  function redeemFromFragment() {
    var fragment = window.location.hash || "";
    var match = fragment.match(/token=([A-Za-z0-9._-]+)/);
    if (!match) return Promise.resolve(null);

    var token = match[1];
    return api("/api/redeem?token=" + encodeURIComponent(token)).then(function (result) {
      if (result.ok && result.data && result.data.ok) {
        save(token, result.data.plan);
        // Clean the fragment so the token is not left in the address bar.
        history.replaceState(null, "", window.location.pathname + window.location.search);
        document.dispatchEvent(
          new CustomEvent("esim:subscription-activated", {
            detail: { plan: result.data.plan, features: result.data.features },
          })
        );
        return result.data;
      }
      clear();
      return null;
    });
  }

  /** Announce the current plan to the page. */
  function announce() {
    var current = session();
    if (!current.token) return;
    api("/api/entitlement").then(function (result) {
      if (result.ok && result.data && result.data.active) {
        document.dispatchEvent(
          new CustomEvent("esim:subscription-active", { detail: result.data })
        );
      }
    });
  }

  // Expose a tiny API for the page scripts.
  window.ESIMSubscription = {
    api: api,
    session: session,
    save: save,
    clear: clear,
    redeem: redeemFromFragment,
  };

  document.addEventListener("DOMContentLoaded", function () {
    redeemFromFragment().then(function (result) {
      if (result) announce();
      else announce();
    });
  });
})();
