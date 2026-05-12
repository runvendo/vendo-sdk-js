# Changelog

## v1.1.0 -- 2026-05-11

Adds frosted-glass theme variants to the `<vendo-connection-card>` web component to match the React `@vendodev/connect-portal@0.4.0` portal. Cards render as translucent surfaces over the host page background (rgba surface + `backdrop-filter: blur(16px) saturate(140%)`), so they pick up tint from whatever is behind them.

- **New `theme="glass-light"`** — translucent white card (45% alpha) + blur, for portals over light page backgrounds.
- **New `theme="glass-dark"`** — translucent near-black card (45% alpha) + blur, for portals over dark page backgrounds.
- **New `--vendo-card-backdrop-filter` CSS variable** drives the blur. Set to `none` on the three opaque themes so they skip the compositor cost. Hosts can override per-card via the standard CSS-variable channel.
- **No breaking changes.** Existing `default` / `beige` / `dark` themes render identically (same surface colour, same border, same skeleton shimmer). Bundle size unchanged.

## v1.0.1 -- 2026-05-11

Performance fix for browser web components. Before this release each `<vendo-connection-card>` made its own `GET /api/deployments/me/connections` and opened its own SSE stream on mount. With N enabled integrations the onboarding panel fired N redundant full-list fetches and N concurrent SSE streams to the same origin, which browsers serialized under per-origin connection limits — cards visibly loaded one-by-one over many seconds.

- **New `connectionsStore`** (`src/browser/connectionsStore.ts`). Process-wide singleton refcounted by `(baseUrl, apiKey)`. First subscriber kicks off one shared fetch + one SSE stream; the last unsubscribe tears them down. Subscribers are notified per slug.
- **`VendoConnectionCard` rewired** through the store. `_fetchState`/`_openSse` removed. No public-API change — `slug`, `api-key`, `base-url`, etc. behave identically.
- **`ConnectionsAPI.list()` in-flight dedupe**. Concurrent `list()` calls share one HTTP request. Collapses the SSE-event storms that `VendoProvider` (in `@vendodev/connect-portal`) triggers on every `connection.*` event.
- **No breaking changes.** Bundle size unchanged (browser entry stays at 24.9 KB).

## v1.0.0 -- 2026-05-08

First stable release. The SDK runs as plain OSS (BYOK env vars) or as a Vendo-deployed app (set `VENDO_API_KEY`). Same code, both modes. Mirrors the Python `vendo-sdk` v1.0.0 surface.

### Headline

- **OSS / BYOK mode** (`v0.5.0`). `vendo.token("openai")` reads `OPENAI_API_KEY` when `VENDO_API_KEY` is unset. Bundled env-var catalog at `dist/_data/byok.json`. 4-step resolution: `VENDO_TOKEN_<SLUG>` -> Vendo backend -> BYOK env var -> `NotConnected`.
- **Multi-tenant** (`v0.5.0`). `Vendo.forRequest(headers)` and `Vendo.forUser(jwt)` scope the client to a user. `X-Vendo-User-JWT` injected on every outbound call from the cloned client and its sub-APIs. `IdentityNotPresent` when the header is missing.
- **Webhooks** (`v0.5.1`). `vendo.webhooks.verify(headers, body)` HMAC-SHA256 verifier, replay protection, constant-time signature compare. Works in any mode.
- **Events** (`v0.5.2`). `vendo.events.subscribe()` returns an async iterable over `EventStreamMessage` from the Vendo SSE stream. Auto-reconnect with exponential backoff. Vendo-only.
- **Schema parity** (`v0.5.3`). `Connection.envBootstrap` surfaced from the Vendo wire format. Mirrors the Python `Connection.env_bootstrap` field.
- **Typed errors**: `VendoError`, `AuthError`, `NotConnected`, `NeedsReauth`, `BalanceExhausted`, `SpendCapExceeded`, `RateLimited`, `UpstreamError`, `ValidationError`, `IdempotencyConflict`, `VendoOnlyFeature`, `IdentityNotPresent`.
- **Helpers**: `isVendoMode()`, `vendo.integrations.envVars(slug)`.

### Vendo-only surfaces in OSS mode

These throw `VendoOnlyFeature` (clear, typed error) in OSS mode: `BillingAPI.balance/spendCaps/usage`, `connectUrl` (module + class), `EventsAPI.subscribe`, `Vendo.forRequest`. Set `VENDO_API_KEY` to enable.

### Backwards-compatibility breaks vs v0.4.1

- `Vendo.token(slug)` no longer throws `AuthError` when `VENDO_API_KEY` is unset. It falls back to BYOK env vars. Apps that relied on the old behavior must catch `NotConnected` (or set `VENDO_API_KEY`).
- `BillingAPI.balance/spendCaps/usage` throw `VendoOnlyFeature` in OSS mode (was: hit the network and 401).
- `Vendo.connectUrl` and module-level `connectUrl` throw `VendoOnlyFeature` in OSS mode.

### Legacy still supported

`getCredential()`, `CredentialResponse`, `VendoSdkError`, `_clearCacheForTesting` are still exported from `@vendodev/sdk` for backwards compatibility with the original `0.0.x` surface. Prefer the `Vendo` class.

### Browser bundle

`@vendodev/sdk/browser` (`<vendo-connect-button>`, `<vendo-connection-card>`, `openPopup`, `openSseStream`) unchanged. CSS custom properties frozen.

### Deferred to v1.x

- AI gateway helpers (`vendo.ai.*`).
- Logger / metrics shippers.

## v0.5.3 -- 2026-05-08

### Added
- `Connection.envBootstrap`: surfaced from the Vendo `/api/deployments/me/connections` payload. Shape: `{ vars: [{ name, valueFrom }], restart: "gateway" | "none" } | null`. Mirrors the Python `vendo-sdk` field. Used by reconciler-style apps that translate connection state into env vars.
- Exported types: `EnvBootstrap`, `EnvBootstrapVar`.

## v0.5.2 — 2026-05-08

### Added
- `EventsAPI`: server-side SSE consumer for the Vendo events stream. `vendo.events.subscribe(opts?)` returns an async iterable yielding typed `EventStreamMessage` objects (`type`, `data`, `id?`, `retry?`). Auto-reconnects on transient errors with exponential backoff (capped at 30s, configurable via `maxBackoffMs`). Pass `signal: AbortSignal` to stop the iteration. Throws `VendoOnlyFeature` synchronously in OSS mode.
- `Vendo.events` instance property exposing the same.

## v0.5.1 — 2026-05-08

### Added
- `WebhooksAPI`: HMAC-SHA256 verifier for inbound Vendo webhooks. `vendo.webhooks.verify(headers, body)` returns a typed `WebhookEvent` or throws `ValidationError`. Reads `VENDO_WEBHOOK_SECRET` from env (or pass `{ secret }` to the constructor). Replay protection: rejects timestamps more than 5 minutes off (`maxAgeSec` configurable).
- `Vendo.webhooks` instance property exposing the same.
- Works in OSS mode too: verification is local (no network call).

## v0.5.0 — 2026-05-08

### Added
- **OSS mode (BYOK)**: `vendo.token(slug)` now works without `VENDO_API_KEY`. When unset, the SDK reads conventional env vars from a bundled catalog (`OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, etc.). Same code runs locally as a plain OSS app and on Vendo. Mirrors Python `vendo-sdk` v0.9.0a2.
- `vendo.isVendoMode()`: returns `true` when `VENDO_API_KEY` is present.
- `vendo.errors.VendoOnlyFeature`: typed error raised when a Vendo-only surface is called in OSS mode.
- `vendo.errors.IdentityNotPresent`: typed error raised by `forRequest` when no `X-Vendo-User-JWT` header is present.
- `vendo.integrations.envVars(slug)`: returns the list of env vars an integration accepts in OSS mode (no network call).
- `Vendo.forRequest(headers)`: extracts `X-Vendo-User-JWT` from request headers (case-insensitive; supports `Headers` objects, plain dicts, framework headers) and returns a client scoped to that user. Throws `IdentityNotPresent` if the header is missing, `VendoOnlyFeature` in OSS mode.
- `VENDO_TOKEN_<SLUG>` env override: bypasses both Vendo mode and BYOK lookup for a single slug.
- Bundled `surface.yaml` (manifest_version 2, api_version 2026-05-07) and `byok.json` under `dist/_data/`.

### Fixed
- `Vendo.forUser(jwt)`: now actually injects `X-Vendo-User-JWT` on every outbound request from the cloned client. Previously the JWT was stored on the cloned instance but never sent (no-op bug since v0.1).

### Changed
- `Vendo.token(slug)` resolution order: `VENDO_TOKEN_<SLUG>` -> Vendo backend (if `VENDO_API_KEY` set) -> BYOK env var -> throw `NotConnected`. Previously: always called credentials.vendo.run; threw on missing key.
- `Vendo.tokens(slugs)`: same per-slug resolution; uses `/_bulk` only in Vendo mode and only for non-overridden slugs.
- `BillingAPI.balance/spendCaps/usage`: throw `VendoOnlyFeature` in OSS mode (was: hit the network and 401).
- `Vendo.connectUrl(slug, ...)` and module-level `connectUrl(slug, opts)`: throw `VendoOnlyFeature` in OSS mode.

### Migration notes
- Apps that relied on `Vendo()` throwing `AuthError` on missing `VENDO_API_KEY` need updating: missing key now means BYOK mode, and `NotConnected` fires only when the conventional env var is also missing.

## v0.1.0 — 2026-05-02 (alpha for v1.0)

### Added
- `Vendo` class — class-based async client with `apiKey` + `baseUrl` env fallback and `forUser(jwt)` for SaaS multi-tenant.
- `connections.list()` / `.get(slug)` — runtime connection state.
- `integrations.list()` / `.get(slug)` — public catalog accessor.
- `billing.balance()` / `.spendCaps()` / `.usage(period=)`.
- `connectUrl(slug, opts)` — OAuth popup URL builder.
- `reconciler.bootstrap()` / `.start()` — env-var-driven app state primitive (Node only; throws in browser).
- `MockClient` + `fakeConnection()` for tests.
- Internal `HttpAdapter` with `RetryPolicy` (3 attempts, exp backoff + jitter on 5xx + network) and auto-generated `Idempotency-Key` UUIDs.
- `Vendo-API-Version: 2026-05-02` header pinned per request.
- 9 typed error classes: `VendoError`, `AuthError`, `NotConnected`, `NeedsReauth`, `BalanceExhausted`, `SpendCapExceeded`, `RateLimited`, `UpstreamError`, `ValidationError`, `IdempotencyConflict`.

### Changed
- Existing minimal surface (`getCredential`, `CredentialResponse`, `VendoSdkError`, `_clearCacheForTesting`) kept as backwards-compatible re-exports from `./legacy`.

## v0.0.x

- Initial `getCredential()` helper.
