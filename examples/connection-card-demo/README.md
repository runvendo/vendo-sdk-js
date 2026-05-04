# `<vendo-connection-card>` demo harness

A local-only sandbox for visually iterating on the SDK's web components against
real Vendo data. Used while triaging the cluster of `<vendo-connection-card>`
bugs surfacing in hermes-webui.

This harness is **not** published in the npm tarball — `package.json`'s `files`
field whitelists only `dist`, `README.md`, `LICENSE`.

## What it shows

- **Left column** — live `<vendo-connection-card>` for every slug returned by
  `Vendo.integrations.list()`, plus collapsible JSON panels showing the raw
  `integrations.list()` and `connections.list()` responses.
- **Right column** — a hand-copied static reference of the connect-portal card
  pattern (source: `web/src/components/connections/ConnectionsCatalog.tsx` in
  the vendo monorepo) so the visual delta is obvious side-by-side.
- **Probe row** — buttons that call each SDK method and dump the result, for
  reproducing bugs in isolation without paging through the full catalog.

## Prerequisites

- Node ≥ 18 (uses ESM + native `fetch`).
- The `vendo` CLI installed and on your `PATH` (`bin/vendo` from the vendo
  monorepo). Confirm with `vendo --help`.
- A deployment ID for an app you can issue keys for. The CLI's
  `--deployment <id>` flag mints a `vendo_sk_*` for it and writes it into
  `.env.vendo-dev`.

## Run loop (three terminals)

**Terminal 1 — SDK build watcher** (rebuilds `dist/` on every source change):

```sh
cd <vendo-sdk-js>
npm run build -- --watch
```

**Terminal 2 — demo server** (static files, port 3210):

```sh
cd <vendo-sdk-js>
node examples/connection-card-demo/server.mjs
```

The server reads `VENDO_API_KEY` from, in order:
1. `$VENDO_API_KEY` in your shell environment
2. `$VENDO_REPO_ROOT/.env.vendo-dev`
3. `~/Desktop/Cool Code/vendo/.env.vendo-dev`
4. `~/.vendo/.env.vendo-dev`

The first one that contains a non-empty `VENDO_API_KEY=…` wins.

**Terminal 3 — vendo dev front-door proxy** (port 8787):

```sh
bin/vendo dev --port 8787 --origin http://127.0.0.1:3210 \
    --deployment <deployment-id> --env
```

The `--env` flag writes `.env.vendo-dev` (the file the demo server reads from
in step 2). The `--deployment` flag stamps the deployment-scoped
`vendo_sk_*` key into that file.

Open `http://127.0.0.1:8787`. The header shows whether `VENDO_API_KEY` was
loaded — green pill = good, red pill = the env file lookup failed.

## Iteration

- Edit any file in `vendo-sdk-js/src/browser/` → tsup rebuilds `dist/` → refresh
  browser. No HMR; just refresh.
- Edit `index.html`, `styles.css`, or `server.mjs` → restart the demo server
  (`Ctrl-C` and re-run); the browser will need a refresh.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Header shows red `no VENDO_API_KEY` pill | `.env.vendo-dev` not found in any of the four locations above. Run `bin/vendo dev --env --deployment <id>` first to write it. |
| Cards render but JSON panels show 401s | Your `vendo_sk_*` is for a different app than the one being inspected. Confirm with `bin/vendo dev status`. |
| `dist/index.js not found. Did you run npm run build?` | The build watcher (terminal 1) hasn't produced `dist/` yet. Wait for the first build to finish, then refresh. |
| `EADDRINUSE :3210` | Another process owns the port. Either kill it (`lsof -ti:3210 \| xargs kill`) or set `PORT=<other> node …`. |
| `vendo dev` reports CSP / connect-src errors in the browser | The demo deliberately uses `baseUrl: ""` so all `/api/*` go same-origin via the proxy. If you've overridden it elsewhere, revert. |
| 502 from the demo server on `/api/*` | The demo server refuses to proxy. Always open `http://127.0.0.1:8787` (the `vendo dev` port), never `:3210` directly. |
