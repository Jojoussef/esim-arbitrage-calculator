/**
 * Theme generation.
 *
 * The CSS custom properties live in src/theme.css, but the brand colours
 * come from config/site.json so the palette can be changed in one place.
 * This module writes dist/theme.css with those values substituted in, and
 * provides the shared <head> snippet that wires up dark mode.
 */

/** Convert #RRGGBB to an "r g b" triplet for use in rgb() / alpha values. */
export function hexToRgb(hex) {
  const clean = String(hex).replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return "15 41 66";
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

/** Mix a hex colour towards black (amount < 0) or white (amount > 0). */
export function shade(hex, amount) {
  const clean = String(hex).replace("#", "");
  const int = parseInt(clean, 16);
  let r = (int >> 16) & 255;
  let g = (int >> 8) & 255;
  let b = int & 255;
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  r = Math.round(r + (target - r) * t);
  g = Math.round(g + (target - g) * t);
  b = Math.round(b + (target - b) * t);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Build the generated theme.css from the source template + site config.
 */
export function buildThemeCss(sourceCss, site) {
  const brand = site.theme_color || "#0F2942";
  const accent = site.accent_color || "#0D9488";

  // Only the light-theme block is generated; the dark block in the source
  // file holds its own (already tuned) values.
  const light = `:root {
  /* ---- brand (generated from config/site.json) ---- */
  --brand: ${brand};
  --brand-hover: ${shade(brand, 0.12)};
  --brand-ink: #ffffff;
  --brand-soft: ${shade(brand, 0.94)};
  --brand-rgb: ${hexToRgb(brand)};

  /* ---- accent (generated from config/site.json) ---- */
  --accent: ${accent};
  --accent-hover: ${shade(accent, -0.15)};
  --accent-ink: #ffffff;
  --accent-soft: ${shade(accent, 0.94)};
  --accent-border: ${shade(accent, 0.6)};
  --accent-rgb: ${hexToRgb(accent)};
}`;

  // Replace the original :root block with the generated one.
  return sourceCss.replace(/^:root \{[\s\S]*?\n\}/m, light);
}

/**
 * The inline script that applies the theme before first paint.
 *
 * It runs in <head> so there is no flash of the wrong theme, and it honours
 * a manual choice stored in localStorage over the OS preference.
 */
export function themeBootstrapScript() {
  return `(function(){
  try {
    var stored = localStorage.getItem("esim_theme");
    var mode = stored || "auto";
    var dark = mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {}
})();`;
}

/** The client-side theme toggle (light / auto / dark). */
export function themeToggleScript() {
  return `(function(){
  var KEY = "esim_theme";
  var order = ["light", "auto", "dark"];
  var icons = { light: "\\u2600", auto: "\\u25D1", dark: "\\u263D" };
  var labels = { light: "Light", auto: "Auto", dark: "Dark" };
  var current = "auto";
  try { current = localStorage.getItem(KEY) || "auto"; } catch (e) {}
  var btn = document.getElementById("themeToggle");
  if (!btn) return;

  function resolve(mode) {
    return mode === "dark" || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function apply(mode) {
    var dark = resolve(mode);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    btn.textContent = icons[mode] || icons.auto;
    btn.setAttribute("title", "Theme: " + (labels[mode] || "Auto") + " (click to change)");
    btn.setAttribute("aria-label", "Theme: " + (labels[mode] || "Auto") + ". Click to change.");
  }
  apply(current);

  btn.addEventListener("click", function () {
    var idx = order.indexOf(current);
    current = order[(idx + 1) % order.length];
    try { localStorage.setItem(KEY, current); } catch (e) {}
    apply(current);
  });

  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () { if (current === "auto") apply("auto"); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();`;
}
