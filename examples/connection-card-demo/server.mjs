#!/usr/bin/env node
/**
 * Tiny static server for the SDK connection-card demo.
 *
 * - Serves index.html (with VENDO_API_KEY injected), styles.css, and the
 *   built SDK at /dist/browser/index.js.
 * - Reads VENDO_API_KEY from .env.vendo-dev — same lookup order as
 *   bin/hermes-dev: vendo monorepo root first, then $HOME/.vendo/.
 * - Refuses to proxy /api/*. Those go through `vendo dev` on :8787.
 *
 * Run behind the vendo dev proxy:
 *   node examples/connection-card-demo/server.mjs            # serves :3210
 *   bin/vendo dev --port 8787 --origin http://127.0.0.1:3210 \
 *       --deployment <id> --env
 */
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDK_ROOT = resolve(__dirname, "..", "..");
const PORT = Number(process.env.PORT) || 3210;

function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function resolveApiKey() {
  if (process.env.VENDO_API_KEY) return process.env.VENDO_API_KEY;
  // Mirror bin/hermes-dev lookup order. The vendo monorepo path differs by
  // user — we fall back to $HOME/.vendo/.env.vendo-dev which `vendo dev`
  // also writes to.
  const candidates = [
    process.env.VENDO_REPO_ROOT
      ? resolve(process.env.VENDO_REPO_ROOT, ".env.vendo-dev")
      : null,
    resolve(process.env.HOME || "", "Desktop/Cool Code/vendo/.env.vendo-dev"),
    resolve(process.env.HOME || "", ".vendo/.env.vendo-dev"),
  ].filter(Boolean);
  for (const path of candidates) {
    const env = loadEnvFile(path);
    if (env.VENDO_API_KEY) {
      console.log(`[demo] loaded VENDO_API_KEY from ${path}`);
      return env.VENDO_API_KEY;
    }
  }
  return "";
}

const VENDO_API_KEY = resolveApiKey();
if (!VENDO_API_KEY) {
  console.warn(
    "[demo] WARN: no VENDO_API_KEY found. Run `bin/vendo dev --env --deployment <id>` " +
      "first, or export VENDO_API_KEY in your shell.",
  );
}

const ROUTES = {
  "/": { file: "examples/connection-card-demo/index.html", type: "text/html; charset=utf-8", template: true },
  "/styles.css": { file: "examples/connection-card-demo/styles.css", type: "text/css; charset=utf-8" },
  "/dist/index.js": { file: "dist/index.js", type: "text/javascript; charset=utf-8" },
  "/dist/browser/index.js": { file: "dist/browser/index.js", type: "text/javascript; charset=utf-8" },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(
      "This demo does not proxy /api/*. Run `bin/vendo dev --port 8787 --origin http://127.0.0.1:3210 ...` and open http://127.0.0.1:8787 instead.\n",
    );
    return;
  }

  const route = ROUTES[url.pathname];
  if (!route) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found\n");
    return;
  }

  try {
    let body = await readFile(resolve(SDK_ROOT, route.file), "utf8");
    if (route.template) {
      body = body.replace(/\{\{VENDO_API_KEY\}\}/g, VENDO_API_KEY);
    }
    res.writeHead(200, { "content-type": route.type, "cache-control": "no-store" });
    res.end(body);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end(
        `${route.file} not found. Did you run \`npm run build\` in the SDK repo?\n`,
      );
      return;
    }
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(err) + "\n");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[demo] listening on http://127.0.0.1:${PORT}`);
  console.log(`[demo] front-door (run separately):`);
  console.log(
    `        bin/vendo dev --port 8787 --origin http://127.0.0.1:${PORT} --deployment <id> --env`,
  );
});
