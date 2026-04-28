# `@vendodev/sdk`

[![CI](https://github.com/runvendo/vendo-sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/runvendo/vendo-sdk-js/actions/workflows/ci.yml)

The lightweight JavaScript / TypeScript SDK for Vendo deployments. Fetches OAuth credentials from `credentials.vendo.run` so your tool can call Notion (and future connected providers) without managing tokens.

## Install

```bash
npm install @vendodev/sdk
```

## Use

Inside a Vendo deployment, the deploy worker injects two env vars:

- `VENDO_CREDENTIALS_URL` — the Vendo credentials endpoint (`https://credentials.vendo.run`)
- `VENDO_DEPLOYMENT_TOKEN` — the deployment's `vendo_sk_*` proxy key

Then:

```ts
import { getCredential } from "@vendodev/sdk";

const { access_token } = await getCredential("notion");

const res = await fetch("https://api.notion.com/v1/databases/<id>/query", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${access_token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ /* query */ }),
});
```

## API

### `getCredential(provider, options?)`

Returns a `Promise<CredentialResponse>` shaped:

```ts
{
  access_token: string;
  expires_at: string | null;   // ISO; null when the provider's tokens don't expire
  token_type: string;          // "Bearer" today
}
```

Caches for 60s in-memory. Throws `VendoSdkError` on auth/binding/upstream failure — inspect `err.code` for the [stable error code](https://docs.vendo.run/errors).

#### Options

- `url`: override `VENDO_CREDENTIALS_URL`
- `token`: override `VENDO_DEPLOYMENT_TOKEN`
- `noCache`: skip the in-memory cache for this call
- `fetch`: inject a fetch implementation (Node < 18 / tests)

## Supported providers

- **Notion** — `getCredential("notion")` returns a workspace bot token. Tokens don't expire; no refresh dance.

More coming. The credentials endpoint is profile-aware — once a provider is added to the Vendo catalog with an OAuth client, the SDK works against it without an SDK change.

## Errors

```ts
import { VendoSdkError } from "@vendodev/sdk";

try {
  const cred = await getCredential("notion");
  // ...
} catch (e) {
  if (e instanceof VendoSdkError) {
    if (e.code === "binding_missing") {
      // Direct the user to /connections/connect/notion in their Vendo dashboard
    }
    if (e.code === "connection_needs_reauth") {
      // Connection expired or upstream revoked it; user reconnects
    }
  }
}
```

| Code | When | What to do |
|---|---|---|
| `app_unknown` | Bearer token unknown to Vendo | Re-deploy or contact support |
| `app_revoked` | Token revoked | Re-deploy |
| `binding_missing` | User hasn't connected this provider | Send to Connect Portal |
| `connection_needs_reauth` | Connection expired or revoked upstream | User reconnects |
| `connection_revoked` | Connection deleted | User reconnects |
| `upstream_error` | Provider 5xx | Retry |

## License

MIT © Vendo
