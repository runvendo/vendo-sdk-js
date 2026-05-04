import { HttpAdapter, type RetryPolicy } from "./_http";
import { AuthError, fromResponse } from "./errors";
import { ConnectionsAPI } from "./connections";
import { IntegrationsAPI } from "./integrations";
import { BillingAPI } from "./billing";
import { connectUrl, type ConnectUrlOptions } from "./connect";

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
    this.baseUrl = opts.baseUrl || env.VENDO_BASE_URL || "https://vendo.run";
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
  }

  forUser(userJwt: string): Vendo {
    const v = new Vendo({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      apiVersion: this.apiVersion,
      timeoutMs: this._http.timeoutMs,
      fetch: this._http.fetch,
    });
    v._userJwt = userJwt;
    return v;
  }

  connectUrl(slug: string, opts?: Omit<ConnectUrlOptions, "apiKey" | "baseUrl">): string {
    const root = this.baseUrl.replace(/\/api$/, "");
    return connectUrl(slug, { apiKey: this.apiKey, baseUrl: root, ...(opts ?? {}) });
  }

  private _credentialsBase(): string {
    return (typeof process !== "undefined" ? process.env.VENDO_CREDENTIALS_URL : undefined)
      ?? "https://credentials.vendo.run";
  }

  async token(slug: string): Promise<string> {
    const hit = this._tokenCache.get(slug);
    if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
    const url = `${this._credentialsBase().replace(/\/$/, "")}/${encodeURIComponent(slug)}`;
    const res = await this._http.fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      let body: unknown = {};
      try { body = await res.json(); } catch {}
      throw fromResponse({ status: res.status, headers: res.headers, body });
    }
    const data = await res.json() as { access_token: string; expires_at: string | null };
    const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 50 * 60_000;
    this._tokenCache.set(slug, { token: data.access_token, expiresAt });
    return data.access_token;
  }

  async tokens(slugs: string[]): Promise<Record<string, string | null>> {
    const url = `${this._credentialsBase().replace(/\/$/, "")}/_bulk?slugs=${slugs.map(encodeURIComponent).join(",")}`;
    const res = await this._http.fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) {
      let body: unknown = {};
      try { body = await res.json(); } catch {}
      throw fromResponse({ status: res.status, headers: res.headers, body });
    }
    const body = await res.json() as { tokens: Record<string, { access_token: string; expires_at: string | null } | null> };
    const out: Record<string, string | null> = {};
    for (const slug of slugs) {
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

  invalidate(slug: string): void {
    this._tokenCache.delete(slug);
  }
}
