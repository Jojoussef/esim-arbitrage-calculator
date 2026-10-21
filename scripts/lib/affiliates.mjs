/**
 * Affiliate link construction.
 *
 * The single most important monetisation detail in this project: the links
 * that visitors click must be the OPERATOR's tracking links, baked in at build
 * time. The original calculator stored them in localStorage, which means every
 * visitor got the bare vendor URL and the operator earned nothing.
 *
 * Every monetised outbound link produced here carries:
 *   - rel="sponsored noopener noreferrer"  (Google's affiliate guidance)
 *   - UTM parameters identifying this site as the referrer
 *   - utm_content naming the destination, so the affiliate dashboard shows
 *     which destination pages actually earn money.
 */

import { esc } from "./analysis.mjs";

/** Append query parameters to a URL without breaking existing query strings. */
export function withParams(url, params) {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );
  if (!entries.length) return url;
  const [base, hash] = splitHash(url);
  const separator = base.includes("?") ? "&" : "?";
  const query = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${base}${separator}${query}${hash}`;
}

function splitHash(url) {
  const index = url.indexOf("#");
  if (index === -1) return [url, ""];
  return [url.slice(0, index), url.slice(index)];
}

/**
 * Build an affiliate tracker.
 *
 * @param {object} config   parsed config/affiliates.json
 * @param {object} site     parsed config/site.json
 */
export function createAffiliateTracker(config, site) {
  const programs = config.programs ?? {};
  const utm = config.utm ?? config.site ?? {};
  const utmSource = utm.utm_source || "esim-arb-calc";

  function baseUrl(key) {
    const program = programs[key];
    if (!program) return null;
    // A wired tracking URL always wins; otherwise fall back so the site is
    // never broken, it just will not earn until the operator pastes a link.
    return program.url || program.fallback;
  }

  function isWired(key) {
    const program = programs[key];
    if (!program) return false;
    return Boolean(program.url && program.url !== program.fallback);
  }

  /**
   * Build a monetised link for a program.
   * @param {string} key           program key, e.g. "saily"
   * @param {string} [utmContent]  destination slug for per-page attribution
   */
  function link(key, utmContent) {
    const url = baseUrl(key);
    if (!url) return "#";
    const program = programs[key];
    const params = {};

    if (program.tracking_id) params.aff_id = program.tracking_id;
    params.utm_source = utmSource;
    if (utm.utm_medium) params.utm_medium = utm.utm_medium;
    if (utm.utm_campaign) params.utm_campaign = utm.utm_campaign;
    if (utmContent) params.utm_content = utmContent;

    return withParams(url, params);
  }

  /** An <a> element for a monetised outbound link. */
  function anchor(key, label, options = {}) {
    const { className = "", utmContent, title } = options;
    const href = link(key, utmContent);
    const titleAttr = title ? ` title="${esc(title)}"` : "";
    return `<a href="${esc(href)}" target="_blank" rel="sponsored noopener noreferrer"${titleAttr} class="${esc(className)}">${label}</a>`;
  }

  return { link, anchor, isWired, programs, baseUrl };
}
