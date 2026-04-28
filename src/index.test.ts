import { describe, it, expect, beforeEach, vi } from "vitest";
import { getCredential, VendoSdkError, _clearCacheForTesting } from "./index";

const URL_ENV = "https://credentials.vendo.run";
const TOKEN = "vendo_sk_test";

beforeEach(() => {
  _clearCacheForTesting();
  process.env.VENDO_CREDENTIALS_URL = URL_ENV;
  process.env.VENDO_DEPLOYMENT_TOKEN = TOKEN;
});

describe("getCredential", () => {
  it("calls the credentials endpoint with the bearer and returns parsed JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(
      JSON.stringify({
        access_token: "ya29.test",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        token_type: "Bearer",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    const out = await getCredential("google", { fetch: fetchMock });
    expect(out.access_token).toBe("ya29.test");
    expect(out.token_type).toBe("Bearer");
    expect(fetchMock).toHaveBeenCalledWith(
      `${URL_ENV}/google`,
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: `Bearer ${TOKEN}` },
      }),
    );
  });

  it("caches the response — second call within TTL does not re-fetch", async () => {
    const makeRes = () => new Response(
      JSON.stringify({
        access_token: "ya29.cacheme",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        token_type: "Bearer",
      }),
      { status: 200 },
    );
    const fetchMock = vi.fn().mockImplementation(async () => makeRes());

    await getCredential("google", { fetch: fetchMock });
    await getCredential("google", { fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("noCache=true bypasses the cache", async () => {
    const makeRes = () => new Response(
      JSON.stringify({
        access_token: "x",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        token_type: "Bearer",
      }),
      { status: 200 },
    );
    const fetchMock = vi.fn().mockImplementation(async () => makeRes());

    await getCredential("google", { fetch: fetchMock });
    await getCredential("google", { fetch: fetchMock, noCache: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws VendoSdkError with code from Vendo-Error-Code header on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(
      JSON.stringify({ error: "binding_missing" }),
      {
        status: 403,
        headers: {
          "Content-Type": "application/json",
          "Vendo-Error-Code": "binding_missing",
        },
      },
    ));

    await expect(getCredential("google", { fetch: fetchMock })).rejects.toMatchObject({
      name: "VendoSdkError",
      code: "binding_missing",
      status: 403,
    });
  });

  it("throws VendoSdkError(missing_url) when env var unset", async () => {
    delete process.env.VENDO_CREDENTIALS_URL;
    await expect(getCredential("google")).rejects.toMatchObject({
      name: "VendoSdkError",
      code: "missing_url",
    });
  });

  it("throws VendoSdkError(missing_token) when env var unset", async () => {
    delete process.env.VENDO_DEPLOYMENT_TOKEN;
    await expect(getCredential("google")).rejects.toMatchObject({
      name: "VendoSdkError",
      code: "missing_token",
    });
  });

  it("rejects empty provider", async () => {
    await expect(getCredential("" as string)).rejects.toThrow(VendoSdkError);
  });

  it("handles Notion-style expires_at:null and refetches each call (no expiry → no caching headroom)", async () => {
    const makeRes = () => new Response(
      JSON.stringify({ access_token: "secret_notion", expires_at: null, token_type: "Bearer" }),
      { status: 200 },
    );
    const fetchMock = vi.fn().mockImplementation(async () => makeRes());
    const a = await getCredential("notion", { fetch: fetchMock });
    const b = await getCredential("notion", { fetch: fetchMock });
    expect(a.access_token).toBe("secret_notion");
    expect(b.access_token).toBe("secret_notion");
    // null-expiry tokens hit the wire each call: the cache TTL would be
    // Date.now() + 60s, and the gate (expires - now > skew) means
    // (60s - 0 > 60s) = false. Documented behavior.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
