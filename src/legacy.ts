/**
 * @vendodev/sdk — fetch fresh OAuth credentials inside Vendo deployments.
 *
 * Reads VENDO_CREDENTIALS_URL and VENDO_DEPLOYMENT_TOKEN from the
 * environment, calls credentials.vendo.run/<provider>, caches the response
 * for ~60s in-memory, and returns the access token.
 *
 * Usage:
 *   import { getCredential } from "@vendodev/sdk";
 *   const { access_token } = await getCredential("google");
 *   await fetch("https://gmail.googleapis.com/...", {
 *     headers: { Authorization: `Bearer ${access_token}` },
 *   });
 */

export interface CredentialResponse {
  access_token: string;
  /** ISO timestamp; null when the provider's tokens don't expire (e.g. Notion). */
  expires_at: string | null;
  /** Always "Bearer" today; future-proof for upstream-token-type variation. */
  token_type: string;
}

export interface GetCredentialOptions {
  /** Override the credentials endpoint. Defaults to env.VENDO_CREDENTIALS_URL. */
  url?: string;
  /** Override the deployment token. Defaults to env.VENDO_DEPLOYMENT_TOKEN. */
  token?: string;
  /** Force-skip the in-memory cache. Default false. */
  noCache?: boolean;
  /** Inject a fetch implementation (Node < 18, tests). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

interface CacheEntry {
  value: CredentialResponse;
  expiresAtMs: number;
}

const CACHE_SKEW_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export class VendoSdkError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "VendoSdkError";
  }
}

function readEnv(): { url?: string; token?: string } {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return {
    url: env.VENDO_CREDENTIALS_URL,
    token: env.VENDO_DEPLOYMENT_TOKEN,
  };
}

/**
 * Fetch a fresh provider credential from credentials.vendo.run. Caches
 * the response in-memory for the duration of `expires_at` minus 60s skew.
 *
 * Throws {@link VendoSdkError} on auth, binding, or upstream failures.
 */
export async function getCredential(
  provider: string,
  opts: GetCredentialOptions = {},
): Promise<CredentialResponse> {
  if (!provider || typeof provider !== "string") {
    throw new VendoSdkError("getCredential: provider is required", "invalid_input");
  }

  const env = readEnv();
  const url = opts.url ?? env.url;
  const token = opts.token ?? env.token;
  if (!url) {
    throw new VendoSdkError(
      "VENDO_CREDENTIALS_URL is not set. The Vendo deploy worker injects this at deploy time.",
      "missing_url",
    );
  }
  if (!token) {
    throw new VendoSdkError(
      "VENDO_DEPLOYMENT_TOKEN is not set. The Vendo deploy worker injects this at deploy time.",
      "missing_token",
    );
  }

  if (!opts.noCache) {
    const hit = cache.get(provider);
    if (hit && hit.expiresAtMs > Date.now() + CACHE_SKEW_MS) {
      return hit.value;
    }
  }

  const fetchImpl = opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (!fetchImpl) {
    throw new VendoSdkError(
      "fetch is not available. Pass opts.fetch on Node < 18.",
      "fetch_unavailable",
    );
  }

  const res = await fetchImpl(`${url.replace(/\/$/, "")}/${encodeURIComponent(provider)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const code = res.headers.get("Vendo-Error-Code") ?? "unknown";
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.detail ?? body.error;
    } catch {
      // body not JSON — ignore
    }
    throw new VendoSdkError(
      `getCredential(${provider}) failed: ${code}${detail ? ` — ${detail}` : ""}`,
      code,
      res.status,
    );
  }

  const value = (await res.json()) as CredentialResponse;

  // Cache when we have an expiry. expires_at:null (Notion) means we cache
  // for a small fixed window — saves a round-trip if the same deployment
  // makes back-to-back calls.
  const expiresAtMs = value.expires_at
    ? new Date(value.expires_at).getTime()
    : Date.now() + CACHE_SKEW_MS;
  cache.set(provider, { value, expiresAtMs });
  return value;
}

/** Test/diagnostics: clear the in-memory cache. */
export function _clearCacheForTesting(): void {
  cache.clear();
}
