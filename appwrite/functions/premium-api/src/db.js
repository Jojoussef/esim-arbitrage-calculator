/**
 * The Appwrite database access.
 *
 * Why this is hand-rolled rather than the SDK's TablesDB class:
 *
 * The SDK sends an `X-Appwrite-Response-Format` header and parses the
 * response with JSONbig. Inside the Appwrite Function runtime, that
 * combination returns an EMPTY body, and JSONbig.parse("") throws
 * "Unexpected end of JSON input" - an error that says nothing about what
 * is actually wrong.
 *
 * A plain fetch with the same headers works perfectly from inside the
 * function, so the two calls this function needs (list and write) are
 * implemented directly. The result is fewer moving parts, no SDK
 * dependency for the database, and errors that say what happened.
 */

/** The Appwrite REST endpoints for a table. */
function tableUrl(databaseId, tableId, rowId) {
  const base = `/tablesdb/${databaseId}/tables/${tableId}/rows`;
  return rowId ? `${base}/${rowId}` : base;
}

/**
 * Make an authenticated call to the Appwrite API.
 */
async function apiCall(path, { method = "GET", key, project, body, query } = {}) {
  const url = new URL(`${process.env.APPWRITE_FUNCTION_API_ENDPOINT}${path}`);

  for (const [name, value] of Object.entries(query ?? {})) {
    // Appwrite reads repeated query parameters, so an array is joined into
    // the `name[]` form it expects.
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(`${name}[]`, item);
      }
    } else {
      url.searchParams.append(name, value);
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      "X-Appwrite-Project": project,
      "X-Appwrite-Key": key,
      accept: "application/json",
      // Without this, fetch sends a string body as text/plain, Appwrite
      // cannot parse it, and a write fails with "The row data is missing".
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();

  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text)?.message ?? text;
    } catch {
      /* keep the raw text */
    }
    throw new Error(`Appwrite ${method} ${path} failed (${response.status}): ${message}`);
  }

  if (!text) return {};
  return JSON.parse(text);
}

/**
 * A tiny TablesDB-shaped client, backed by plain REST calls.
 *
 * It exposes only the four operations the function uses, with the same
 * names and shapes as the SDK, so the rest of the code does not change.
 */
export function createTables(key, project) {
  const databaseId = () => process.env.SUBSCRIBERS_DATABASE_ID;

  return {
    async listRows({ tableId, queries }) {
      const parsed = (queries ?? []).map((query) =>
        typeof query === "string" ? JSON.parse(query) : query
      );

      // The Appwrite query language is richer than this, but the function
      // only ever needs equality plus a limit, and both are expressed
      // directly here.
      const filters = parsed.filter((q) => q.method === "equal");
      const limit = parsed.find((q) => q.method === "limit");

      const result = await apiCall(tableUrl(databaseId(), tableId), {
        method: "GET",
        key,
        project,
        query: {
          queries: filters.map((f) =>
            JSON.stringify({
              method: "equal",
              attribute: f.attribute,
              values: f.values,
            })
          ),
          ...(limit ? { limit: limit.values[0] } : {}),
        },
      });

      let rows = result.rows ?? [];

      // The equality filters are applied again locally, so the result is
      // correct even if the server's query handling differs.
      for (const filter of filters) {
        rows = rows.filter((row) => filter.values.includes(row[filter.attribute]));
      }
      if (limit) rows = rows.slice(0, limit.values[0]);

      return { rows, total: result.total ?? rows.length };
    },

    async createRow({ tableId, rowId, data }) {
      // The row id goes in the BODY, not in the path. Appwrite's
      // create-row route is POST /rows, and a row id in the path is a
      // 404.
      return apiCall(tableUrl(databaseId(), tableId), {
        method: "POST",
        key,
        project,
        body: { rowId, data },
      });
    },

    async updateRow({ tableId, rowId, data }) {
      return apiCall(tableUrl(databaseId(), tableId, rowId), {
        method: "PATCH",
        key,
        project,
        body: { data },
      });
    },

    async deleteRow({ tableId, rowId }) {
      return apiCall(tableUrl(databaseId(), tableId, rowId), {
        method: "DELETE",
        key,
        project,
      });
    },
  };
}
