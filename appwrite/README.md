# The Appwrite backend

This is the backend for the **paid tier** of eSIM Price Truth.

The free calculator stays on GitHub Pages, completely free and completely
open. This Appwrite project serves only what needs an entitlement check:
the subscriber's account, their watchlist, the premium data export and
the Stripe billing.

```
appwrite/
  functions/
    premium-api/          the Appwrite Function (Node 22)
      src/
        main.js           the routes and the entitlement check
        db.js             the Appwrite REST client (hand-rolled, see below)
        data.js           the export / error-feed / alert builders
        entitlement.js    the signature scheme (shared with the site)
        catalog.js        GENERATED - the embedded catalogue
  appwrite.json           the project manifest for the CLI
  schema.md               the table definitions, in plain English
```

## Why the database client is hand-rolled

`src/db.js` does not use the SDK's `TablesDB` class. The SDK sends an
`X-Appwrite-Response-Format` header and parses the response with JSONbig.
Inside the Appwrite Function runtime, that combination returns an **empty
body**, and `JSONbig.parse("")` throws "Unexpected end of JSON input" — an
error that says nothing about what is actually wrong.

A plain `fetch` with the same headers works perfectly from inside the
function, so the four calls this function needs are implemented directly.
The result is fewer moving parts, no SDK dependency for the database, and
errors that say what happened.

## The function's API key

Appwrite gives each execution its own **ephemeral key** in the
`x-appwrite-key` header. That key is the only credential that works from
inside the function — the `APPWRITE_FUNCTION_API_KEY` environment
variable is a *build-time* value and is not valid at runtime.

The ephemeral key only carries the scopes the function declares, so the
function's scopes must include the database ones:

```bash
appwrite functions update --function-id premium-api --name "Premium API" \
  --scopes 'rows.read' --scopes 'rows.write' \
  --scopes 'documents.read' --scopes 'documents.write' \
  --scopes 'tables.read' --scopes 'tables.write' \
  --scopes 'users.read' --scopes 'databases.read'
```

Without `rows.read`, the function fails with
`missing scopes (["rows.read"])` — and with the hand-rolled client it
fails with a readable error instead of a JSON parse error.

## What it is for

| Route | What it does |
|---|---|
| `GET /entitlement` | "Am I a subscriber, and what can I do?" |
| `GET /export` | The flat price + coverage export (JSON or CSV), paginated |
| `GET /errors` | The pricing-error monitor feed |
| `GET /alerts` | The subscriber's watchlist, priced |
| `POST /watch` | Add or remove a destination from the watchlist |
| `POST /checkout` | Create a Stripe Checkout session |
| `POST /portal` | Create a Stripe customer portal session |
| `POST /webhook` | Stripe's subscription events |

Every route except `/webhook` requires an Appwrite session. The webhook
is authenticated by Stripe's own signature instead, because Stripe is not
an Appwrite user.

### The export is paginated

The full table is 136,040 rows, which is 42 MB of JSON — far too large to
return in one response, and it times out at the edge cache. `GET /export`
therefore returns one page:

- `?limit=` — rows per page (default 2,000, maximum 20,000)
- `?offset=` — the first row of the page
- `?destinations=` — a comma-separated list of ISO codes to narrow to
- `?format=csv` — CSV instead of JSON

The response carries `rowCount` (rows in this page), `totalRows` (rows
that match the filter), `hasMore` and `nextOffset`, so a client can walk
the whole export page by page. The CSV response repeats the totals in the
`X-Export-Total-Rows` and `X-Export-Next-Offset` headers.

## The tables

Two tables, both in one database:

- **`subscribers`** — one row per paying customer: the Appwrite user id,
  the plan, the status, and the Stripe customer/subscription ids.
- **`watchlist`** — the destinations a subscriber follows.

See `schema.md` for the columns.

## Deploying it

The scripts do the work; the CLI needs to be pointed at the project first.

```bash
# 1. Point the CLI at the project (an API key is enough for project commands)
appwrite client \
  --endpoint https://fra.cloud.appwrite.io/v1 \
  --project-id 6ad9062200163d93497b \
  --key <API_KEY>

# 2. Create the database, the tables, the indexes, the function and its variables
node scripts/appwrite-setup.mjs

# 3. Set the function's scopes (the ephemeral key needs the database ones)
appwrite functions update --function-id premium-api --name "Premium API" \
  --scopes 'rows.read' --scopes 'rows.write' \
  --scopes 'documents.read' --scopes 'documents.write' \
  --scopes 'tables.read' --scopes 'tables.write' \
  --scopes 'users.read' --scopes 'databases.read'

# 4. Set the secrets. A secret can be created once and can never be
#    read back, so these are set by hand, not by the setup script.
appwrite functions create-variable --function-id premium-api \
  --variable-id var_entitlement_secret \
  --key ENTITLEMENT_SECRET --value <random> --secret
appwrite functions create-variable --function-id premium-api \
  --variable-id var_stripe_secret_key \
  --key STRIPE_SECRET_KEY --value sk_live_... --secret
appwrite functions create-variable --function-id premium-api \
  --variable-id var_stripe_webhook_secret \
  --key STRIPE_WEBHOOK_SECRET --value whsec_... --secret

# 5. Build the embedded catalogue and deploy
node scripts/build-appwrite-function.mjs
node scripts/appwrite-deploy.mjs
```

### The CLI's flag quirks, for reference

These cost time to work out, so they are recorded here:

- `--columns` is a **stringArray**: each column is its own argument
  holding one JSON object, not one argument holding an array.
- A column that is `required` **cannot** also have a `default`.
- `create-variable` needs `--variable-id` as well as `--key` and `--value`.
- `functions update` needs `--name` even when you are only changing scopes.
- `create-deployment` needs `--activate` to swap the new deployment in.

## Testing it without deploying

```bash
node scripts/test-appwrite-function.mjs
```

The harness loads the function exactly as Appwrite would, drives it
through a fake `req`/`res` pair, and stubs the database. It proves the
routing, the entitlement logic and the data shapes - the parts that are
easy to get subtly wrong and impossible to debug once deployed.

## Why the session is the key

The entitlement is checked against the **Appwrite user id**, which Appwrite
derives from the session JWT. The client never sends a user id it could
have made up. A signed token is accepted as a fast path, but the database
record is the source of truth - so a client cannot upgrade its own plan by
editing a field, and a cancelled subscription loses access immediately.
