import { HttpAdapter, type RetryPolicy } from "./_http";
import { AuthError, IdentityNotPresent, NotConnected, fromResponse } from "./errors";
import { ConnectionsAPI } from "./connections";
import { IntegrationsAPI } from "./integrations";
import { BillingAPI } from "./billing";
import { WebhooksAPI } from "./webhooks";
import { connectUrl, type ConnectUrlOptions } from "./connect";
import { requireVendoMode } from "./_mode";

export interface VendoOptions {
  apiKey?: string;
  baseUrl?: string;
  apiVersion?: string;
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export class Vendo {
  apiKey: string;
  baseUrl: string;
  apiVersion: string;
  readonly _http: HttpAdapter;
  _userJwt?: string;

  readonly connections: ConnectionsAPI;
  readonly integrations: IntegrationsAPI;
  readonly billing: BillingAPI;
  readonly webhooks: WebhooksAPI;

  private _tokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(opts: VendoOptions = {}) {
    const env = (typeof process !== "undefined" ? process.env : {}) as Record<
      string,
      string | undefined
    >;
    this.apiKey = (opts.apiKey ?? env.VENDO_API_KEY ?? "").trim();
    if (!this.apiKey) {
      throw new AuthError(
        "VENDO_API_KEY not set — pass apiKey or set the env var.",
        { code: "app_unknown" },
      );
    }
    // Default has no `/api` suffix — every call site (integrations.ts,
    // connections.ts, billing.ts, VendoConnectionCard) prefixes its path
    // with `/api/`. A baseUrl of `https://vendo.run/api` would produce
    // `https://vendo.run/api/api/<path>`.
    //
    // `??` on opts.baseUrl so an explicit empty string survives — it's
    // the same-origin / proxy-friendly posture used behind `vendo dev`
    // and hermes-webui's /api/vendo/proxy. The env var, in contrast,
    // is `||`-coalesced — an empty `VENDO_BASE_URL` env value is treated
    // as unset, since shells commonly normalize unset to "".
    const envBaseUrl = env.VENDO_BASE_URL || undefined;
    this.baseUrl = opts.baseUrl ?? envBaseUrl ?? "https://vendo.run";
    this.apiVersion = opts.apiVersion ?? "2026-05-02";
    this._http = new HttpAdapter({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      retry: opts.retryPolicy,
      apiVersion: this.apiVersion,
      timeoutMs: opts.timeoutMs,
      fetch: opts.fetch,
    });

    this.connections = new ConnectionsAPI(this._http);
    this.integrations = new IntegrationsAPI(this._http);
    this.billing = new BillingAPI(this._http);
    this.webhooks = new WebhooksAPI();
  }

  forUser(userJwt: string): Vendo {
    const child = new Vendo({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      apiVersion: this.apiVersion,
      timeoutMs: this._http.timeoutMs,
      fetch: this._http.fetch,
    });
    child._userJwt = userJwt;
    // Rebuild the HTTP adapter and sub-APIs so they carry the JWT.
    (child as { _http: HttpAdapter })._http = new HttpAdapter({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      retry: this._http.retry,
      apiVersion: this.apiVersion,
      timeoutMs: this._http.timeoutMs,
      fetch: this._http.fetch,
      userJwt,
    });
    (child as { connections: ConnectionsAPI }).connections = new ConnectionsAPI(child._http);
    (child as { integrations: IntegrationsAPI }).integrations = new IntegrationsAPI(child._http);
    (child as { billing: BillingAPI }).billing = new BillingAPI(child._http);
    (child as { webhooks: WebhooksAPI }).webhooks = new WebhooksAPI();
    return child;
  }

  forRequest(headers: Headers | Record<string, string>): Vendo {
    requireVendoMode("forRequest");
    const jwt = readHeaderCaseInsensitive(headers, "X-Vendo-User-JWT");
    if (!jwt) {
      throw new IdentityNotPresent(
        "X-Vendo-User-JWT header missing. The Vendo proxy injects this header " +
        "when forwarding authenticated requests; ensure your app runs behind " +
        "the Vendo proxy with vendoAuth on.",
      );
    }
    return this.forUser(jwt);
  }

  connectUrl(slug: string, opts?: Omit<ConnectUrlOptions, "apiKey" | "baseUrl">): string {
    requireVendoMode("connectUrl");
    const root = this.baseUrl.replace(/\/api$/, "");
    return connectUrl(slug, { apiKey: this.apiKey, baseUrl: root, ...(opts ?? {}) });
  }

  private _credentialsBase(): string {
    return (typeof process !== "undefined" ? process.env.VENDO_CREDENTIALS_URL : undefined)
      ?? "https://credentials.vendo.run";
  }

  async token(slug: string): Promise<string> {
    const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;

    // Step 1: VENDO_TOKEN_<UPPER_SLUG> override wins in any mode.
    const overrideKey = "VENDO_TOKEN_" + slug.toUpperCase().replace(/-/g, "_");
    const override = (env[overrideKey] ?? "").trim();
    if (override) return override;

    // Step 2: Vendo mode — existing cache + fetch path.
    if ((env.VENDO_API_KEY ?? "").trim()) {
      const hit = this._tokenCache.get(slug);
      if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
      const url = `${this._credentialsBase().replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
      const res = await this._http.fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        let body: unknown = {};
        try { body = await res.json(); } catch { /* ignore */ }
        throw fromResponse({ status: res.status, headers: res.headers, body });
      }
      const data = await res.json() as { access_token: string; expires_at: string | null };
      const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 50 * 60_000;
      this._tokenCache.set(slug, { token: data.access_token, expiresAt });
      return data.access_token;
    }

    // Step 3 & 4: BYOK mode — read primary env var from bundled catalog.
    const { primaryEnvVar } = await import("./_byok");
    const envName = primaryEnvVar(slug);
    if (envName === null) {
      throw new NotConnected(
        `slug '${slug}' is not in the bundled byok catalog. ` +
        `If this is a custom integration, set ${overrideKey} to bypass; ` +
        `otherwise set VENDO_API_KEY to use Vendo mode.`,
        { code: "binding_missing", slug },
      );
    }
    const val = (env[envName] ?? "").trim();
    if (!val) {
      throw new NotConnected(
        `slug '${slug}' has no static token: set ${envName} (BYOK mode) ` +
        `or VENDO_API_KEY (Vendo mode).`,
        { code: "binding_missing", slug },
      );
    }
    return val;
  }

  async tokens(slugs: string[]): Promise<Record<string, string | null>> {
    const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
    const out: Record<string, string | null> = {};

    // Step 1: Per-slug VENDO_TOKEN_<SLUG> overrides win in any mode.
    const pending: string[] = [];
    for (const slug of slugs) {
      const overrideKey = "VENDO_TOKEN_" + slug.toUpperCase().replace(/-/g, "_");
      const v = (env[overrideKey] ?? "").trim();
      if (v) out[slug] = v;
      else pending.push(slug);
    }
    if (pending.length === 0) return out;

    // Step 2: Vendo mode — one bulk fetch for all pending slugs.
    if ((env.VENDO_API_KEY ?? "").trim()) {
      const url = `${this._credentialsBase().replace(/\/$/, "")}/_bulk?slugs=${pending.map(encodeURIComponent).join(",")}`;
      const res = await this._http.fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        let body: unknown = {};
        try { body = await res.json(); } catch { /* ignore */ }
        throw fromResponse({ status: res.status, headers: res.headers, body });
      }
      const body = await res.json() as { tokens: Record<string, { access_token: string; expires_at: string | null } | null> };
      for (const slug of pending) {
        const entry = body.tokens?.[slug] ?? null;
        if (entry === null) {
          out[slug] = null;
        } else {
          const expiresAt = entry.expires_at ? new Date(entry.expires_at).getTime() : Date.now() + 50 * 60_000;
          this._tokenCache.set(slug, { token: entry.access_token, expiresAt });
          out[slug] = entry.access_token;
        }
      }
      return out;
    }

    // Step 3: BYOK mode — read each pending slug's primary env var.
    const { primaryEnvVar } = await import("./_byok");
    for (const slug of pending) {
      const envName = primaryEnvVar(slug);
      if (envName === null) {
        out[slug] = null;
        continue;
      }
      const v = (env[envName] ?? "").trim();
      out[slug] = v || null;
    }
    return out;
  }

  invalidate(slug: string): void {
    this._tokenCache.delete(slug);
  }
}

function readHeaderCaseInsensitive(
  headers: Headers | Record<string, string>,
  name: string,
): string | null {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const v = headers.get(name);
    return v && v.trim() ? v.trim() : null;
  }
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name.toLowerCase()) {
      const s = String(v).trim();
      return s || null;
    }
  }
  return null;
}
