/**
 * XML sitemap generation.
 */

import { esc } from "./analysis.mjs";
import { url } from "./layout.mjs";

export function buildSitemap(site, pages) {
  const entries = pages
    .map((page) => {
      const priority = page.priority ?? 0.6;
      const freq = page.path === "/" ? "weekly" : "monthly";
      return `  <url>
    <loc>${esc(url(site, page.path))}</loc>
    <lastmod>${site.data_as_of}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}
