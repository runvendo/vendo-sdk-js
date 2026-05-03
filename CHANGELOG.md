# Changelog

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
