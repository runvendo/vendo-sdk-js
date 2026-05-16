import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DataAPI } from "./data";
import { VendoError, VendoOnlyFeature } from "./errors";

const original: Record<string, string | undefined> = {};
beforeEach(() => {
  original.VENDO_API_KEY = process.env.VENDO_API_KEY;
  original.VENDO_DATA_PROXY_URL = process.env.VENDO_DATA_PROXY_URL;
});
afterEach(() => {
  if (original.VENDO_API_KEY === undefined) delete process.env.VENDO_API_KEY;
  else process.env.VENDO_API_KEY = original.VENDO_API_KEY;
  if (original.VENDO_DATA_PROXY_URL === undefined) delete process.env.VENDO_DATA_PROXY_URL;
  else process.env.VENDO_DATA_PROXY_URL = original.VENDO_DATA_PROXY_URL;
});

function makeApi(opts: {
  apiKey?: string;
  responder: (input: string, init: RequestInit) => Promise<Response> | Response;
  dataProxyUrl?: string;
}): { api: DataAPI; fetchSpy: ReturnType<typeof vi.fn> } {
  const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    opts.responder(input.toString(), init ?? {}),
  );
  const api = new DataAPI({
    apiKey: opts.apiKey ?? "vendo_sk_test",
    apiVersion: "2026-05-15",
    dataProxyUrl: opts.dataProxyUrl ?? "https://proxy.test",
    fetch: fetchSpy as unknown as typeof fetch,
  });
  return { api, fetchSpy };
}

describe("DataAPI.execute", () => {
  it("posts {action_id, args} to /v1/execute with bearer + api-version", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const { api, fetchSpy } = makeApi({
      responder: () =>
        new Response(JSON.stringify({ data: { ok: true, count: 3 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    const result = await api.execute("HACKERNEWS_FETCH_TOP_STORIES", { limit: 3 });

    expect(result).toEqual({ ok: true, count: 3 });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://proxy.test/v1/execute");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer vendo_sk_test");
    expect(headers["Vendo-API-Version"]).toBe("2026-05-15");
    expect(JSON.parse(init.body as string)).toEqual({
      action_id: "HACKERNEWS_FETCH_TOP_STORIES",
      args: { limit: 3 },
    });
  });

  it("defaults args to {} when omitted", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const { api, fetchSpy } = makeApi({
      responder: () =>
        new Response(JSON.stringify({ data: null }), { status: 200 }),
    });
    await api.execute("HACKERNEWS_FETCH_TOP_STORIES");
    const init = fetchSpy.mock.calls[0][1];
    expect(JSON.parse(init.body as string).args).toEqual({});
  });

  it("maps 403 binding_missing to NotConnected with toolkit slug", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const { api } = makeApi({
      responder: () =>
        new Response(JSON.stringify({ error: "binding_missing", toolkit: "slack" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    });

    await expect(api.execute("slack.send_message", { channel: "#general" })).rejects.toMatchObject({
      name: "NotConnected",
      code: "binding_missing",
      slug: "slack",
      status: 403,
    });
  });

  it("maps Composio passthrough errors to UpstreamError(composio_error)", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const { api } = makeApi({
      responder: () =>
        new Response(JSON.stringify({ error: "Action not found: BOGUS_ACTION" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    });

    await expect(api.execute("BOGUS_ACTION")).rejects.toMatchObject({
      name: "UpstreamError",
      code: "composio_error",
      status: 404,
      message: "Action not found: BOGUS_ACTION",
    });
  });

  it("throws VendoOnlyFeature when no api key is in scope (OSS mode)", async () => {
    delete process.env.VENDO_API_KEY;
    const fetchSpy = vi.fn();
    const api = new DataAPI({
      apiKey: "",
      apiVersion: "2026-05-15",
      dataProxyUrl: "https://proxy.test",
      fetch: fetchSpy as unknown as typeof fetch,
    });
    await expect(api.execute("anything.do_thing")).rejects.toBeInstanceOf(VendoOnlyFeature);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects empty/non-string action without hitting the network", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const fetchSpy = vi.fn();
    const api = new DataAPI({
      apiKey: "vendo_sk_test",
      apiVersion: "2026-05-15",
      dataProxyUrl: "https://proxy.test",
      fetch: fetchSpy as unknown as typeof fetch,
    });
    await expect(api.execute("")).rejects.toBeInstanceOf(VendoError);
    await expect(api.execute("   ")).rejects.toBeInstanceOf(VendoError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses VENDO_DATA_PROXY_URL env var when no constructor override is set", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    process.env.VENDO_DATA_PROXY_URL = "https://staging-proxy.example.com/";

    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ data: "ok" }), { status: 200 }),
    );
    const api = new DataAPI({
      apiKey: "vendo_sk_test",
      apiVersion: "2026-05-15",
      fetch: fetchSpy as unknown as typeof fetch,
    });

    await api.execute("anything.do_thing");
    const firstCall = fetchSpy.mock.calls[0] as unknown as [RequestInfo, RequestInit];
    expect(firstCall[0]).toBe("https://staging-proxy.example.com/v1/execute");
  });

  it("falls back to composio-proxy.vendo.run when neither env nor option is set", () => {
    delete process.env.VENDO_DATA_PROXY_URL;
    const api = new DataAPI({
      apiKey: "vendo_sk_test",
      apiVersion: "2026-05-15",
    });
    // baseUrl is private; assert through a probe call instead.
    expect((api as unknown as { baseUrl: string }).baseUrl).toBe(
      "https://composio-proxy.vendo.run",
    );
  });

  it("unwraps the {data: <value>} envelope, but returns raw body when {data} absent", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const { api } = makeApi({
      responder: () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    });
    expect(await api.execute("any.action")).toEqual({ ok: true });
  });
});
