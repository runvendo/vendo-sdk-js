import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventsAPI } from "./events";
import type { HttpAdapter } from "./_http";
import { VendoOnlyFeature } from "./errors";

const original: Record<string, string | undefined> = {};
beforeEach(() => { original.VENDO_API_KEY = process.env.VENDO_API_KEY; });
afterEach(() => {
  if (original.VENDO_API_KEY === undefined) delete process.env.VENDO_API_KEY;
  else process.env.VENDO_API_KEY = original.VENDO_API_KEY;
});

/**
 * Build a fake HttpAdapter that returns a Response whose body streams the
 * given chunks (string by string) over the duration of the test.
 */
function fakeAdapterStreaming(chunks: string[]): HttpAdapter {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
        await new Promise((r) => setTimeout(r, 0));
      }
      controller.close();
    },
  });
  return {
    apiKey: "vendo_sk_test",
    baseUrl: "https://vendo.run",
    fetch: vi.fn(async () =>
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    ),
  } as unknown as HttpAdapter;
}

describe("EventsAPI.subscribe", () => {
  it("yields parsed SSE events from the stream", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const adapter = fakeAdapterStreaming([
      "event: connection_updated\n",
      'data: {"slug":"openai","status":"connected"}\n\n',
      "event: connection_disconnected\n",
      'data: {"slug":"telegram"}\n\n',
    ]);
    const api = new EventsAPI(adapter);
    const events: string[] = [];
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 500);
    try {
      for await (const ev of api.subscribe({ signal: ctrl.signal })) {
        events.push(ev.type);
        if (events.length === 2) ctrl.abort();
      }
    } catch (e) {
      // AbortError expected
    }
    expect(events).toEqual(["connection_updated", "connection_disconnected"]);
  });

  it("parses event data as JSON when valid, raw string when not", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const adapter = fakeAdapterStreaming([
      "event: heartbeat\n",
      "data: ping\n\n",
      "event: connection_updated\n",
      'data: {"slug":"openai"}\n\n',
    ]);
    const api = new EventsAPI(adapter);
    const got: Array<{ type: string; data: unknown }> = [];
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 500);
    try {
      for await (const ev of api.subscribe({ signal: ctrl.signal })) {
        got.push({ type: ev.type, data: ev.data });
        if (got.length === 2) ctrl.abort();
      }
    } catch {}
    expect(got[0]).toEqual({ type: "heartbeat", data: "ping" });
    expect(got[1]).toEqual({ type: "connection_updated", data: { slug: "openai" } });
  });

  it("throws VendoOnlyFeature in OSS mode (synchronous, before iteration)", () => {
    delete process.env.VENDO_API_KEY;
    const adapter = fakeAdapterStreaming([]);
    const api = new EventsAPI(adapter);
    expect(() => api.subscribe()).toThrow(VendoOnlyFeature);
  });

  it("AbortSignal stops the iteration", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const adapter = fakeAdapterStreaming([
      "event: a\ndata: 1\n\n",
      "event: b\ndata: 2\n\n",
      "event: c\ndata: 3\n\n",
    ]);
    const api = new EventsAPI(adapter);
    const ctrl = new AbortController();
    let count = 0;
    try {
      for await (const _ of api.subscribe({ signal: ctrl.signal })) {
        count++;
        ctrl.abort();
      }
    } catch {}
    expect(count).toBe(1);
  });

  it("skips SSE comment lines starting with :", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const adapter = fakeAdapterStreaming([
      ": this is a heartbeat comment\n",
      "event: real\ndata: yes\n\n",
    ]);
    const api = new EventsAPI(adapter);
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 500);
    const got: string[] = [];
    try {
      for await (const ev of api.subscribe({ signal: ctrl.signal })) {
        got.push(ev.type);
        if (got.length === 1) ctrl.abort();
      }
    } catch {}
    expect(got).toEqual(["real"]);
  });
});


describe("Vendo.events instance property", () => {
  it("exists on Vendo and is an EventsAPI", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const { Vendo } = await import("./_client");
    const v = new Vendo();
    expect(v.events).toBeInstanceOf(EventsAPI);
  });
});
