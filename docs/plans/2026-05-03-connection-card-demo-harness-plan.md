# Connection Card Demo Harness — Implementation Plan

> Companion to: [2026-05-03-connection-card-demo-harness-design.md](./2026-05-03-connection-card-demo-harness-design.md)

**Goal:** Stand up a local-only example app (`vendo-sdk-js/examples/connection-card-demo/`) that renders `<vendo-connection-card>` against real Vendo data via the existing `vendo dev` proxy.

**Out of scope:** any bug fixes to the SDK or to Vendo APIs. Phase 1 is harness-only.

---

## Files to create

All under `vendo-sdk-js/examples/connection-card-demo/`:

| File | Responsibility |
|---|---|
| `server.mjs` | Static file server on `:3210`. Reads `VENDO_API_KEY` from `.env.vendo-dev` and injects it into `index.html`. Node stdlib only. |
| `index.html` | Demo page. Two columns + probe row. Loads SDK from `../../dist/browser/index.js`. |
| `styles.css` | Demo-only styling. Never shipped. |
| `README.md` | Three-terminal run instructions, prerequisites, troubleshooting. |

No SDK source files are modified.

## Tasks

### 1. Skeleton + static server

- Create the four files above with minimal stubs (server returns 200 for the four paths, 404 elsewhere).
- Server reads `.env.vendo-dev` from `$VENDO_REPO_ROOT/.env.vendo-dev` first, then `$HOME/.vendo/.env.vendo-dev` (mirroring `bin/hermes-dev`).
- Templating step: replace a single `{{VENDO_API_KEY}}` token in `index.html` on each request. No template engine, no deps.
- Verify: `node examples/connection-card-demo/server.mjs` starts on `:3210` and serves an empty page with the meta tag populated.

### 2. SDK boot + integrations render

- `index.html` loads `../../dist/browser/index.js` as a module, calls `Vendo.init({ baseUrl: '' })` (empty so all `/api/*` go same-origin).
- Iterate `Vendo.integrations.list()`; render one `<vendo-connection-card>` per slug into the **left column**.
- Below the cards, render a collapsible JSON panel showing the raw `integrations.list()` response and a separate panel for `connections.list()`.
- Verify: behind `vendo dev`, the page lists at least one card and the JSON panels are populated.

### 3. Reference column

- **Right column**: hand-copied static HTML/CSS approximating the connect-portal card pattern (from `web/src/components/connections/ConnectionsCatalog.tsx`). One representative card is enough — this is a visual reference, not a full reimplementation.
- Side-by-side layout via CSS grid in `styles.css`.
- Verify: visual delta between the live SDK card (left) and the reference card (right) is now obvious at a glance.

### 4. Probe row

- **Bottom**: a slug `<select>` populated from `integrations.list()`, plus four buttons:
  - `integrations.list()`
  - `connections.list()`
  - `billing.balance()`
  - `connections.get(<slug>)` — for the selected slug
- Each button writes its result into a single output `<pre>` below the row.
- Verify: clicking each button produces real JSON output. Errors render as red.

### 5. README + run loop

- `README.md` documents the three-terminal flow:
  1. `npm run build -- --watch`
  2. `node examples/connection-card-demo/server.mjs`
  3. `bin/vendo dev --port 8787 --origin http://127.0.0.1:3210 --deployment <id> --env`
- Include prerequisites: a `vendo_sk_*` key for some deployment, the `vendo` CLI installed.
- Include troubleshooting: empty `VENDO_API_KEY`, port collisions, stale `dist/` (forgot the build watcher).
- Verify: a fresh reader can follow the README and reach an interactive page.

### 6. Acceptance pass

- Run all three processes against a real deployment.
- Confirm acceptance bar from the design doc: at least one card renders, both JSON panels show real data, save-and-refresh shows SDK source changes, README is complete.
- Commit each task as it lands.

## Decisions locked in

- No bundler. Static files only.
- No deps in `server.mjs` beyond Node stdlib.
- API key flows via `<meta name="vendo-api-key">` (matches hermes-webui's posture).
- Reference column is hand-copied static HTML, not an import or iframe.
- The harness lives in the SDK repo. It is not published in the npm tarball (already excluded — `files` field whitelists only `dist`, `README.md`, `LICENSE`).
