# Monetisation strategy

**Status: the affiliate route is closed.** The eSIM affiliate programmes
rejected the publisher application, so the site currently earns nothing from
outbound clicks. This document is the replacement plan.

Everything below is configured in `config/monetization.json`. Nothing on the
site is monetised until a model is enabled there, so the build never renders
an empty or broken ad slot.

---

## Why the plan changed

The original model was: a visitor clicks a "buy" button → the vendor's
cookie attributes the sale → you earn 10–20% commission.

That model needs **an approved affiliate account**. Without one, the links
point at bare vendor URLs and every click is worth $0.

But the rejection was not a verdict on the site. It was a verdict on the
*application*. What the site actually owns is this:

```
94 destinations            6,802 plan variants        160 carriers mapped
20 currencies              136,040 price points       224 pricing errors
4,509 plan variants (66.3%) that the vendor's own iOS app hides
```

**A vendor cannot publish the pricing errors in their own catalogue, and
cannot publish the list of durations their own app hides.** A comparison
site can, and can prove it. That asymmetry is the commercial asset, and it
does not require anyone's affiliate programme.

---

## The four models

### 0. Subscription — the only model that earns without anyone's approval

This is the model that does not depend on a third party at all. A reader
pays you directly, and you keep the whole amount.

| Plan | Price | What it is |
|---|---|---|
| Free | $0 | The calculator, every destination, every currency, every trip length. No account, no cookie, no tracking. |
| Pro | $7/mo or $59/yr | Price alerts, the flat clean data export, the pricing-error monitor as a live feed. |
| Team | $29/mo or $249/yr | Everything in Pro, up to 5 seats, API access, priority support. |

**The free tier stays completely free.** That is the whole trick. The
calculator is the SEO asset and the referral asset — paywalling it would
destroy both. `scripts/check.mjs` fails the build if the free plan ever
gets a price.

**What is paid for is the *work*, not the *data*:**

- being **told** when a price changes, before the public page is rebuilt
- a **pre-built, flat, de-duplicated** export instead of a nested JSON file
- the **error monitor as a feed**, not a number on a page

> This matters: the catalogue is already served publicly at
> `/data/catalog.json` because the free calculator is client-side. "Sell the
> data file" is not a business — a subscriber could download it for free.
> The subscription sells the labour.

**Why it is the right first model:**

- It **cannot be switched off** by a rejection, because there is no reviewer.
- Recurring revenue from the **first** subscriber, not a per-click commission
  that needs thousands of clicks.
- The vendor outreach still works *on top* of it.

### The stack: Appwrite + Stripe

| Piece | Where |
|---|---|
| Subscriber accounts | Appwrite Auth (email + password) |
| Subscriber + watchlist records | Appwrite TablesDB |
| The premium API, the Stripe billing, the webhook | An Appwrite Function (`appwrite/functions/premium-api`) |
| Payments | Stripe Checkout, subscriptions, customer portal |
| The pricing page | `scripts/lib/pages-subscription.mjs` → `/pricing/` |
| The client | `src/assets/subscription.js` |

**Why the session is the key.** Appwrite derives the user's id from the
session JWT, and passes it to the function as `x-appwrite-user-id`. The
client never sends a user id it could have made up. The subscriber record
is the source of truth for the plan, so a client cannot upgrade itself by
editing a field, and a cancelled subscription loses access immediately.

**The infrastructure is free at this scale.** Appwrite Cloud's free plan
covers a project, a database, tables and function executions comfortably at
subscriber counts in the dozens.

### The Stripe problem, and how to solve it

**Stripe does not support businesses registered in Tunisia.** Neither
standard Stripe Payments nor Stripe Managed Payments (the Merchant of
Record product) will open an account for a Tunisia-based seller — the
supported business locations are Canada, the US, 35 European countries, and
Australia, Hong Kong, Japan and Singapore.

**This is solved.** The Stripe account in use is registered in the
**Netherlands** (`acct_1ROHGKCSuN5I79Kh`), so the account itself is not a
problem any more. Three ways forward, in order of preference, if the
account ever has to change:

1. **Stripe Atlas.** Forms a Delaware C-corp from anywhere in the world
   (~$500 once, then ~$100/year), and the account can be opened immediately.
   Because Stripe is then the merchant of record only if you enable Managed
   Payments, you should either enable it (Stripe handles VAT) or register
   for EU VAT with the OSS.
2. **A Merchant of Record that accepts Tunisia-based sellers** — Lemon
   Squeezy or Gumroad. They keep the code, but you do not get a Stripe
   dashboard or the API.
3. **A local Tunisian entity that can contract with a payment provider.**
   Slower, and it is your own legal problem.

The code is written against the **standard Stripe API** (Checkout
Sessions, Subscriptions, the customer portal, webhooks), so all three work
with it as written.

### Setting Stripe up

```bash
STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs
```

The script creates the products, the monthly and yearly prices, the
billing-portal configuration and the webhook endpoint, pushes the price
ids and the two secrets to the Appwrite Function, and writes the price ids
back into `config/subscription.json`. It is idempotent, so it can be
re-run safely.

**The prices come from `config/subscription.json`**, so the amount on the
pricing page and the amount Stripe charges are read from the same file and
cannot drift apart.

### The webhook

The webhook is posted to the function's own domain:

```
https://premium-api.fra.appwrite.run/webhook
```

A function created through the CLI does not get a domain the way the
console creates one, so the domain is a proxy rule:

```bash
appwrite proxy create-function-rule \
  --domain premium-api.fra.appwrite.run --function-id premium-api
```

This matters for correctness, not just convenience: a request that arrives
through the domain keeps its **raw body and its headers**, and a Stripe
signature is computed over exactly those bytes. Through the Appwrite
executions API the body is wrapped in an envelope, which would break the
signature.

**The signature is mandatory.** If `STRIPE_WEBHOOK_SECRET` is set, a
request without a valid `stripe-signature` header is rejected with a 400.
The webhook is a public URL, so accepting an unverified body would let
anybody POST a forged event and grant themselves a subscription.

The events the function handles:

| Event | What it does |
|---|---|
| `checkout.session.completed` | Creates the subscriber record from the Appwrite user id in the session metadata. |
| `customer.subscription.created` / `.updated` | Keeps the plan and the current period end up to date. |
| `customer.subscription.deleted` | Marks the record cancelled, so access ends immediately. |
| `invoice.paid` | Restores access after a failed payment is resolved. |
| `invoice.payment_failed` | Marks the record `past_due`, so access pauses. |

**One API-version detail that bites.** Since API version
`2025-03-31.basil`, `current_period_end` lives on the subscription's
*item*, not on the subscription. The function reads both, and the API
version is pinned in the function and in `scripts/stripe-setup.mjs` so the
two can never disagree.

### 1. Sponsorship — the secondary engine

A vendor pays a **flat monthly fee** for a clearly labelled placement.

- No cookie, no network, no approval queue, no attribution debate.
- The placement is visually separated from the comparison results and
  always labelled **"Sponsored"** (FTC + Google policy).
- Implemented in `scripts/lib/lead-gen.mjs` → `renderSponsorSlot()`.

Enable it in `config/monetization.json`:

```json
"sponsorship": {
  "enabled": true,
  "slots": [
    {
      "name": "Travel data for Japan, from $9",
      "blurb": "A 7-day plan with 5G and unlimited hotspot.",
      "href": "https://example.com/japan",
      "cta": "See plans"
    }
  ]
}
```

Slots render in the sidebar of every destination page and on the hub pages.

### 2. Lead postback — the highest-value model

A visitor who picks a destination, a trip length, a currency and a data need
is a **qualified lead** — minutes away from buying. That is worth more than
a click, because the vendor does not have to convince anyone.

The intent signal is captured client-side (`scripts/lib/intent-capture.mjs`)
and forwarded **only** if an endpoint is configured:

```json
"intent": {
  "capture": true,
  "fields": ["destination", "days", "currency", "hotspot"],
  "endpoint": "https://your-crm.example/leads"
}
```

With no endpoint set, **nothing is transmitted anywhere** — the signal stays
in the visitor's own browser. `scripts/check.mjs` fails the build if the
endpoint is not `https`.

### 3. Data licensing — the sleeper

Sell the dataset itself to travel and telecom products. Four products are
already defined in the config:

| Product | What it is |
|---|---|
| Full price matrix | every plan variant, duration and currency price point |
| Carrier coverage matrix | which carriers serve which destination, 5G and tethering flags |
| Pricing error feed | the duration inversions and duplicate-price conflicts, refreshed monthly |
| iOS app visibility diff | which durations are purchasable on the web but hidden in the app |

The **iOS visibility diff** is the most interesting one: it is a concrete,
provable, uncomfortable fact about a competitor's own storefront, and no
vendor will publish it about themselves.

---

## What was ruled out, and why

| Option | Verdict |
|---|---|
| **Wholesale / private-label eSIM** | eSIM Go's published minimum is **$10,000/month** of wholesale spend. Out of reach, and it needs contracts plus an API integration. Revisit at scale. |
| **Display advertising as the main model** | At 5–15k monthly pageviews, travel/finance CPMs of $3–12 yield roughly **$15–180/month**. Useful as a floor, not a business. |
| **Raptive / Media.net** | Both reachable and accepting applications, but both run a manual traffic-quality review that a brand-new site will not pass. Apply after 500+ sessions. |
| **Carbon Ads** | Reachable and easy to join, but its inventory is developer/tech audiences. A travel audience is a poor match. |
| **Google AdSense** | Reachable and the realistic floor. Apply once the site has 50+ pages of original content — which it now does. |

---

## The outreach campaign

The sponsorship model is won by outreach, and outreach needs tracking.

### 1. Send the pitch

The media kit is generated from the live dataset, so every number in it is
true:

- `https://youssef-benatti.me/esim-arbitrage-calculator/advertise/` — the page
- `https://youssef-benatti.me/esim-arbitrage-calculator/advertise/kit.txt` — paste into an email

### 2. Track it

```bash
node scripts/vendor-outreach.mjs list              # the pipeline
node scripts/vendor-outreach.mjs next              # who to contact today
node scripts/vendor-outreach.mjs add Holafly emailed "sent the kit, follow up Friday"
node scripts/vendor-outreach.mjs note Holafly "asked for a rate card"
```

States: `not_contacted → emailed → replied → negotiating → won` (or `lost`).

### 3. Who to contact, in order

**Tier 1 — the vendors in the catalogue.** They already appear on the site.
A direct partnerships email is a far easier yes than an affiliate review.

**Tier 2 — the networks that were rejected.** If the rejection was the
*application*, not the site, re-apply on the network the vendor uses
(Awin, FlexOffers, Impact, Partnerize, Cuelinks, Admitad). Some networks
auto-approve a publisher with real content; some reject every new site
regardless. It costs one form each.

**Tier 3 — the wider travel-tech ecosystem.** The same dataset has value to:
travel blogs that want a "cheapest eSIM in X" widget, price-comparison
newsletter authors, and travel apps that want a cost estimator.

### 4. The pitch, in one line

> We found 224 plans where the longer, cheaper option is mispriced, and
> 4,509 plan lengths that Holafly's own iOS app hides. Every visitor to our
> calculator has told us where they are going and how long for. Sell a
> placement, or take the leads.

---

## What is already built

| Piece | Where |
|---|---|
| Monetisation config | `config/monetization.json` |
| Sponsored slot renderer | `scripts/lib/lead-gen.mjs` |
| Intent capture (client) | `scripts/lib/intent-capture.mjs` |
| Media kit page | `scripts/lib/vendor-pitch.mjs` → `/advertise/` |
| Plain-text pitch | `scripts/lib/vendor-pitch.mjs` → `/advertise/kit.txt` |
| Outreach tracker | `scripts/vendor-outreach.mjs` |
| Asset report | `scripts/lib/asset-report.mjs` |
| Config validation | `scripts/check.mjs` (fails on a broken slot) |

---

## The order of operations

1. **Today** — send the kit to the 7 catalogue vendors. Use
   `vendor-outreach.mjs next` to work the list.
2. **This week** — apply to Google AdSense (the floor) and to Admitad,
   Cuelinks and Partnerize (the networks, in case the rejection was the
   application). Set `intent.endpoint` to a CRM or a lead-network
   postback URL when you have one.
3. **This month** — re-apply to the affiliate programmes with the live
   site URL and the media kit attached. Several approve publishers who
   have a real, indexed site; the first application was made before the
   site had one.
4. **Next month** — approach the data-licensing buyers, and check the
   affiliate dashboard if any of the tier-2 networks approve.

**The one thing that matters most:** the site needs traffic for any of this
to work. The 94 destination pages are the engine, so indexing and the
Phase 3 posts still come first.
