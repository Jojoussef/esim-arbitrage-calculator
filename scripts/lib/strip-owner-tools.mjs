/**
 * Remove the operator-only tooling from the public build.
 *
 * The original app shipped two things that are for the site's owner, not for
 * travellers:
 *
 *   1. "Affiliate & Export Studio" - a form containing the site's own
 *      tracking URLs, plus buttons to download the raw dataset.
 *   2. "Interactive Micro-Sprint Tracker" - the personal project checklist.
 *
 * Publishing those is a trust problem (a visitor sees a form asking for
 * "your" affiliate URLs) and a competitive leak (the dataset is
 * downloadable, and the roadmap reveals the operation).
 *
 * The affiliate links are baked in at BUILD time, so removing the studio
 * costs the owner no functionality at all - `config/affiliates.json` is
 * still the single source of truth and `deploy.mjs` still bakes it in.
 */

import { replaceOnce, replaceAll } from "./app-transform.mjs";

/** Remove a whole element (and its contents) identified by an id. */
function removeElementById(html, id) {
  const open = new RegExp(`<([a-z]+)[^>]*\\bid="${id}"[^>]*>`, "i");
  const match = html.match(open);
  if (!match) return { html, removed: false };

  const tag = match[1];
  const start = match.index;
  // Find the matching close tag, accounting for nesting of the same tag.
  const scanner = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  scanner.lastIndex = start;
  let depth = 0;
  let end = -1;
  let token;
  while ((token = scanner.exec(html)) !== null) {
    if (token[0].startsWith(`</`)) {
      depth -= 1;
      if (depth === 0) {
        end = token.index + token[0].length;
        break;
      }
    } else if (!token[0].endsWith("/>")) {
      depth += 1;
    }
  }
  if (end === -1) return { html, removed: false };

  return {
    html: html.slice(0, start) + html.slice(end),
    removed: true,
  };
}

/** Remove a `document.getElementById(id).addEventListener(...)` block. */
function removeListenerBlock(html, id) {
  const marker = `document.getElementById("${id}").addEventListener`;
  const index = html.indexOf(marker);
  if (index === -1) return html;

  // Walk back to the start of the statement (the indentation), including any
  // comment line directly above it.
  let start = index;
  while (start > 0 && html[start - 1] !== "\n") start -= 1;
  const before = html.slice(0, start);
  const commentMatch = before.match(/\n[ \t]*\/\/[^\n]*$/);
  if (commentMatch) start -= commentMatch[0].length;

  // Find the matching closing brace of the arrow function.
  const braceStart = html.indexOf("{", index);
  if (braceStart === -1) return html;
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < html.length; i += 1) {
    const c = html[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return html;

  // The statement is `....addEventListener("click", () => { ... });` so the
  // closing paren and semicolon come after the arrow function's brace.
  while (end < html.length && /[\s);]/.test(html[end])) {
    if (html[end] === ")") {
      end += 1;
      break;
    }
    end += 1;
  }
  if (html[end] === ";") end += 1;

  // Swallow the trailing newline too.
  while (end < html.length && html[end] === "\n") end += 1;
  return html.slice(0, start) + html.slice(end);
}

/**
 * Remove a top-level `function name(...) { ... }` declaration.
 *
 * Brace counting is used rather than a regex because the function body
 * contains nested blocks - a non-greedy regex stops at the first inner
 * `}` and leaves a dangling fragment behind.
 */
function removeFunction(html, name) {
  const decl = new RegExp(`\\n[ \\t]*function ${name}\\s*\\(`, "g");
  const match = decl.exec(html);
  if (!match) return html;

  let start = match.index;

  // Also remove the doc comment immediately above the function, otherwise it
  // is left dangling and comments out the next line.
  const before = html.slice(0, start);
  const commentMatch = before.match(/\n[ \t]*\/\/[^\n]*$/);
  if (commentMatch) start -= commentMatch[0].length;

  // Find the opening brace of the body.
  const braceStart = html.indexOf("{", match.index + match[0].length - 1);
  if (braceStart === -1) return html;

  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < html.length; i += 1) {
    const c = html[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return html;

  // Swallow the trailing newline.
  while (end < html.length && html[end] === "\n") end += 1;
  return html.slice(0, start) + html.slice(end);
}

/**
 * Strip the owner-facing tooling.
 * @returns {{html: string, removed: string[]}}
 */
export function stripOwnerTools(html) {
  const removed = [];

  // ---- 1. the tab button in the header ----
  const deployBtn = `        <button id="tabBtnDeploy" type="button" class="tab-inactive text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap flex items-center gap-1.5">
          <span>4. Affiliate &amp; Export Studio</span>
          <span class="w-2 h-2 rounded-full bg-amber-400"></span>
        </button>`;
  if (html.includes(deployBtn)) {
    html = replaceOnce(html, deployBtn, "", "deploy tab button");
    removed.push("deploy tab button");
  }

  // ---- 2. the whole studio view (includes the sprint tracker) ----
  const view = removeElementById(html, "viewDeploy");
  if (view.removed) {
    html = view.html;
    removed.push("affiliate & export studio view");
  }

  // ---- 3. the tab-switcher wiring ----
  html = replaceAll(html, `        deploy: document.getElementById("viewDeploy")\n`, "");
  html = replaceAll(
    html,
    `        deploy: document.getElementById("tabBtnDeploy")\n`,
    ""
  );
  html = replaceAll(
    html,
    `      document.getElementById("tabBtnDeploy").addEventListener("click", () => switchTab("deploy"));\n`,
    ""
  );

  // ---- 4. the owner-facing event handlers ----
  for (const id of [
    "btnSaveAffiliates",
    "btnResetAffiliates",
    "btnExportHtml",
    "btnExportJson",
    "btnExportCsv",
  ]) {
    const before = html;
    html = removeListenerBlock(html, id);
    if (before !== html) removed.push(`${id} handler`);
  }

  // ---- 5. the sprint checklist renderer + its call sites ----
  for (const fn of ["renderSprintChecklist", "updateSprintProgress"]) {
    const before = html;
    html = removeFunction(html, fn);
    if (before !== html) removed.push(`${fn}()`);
  }
  html = replaceAll(html, "      renderSprintChecklist();\n", "");
  html = replaceAll(html, "        renderSprintChecklist();\n", "");
  html = replaceAll(html, "        updateSprintProgress();\n", "");

  // ---- 6. the operator's affiliate inputs are gone, so stop populating them ----
  // The baked links MUST always win: a localStorage override would strip
  // referral attribution for every visitor who happens to have one saved.
  const populateBlock = `      // NOTE: affiliate URLs are baked in at build time so every visitor is
      // attributed. We deliberately do NOT restore a localStorage override
      // here - a stale browser value would strip referral attribution.
      // The inputs below are still populated so the operator can see and
      // copy the exact tracking URLs that are live on this deployment.
      try {
        document.getElementById("affSaily").value = affiliateConfig.saily;
        document.getElementById("affAiralo").value = affiliateConfig.airalo;
        document.getElementById("affNomad").value = affiliateConfig.nomad;
        document.getElementById("affYesim").value = affiliateConfig.yesim;
        document.getElementById("affJetpac").value = affiliateConfig.jetpac;
        document.getElementById("affHolafly").value = affiliateConfig.holafly;
        document.getElementById("affPromoCode").value = affiliateConfig.promo || "";
      } catch (e) {}`;

  const bakedOnly = `      // Affiliate URLs are baked in at build time so every visitor is
      // attributed. There is deliberately no localStorage override here -
      // a stale browser value would strip referral attribution.
      // The owner-facing studio is not part of the public build.`;

  if (html.includes(populateBlock)) {
    html = replaceOnce(html, populateBlock, bakedOnly, "affiliate input population");
    removed.push("affiliate input population");
  }

  return { html, removed };
}
