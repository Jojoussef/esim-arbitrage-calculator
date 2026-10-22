# The tables

One database, two tables. Both are **server-only** — no table-level
permissions are granted, so the only way to read or write them is through
the function using its API key. The client never touches the database
directly; it goes through the function, which checks the entitlement
first.

## `subscribers`

One row per paying customer.

| Column | Type | Notes |
|---|---|---|
| `userId` | string(64) | The Appwrite user id. **Indexed, unique** — this is the key Stripe's metadata points at. |
| `plan` | string(16) | `free`, `pro` or `team`. |
| `status` | string(32) | `active`, `cancelled`, `past_due`, `incomplete`, `trialing`, `unpaid`. Only `active` grants access. |
| `stripeCustomerId` | string(64) | Indexed. Used by the customer portal and by `invoice.*` webhooks, which only know the customer. |
| `stripeSubscriptionId` | string(64) | The Stripe subscription. |
| `email` | string(128) | Optional, but it is how a buyer is reached about a failed payment. |
| `currentPeriodEnd` | datetime | When the current period ends, from Stripe. |

**Indexes:** `userId` (unique), `stripeCustomerId`.

## `watchlist`

The destinations a subscriber follows.

| Column | Type | Notes |
|---|---|---|
| `userId` | string(64) | Indexed. |
| `destination` | string(8) | The catalogue's ISO code, e.g. `JPN`. Stored upper-case. |

**Indexes:** a compound index on `userId` + `destination` (unique), so a
subscriber cannot follow the same destination twice.

## The `price_events` table

Not created by default. It is where the monthly refresh writes what
changed, so the alert feed can say "this moved" rather than "here is the
current state".

| Column | Type | Notes |
|---|---|---|
| `destination` | string(8) | Indexed. |
| `days` | integer | The plan duration. |
| `currency` | string(8) | The currency the price is in. |
| `old_price` | double | Before the refresh. |
| `new_price` | double | After the refresh. |
| `detected_at` | datetime | Indexed, so "changes since I last looked" is a cheap query. |
| `notified` | boolean | Whether the alert email has been sent. |
