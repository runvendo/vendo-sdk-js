# Changelog

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
