import { describe, it, expect, vi, afterEach } from "vitest";
import { Vendo } from "./_client";
import { AuthError } from "./errors";
import { ConnectionsAPI } from "./connections";
import { IntegrationsAPI } from "./integrations";
import { BillingAPI } from "./billing";

// Stub fetch so HttpAdapter constructor doesn't throw
const noopFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Vendo", () => {
  it("accepts explicit apiKey and baseUrl", () => {
    const v = new Vendo({ apiKey: "sk-test", baseUrl: "https://custom.api.com", fetch: noopFetch });
    expect(v.apiKey).toBe("sk-test");
    expect(v.baseUrl).toBe("https://custom.api.com");
  });

  it("reads apiKey and baseUrl from process.env when not provided", () => {
    vi.stubEnv("VENDO_API_KEY", "env-key-123");
    vi.stubEnv("VENDO_BASE_URL", "https://env.api.com");
    const v = new Vendo({ fetch: noopFetch });
    expect(v.apiKey).toBe("env-key-123");
    expect(v.baseUrl).toBe("https://env.api.com");
  });

  it("throws AuthError when no apiKey is provided anywhere", () => {
    vi.stubEnv("VENDO_API_KEY", "");
    expect(() => new Vendo({ fetch: noopFetch })).toThrow(AuthError);
  });

  it("defaults baseUrl to https://vendo.run (no /api suffix) when env var is not set", () => {
    // Regression: the old default was "https://vendo.run/api". Combined with
    // call-site paths that already start with "/api/" (integrations.ts,
    // connections.ts, billing.ts, VendoConnectionCard.ts), the SDK hit
    // "https://vendo.run/api/api/<path>" — every default-config call 404'd
    // or CORS-failed. Hermes-webui only worked because it overrode baseUrl
    // to "https://vendo.run" explicitly.
    vi.stubEnv("VENDO_API_KEY", "sk-test");
    vi.stubEnv("VENDO_BASE_URL", "");
    const v = new Vendo({ fetch: noopFetch });
    expect(v.baseUrl).toBe("https://vendo.run");
  });

  it("respects explicit baseUrl: '' (same-origin) — does not fall through to default", () => {
    // Empty-string baseUrl is the same-origin / proxy-friendly posture
    // (e.g. behind `vendo dev` or hermes-webui's /api/vendo/proxy). The
    // old `||` chain treated "" as falsy and substituted the default,
    // forcing every request cross-origin and tripping CSP.
    vi.stubEnv("VENDO_API_KEY", "sk-test");
    vi.stubEnv("VENDO_BASE_URL", "https://should.be.ignored");
    const v = new Vendo({ apiKey: "sk-test", baseUrl: "", fetch: noopFetch });
    expect(v.baseUrl).toBe("");
  });

  it("explicit baseUrl: '' produces relative same-origin call URLs", async () => {
    vi.stubEnv("VENDO_API_KEY", "sk-test");
    vi.stubEnv("VENDO_BASE_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ integrations: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const v = new Vendo({
      apiKey: "sk-test",
      baseUrl: "",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await v.integrations.list();
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/integrations");
  });

  it("default baseUrl + integrations.list() hits https://vendo.run/api/integrations (not /api/api/)", async () => {
    vi.stubEnv("VENDO_API_KEY", "sk-test");
    vi.stubEnv("VENDO_BASE_URL", "");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ integrations: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const v = new Vendo({ fetch: fetchMock as unknown as typeof fetch });
    await v.integrations.list();
    const calledUrl = fetchMock.mock.calls[0][0] as string | URL;
    expect(String(calledUrl)).toBe("https://vendo.run/api/integrations");
  });

  it("forUser(jwt) returns a new Vendo instance with _userJwt set", () => {
    const v = new Vendo({ apiKey: "sk-test", fetch: noopFetch });
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig";
    const scoped = v.forUser(jwt);
    expect(scoped).not.toBe(v);
    expect(scoped).toBeInstanceOf(Vendo);
    expect(scoped._userJwt).toBe(jwt);
    expect(v._userJwt).toBeUndefined();
  });
});

describe("Vendo subAPIs and methods", () => {
  it("exposes connections / integrations / billing as instance properties", () => {
    const v = new Vendo({ apiKey: "vendo_sk_x", fetch: noopFetch });
    expect(v.connections).toBeDefined();
    expect(v.connections).toBeInstanceOf(ConnectionsAPI);
    expect(v.integrations).toBeDefined();
    expect(v.integrations).toBeInstanceOf(IntegrationsAPI);
    expect(v.billing).toBeDefined();
    expect(v.billing).toBeInstanceOf(BillingAPI);
  });

  it("connectUrl uses the host root (strips /api suffix from baseUrl)", () => {
    vi.stubEnv("VENDO_API_KEY", "vendo_sk_x");
    const v = new Vendo({ apiKey: "vendo_sk_x", baseUrl: "https://x.run/api", fetch: noopFetch });
    const url = v.connectUrl("telegram", { returnTo: "https://app.example.com/back" });
    expect(url).toBe("https://x.run/connections/connect/telegram?app_key=vendo_sk_x&return_to=https%3A%2F%2Fapp.example.com%2Fback");
  });

  it("token() caches and returns access_token from credentials.vendo.run", async () => {
    vi.stubEnv("VENDO_API_KEY", "vendo_sk_x");
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      headers: new Headers(),
      json: async () => ({ access_token: "tok-1", expires_at: null, token_type: "Bearer" }),
    });
    const v = new Vendo({ apiKey: "vendo_sk_x", fetch: fetchMock as unknown as typeof fetch });
    expect(await v.token("telegram")).toBe("tok-1");
    expect(await v.token("telegram")).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1); // cache hit
  });

  it("tokens() returns map and warms cache for non-null entries", async () => {
    vi.stubEnv("VENDO_API_KEY", "vendo_sk_x");
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200,
      headers: new Headers(),
      json: async () => ({
        tokens: { a: { access_token: "tok-a", expires_at: null, token_type: "Bearer" }, b: null },
        errors: { b: "binding_missing" },
      }),
    });
    const v = new Vendo({ apiKey: "vendo_sk_x", fetch: fetchMock as unknown as typeof fetch });
    const out = await v.tokens(["a", "b"]);
    expect(out).toEqual({ a: "tok-a", b: null });
  });

  it("token() throws NotConnected on 403 binding_missing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false, status: 403,
      headers: new Headers({ "Vendo-Error-Code": "binding_missing" }),
      json: async () => ({ error: { code: "binding_missing", message: "x" } }),
    });
    const v = new Vendo({ apiKey: "vendo_sk_x", fetch: fetchMock as unknown as typeof fetch });
    const { NotConnected } = await import("./errors");
    await expect(v.token("missing")).rejects.toBeInstanceOf(NotConnected);
  });

  it("invalidate() drops the cached token", async () => {
    vi.stubEnv("VENDO_API_KEY", "vendo_sk_x");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: async () => ({ access_token: "tok-1", expires_at: null, token_type: "Bearer" }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: async () => ({ access_token: "tok-2", expires_at: null, token_type: "Bearer" }),
      });
    const v = new Vendo({ apiKey: "vendo_sk_x", fetch: fetchMock as unknown as typeof fetch });
    await v.token("x");
    v.invalidate("x");
    expect(await v.token("x")).toBe("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
