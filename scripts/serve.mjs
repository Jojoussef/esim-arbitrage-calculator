#!/usr/bin/env node
/**
 * Tiny static preview server for dist/.
 *
 *   node scripts/serve.mjs [port]
 *
 * Zero dependencies - it exists so you can preview the exact published tree
 * locally, including the directory-index behaviour GitHub Pages uses.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const PORT = Number(process.argv[2] ?? 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

async function resolveFile(pathname) {
  const clean = decodeURIComponent(pathname.split("?")[0]);
  let target = join(DIST, clean);
  if (!target.startsWith(DIST)) return null; // path traversal guard

  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      target = join(target, "index.html");
      await stat(target);
    }
    return target;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url || "/");
  if (!file) {
    const notFound = join(DIST, "404.html");
    try {
      const body = await readFile(notFound);
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
    }
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end(String(error));
  }
});

server.listen(PORT, () => {
  console.log(`serving dist/ at http://localhost:${PORT}`);
  console.log("press ctrl-c to stop");
});
