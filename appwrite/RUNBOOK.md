# Runbook: finishing the Appwrite + Stripe migration

The Appwrite backend is **provisioned, the function is deployed and
verified live, and the site is deployed**. What is left is Stripe and the
housekeeping. Every command is run from the repository root.

---

## ✅ Already done

| Thing | Value |
|---|---|
| Appwrite endpoint | `https://fra.cloud.appwrite.io/v1` |
| Appwrite project id | `6ad9062200163d93497b` |
| Database | `esim_subscriptions` |
| Table `subscribers` | userId, plan, status, stripeCustomerId, stripeSubscriptionId, email, currentPeriodEnd |
| Table `watchlist` | userId, destination |
| Function | `premium-api`, node-22, deployed and active |
| Function variables | SUBSCRIBERS_DATABASE_ID, SUBSCRIBERS_TABLE_ID, WATCHLIST_TABLE_ID, PUBLIC_SITE_URL |
| Function secrets | ENTITLEMENT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET |
| Function execute permission | `["any"]` — see below |
| Web platform | `youssef-benatti.me` — see below |
| Function domain | `premium-api.fra.appwrite.run` — a proxy rule, see §4 |
| Stripe account | `acct_1ROHGKCSuN5I79Kh` (NL) — see §4 |
| Stripe prices | Pro $7/mo, $59/yr · Team $29/mo, $249/yr |
| Stripe webhook | `https://premium-api.fra.appwrite.run/webhook` |
| The site | built and deployed; the pricing page points at Appwrite, not the old Worker |

The function is live and verified end to end: an authenticated caller gets
`{"active":true,"plan":"pro",...}`, and an anonymous caller is refused.

### The two settings that are easy to miss

Both are silent failures — the function either refuses to run or runs as a
guest, with no hint about what is wrong.

**The execute permission.** A function created through the CLI has
`execute: []`, which means *nobody* may run it, not even a signed-in
user. Appwrite answers `No permissions provided for action 'execute'`
before the code runs. It must be:

```bash
appwrite functions update --function-id premium-api \
  --name "Premium API" --execute any
```

The function does its own session check, so `"any"` is safe here: an
anonymous caller still gets `{"active":false,"reason":"no-session"}`.

**The web platform.** A browser can only call the API if the project's
origin is registered, otherwise Appwrite answers `Invalid Origin` and the
site cannot sign in at all:

```bash
appwrite project create-web-platform \
  --project-id 6ad9062200163d93497b \
  --platform-id esim-site --name "eSIM Price Truth" \
  --hostname youssef-benatti.me
```

`scripts/appwrite-setup.mjs` now does both, so a fresh project is
provisioned correctly in one command.

---

## 1. How a session reaches the function (Appwrite 2.x)

This is the part that is genuinely different from Appwrite 1.x, and it
cost the most time, so it is written down here.

**Appwrite 2.x does not return the session token in the response body.**
When a browser creates a session, the body's `secret` field is an empty
string. The token is delivered in a **cookie**, and — because that cookie
belongs to the API's domain and cannot be read by script on another
origin — Appwrite also echoes it in the **`X-Fallback-Cookies` response
header**, as a JSON map of cookie name to cookie value:

```
X-Fallback-Cookies: {"a_session_6ad9062200163d93497b":"eyJpZCI6..."}
```

The client sends it back three ways, and any one of them works:

- the cookie itself, with `credentials: "include"`;
- the `X-Fallback-Cookies` **request** header;
- the `X-Appwrite-Session` **request** header, carrying the value of
  `a_session_<projectId>`.

`src/assets/subscription.js` uses all three, so sign-in works whether
or not the browser allows the third-party cookie. It keeps the token in
`localStorage` and re-sends it as `X-Appwrite-Session`.

**A server-created session is different.** Creating a session *with* an
API key puts the token in the body's `secret` field, so a script can read
it directly. That is the easiest way to test the function from a shell.

---

## 2. Verify the live function end to end

```bash
# 1. create a test user
curl -s -X POST "https://fra.cloud.appwrite.io/v1/account" \
  -H "X-Appwrite-Project: 6ad9062200163d93497b" \
  -H "Content-Type: application/json" \
  -d '{"userId":"sub_test","email":"subtest@example.com","password":"SubTest-123456789"}'

# 2. insert a subscriber row
appwrite tablesdb create-row \
  --database-id esim_subscriptions --table-id subscribers \
  --row-id row_test \
  --data '{"userId":"sub_test","plan":"pro","status":"active","email":"subtest@example.com"}' \
  --permissions '[]'

# 3. create a session (the API key makes the secret readable)
TOKEN=$(curl -s -X POST "https://fra.cloud.appwrite.io/v1/account/sessions/email" \
  -H "X-Appwrite-Project: 6ad9062200163d93497b" \
  -H "X-Appwrite-Key: $APPWRITE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"subtest@example.com","password":"SubTest-123456789"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["secret"])')

# 4. call the function with it
curl -s -X POST "https://fra.cloud.appwrite.io/v1/functions/premium-api/executions" \
  -H "X-Appwrite-Project: 6ad9062200163d93497b" \
  -H "X-Appwrite-Session: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path":"/entitlement","method":"GET"}'
# -> {"active":true,"plan":"pro",...}
```

**The expected result is `{"active":true,"plan":"pro",...}`.** Anything
else means the deployment did not pick up the change.

The full local suite covers this without a network:

```bash
node scripts/test-appwrite-function.mjs   # 63 tests
node scripts/test-entitlement.mjs          # 45 tests
```

## 3. The export is paginated

The full table is 136,040 rows, which is 42 MB of JSON. Returning that in
one response times out at the edge cache, so `GET /export` returns one
page and says where the next one starts:

- `?limit=` — rows per page (default 2,000, maximum 20,000)
- `?offset=` — the first row of the page
- `?destinations=` — a comma-separated list of ISO codes
- `?format=csv` — CSV instead of JSON

The response carries `rowCount`, `totalRows`, `hasMore` and `nextOffset`.

## 4. Stripe — ✅ DONE

### The account

**Stripe does not support businesses registered in Tunisia.** Not Stripe
Payments, and not Stripe Managed Payments (the Merchant of Record product)
either — the supported seller countries are CA, US, 35 European countries,
AU, HK, JP and SG.

**This is solved:** the account in use is registered in the **Netherlands**
(`acct_1ROHGKCSuN5I79Kh`). The alternatives, if the account ever has to
change, are Stripe Atlas (~$500 once), a Merchant of Record that accepts
Tunisia-based sellers (Lemon Squeezy, Gumroad), or a Tunisian entity.

### The products, the prices and the webhook — one command

```bash
STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs
```

The script is idempotent and it does everything:

- creates the two products and their four recurring prices (Pro and Team,
  monthly and yearly), reading the amounts from `config/subscription.json`
  so the pricing page and the charge can never disagree;
- creates the billing-portal configuration;
- creates the webhook endpoint and stores its signing secret on the
  function;
- pushes the price ids and the secret key to the function;
- writes the price ids back into `config/subscription.json`.

**The secret key is never written to disk.** It is read from the
environment and goes straight to the function as a secret variable.

### The function's domain

A function created through the CLI does not get a domain the way the
console creates one, so the domain is a proxy rule:

```bash
appwrite proxy create-function-rule \
  --domain premium-api.fra.appwrite.run --function-id premium-api
```

This is not a convenience. A request that arrives through the domain keeps
its **raw body and its headers**, and a Stripe signature is computed over
exactly those bytes. Through the Appwrite executions API the body is
wrapped in an envelope, which would break the signature.

The webhook listens on:

```
https://premium-api.fra.appwrite.run/webhook
```

### The signature is mandatory

If `STRIPE_WEBHOOK_SECRET` is set, a request without a valid
`stripe-signature` header is refused with a 400:

```json
{ "error": "missing_signature" }
```

The webhook is a public URL, so accepting an unverified body would let
anybody POST a forged event and grant themselves a subscription. A wrong
signature is refused the same way, with `invalid_signature`.

### The events

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

**Important:** the webhook needs the Appwrite user id, and it gets it from
the Checkout Session's metadata, which the function sets from the signed-in
user. The webhook is the only route that does not need a session.

### The API version

The function pins Stripe's API version to `2025-10-29.clover`, and
`scripts/stripe-setup.mjs` uses the same one. They have to match, because
the object SHAPES differ between versions: since `2025-03-31.basil`,
`current_period_end` lives on the subscription's **item**, not on the
subscription, so the function reads both.

## 5. Clean up

The test user, the test subscriber row and the test watchlist rows have
already been removed. If you create more:

```bash
appwrite tablesdb delete-row --database-id esim_subscriptions \
  --table-id subscribers --row-id row_test
appwrite users delete --user-id sub_test
```

## 6. Rotate the exposed key

The Appwrite API key was pasted into a chat, so it should be treated as
public. Rotate it in the Appwrite console (Project → Overview → API
keys), then re-point the CLI:

```bash
appwrite client --endpoint https://fra.cloud.appwrite.io/v1 \
  --project-id 6ad9062200163d93497b --key <NEW_KEY>
```

The function's own ephemeral key is generated per execution and is not
affected.

## 7. The Spaceship token

The Spaceship API token used for the domain is still outstanding:
revoke it, and watch `partnerships@youssef-benatti.me` for anything
unusual.
