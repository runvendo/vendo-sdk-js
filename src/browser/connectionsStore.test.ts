import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as sseModule from "./sse-client.js";
import {
  subscribeConnection,
  refreshConnections,
  _resetConnectionsStoreForTesting,
} from "./connectionsStore.js";

const BASE = "https://vendo.run";
const KEY = "vendo_sk_test";

beforeEach(() => {
  _resetConnectionsStoreForTesting();
});

afterEach(() => {
  _resetConnectionsStoreForTesting();
  vi.restoreAllMocks();
});

function tick(ms = 10): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("connectionsStore", () => {
  it("fires the subscriber once with loading status synchronously on subscribe", () => {
    vi.spyOn(sseModule, "openSseStream").mockReturnValue(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ connections: [] }),
    } as unknown as Response);

    const cb = vi.fn();
    const cleanup = subscribeConnection(BASE, KEY, "telegram", cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(undefined, "loading");
    cleanup();
  });

  it("makes ONE fetch + ONE SSE stream regardless of subscriber count", async () => {
    const sseSpy = vi
      .spyOn(sseModule, "openSseStream")
      .mockReturnValue(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          connections: [
            { slug: "telegram", status: "connected", id: "c1" },
            { slug: "notion", status: "available", id: "c2" },
          ],
        }),
      } as unknown as Response);

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    const c1 = subscribeConnection(BASE, KEY, "telegram", cb1);
    const c2 = subscribeConnection(BASE, KEY, "notion", cb2);
    const c3 = subscribeConnection(BASE, KEY, "anthropic", cb3);

    await tick();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sseSpy).toHaveBeenCalledTimes(1);
    // Each subscriber resolves to its own slug's row (or undefined)
    expect(cb1).toHaveBeenLastCalledWith(
      expect.objectContaining({ slug: "telegram", status: "connected" }),
      "ready",
    );
    expect(cb2).toHaveBeenLastCalledWith(
      expect.objectContaining({ slug: "notion" }),
      "ready",
    );
    expect(cb3).toHaveBeenLastCalledWith(undefined, "ready");

    c1();
    c2();
    c3();
  });

  it("tears down SSE when the last subscriber unsubscribes", () => {
    const sseCleanup = vi.fn();
    vi.spyOn(sseModule, "openSseStream").mockReturnValue(sseCleanup);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ connections: [] }),
    } as unknown as Response);

    const c1 = subscribeConnection(BASE, KEY, "a", () => {});
    const c2 = subscribeConnection(BASE, KEY, "b", () => {});

    c1();
    expect(sseCleanup).not.toHaveBeenCalled();
    c2();
    expect(sseCleanup).toHaveBeenCalledTimes(1);
  });

  it("keeps separate stores for distinct (baseUrl, apiKey) tuples", async () => {
    const sseSpy = vi
      .spyOn(sseModule, "openSseStream")
      .mockReturnValue(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ connections: [] }),
    } as unknown as Response);

    subscribeConnection(BASE, KEY, "x", () => {});
    subscribeConnection("https://other.example", KEY, "x", () => {});
    subscribeConnection(BASE, "vendo_sk_other", "x", () => {});

    await tick();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sseSpy).toHaveBeenCalledTimes(3);
  });

  it("re-uses the same in-flight fetch when subscribers arrive concurrently", async () => {
    vi.spyOn(sseModule, "openSseStream").mockReturnValue(() => {});
    let resolveFetch: (r: Response) => void = () => {};
    const pending = new Promise<Response>((r) => {
      resolveFetch = r;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(pending);

    // Three subscribers arrive while the first fetch is still pending.
    subscribeConnection(BASE, KEY, "a", () => {});
    subscribeConnection(BASE, KEY, "b", () => {});
    subscribeConnection(BASE, KEY, "c", () => {});

    // Only ONE network call should be in flight.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      json: async () => ({ connections: [] }),
    } as unknown as Response);
    await tick();
    // Still one — the same request resolved for everyone.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("refetches when a connection.* SSE event arrives, and notifies subscribers", async () => {
    let sseHandler: ((event: { type: string; data: unknown }) => void) | null =
      null;
    vi.spyOn(sseModule, "openSseStream").mockImplementation(
      (_url, _key, onEvent) => {
        sseHandler = onEvent;
        return () => {};
      },
    );

    let callIdx = 0;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        callIdx++;
        return {
          ok: true,
          json: async () => ({
            connections:
              callIdx === 1
                ? [{ slug: "telegram", status: "available", id: "c1" }]
                : [{ slug: "telegram", status: "connected", id: "c1" }],
          }),
        } as unknown as Response;
      });

    const cb = vi.fn();
    subscribeConnection(BASE, KEY, "telegram", cb);
    await tick();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "available" }),
      "ready",
    );

    // Simulate an SSE connection_updated arriving.
    sseHandler!({ type: "connection_updated", data: { slug: "telegram" } });
    await tick();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "connected" }),
      "ready",
    );
  });

  it("refreshConnections triggers a refetch and is a no-op if no entry exists", async () => {
    vi.spyOn(sseModule, "openSseStream").mockReturnValue(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ connections: [] }),
    } as unknown as Response);

    // No entry yet — safe no-op.
    await refreshConnections(BASE, KEY);
    expect(fetchSpy).toHaveBeenCalledTimes(0);

    subscribeConnection(BASE, KEY, "telegram", () => {});
    await tick();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await refreshConnections(BASE, KEY);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("flips subscribers to 'error' status on non-OK fetch", async () => {
    vi.spyOn(sseModule, "openSseStream").mockReturnValue(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as unknown as Response);

    const cb = vi.fn();
    subscribeConnection(BASE, KEY, "telegram", cb);
    await tick();
    expect(cb).toHaveBeenLastCalledWith(undefined, "error");
  });
});
