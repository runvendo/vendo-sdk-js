import { HttpAdapter, type RetryPolicy } from "./_http";
import { AuthError } from "./errors";

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
    this.baseUrl = opts.baseUrl || env.VENDO_BASE_URL || "https://vendo.run/api";
    this.apiVersion = opts.apiVersion ?? "2026-05-02";
    this._http = new HttpAdapter({
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      retry: opts.retryPolicy,
      apiVersion: this.apiVersion,
      timeoutMs: opts.timeoutMs,
      fetch: opts.fetch,
    });
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
}
