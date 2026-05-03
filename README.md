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
