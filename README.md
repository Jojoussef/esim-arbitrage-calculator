# eSIM Price Truth

Zero-dependency Node.js static site generator for [youssef-benatti.me/esim-arbitrage-calculator](https://youssef-benatti.me/esim-arbitrage-calculator/). It compiles a point-in-time catalog snapshot of 136,040 eSIM price points (6,802 plan variants across 94 travel destinations and 20 checkout currencies) into an interactive FX calculator, 94 programmatic destination pages, and three pricing analysis guides.

## Repository layout

```
config/
  site.json             site metadata, brand tokens, mirror target
  affiliates.json       vendor link registry and UTM parameters
  monetization.json     sponsorship and data-license configuration
  subscription.json     Pro and Team tier definitions
data/                   committed catalog snapshot
  catalog.json          94 destinations, 20 currencies, 224 currency inversions
  fx.json               ECB spot rates and catalog medians per currency
  competitors.json      comparison list prices across 7 providers
  stats.json            computed headline counters
src/
  app.html              base single-file calculator template
  styles.css            layout styles
  theme.css             CSS custom properties (light and dark palettes)
  assets/               static icons, OG assets, and subscription client
scripts/
  extract_data.mjs      extract normalized JSON tables from raw scrape data
  build.mjs             compile static HTML, CSS, and data into dist/
  build-worker.mjs      bundle the Cloudflare Worker with embedded catalog data
  check.mjs             build-time invariants (pricing integrity, SEO, copy rules)
  validate.mjs          syntax and template validation across generated pages
  test-entitlement.mjs  unit tests for HMAC entitlement verification
  serve.mjs             local static preview server
  deploy.mjs            publish dist/ to gh-pages and mirror to Jojoussef.github.io
  lib/                  page generators and data transforms
worker/                 Cloudflare Worker entitlement API
  index.js              HMAC bearer verification and gated endpoints
  schema.sql            D1 schema for subscribers, watchlists, and price events
  wrangler.toml         Worker deployment configuration
```

## Quick start

Node 18+ is required. The static build uses zero npm dependencies.

```bash
node scripts/build.mjs     # compile site into dist/
node scripts/check.mjs     # run data integrity and SEO checks
node scripts/validate.mjs  # verify generated HTML and inline JS syntax
node scripts/serve.mjs     # preview at http://localhost:8080
```

## Build verification

Every numeric counter rendered in page copy (`{prices}`, `{destinations}`, `{currencies}`, `{variants}`, `{inversions}`) is derived from `data/*.json` during `node scripts/build.mjs`. Running `node scripts/check.mjs` and `node scripts/validate.mjs` in CI blocks deployment if any page contains unresolved template tokens, broken internal links, or invalid inline JavaScript.

## Entitlement architecture

The calculator and all 94 destination pages are static and unauthenticated. Paid endpoints (flat CSV/JSON exports, price-drop alerts, and live inversion feeds) sit behind server-side session verification in `appwrite/functions/premium-api/` and `worker/index.js`:

1. Billing webhooks verify cryptographic signatures before mutating subscriber state.
2. Authenticated endpoints derive the caller identity from the verified session or HMAC bearer token rather than client-supplied parameters.
3. Run `node scripts/test-entitlement.mjs` and `node scripts/test-appwrite-function.mjs` (97 assertions) to verify token signing, expiry, and webhook validation locally.

## License

Code is licensed under MIT. Embedded catalog data is a point-in-time snapshot of public pricing tables used for price comparison and FX analysis. Not affiliated with or endorsed by Holafly, Nomad, Saily, Airalo, Yesim, Jetpac, or Cellesim.
