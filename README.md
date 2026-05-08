# @vendodev/sdk

[![CI](https://github.com/runvendo/vendo-sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/runvendo/vendo-sdk-js/actions/workflows/ci.yml)

The TypeScript SDK for Vendo deployments. Connections, credentials, billing, and a programmable connect-flow URL — all in one async-first API.

## Install

```bash
npm install @vendodev/sdk
```

## Quick start

```ts
import { Vendo } from "@vendodev/sdk";

const vendo = new Vendo();   // reads VENDO_API_KEY + VENDO_BASE_URL from env

const conns = await vendo.connections.list();
const token = await vendo.token("telegram");
const balance = await vendo.billing.balance();
```

Class options:

```ts
const vendo = new Vendo({
  apiKey: "vendo_sk_...",
  baseUrl: "https://vendo.run/api",
  apiVersion: "2026-05-02",
});

// SaaS multi-tenant — vendo on behalf of a logged-in user
const userVendo = vendo.forUser(userJwt);
```

## OSS mode (BYOK)

`@vendodev/sdk` works without a Vendo backend. Set the conventional env var for each integration and the SDK reads it directly:

```bash
# .env (no VENDO_API_KEY)
OPENAI_API_KEY=sk-...
TELEGRAM_BOT_TOKEN=12345:abcde
```

```ts
import { Vendo } from "@vendodev/sdk";
const vendo = new Vendo();
const tok = await vendo.token("openai");          // returns OPENAI_API_KEY value
const bot = await vendo.token("telegram");        // returns TELEGRAM_BOT_TOKEN value
```

Resolution order for `vendo.token(slug)`:
1. `VENDO_TOKEN_<UPPER_SLUG>` env var (escape hatch, always wins).
2. If `VENDO_API_KEY` is set, fetch a refreshed token from Vendo's credentials worker.
3. Else, read the slug's conventional env var (e.g. `openai` -> `OPENAI_API_KEY`).
4. Else, throw `NotConnected` with a hint about which env var to set.

Discover the env vars an integration accepts:

```ts
vendo.integrations.envVars("slack");  // ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET"]
import { isVendoMode } from "@vendodev/sdk";
isVendoMode();                        // false when VENDO_API_KEY is unset
```

OAuth integrations (Gmail, Notion, Slack) work in OSS mode too, but the SDK passes the static token through as-is. It will not refresh expired OAuth tokens. Use `VENDO_API_KEY` if you need automatic refresh.

Surfaces that genuinely require a Vendo backend (`billing`, `connectUrl`, `forRequest`) throw `VendoOnlyFeature` in OSS mode with a hint to set `VENDO_API_KEY`.

## Multi-tenant (SaaS)

Inside a request handler, scope a Vendo client to the logged-in user with one call:

```ts
import { Vendo } from "@vendodev/sdk";

app.get("/api/calendar", async (req, res) => {
  const client = new Vendo().forRequest(req.headers);
  const tok = await client.token("google");
  // ...
});
```

`forRequest` reads `X-Vendo-User-JWT` (case-insensitive) from any Headers-like mapping. Throws `IdentityNotPresent` if the header is missing, `VendoOnlyFeature` if `VENDO_API_KEY` is unset.

## Connect flows

```ts
import { connectUrl } from "@vendodev/sdk";

const url = connectUrl("telegram", {
  apiKey: vendo.apiKey,
  returnTo: "https://app.example.com/connected",
});
// open url in a popup; the connect portal posts a window message on completion
```

## Errors

```ts
import { Vendo, NotConnected, NeedsReauth } from "@vendodev/sdk";

try {
  await vendo.token("google");
} catch (e) {
  if (e instanceof NotConnected) {
    console.log("Connect first:", e.connectUrl);
  } else if (e instanceof NeedsReauth) {
    console.log("Re-authorize:", e.connectUrl);
  } else {
    throw e;
  }
}
```

## Reconciler (Node only)

```ts
import { reconciler } from "@vendodev/sdk";

await reconciler.start({
  envFile: "/app/.env",
  mapping: async () => ({
    TELEGRAM_BOT_TOKEN: (await vendo.connections.get("telegram"))?.credential?.bot_token as string,
    OPENAI_API_KEY: vendo.apiKey,
  }),
  onChange: "restart",
});
```

## Testing

```ts
import { MockClient, fakeConnection } from "@vendodev/sdk";

const mock = MockClient.withConnections([
  fakeConnection({ slug: "telegram", credential: { bot_token: "fake" } }),
]);
expect(await mock.token("telegram")).toBe("fake");
```

## Legacy `getCredential`

The earlier 0.0.x surface (`getCredential`, `VendoSdkError`) is still exported for backwards compatibility:

```ts
import { getCredential } from "@vendodev/sdk";
const { access_token } = await getCredential("notion");
```

Prefer the `Vendo` class for new code — it's cache-aware, retries, and supports the full surface.

## Browser / Web Components

For vanilla HTML pages (no React or framework required), the `@vendodev/sdk/browser` entry ships two custom elements that implement the same popup connect flow as `@vendodev/connect-portal`.

Bundle size: ~4.2 KB gzipped (zero framework dependencies).

### CDN usage

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/@vendodev/sdk/dist/browser/index.js"></script>
```

The elements register automatically on import. No `register()` call needed.

### `<vendo-connect-button>`

```html
<meta name="vendo-api-key" content="vendo_sk_..." />

<vendo-connect-button slug="telegram">
  Connect Telegram
</vendo-connect-button>

<script type="module">
  document.querySelector('vendo-connect-button')
    .addEventListener('vendo-connected', (e) => {
      console.log('Connected!', e.detail.connectionId);
    });
</script>
```

Attributes:
- `slug` (required) — integration to connect
- `api-key` (optional) — `vendo_sk_*` key; falls back to `<meta name="vendo-api-key">` then `window.Vendo.apiKey`
- `return-to` (optional) — URL to return to after connect; defaults to `window.location.href`
- `base-url` (optional) — defaults to `https://vendo.run`

Events:
- `vendo-connected` — `{ slug, connectionId }` — popup completed
- `vendo-cancelled` — user closed the popup
- `vendo-timeout` — popup timed out (default 5 min)
- `vendo-redirected` — `{ url }` — popup was blocked; page navigated instead
- `vendo-error` — `{ error }` — unexpected error

CSS custom properties: `--vendo-color-brand`, `--vendo-radius`.

### `<vendo-connection-card>`

```html
<vendo-connection-card
  slug="telegram"
  api-key="vendo_sk_..."
></vendo-connection-card>
```

Renders one of 6 states (`available`, `connecting`, `pending_setup`, `connected`, `needs_reauth`, `error`) and auto-updates via SSE.

Attributes:
- `slug`, `api-key`, `base-url` — same as above
- `manage-base-url` (optional) — dashboard origin override
- `compact` (boolean) — compact layout (~50 px tall)

Events: `vendo-connected` `{ connectionId }`, `vendo-disconnected` `{ connectionId }`.

CSS custom properties: `--vendo-color-brand`, `--vendo-color-border`, `--vendo-color-surface`, `--vendo-color-muted`, `--vendo-color-success`, `--vendo-color-warning`, `--vendo-color-error`, `--vendo-radius`.

### ESM import

```js
import { register, VendoConnectButton, VendoConnectionCard } from "@vendodev/sdk/browser";

// register() is already called as a side-effect of the import above.
// Call it explicitly only if you need to guard against double-registration in SSR-like environments.
register();
```

## License

MIT.
