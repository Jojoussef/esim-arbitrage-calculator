# eSIM Price Truth

Static site generator for a data-driven eSIM buying tool: it turns one
catalogue snapshot into a calculator, 94 programmatic destination pages,
three long-form guides, and a monetised affiliate funnel — all static, all
free to host on GitHub Pages.

**Live:** https://youssef-benatti.me/esim-arbitrage-calculator/

The site is written for travellers, not for its operator: every page
answers a question a traveller actually asks ("How much does an eSIM cost
in Japan?", "Which currency should I pay in?"). `scripts/check.mjs` fails
the build if the operator's voice, developer jargon or any owner-only
tooling leaks into the public pages.

---

## What is in here

```
config/
  site.json           site metadata, brand, theme colours, mirror target
  affiliates.json     affiliate program registry + UTM settings   <-- edit this
  monetization.json    sponsorship / lead-gen / data-licence models
  subscription.json    the Pro + Team subscription plans          <-- edit this
data/                 the catalogue snapshot (generated, committed)
  catalog.json        94 destinations, 20 currencies, 224 inversions
  fx.json             spot rates + catalogue medians per currency
  competitors.json    verified rival list prices
  stats.json          headline counters
src/
  app.html            the original single-file calculator (transformed at build)
  styles.css          supplemental styles
  theme.css           design tokens: colour, radius, elevation, light + dark
  assets/             favicon, OG image, subscription client
scripts/
  extract_data.mjs    pull the dataset out of the original HTML
  build.mjs           generate the whole site into dist/
  build-worker.mjs    build the subscription Worker (embeds the catalogue)
  check.mjs           monetisation, SEO, voice and subscription checks
  validate.mjs        structural checks (JS parses, no template artefacts)
  test-entitlement.mjs  tests for the paywall signature scheme
  find-syntax-error.mjs  locate a JS syntax error in a built page
  serve.mjs           zero-dependency local preview server
  deploy.mjs          build + publish to GitHub Pages + mirror
  setup-dns.mjs       write the DNS records for the custom domain
  check-dns.mjs       verify the domain is serving over HTTPS
  social-posts.mjs    generate the Phase 3 post copy
  lib/                the generator internals
worker/               the subscription API (Cloudflare Worker)
  index.js            entitlement checks + the premium endpoints
  schema.sql          the subscriber / watchlist / price-event tables
  wrangler.toml       deployment config
```

## Quick start

```bash
node scripts/build.mjs     # generate dist/
node scripts/check.mjs     # verify monetisation, SEO and voice
node scripts/validate.mjs  # verify structure
node scripts/serve.mjs     # preview at http://localhost:8080
node scripts/deploy.mjs    # build + push to gh-pages + mirror
```

There are **no npm dependencies**. Node 18+ is the only requirement.

The subscription Worker does need `wrangler`, but only if you are deploying
it — the site builds and the free tier works without it.

---

## Theme

`src/theme.css` holds every colour as a CSS custom property. The brand and
accent values are generated from `config/site.json` at build time, so the
palette is changed in one place:

```json
"theme_color": "#0F2942",
"accent_color": "#0D9488"
```

Dark mode is applied via `prefers-color-scheme`, with a light/auto/dark
toggle in the header that persists to `localStorage`. A pre-paint bootstrap
script sets the theme before first paint, so there is no flash.

---

## The subscription model

The affiliate programmes rejected the publisher, so the site needed a
revenue model that does not depend on anyone's approval. The subscription
is that model: **the calculator stays completely free, and the paid tier
sells the work around the data.**

| Plan | Price | What it adds |
|---|---|---|
| Free | $0 | The calculator, every destination, every currency, every trip length. No account, no cookie. |
| Pro | $7/mo · $59/yr | Price alerts, the flat clean export, the pricing-error monitor as a feed. |
| Team | $29/mo · $249/yr | Everything in Pro, 5 seats, API access, priority support. |

**The free tier is the whole point.** The calculator is the SEO asset and
the referral asset; paywalling it would destroy both. `scripts/check.mjs`
fails the build if the free plan ever gets a price.

**What the paid tier actually sells.** The catalogue is already served
publicly at `/data/catalog.json` (the free calculator is client-side), so
"sell the data file" would be pointless. What a subscriber pays for is the
*labour*: being told when a price moves, a pre-flattened export ready for
a spreadsheet, and the error monitor as a live feed.

**How it is enforced.** Server-side, in an Appwrite Function:

```
browser ──X-Appwrite-Session (JWT)──▶  Appwrite Function
                                          ├─ x-appwrite-user-id identifies the caller
                                          ├─ the subscriber record says what they paid for
                                          └─ the premium data is served, or refused
```

Appwrite derives the user's id from the session JWT, so the client never
sends a user id it could have made up. The subscriber record is the source
of truth for the plan, so a client cannot upgrade itself by editing a
field, and a cancelled subscription loses access immediately.

**⚠️ Stripe does not support Tunisia-based businesses.** Neither standard
Stripe Payments nor Managed Payments will open an account for a
Tunisia-registered seller. The code is written against the standard Stripe
API, so the practical route is **Stripe Atlas** (~$500 once, then ~$100/yr,
forms a Delaware C-corp from anywhere). See `docs/MONETIZATION.md` for
the alternatives and the full reasoning.

**The pieces:**

| Piece | Where |
|---|---|
| The function | `appwrite/functions/premium-api/` |
| The database access (hand-rolled REST) | `appwrite/functions/premium-api/src/db.js` |
| Provisioning | `scripts/appwrite-setup.mjs` |
| Deployment | `scripts/appwrite-deploy.mjs` |
| Local tests (37 assertions) | `scripts/test-appwrite-function.mjs` |
| The client | `src/assets/subscription.js` |
| The pricing page | `scripts/lib/pages-subscription.mjs` → `/pricing/` |

See `docs/MONETIZATION.md` for the full strategy.

**REMOVE_LEGACY_BLOCK**

```
browser  ──Authorization: Bearer <signed token>──▶  Worker
                                                  ├─ verify HMAC signature
                                                  ├─ check the revocation list
                                                  └─ serve the premium data
```

The premium data is simply **not sent** to a browser without a valid
entitlement — which is the only way to actually gate data. Client-side
obfuscation is not security.

**The session lives in `localStorage`, not a cookie.** The site is on
`youssef-benatti.me` and the API is on `workers.dev`, so a cookie would be
a third-party cookie — which modern browsers block. A bearer token has no
such problem.

**It costs nothing at this scale.** Workers: 100k requests/day free. KV:
100k reads/day free. D1: 5M rows read/day free. At 100 subscribers you use
well under 1% of it.

**To switch it on you need one thing: a checkout URL.** Create a Pro and a
Team product in Lemon Squeezy (5% + 50¢, Merchant of Record) or Gumroad
(10% + 50¢, Merchant of Record), then set them in
`config/subscription.json`:

```json
"checkout_urls": {
  "pro":  "https://your-store.lemonsqueezy.com/checkout/buy/...",
  "team": "https://your-store.lemonsqueezy.com/checkout/buy/..."
}
```

Then rebuild. `scripts/check.mjs` fails the build if a paid plan has no
price, no features, or a placeholder checkout URL.

See `docs/MONETIZATION.md` for the full strategy.

---

## Monetisation: the one thing to get right

The original calculator stored affiliate URLs in `localStorage`. That works
for the person who set it up and **earns nothing from visitors** — every
other person clicked a bare vendor URL.

This project bakes the tracking URLs in at **build time**:

| File | What it does |
|---|---|
| `config/affiliates.json` | Your affiliate tracking URLs, one per program |
| `scripts/lib/affiliates.mjs` | Builds the final URLs (UTM tagging) |
| `scripts/lib/app-transform.mjs` | Injects them into the calculator at build time |
| `scripts/lib/pages-destinations.mjs` | Uses them on every destination page |

### Wiring your affiliate links

Open `config/affiliates.json` and replace the `url` of each program with the
tracking link your affiliate dashboard gave you:

```json
"saily": {
  "name": "Saily",
  "url": "https://saily.com/?partner_id=YOUR_ID",
  "fallback": "https://saily.com/",
  "tracking_id": "",
  "rate": "15% per new user, 30-day cookie",
  "primary": true
}
```

Then:

```bash
node scripts/build.mjs && node scripts/deploy.mjs
```

`fallback` is used when `url` is still the bare vendor URL, so the site never
breaks — it simply will not earn until you paste a real tracking link. The
`/disclosure/` page reads this file and shows the live status of each program.

### What every monetised link gets

- `rel="sponsored noopener noreferrer"` (Google's affiliate-link guidance)
- `utm_source=esim-arb-calc&utm_medium=affiliate&utm_campaign=2026-arbitrage`
- `utm_content=<destination slug>` so the affiliate dashboard shows which
  destination pages actually earn money

### Compliance

- An affiliate disclosure bar appears above the fold on every page.
- `/disclosure/` states which vendors pay, that ranking is by price and never
  paid for, and how the price data was collected.
- `/privacy/` documents that there are no accounts, no cookies and no
  server-side collection.

---

## Roadmap sprints mapped to the code

| Sprint | Where it lives |
|---|---|
| 1.1–1.3 Apply to affiliate programs, save links | `config/affiliates.json` |
| 2.1 Clean the catalogue | `scripts/extract_data.mjs` → `data/` |
| 2.2 Build the calculator | `src/app.html` + `scripts/lib/app-transform.mjs` |
| 2.3 Wire links and deploy | `scripts/lib/affiliates.mjs` + `scripts/deploy.mjs` |
| 3.1 20-currency FX audit post | `scripts/lib/guide-bodies.mjs` → `fxGuideBody` |
| 3.2 "Extra day is cheaper" post | `scripts/lib/guide-bodies.mjs` → `inversionGuideBody` |
| 3.3 Unlimited vs fixed-GB post | `scripts/lib/guide-bodies.mjs` → `breakEvenGuideBody` |
| 4.1 Programmatic destination pages | `scripts/lib/pages-destinations.mjs` |
| 4.2 Throttled monthly refresh | `data/` + `.github/workflows/refresh-catalogue.yml` |

---

## Data honesty

Every figure in the generated copy is computed from `data/*.json` at build
time — there are no hard-coded numbers in the page templates. The headline
counters in `config/site.json` support `{prices}`, `{destinations}`,
`{currencies}`, `{variants}` and `{inversions}` placeholders.

> **Note on the original figures:** the source tool advertised "193,378
> prices". The embedded dataset actually contains **136,040** price points
> (6,802 plan variants × 20 currencies). The site publishes the real number,
> and `scripts/check.mjs` fails the build if the stale figure reappears.

---

## Data source

`src/app.html` is the original single-file tool, produced from a
`catalogue_all.jsonl` scrape of the vendor's public catalogue. The dataset
is a **point-in-time snapshot** (Oct 2026) and prices change often.

The build re-derives everything from `data/`, so refreshing the catalogue is
a matter of replacing the JSON files and rebuilding.

---

## Deployment

`scripts/deploy.mjs`:

1. Builds into `dist/`.
2. Publishes `dist/` to the `gh-pages` branch via a throwaway git repo, so
   the source branch stays clean.
3. Enables GitHub Pages with `source: gh-pages /`.
4. Mirrors the identical build into `Jojoussef/Jojoussef.github.io` at
   `/esim/`, which is the repository that owns the `youssef-benatti.me`
   CNAME.

Both copies declare the same canonical URL, so there is no duplicate-content
problem.

`.github/workflows/deploy.yml` does the same on every push to `main`, and
runs `check.mjs` + `validate.mjs` first — a broken monetisation invariant
fails the build rather than shipping.

---

## Licence

The code is MIT-licensed. The catalogue data is a snapshot of a third party's
public pricing tables and is used for personal, non-commercial analysis.
This project is not affiliated with or endorsed by Holafly, Nomad, Saily,
Airalo, Yesim, Jetpac or Cellesim.

