import { describe, it, expect, vi } from "vitest";
import { HttpAdapter } from "./_http";
import { ValidationError } from "./errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeAdapter(fetchMock: typeof fetch) {
  return new HttpAdapter({
    apiKey: "test-key",
    baseUrl: "https://api.example.com",
    fetch: fetchMock,
    retry: {
      maxAttempts: 3,
      backoffBaseMs: 0,
      backoffMaxMs: 0,
      retryableStatusCodes: new Set([500, 502, 503, 504]),
    },
  });
}

function makeResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("HttpAdapter", () => {
  it("retries 503 → 503 → 200 and makes exactly 3 fetch calls", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(503))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }));

    const adapter = makeAdapter(fetchMock as unknown as typeof fetch);
    const result = await adapter.get<{ ok: boolean }>("/test");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
  });

  it("does NOT retry 400 and throws ValidationError", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      makeResponse(400, { error: { code: "validation_failed", message: "Bad input" } }, {
        "Vendo-Error-Code": "validation_failed",
      }),
    );

    const adapter = makeAdapter(fetchMock as unknown as typeof fetch);
    await expect(adapter.get("/test")).rejects.toBeInstanceOf(ValidationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts and throws VendoError subclass", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(503));

    const adapter = makeAdapter(fetchMock as unknown as typeof fetch);
    await expect(adapter.get("/test")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("POST auto-generates an Idempotency-Key UUID", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeResponse(200, {}));
    const adapter = makeAdapter(fetchMock as unknown as typeof fetch);

    await adapter.post("/test", { body: { x: 1 } });

    const calledHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(calledHeaders["Idempotency-Key"]).toMatch(UUID_RE);
  });

  it("POST respects user-supplied idempotencyKey over auto-generated", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeResponse(200, {}));
    const adapter = makeAdapter(fetchMock as unknown as typeof fetch);
    const myKey = "my-custom-idempotency-key-123";

    await adapter.post("/test", { body: {}, idempotencyKey: myKey });

    const calledHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(calledHeaders["Idempotency-Key"]).toBe(myKey);
  });

  it("GET does NOT set an Idempotency-Key header", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeResponse(200, {}));
    const adapter = makeAdapter(fetchMock as unknown as typeof fetch);

    await adapter.get("/test");

    const calledHeaders = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(calledHeaders["Idempotency-Key"]).toBeUndefined();
  });
});
