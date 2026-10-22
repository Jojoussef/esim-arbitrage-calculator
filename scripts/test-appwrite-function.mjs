#!/usr/bin/env node
/**
 * Test the Appwrite Function locally, without deploying it.
 *
 *   node scripts/test-appwrite-function.mjs
 *
 * The function is loaded exactly as Appwrite would load it, and the
 * requests are driven through a fake `req`/`res` pair. The Appwrite
 * database is stubbed, so this proves the ROUTING, the ENTITLEMENT LOGIC
 * and the DATA SHAPES - the parts that are easy to get subtly wrong and
 * impossible to debug once deployed.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FN = resolve(ROOT, "appwrite/functions/premium-api/src");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------- the fake Appwrite -- */

/** A fake TablesDB that holds rows in memory. */
const rows = {
  subscribers: [
    {
      $id: "sub_row_1",
      userId: "user_active",
      plan: "pro",
      status: "active",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      email: "pro@example.com",
      currentPeriodEnd: "2026-11-01T00:00:00.000Z",
    },
    {
      $id: "sub_row_2",
      userId: "user_cancelled",
      plan: "pro",
      status: "cancelled",
      stripeCustomerId: "cus_456",
      stripeSubscriptionId: "sub_456",
      email: "cancelled@example.com",
      currentPeriodEnd: null,
    },
    {
      $id: "sub_row_3",
      userId: "user_free",
      plan: "free",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      email: "free@example.com",
      currentPeriodEnd: null,
    },
  ],
  watchlist: [
    { $id: "w1", userId: "user_active", destination: "JPN" },
    { $id: "w2", userId: "user_active", destination: "ESP" },
  ],
};

/** The fake TablesDB. Mirrors the real SDK's method names. */
const fakeTables = {
  async listRows({ tableId, queries }) {
    const table = rows[tableId] ?? [];
    let result = [...table];

    for (const q of queries ?? []) {
      // The queries are plain objects, matching what the function sends.
      const parsed = typeof q === "string" ? JSON.parse(q) : q;

      if (parsed.method === "equal") {
        const { attribute, values } = parsed;
        result = result.filter((row) => values.includes(row[attribute]));
      } else if (parsed.method === "limit") {
        result = result.slice(0, parsed.values[0]);
      } else if (parsed.method === "offset") {
        result = result.slice(parsed.values[0]);
      }
    }
    return { rows: result, total: result.length };
  },
  async createRow({ tableId, rowId, data }) {
    const row = { $id: rowId, ...data };
    (rows[tableId] ??= []).push(row);
    return row;
  },
  async updateRow({ tableId, rowId, data }) {
    const table = rows[tableId] ?? [];
    const index = table.findIndex((r) => r.$id === rowId);
    if (index >= 0) table[index] = { ...table[index], ...data };
    return table[index];
  },
  async deleteRow({ tableId, rowId }) {
    const table = rows[tableId] ?? [];
    const index = table.findIndex((r) => r.$id === rowId);
    if (index >= 0) table.splice(index, 1);
    return {};
  },
};

/* ------------------------------------------------------------- the fake req/res -- */

/** Build a fake Appwrite request. */
function makeReq({
  method = "GET",
  path = "/",
  user = null,
  body = {},
  query = {},
  headers = {},
} = {}) {
  const allHeaders = { "content-type": "application/json", ...headers };
  if (user) allHeaders["x-appwrite-user-id"] = user;
  const hasBody = Object.keys(body).length > 0;

  return {
    method,
    path,
    headers: allHeaders,
    query,
    bodyJson: hasBody ? body : undefined,
    bodyText: hasBody ? JSON.stringify(body) : undefined,
  };
}

/** Build a fake Appwrite response that records what was sent. */
function makeRes() {
  const captured = { status: 200, body: null, headers: {} };
  return {
    captured,
    json(payload, status = 200) {
      captured.status = status;
      captured.body = payload;
      return payload;
    },
    text(payload, status = 200, headers = {}) {
      captured.status = status;
      captured.body = payload;
      captured.headers = headers;
      return payload;
    },
  };
}

/** Call the function and return the captured response. */
async function call(req) {
  const res = makeRes();
  await handler({
    req,
    res,
    log: () => {},
    error: () => {},
  });
  return res.captured;
}

/* ------------------------------------------------------------------- run -- */

// The function reads its configuration from the environment.
process.env.APPWRITE_FUNCTION_PROJECT_ID = "test-project";
process.env.APPWRITE_FUNCTION_API_ENDPOINT = "https://cloud.appwrite.io/v1";
process.env.ENTITLEMENT_SECRET = "test-entitlement-secret";
process.env.SUBSCRIBERS_DATABASE_ID = "subscribers";
process.env.SUBSCRIBERS_TABLE_ID = "subscribers";
process.env.WATCHLIST_TABLE_ID = "watchlist";
process.env.PUBLIC_SITE_URL = "https://youssef-benatti.me";
process.env.STRIPE_PRICE_PRO = "price_pro_test";
process.env.STRIPE_PRICE_TEAM = "price_team_test";
// Inject the fake database so the function can be tested without a project.
// It is a global rather than an env var because Node coerces every
// `process.env` value to a string.
globalThis.__APPWRITE_TEST_TABLES = fakeTables;

const { default: handler } = await import(`${FN}/main.js?test=${Date.now()}`);

console.log("APPWRITE FUNCTION TESTS\n");

// ---- routing ----
{
  const out = await call(makeReq({ path: "/nope" }));
  check("an unknown route returns 404", out.status === 404);
  check("an unknown route says not_found", out.body?.error === "not_found");
}

// ---- a GET request has no body, and the runtime's bodyJson getter throws ----
// The Appwrite runtime exposes `bodyJson` as a lazy getter that runs
// JSON.parse on the raw body. A GET request has an empty body, so the
// getter throws "Unexpected end of JSON input". Reading it unguarded took
// down every GET route, so this is the regression test for that.
{
  const req = makeReq({ path: "/entitlement", user: "user_active" });
  Object.defineProperty(req, "bodyJson", {
    get() {
      throw new SyntaxError("Unexpected end of JSON input");
    },
    enumerable: true,
  });

  const out = await call(req);
  check(
    "a GET request survives the runtime's throwing bodyJson getter",
    out.status === 200,
    out.body?.error
  );
  check(
    "the entitlement is still served for that request",
    out.body?.active === true,
    JSON.stringify(out.body)
  );
}

// ---- the body is read from the raw text when the getter is unusable ----
{
  const req = makeReq({
    method: "POST",
    path: "/watch",
    user: "user_active",
    body: { destination: "PER" },
  });
  const out = await call(req);
  check("a POST body is still read", out.body?.ok === true, JSON.stringify(out.body));
  check(
    "the POST body reached the handler",
    out.body?.destination === "PER",
    JSON.stringify(out.body)
  );
}

// ---- entitlement: no session ----
{
  const out = await call(makeReq({ path: "/entitlement" }));
  check("no session is refused", out.body?.active === false);
  check(
    "no session is refused with no-session",
    out.body?.reason === "no-session",
    out.body?.reason
  );
}

// ---- entitlement: an active subscriber ----
{
  const out = await call(makeReq({ path: "/entitlement", user: "user_active" }));
  check("an active subscriber is active", out.body?.active === true);
  check("the plan is read back", out.body?.plan === "pro");
  check(
    "the features are listed",
    Array.isArray(out.body?.features) && out.body.features.includes("data_export")
  );
  check(
    "the customer portal is offered",
    out.body?.customerPortalAvailable === true
  );
}

// ---- entitlement: a cancelled subscriber ----
{
  const out = await call(makeReq({ path: "/entitlement", user: "user_cancelled" }));
  check("a cancelled subscriber is not active", out.body?.active === false);
  check(
    "a cancelled subscriber is refused as cancelled",
    out.body?.reason === "cancelled",
    out.body?.reason
  );
}

// ---- entitlement: a free-tier user ----
{
  const out = await call(makeReq({ path: "/entitlement", user: "user_free" }));
  check("a free-tier user is active", out.body?.active === true);
  check("a free-tier user is on the free plan", out.body?.plan === "free");
  check(
    "a free-tier user gets no paid features",
    (out.body?.features ?? []).length === 0
  );
}

// ---- the premium export ----
{
  const out = await call(
    makeReq({ path: "/export", user: "user_active", query: { destinations: "JPN" } })
  );
  check("the export is served", out.status === 200);
  check("the export has rows", (out.body?.rows?.length ?? 0) > 0);
  check(
    "the export is filtered to the requested destination",
    out.body?.rows?.every((r) => r.iso === "JPN")
  );
  check(
    "the export reports the filtered total",
    (out.body?.totalRows ?? 0) >= (out.body?.rowCount ?? 0)
  );
  check(
    "the export rows are flat (one price per row)",
    typeof out.body?.rows?.[0]?.price === "number" &&
      out.body?.rows?.[0]?.prices === undefined
  );
}

// ---- the export is paginated, so one response is never the whole table ----
// The full table is 136,000 rows / 42 MB, which is what made the route
// time out at the edge cache. The export therefore returns one page and
// says where the next one starts.
{
  const first = await call(
    makeReq({
      path: "/export",
      user: "user_active",
      query: { limit: "10", offset: "0" },
    })
  );
  check("the export returns a page", first.status === 200);
  check("the page holds the requested number of rows", first.body?.rowCount === 10);
  check("the page is the requested slice", first.body?.offset === 0);
  check(
    "the export says there is more to come",
    first.body?.hasMore === true && typeof first.body?.nextOffset === "number"
  );
  check(
    "the export reports the full row count",
    (first.body?.totalRows ?? 0) > 100000
  );

  const second = await call(
    makeReq({
      path: "/export",
      user: "user_active",
      query: { limit: "10", offset: "10" },
    })
  );
  check("the next page is served", second.status === 200);
  check("the next page starts where the first ended", second.body?.offset === 10);
  check(
    "the next page has different rows",
    second.body?.rows?.[0]?.iso !== first.body?.rows?.[0]?.iso ||
      second.body?.rows?.[0]?.days !== first.body?.rows?.[0]?.days ||
      second.body?.rows?.[0]?.currency !== first.body?.rows?.[0]?.currency
  );

  const capped = await call(
    makeReq({
      path: "/export",
      user: "user_active",
      query: { limit: "99999999" },
    })
  );
  check(
    "the page size is capped",
    capped.body?.limit === 20000 && capped.body?.rowCount <= 20000
  );
}

// ---- the export as CSV ----
{
  const out = await call(
    makeReq({
      path: "/export",
      user: "user_active",
      query: { format: "csv", destinations: "JPN" },
    })
  );
  check("the CSV export is served", out.status === 200);
  check(
    "the CSV has a header row",
    String(out.body).split("\n")[0].includes("iso")
  );
  check(
    "the CSV sets a download filename",
    (out.headers?.["Content-Disposition"] ?? "").includes(".csv")
  );
}

// ---- the export for a non-subscriber ----
{
  const out = await call(makeReq({ path: "/export", user: "user_cancelled" }));
  check("a cancelled subscriber gets 403", out.status === 403);
  check(
    "a cancelled subscriber gets subscription_required",
    out.body?.error === "subscription_required"
  );
}

// ---- the export for a free-tier user ----
{
  const out = await call(makeReq({ path: "/export", user: "user_free" }));
  check("a free-tier user gets 403 on the export", out.status === 403);
  check(
    "a free-tier user is told to upgrade",
    out.body?.error === "upgrade_required",
    out.body?.error
  );
}

// ---- the pricing-error feed ----
{
  const out = await call(makeReq({ path: "/errors", user: "user_active" }));
  check("the error feed is served", out.status === 200);
  check("the error feed has inversions", (out.body?.inversions?.length ?? 0) > 0);
  check(
    "the error feed totals the overpay",
    (out.body?.totalOverpay ?? 0) > 0
  );
}

// ---- the watchlist ----
{
  const out = await call(makeReq({ path: "/alerts", user: "user_active" }));
  check("the watchlist is served", out.status === 200);
  check(
    "the watchlist has the destinations",
    (out.body?.destinations ?? []).includes("JPN")
  );
  check(
    "the watchlist is priced per destination",
    out.body?.watched?.every((w) => "best" in w)
  );
}

// ---- adding to the watchlist ----
{
  const before = rows.watchlist.length;
  const out = await call(
    makeReq({
      method: "POST",
      path: "/watch",
      user: "user_active",
      body: { destination: "cze" },
    })
  );
  check("adding to the watchlist works", out.body?.ok === true);
  check(
    "the destination is upper-cased",
    out.body?.destination === "CZE",
    out.body?.destination
  );
  check("the row was created", rows.watchlist.length === before + 1);
}

// ---- removing from the watchlist ----
{
  const before = rows.watchlist.length;
  const out = await call(
    makeReq({
      method: "POST",
      path: "/watch",
      user: "user_active",
      body: { destination: "CZE", action: "remove" },
    })
  );
  check("removing from the watchlist works", out.body?.ok === true);
  check("the row was removed", rows.watchlist.length === before - 1);
}

// ---- a token claiming a higher plan cannot upgrade the record ----
{
  const { signEntitlement } = await import(`${FN}/entitlement.js`);
  const token = signEntitlement(
    "team",
    Date.now() + 86_400_000,
    "test-entitlement-secret",
    "user_active"
  );

  const out = await call(
    makeReq({
      path: "/export",
      user: "user_active",
      headers: { "x-esim-entitlement": token },
    })
  );
  check(
    "a token claiming a higher plan cannot upgrade the record",
    out.status === 200 && out.body?.plan !== "team"
  );
}

// ---- the real database client, against a stub Appwrite API ----
// The fake table above cannot catch a WRONG URL or a missing
// Content-Type, because it never makes an HTTP call. Those two bugs
// (a row id in the create path, and a body sent as text/plain) only
// showed up once the function was deployed, so the real client is
// exercised here against a local stub server.
{
  const { createTables } = await import(`${FN}/db.js?test=${Date.now()}`);
  const http = await import("node:http");

  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      seen.push({
        method: req.method,
        url: req.url,
        contentType: req.headers["content-type"] ?? null,
        body: raw,
      });

      if (req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ total: 1, rows: [{ $id: "r1", userId: "u1" }] }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ $id: "created" }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  process.env.APPWRITE_FUNCTION_API_ENDPOINT = `http://127.0.0.1:${port}/v1`;
  process.env.SUBSCRIBERS_DATABASE_ID = "db1";

  const tables = createTables("key1", "project1");

  await tables.listRows({
    tableId: "subscribers",
    queries: [
      { method: "equal", attribute: "userId", values: ["u1"] },
      { method: "limit", values: [1] },
    ],
  });
  const list = seen.at(-1);
  check("listRows asks for the rows collection", list.url.startsWith("/v1/tablesdb/db1/tables/subscribers/rows"));
  check(
    "listRows sends the filter as a query",
    decodeURIComponent(list.url).includes("queries[]=")
  );
  check("listRows sends the limit as a query", list.url.includes("limit=1"));

  await tables.createRow({ tableId: "watchlist", rowId: "row_1", data: { userId: "u1" } });
  const create = seen.at(-1);
  check("createRow posts to the rows collection", create.url === "/v1/tablesdb/db1/tables/watchlist/rows");
  check("createRow does not put the row id in the path", !create.url.includes("row_1"));
  check("createRow sends the row id in the body", create.body.includes('"rowId":"row_1"'));
  check("createRow sends the data in the body", create.body.includes('"data"'));
  check(
    "createRow sends a JSON content type",
    (create.contentType ?? "").includes("application/json"),
    create.contentType
  );

  await tables.updateRow({ tableId: "watchlist", rowId: "row_1", data: { userId: "u2" } });
  const update = seen.at(-1);
  check("updateRow patches the row", update.method === "PATCH");
  check("updateRow targets the row by id", update.url.endsWith("/rows/row_1"));
  check("updateRow sends the data in the body", update.body.includes('"data"'));

  await tables.deleteRow({ tableId: "watchlist", rowId: "row_1" });
  const remove = seen.at(-1);
  check("deleteRow deletes the row", remove.method === "DELETE");
  check("deleteRow targets the row by id", remove.url.endsWith("/rows/row_1"));

  server.close();
  delete process.env.APPWRITE_FUNCTION_API_ENDPOINT;
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
