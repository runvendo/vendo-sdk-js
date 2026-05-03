import { fromResponse, VendoError } from "./errors";

export interface RetryPolicy {
  maxAttempts: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  retryableStatusCodes: ReadonlySet<number>;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  backoffBaseMs: 500,
  backoffMaxMs: 10_000,
  retryableStatusCodes: new Set([500, 502, 503, 504]),
};

export interface HttpAdapterOptions {
  apiKey: string;
  baseUrl: string;
  retry?: RetryPolicy;
  apiVersion?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  userAgent?: string;
}

export interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  timeoutMs?: number;
  extraHeaders?: Record<string, string>;
}

const API_VERSION = "2026-05-02";
const USER_AGENT = "@vendodev/sdk/0.1.0";

export class HttpAdapter {
  apiKey: string;
  baseUrl: string;
  retry: RetryPolicy;
  apiVersion: string;
  timeoutMs: number;
  fetch: typeof fetch;
  userAgent: string;

  constructor(opts: HttpAdapterOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.retry = opts.retry ?? DEFAULT_RETRY;
    this.apiVersion = opts.apiVersion ?? API_VERSION;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.userAgent = opts.userAgent ?? USER_AGENT;
    const f = opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch;
    if (!f) throw new VendoError("fetch is not available", { code: "internal_error" });
    this.fetch = f;
  }

  get<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this._request<T>("GET", path, opts);
  }

  post<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this._writeRequest<T>("POST", path, opts);
  }

  put<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this._writeRequest<T>("PUT", path, opts);
  }

  delete<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this._writeRequest<T>("DELETE", path, opts);
  }

  private _writeRequest<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    const idem = opts.idempotencyKey ?? this._uuid();
    return this._request<T>(method, path, {
      ...opts,
      extraHeaders: { ...(opts.extraHeaders ?? {}), "Idempotency-Key": idem },
    });
  }

  private _uuid(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private async _request<T>(method: string, path: string, opts: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}/${path.replace(/^\//, "")}`;
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "Vendo-API-Version": this.apiVersion,
      ...(opts.extraHeaders ?? {}),
    };
    if (opts.body !== undefined && opts.body !== null) {
      headers["Content-Type"] = "application/json";
    }

    let lastErr: VendoError | null = null;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await this.fetch(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(opts.timeoutMs ?? this.timeoutMs),
        });
      } catch (e) {
        lastErr = new VendoError(`network error: ${(e as Error).message}`, {
          code: "upstream_error",
        });
        if (attempt >= this.retry.maxAttempts) throw lastErr;
        await this._backoff(attempt);
        continue;
      }

      if (res.status >= 200 && res.status < 300) {
        const text = await res.text();
        return (text ? (JSON.parse(text) as T) : ({} as T));
      }

      let body: unknown = {};
      try {
        body = await res.json();
      } catch {
        // non-JSON error body — ignore
      }

      const err = fromResponse({ status: res.status, headers: res.headers, body });
      if (this.retry.retryableStatusCodes.has(res.status) && attempt < this.retry.maxAttempts) {
        lastErr = err;
        await this._backoff(attempt);
        continue;
      }
      throw err;
    }

    if (lastErr) throw lastErr;
    throw new VendoError("retry loop exited without result", { code: "internal_error" });
  }

  private async _backoff(attempt: number): Promise<void> {
    const base = this.retry.backoffBaseMs * Math.pow(2, attempt - 1);
    const capped = Math.min(base, this.retry.backoffMaxMs);
    const jitter = Math.random() * capped * 0.25;
    await new Promise<void>((r) => setTimeout(r, capped + jitter));
  }
}
