import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openSseStream } from "./sse-client.js";

/** Encode a string as a Uint8Array (mirrors what a real fetch body reader yields). */
function encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Build a minimal ReadableStream from an array of string chunks. */
function makeBody(chunks: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encode(chunks[i++]!));
      } else {
        controller.close();
      }
    },
  });
}

function makeFetchMock(status: number, chunks: string[] = []) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    body: status >= 200 && status < 300 ? makeBody(chunks) : null,
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", makeFetchMock(200, []));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openSseStream", () => {
  it("parses a basic SSE event and calls onEvent", async () => {
    const chunks = ["event: connection_updated\ndata: {\"slug\":\"telegram\"}\n\n"];
    vi.stubGlobal("fetch", makeFetchMock(200, chunks));

    const events: Array<{ type: string; data: unknown }> = [];
    const cleanup = openSseStream("https://example.com/events", "key", (e) => events.push(e));

    // Wait for async stream to drain
    await new Promise((r) => setTimeout(r, 20));
    cleanup();

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("connection_updated");
    expect(events[0]!.data).toEqual({ slug: "telegram" });
  });

  it("calls onError on non-OK response (e.g. 401)", async () => {
    vi.stubGlobal("fetch", makeFetchMock(401));

    const onEvent = vi.fn();
    const onError = vi.fn();
    const cleanup = openSseStream("https://example.com/events", "key", onEvent, onError);

    await new Promise((r) => setTimeout(r, 20));
    cleanup();

    expect(onEvent).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]![0] as Error).message).toContain("401");
  });

  it("calls onError on 403", async () => {
    vi.stubGlobal("fetch", makeFetchMock(403));

    const onError = vi.fn();
    const cleanup = openSseStream("https://example.com/events", "key", vi.fn(), onError);

    await new Promise((r) => setTimeout(r, 20));
    cleanup();

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0]![0] as Error).message).toContain("403");
  });

  it("normalises \\r\\n line endings to \\n", async () => {
    // Server sends CRLF-terminated SSE lines
    const chunks = ["event: ping\r\ndata: {}\r\n\r\n"];
    vi.stubGlobal("fetch", makeFetchMock(200, chunks));

    const events: Array<{ type: string; data: unknown }> = [];
    const cleanup = openSseStream("https://example.com/events", "key", (e) => events.push(e));

    await new Promise((r) => setTimeout(r, 20));
    cleanup();

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("ping");
  });

  it("normalises bare \\r line endings to \\n", async () => {
    const chunks = ["event: ping\rdata: {}\r\r"];
    vi.stubGlobal("fetch", makeFetchMock(200, chunks));

    const events: Array<{ type: string; data: unknown }> = [];
    const cleanup = openSseStream("https://example.com/events", "key", (e) => events.push(e));

    await new Promise((r) => setTimeout(r, 20));
    cleanup();

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("ping");
  });

  it("skips SSE comment/heartbeat lines starting with ':'", async () => {
    // Heartbeat comments interspersed between real events
    const chunks = [": heartbeat\nevent: ping\ndata: {}\n\n: keepalive\n"];
    vi.stubGlobal("fetch", makeFetchMock(200, chunks));

    const events: Array<{ type: string; data: unknown }> = [];
    const cleanup = openSseStream("https://example.com/events", "key", (e) => events.push(e));

    await new Promise((r) => setTimeout(r, 20));
    cleanup();

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("ping");
  });
});
