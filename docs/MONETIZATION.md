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
destroy both. What is paid for is the *work*, not the *data*:

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

**How it is built:**

| Piece | Where |
|---|---|
| Plan config | `config/subscription.json` |
| Entitlement signing + verification | `scripts/lib/entitlement.mjs` |
| Entitlement tests (24 assertions) | `scripts/test-entitlement.mjs` |
| The API Worker | `worker/index.js` |
| Worker build (embeds the catalogue) | `scripts/build-worker.mjs` |
| Database schema | `worker/schema.sql` |
| Client session handling | `src/assets/subscription.js` |
| The pricing page | `scripts/lib/pages-subscription.mjs` → `/pricing/` |

**The infrastructure costs nothing at this scale:**

- Cloudflare Workers free tier: 100,000 requests/day
- KV free tier: 100,000 reads/day, 1,000 writes/day
- D1 free tier: 5,000,000 rows read/day, 100,000 rows written/day

At 100 subscribers, you are using well under 1% of the free tier.

**Payment is via a Merchant of Record** — Lemon Squeezy (5% + 50¢) or
Gumroad (10% + 50¢). They handle VAT and sales tax worldwide, which matters
when you are a solo seller, and they both support recurring subscriptions.

**To switch it on you need exactly one thing: a checkout URL.** Put it in
`config/subscription.json` as `checkout_url`, then:

```bash
node scripts/build.mjs && node scripts/check.mjs && node scripts/validate.mjs
```

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
