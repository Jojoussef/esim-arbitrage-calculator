/**
 * Client-side intent capture.
 *
 * Records the visitor's selections locally and, only if an endpoint is
 * configured, forwards them. Never sends anything identifying the visitor.
 *
 * This is the payload a vendor is buying when they sponsor a slot: a
 * destination, a trip length, a currency and a data need. That is a
 * qualified lead, and it is worth more than a click.
 */

export function intentCaptureScript(config) {
  const intent = config.intent ?? {};
  if (!intent.capture) return "";

  const endpoint = intent.endpoint ?? "";
  const fields = intent.fields ?? ["destination", "days", "currency", "hotspot"];

  return `(function(){
  var ENDPOINT = ${JSON.stringify(endpoint)};
  var FIELDS = ${JSON.stringify(fields)};
  var KEY = "esim_intent";

  function readIntent() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; }
  }

  function writeIntent(patch) {
    var current = readIntent();
    current = Object.assign(current, patch);
    current.updatedAt = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) {}

    // Only ever forward when an endpoint has been configured deliberately.
    if (!ENDPOINT) return;
    var payload = {};
    FIELDS.forEach(function (f) { if (current[f] !== undefined) payload[f] = current[f]; });
    if (!Object.keys(payload).length) return;

    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  // A tiny API the page can call when the visitor changes a selection.
  window.esimIntent = {
    track: writeIntent,
    read: readIntent,
    clear: function () { try { localStorage.removeItem(KEY); } catch (e) {} }
  };

  document.addEventListener("DOMContentLoaded", function () {
    var sel = document.getElementById("selectDest");
    var days = document.getElementById("rangeDays");
    var ccy = document.getElementById("selectUserCcy");
    var hot = document.getElementById("selectHotspot");
    if (!sel) return;

    function capture() {
      var opt = sel.options[sel.selectedIndex];
      writeIntent({
        destination: opt ? opt.text : null,
        days: days ? days.value : null,
        currency: ccy ? ccy.value : null,
        hotspot: hot ? hot.value : null
      });
    }

    [sel, days, ccy, hot].forEach(function (el) {
      if (!el) return;
      el.addEventListener("change", capture);
      if (el.tagName === "INPUT") el.addEventListener("input", capture);
    });
  });
})();`;
}
