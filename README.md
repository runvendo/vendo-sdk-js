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

## License

MIT.
