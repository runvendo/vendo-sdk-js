# Connection Card Demo Harness — Design

Date: 2026-05-03
Status: Approved (verbal)
Repo: `vendo-sdk-js`

## Problem

`<vendo-connection-card>` has multiple visible bugs in hermes-webui:

- Layout is far off from the connect-portal reference (`web/src/components/connections/ConnectionsCatalog.tsx`).
- `Vendo.integrations.list()` does not return all enabled integrations.
- `Vendo.connections.list()` returns nothing for deployments that should have surfaced rows.
- Logo never renders.
- Connect button does not transition to "Manage" after a successful connection.
- Likely more, surfaced once we can iterate visually.

We cannot triage these in hermes-webui alone — the rebuild loop is slow, the production CSP masks errors, and the bugs span both the SDK and the upstream Vendo API. We need an isolated preview of the SDK that hits real Vendo data.

## Goal

Stand up a minimal local harness that renders `<vendo-connection-card>` with real data via the existing `vendo dev` auth proxy, so each bug can be reproduced, observed, and fixed in isolation against the SDK source.

This spec is **harness-only**. Bug fixes are out of scope and tracked separately once the harness reveals the actual deltas.

## Non-Goals

- Redesigning the card visually.
- Changing any Vendo API endpoint shape.
- Replacing or modifying hermes-webui's integration of the SDK.
- Adding any production code path or new SDK feature.

## Approach

A new `examples/connection-card-demo/` directory in the SDK repo, served by a tiny Node script. The user runs it behind `vendo dev` so the demo gets the same identity + deployment-key posture as hermes-webui.

### Three-process run loop

1. `npm run build -- --watch` — tsup rebuilds `dist/browser/index.js` on every SDK source change.
2. `node examples/connection-card-demo/server.mjs` — static file server on `:3210`. Reads `VENDO_API_KEY` from `.env.vendo-dev` (looked up in `$VENDO_REPO_ROOT/.env.vendo-dev` then `$HOME/.vendo/.env.vendo-dev`, mirroring hermes-dev) and injects it into `index.html` via `<meta name="vendo-api-key">`.
3. `bin/vendo dev --port 8787 --origin http://127.0.0.1:3210 --deployment <id> --env` — the existing front-door proxy. Mints real cookie + `X-Vendo-*` headers and rewrites `/api/*` → `https://vendo.run/api/*`.

User opens `http://127.0.0.1:8787`. The demo gets:
- Real user identity via vendo dev cookie.
- Real deployment-scoped `vendo_sk_*` via the meta tag.
- Same-origin `/api/*` calls, no CSP issues.

### Demo page layout

Two columns plus a probe row:

- **Left**: live SDK output — one `<vendo-connection-card>` per slug from `Vendo.integrations.list()`. Below the cards, a collapsible JSON panel showing the raw `integrations.list()` and `connections.list()` responses, so the data the card receives is visible alongside how it renders.
- **Right**: visual reference — a static excerpt of `ConnectionsCatalog.tsx`'s card pattern (HTML/CSS copy, not imported), so the visual delta is obvious side-by-side.
- **Bottom (probe row)**: a slug dropdown plus buttons that fire each SDK method (`integrations.list`, `connections.list`, `billing.balance`, etc.) and dump the result. Lets us reproduce a specific bug in isolation without fishing through the full catalog render.

### Files

```
examples/connection-card-demo/
  README.md       # 3-terminal run instructions
  server.mjs      # ~80 lines, no dependencies beyond Node stdlib
  index.html      # cards + JSON panels + probe row
  styles.css      # demo-only, never shipped in dist
```

`server.mjs` is intentionally tiny:
- Serves the four files above.
- One templating step on `index.html` to inject the `vendo-api-key` meta value.
- Returns 404 on anything else; refuses to proxy API requests (those go through `vendo dev`).

## Decisions

- **Why not Vite?** No bundling needed — the demo loads the SDK as `<script type="module" src="/dist/browser/index.js">` directly. A static server is simpler and matches how third-party consumers actually use the SDK.
- **Why a meta tag for the API key, not a query param or input field?** Matches hermes-webui's pattern (`<meta name="vendo-api-key">`), so we test the real deployment posture. Query params and inputs would test a code path no production consumer uses.
- **Why two columns?** The "card layout is off" bug is the hardest to triage textually; a side-by-side visual is the fastest way to spot the delta.
- **Why phase 1 = harness only?** The "and more!" bugs are unknown until we can see the card live. Locking in fixes before observing is premature.

## Out of scope (phase 2 candidates)

- Visual redesign of `<vendo-connection-card>` to match the portal.
- Investigating `integrations.list` / `connections.list` response gaps.
- SSE plumbing for live status updates.
- Anything required to merge changes upstream — phase 1 is local-only.

## Acceptance

The harness is done when:

- Running the three commands above on a clean checkout produces a browser tab at `http://127.0.0.1:8787` showing at least one `<vendo-connection-card>` rendering against real Vendo data.
- The JSON panel shows non-empty responses from `integrations.list()` and `connections.list()` for a deployment that has bindings.
- Saving any file in `vendo-sdk-js/src/browser/` and refreshing the browser shows the change (via the build watcher).
- `README.md` documents the three-terminal flow and prerequisites.

What we *don't* require for harness acceptance: any of the bugs being fixed. Those are phase 2.
