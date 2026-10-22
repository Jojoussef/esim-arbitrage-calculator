/**
 * The subscription client.
 *
 * The free calculator never needs this file. It only activates when the
 * reader is a subscriber, and it handles four things:
 *
 *   1. Signing the reader in to Appwrite (an email + password session).
 *   2. Calling the premium function with that session.
 *   3. Remembering the session in localStorage.
 *   4. Starting a Stripe Checkout, and opening the customer portal.
 *
 * The session is an Appwrite JWT. It proves WHO the caller is, so the
 * function never has to trust anything the browser says about identity.
 */
(function () {
  "use strict";

  var CONFIG = window.ESIM_SUBSCRIPTION || {};
  var ENDPOINT = CONFIG.endpoint || "";
  var PROJECT = CONFIG.project || "";
  var FUNCTION_ID = CONFIG.function_id || "premium-api";

  if (!ENDPOINT) return;

  var STORAGE_KEY = "esim_appwrite_session";
  var FALLBACK_KEY = "esim_appwrite_cookies";

  /**
   * A tiny Appwrite REST client.
   *
   * The site has no build step and no npm dependencies, so rather than
   * pulling in the whole web SDK, this calls the two Appwrite endpoints
   * that are actually needed: create a session, and execute a function.
   */
  function appwrite(path, options) {
    var opts = options || {};
    var headers = {
      "Content-Type": "application/json",
      "X-Appwrite-Project": PROJECT,
    };

    // Appwrite 2.x authenticates a browser with a COOKIE, not with a
    // header. The cookie is set on the API's own domain, so it is only
    // sent when the request carries credentials AND the browser allows
    // the third-party cookie. Because that is not guaranteed (Safari and
    // Chrome both restrict third-party cookies), the session token is
    // ALSO kept in localStorage and sent in the `X-Appwrite-Session`
    // header, which Appwrite accepts as an equivalent transport.
    var session = readSession();
    if (session) headers["X-Appwrite-Session"] = session;

    var fallback = readFallbackCookies();
    if (fallback) headers["X-Fallback-Cookies"] = fallback;

    return fetch(ENDPOINT + path, {
      method: opts.method || "GET",
      headers: headers,
      credentials: "include",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (response) {
      // Appwrite echoes the session cookie back in this header so a
      // client on another origin can keep using it.
      var echoed = response.headers.get("X-Fallback-Cookies");
      if (echoed) saveFallbackCookies(echoed);

      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return {
            ok: response.ok,
            status: response.status,
            data: data,
            // Appwrite 2.x hands the session back in a HEADER, not in the
            // body - see sessionToken() below.
            fallbackCookies: echoed,
            sessionHeader: response.headers.get("X-Appwrite-Session"),
          };
        });
    });
  }

  /**
   * Pull the session token out of a sign-in response.
   *
   * Appwrite 2.x no longer returns the token in the response body when
   * the caller is a browser: the body's `secret` field is empty. Instead
   * it sets an HttpOnly cookie, and - because a cookie cannot be read by
   * script on another origin - it also sends the cookie back in the
   * `X-Fallback-Cookies` response header, as a JSON map of cookie name to
   * cookie value. The value we send in `X-Appwrite-Session` is the one
   * for `a_session_<projectId>`.
   *
   * The body's `secret` is still read as a fallback, because a session
   * created with a server API key does put it there.
   */
  function sessionToken(result) {
    var raw = result && result.fallbackCookies;
    if (raw) {
      try {
        var cookies = JSON.parse(raw);
        var token = cookies["a_session_" + PROJECT];
        if (token) return token;
        // The cookie name carries the project id, but fall back to any
        // a_session_* entry so a rename cannot break sign-in.
        for (var name in cookies) {
          if (name.indexOf("a_session_") === 0 && cookies[name]) {
            return cookies[name];
          }
        }
      } catch (e) {
        /* not JSON - fall through to the other sources */
      }
    }
    if (result && result.sessionHeader) return result.sessionHeader;
    if (result && result.data && result.data.secret) return result.data.secret;
    return null;
  }

  /** Read the stored Appwrite cookie fallback. */
  function readFallbackCookies() {
    try {
      return localStorage.getItem(FALLBACK_KEY);
    } catch (e) {
      return null;
    }
  }

  /** Store the Appwrite cookie fallback. */
  function saveFallbackCookies(value) {
    try {
      localStorage.setItem(FALLBACK_KEY, value);
    } catch (e) {
      /* private mode: the session just will not persist */
    }
  }

  /** Read the stored Appwrite session. */
  function readSession() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  /** Store the Appwrite session. */
  function saveSession(token) {
    try {
      localStorage.setItem(STORAGE_KEY, token);
    } catch (e) {
      /* private mode: the session just will not persist */
    }
  }

  /** Clear the Appwrite session. */
  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(FALLBACK_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  /** Sign in and remember the session. */
  function signIn(email, password) {
    return appwrite("/account/sessions/email", {
      method: "POST",
      body: { email: email, password: password },
    }).then(function (result) {
      var token = sessionToken(result);
      if (result.ok && token) {
        saveSession(token);
        document.dispatchEvent(
          new CustomEvent("esim:signed-in", { detail: result.data })
        );
        return { ok: true };
      }
      return {
        ok: false,
        error: result.data?.message ?? "Could not sign in.",
      };
    });
  }

  /** Sign out and forget the session. */
  function signOut() {
    var session = readSession();
    var done = session
      ? appwrite("/account/sessions/current", { method: "DELETE" })
      : Promise.resolve({ ok: true });
    return done.then(function () {
      clearSession();
      document.dispatchEvent(new CustomEvent("esim:signed-out"));
      return { ok: true };
    });
  }

  /** Call the premium function. */
  function call(path, options) {
    var opts = options || {};
    var query = opts.query
      ? "?" +
        Object.keys(opts.query)
          .map(function (key) {
            return (
              encodeURIComponent(key) +
              "=" +
              encodeURIComponent(opts.query[key])
            );
          })
          .join("&")
      : "";

    return appwrite("/functions/" + FUNCTION_ID + "/executions" + query, {
      method: "POST",
      body: {
        path: path,
        method: opts.method || "GET",
        body: opts.body ?? undefined,
        headers: opts.headers ?? undefined,
      },
    }).then(function (result) {
      if (!result.ok) {
        return {
          ok: false,
          status: result.status,
          error: result.data?.message ?? "The request failed.",
        };
      }

      // Appwrite wraps the function's own response.
      var payload = result.data?.responseBody;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (e) {
          /* leave it as a string */
        }
      }
      return {
        ok: true,
        status: result.data?.statusCode ?? 200,
        data: payload,
      };
    });
  }

  /** Is anyone signed in? */
  function isSignedIn() {
    return Boolean(readSession());
  }

  /* --------------------------------------------------------- the UI -- */

  /**
   * Render the subscriber area on the pricing page.
   */
  function renderAccountPanel(container) {
    if (!container) return;

    if (isSignedIn()) {
      container.innerHTML =
        '<div class="text-sm text-muted">Signed in. Checking your plan&hellip;</div>';
      call("/entitlement").then(function (result) {
        if (!result.ok) {
          container.innerHTML =
            '<div class="text-sm text-muted">Signed in, but the plan could not be checked. Try reloading.</div>';
          return;
        }
        var data = result.data || {};
        if (data.active) {
          container.innerHTML =
            '<div class="text-sm text-strong">You are on the <strong>' +
            (data.plan || "free") +
            "</strong> plan.</div>" +
            '<button id="esimPortal" class="btn-ghost mt-3 px-4 py-2 text-sm font-semibold">Manage billing</button>';
          var button = document.getElementById("esimPortal");
          if (button) {
            button.addEventListener("click", function () {
              call("/portal", { method: "POST" }).then(function (res) {
                if (res.ok && res.data?.url) window.location.href = res.data.url;
              });
            });
          }
        } else {
          container.innerHTML =
            '<div class="text-sm text-muted">Signed in, but there is no active subscription. Choose a plan below.</div>';
        }
      });
      return;
    }

    container.innerHTML =
      '<div class="text-sm text-muted">Already subscribed? Sign in to manage your plan.</div>' +
      '<form id="esimSignIn" class="mt-3 space-y-2">' +
      '<input id="esimEmail" type="email" required placeholder="you@example.com" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />' +
      '<input id="esimPassword" type="password" required placeholder="Password" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />' +
      '<button type="submit" class="btn-primary w-full px-4 py-2 text-sm font-semibold">Sign in</button>' +
      '<div id="esimSignInError" class="text-xs text-red-600"></div>' +
      "</form>";

    var form = document.getElementById("esimSignIn");
    if (!form) return;
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var email = document.getElementById("esimEmail").value;
      var password = document.getElementById("esimPassword").value;
      var error = document.getElementById("esimSignInError");
      signIn(email, password).then(function (result) {
        if (result.ok) {
          renderAccountPanel(container);
        } else {
          error.textContent = result.error;
        }
      });
    });
  }

  /**
   * Wire up the "Subscribe" buttons to a Stripe Checkout session.
   */
  function wireCheckoutButtons(root) {
    var buttons = (root || document).querySelectorAll("[data-checkout-plan]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", function (event) {
        event.preventDefault();
        var plan = button.getAttribute("data-checkout-plan");

        if (!isSignedIn()) {
          // The buyer needs an account so the subscription can be tied to
          // a user. Send them to the sign-in form first.
          var panel = document.getElementById("esimAccount");
          if (panel) {
            panel.scrollIntoView({ behavior: "smooth", block: "center" });
            var email = panel.querySelector("input[type=email]");
            if (email) email.focus();
          }
          return;
        }

        call("/checkout", { method: "POST", body: { plan: plan } }).then(
          function (result) {
            if (result.ok && result.data?.url) {
              window.location.href = result.data.url;
            } else {
              window.alert(
                result.data?.message ??
                  "The checkout could not be started. Please try again."
              );
            }
          }
        );
      });
    });
  }

  /* ------------------------------------------------------- bootstrap -- */

  window.ESIMSubscription = {
    signIn: signIn,
    signOut: signOut,
    isSignedIn: isSignedIn,
    call: call,
    api: call,
  };

  document.addEventListener("DOMContentLoaded", function () {
    renderAccountPanel(document.getElementById("esimAccount"));
    wireCheckoutButtons(document);
  });
})();
