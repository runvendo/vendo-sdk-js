// P5 `vendo.data.execute(action, args)` — execute a Composio action against the
// deployment's connected accounts via composio-proxy.vendo.run.
//
// Why a dedicated module instead of reusing `_http`:
//
//   - The Composio adapter is hosted on its own subdomain
//     (composio-proxy.vendo.run, see proxy/wrangler.toml) rather than under
//     vendo.run/api/*, so the request URL has a different host from every
//     other SDK call. Reusing HttpAdapter would mean passing it a separate
//     baseUrl, which leaks into how Vendo's main HTTP adapter exposes itself.
//
//   - The proxy's response/error envelope is bespoke: 200 returns
//     {data: <unknown>}, 403 returns {error: "binding_missing", toolkit: "..."},
//     and other failures pass through Composio's status with {error: <string>}.
//     None of these match the canonical Vendo error envelope that `fromResponse`
//     in errors.ts expects, so the body needs its own mapping.
//
// Endpoint resolution order:
//   1. Constructor `dataProxyUrl` option (test seam / private routing).
//   2. `VENDO_DATA_PROXY_URL` env var (override for staging / self-hosted).
//   3. `https://composio-proxy.vendo.run` (production default).

import { NotConnected, UpstreamError, VendoError, fromResponse } from "./errors";
import { requireVendoMode } from "./_mode";

const DEFAULT_DATA_PROXY_URL = "https://composio-proxy.vendo.run";

export interface DataAPIOptions {
  apiKey: string;
  apiVersion: string;
  /** Test seam / per-instance override. Wins over VENDO_DATA_PROXY_URL. */
  dataProxyUrl?: string;
  /** Test seam. Defaults to global fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout, ms. Defaults to 30s. */
  timeoutMs?: number;
}

function resolveProxyUrl(opts: DataAPIOptions): string {
  if (opts.dataProxyUrl) return opts.dataProxyUrl.replace(/\/$/, "");
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  const fromEnv = (env.VENDO_DATA_PROXY_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return DEFAULT_DATA_PROXY_URL;
}

export class DataAPI {
  private readonly apiKey: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: DataAPIOptions) {
    this.apiKey = opts.apiKey;
    this.apiVersion = opts.apiVersion;
    this.baseUrl = resolveProxyUrl(opts);
    const f = opts.fetch ?? (globalThis as { fetch?: typeof fetch }).fetch?.bind(globalThis);
    if (!f) throw new VendoError("fetch is not available", { code: "internal_error" });
    this.fetch = f;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /**
   * Execute a Composio action against the deployment's connected account for
   * the inferred toolkit. Requires Vendo mode (VENDO_API_KEY set).
   *
   * @param action  Composio action id (e.g. "SLACK_SEND_MESSAGE" or
   *                "slack.send_message" — case-insensitive; the proxy infers
   *                the toolkit from the prefix).
   * @param args    Action arguments. Schema is per-action; fetch via
   *                Composio's getActionSchema endpoint or the search results.
   * @returns       The Composio `data` payload (the result of the action).
   *                Shape is action-specific.
   *
   * Throws:
   *   - `NotConnected` (code: "binding_missing") — the toolkit has no
   *     composio_managed connection on this deployment.
   *   - `UpstreamError` (code: "composio_error") — Composio rejected the call
   *     (bad args, action not found, upstream API error).
   *   - `AuthError` — VENDO_API_KEY missing / invalid.
   *   - `VendoOnlyFeature` — called in OSS mode.
   */
  async execute(action: string, args?: Record<string, unknown>): Promise<unknown> {
    requireVendoMode("data.execute", this.apiKey);
    if (typeof action !== "string" || !action.trim()) {
      throw new VendoError("data.execute(action, args?): `action` must be a non-empty string", {
        code: "validation_failed",
      });
    }

    const url = `${this.baseUrl}/v1/execute`;
    let res: Response;
    try {
      res = await this.fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "Vendo-API-Version": this.apiVersion,
        },
        body: JSON.stringify({ action_id: action, args: args ?? {} }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new VendoError(`network error calling data proxy: ${(e as Error).message}`, {
        code: "upstream_error",
      });
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // proxy always returns JSON; an unparseable body means an edge error.
    }

    if (res.status >= 200 && res.status < 300) {
      // The proxy adapter wraps the Composio response as {data: <unknown>}.
      // Unwrap so callers see the action's result shape directly. If a
      // non-conforming 2xx slips through, return the raw body unchanged.
      if (body && typeof body === "object" && "data" in body) {
        return (body as { data: unknown }).data;
      }
      return body;
    }

    // 403 binding_missing → typed NotConnected. The adapter's error body
    // shape is {error: "binding_missing", toolkit: "<slug>"}, distinct
    // from the canonical {error: {code: "...", message: "..."}} envelope.
    if (
      res.status === 403 &&
      body &&
      typeof body === "object" &&
      (body as { error?: unknown }).error === "binding_missing"
    ) {
      const toolkit = (body as { toolkit?: string }).toolkit;
      throw new NotConnected(
        `data.execute("${action}"): the '${toolkit ?? "?"}' toolkit is not connected on this deployment.`,
        { code: "binding_missing", slug: toolkit, status: 403 },
      );
    }

    // Any other error with a string `error` is a Composio passthrough.
    const stringError =
      body &&
      typeof body === "object" &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : null;
    if (stringError) {
      throw new UpstreamError(stringError, {
        code: "composio_error",
        status: res.status,
      });
    }

    throw fromResponse({ status: res.status, headers: res.headers, body: body ?? {} });
  }
}
