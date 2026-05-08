import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { WebhooksAPI } from "./webhooks";
import { ValidationError } from "./errors";

const SECRET = "whsec_test_secret_12345";

function sign(timestamp: string, body: string): string {
  return createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
}

describe("WebhooksAPI.verify", () => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.VENDO_WEBHOOK_SECRET;
    process.env.VENDO_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.VENDO_WEBHOOK_SECRET;
    else process.env.VENDO_WEBHOOK_SECRET = original;
  });

  it("verifies a valid signature and returns the event", () => {
    const api = new WebhooksAPI();
    const body = JSON.stringify({
      id: "evt_123",
      type: "connection.connected",
      occurred_at: "2026-05-08T01:00:00Z",
      data: { slug: "openai", connection_id: "conn_x" },
    });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(ts, body);
    const event = api.verify(
      { "Vendo-Signature": sig, "Vendo-Timestamp": ts, "Vendo-Event-Id": "evt_123" },
      body,
    );
    expect(event.id).toBe("evt_123");
    expect(event.type).toBe("connection.connected");
    expect(event.data).toEqual({ slug: "openai", connection_id: "conn_x" });
  });

  it("verifies via Headers object", () => {
    const api = new WebhooksAPI();
    const body = JSON.stringify({ id: "evt_h", type: "x", occurred_at: "2026-01-01T00:00:00Z", data: {} });
    const ts = String(Math.floor(Date.now() / 1000));
    const headers = new Headers({
      "Vendo-Signature": sign(ts, body),
      "Vendo-Timestamp": ts,
      "Vendo-Event-Id": "evt_h",
    });
    const event = api.verify(headers, body);
    expect(event.id).toBe("evt_h");
  });

  it("case-insensitive header lookup", () => {
    const api = new WebhooksAPI();
    const body = JSON.stringify({ id: "evt_low", type: "x", occurred_at: "2026-01-01T00:00:00Z", data: {} });
    const ts = String(Math.floor(Date.now() / 1000));
    const event = api.verify(
      { "vendo-signature": sign(ts, body), "vendo-timestamp": ts, "vendo-event-id": "evt_low" },
      body,
    );
    expect(event.id).toBe("evt_low");
  });

  it("rejects bad signature", () => {
    const api = new WebhooksAPI();
    const body = JSON.stringify({ id: "evt_x", type: "x", occurred_at: "2026-01-01T00:00:00Z", data: {} });
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() => api.verify(
      { "Vendo-Signature": "deadbeef", "Vendo-Timestamp": ts, "Vendo-Event-Id": "evt_x" },
      body,
    )).toThrow(ValidationError);
  });

  it("rejects stale timestamp (more than 5 minutes off)", () => {
    const api = new WebhooksAPI();
    const body = JSON.stringify({ id: "evt_stale", type: "x", occurred_at: "2026-01-01T00:00:00Z", data: {} });
    const ts = String(Math.floor(Date.now() / 1000) - 600);  // 10 minutes ago
    expect(() => api.verify(
      { "Vendo-Signature": sign(ts, body), "Vendo-Timestamp": ts, "Vendo-Event-Id": "evt_stale" },
      body,
    )).toThrow(ValidationError);
  });

  it("rejects future timestamp (more than 5 min ahead)", () => {
    const api = new WebhooksAPI();
    const body = JSON.stringify({ id: "evt_future", type: "x", occurred_at: "2026-01-01T00:00:00Z", data: {} });
    const ts = String(Math.floor(Date.now() / 1000) + 600);
    expect(() => api.verify(
      { "Vendo-Signature": sign(ts, body), "Vendo-Timestamp": ts, "Vendo-Event-Id": "evt_future" },
      body,
    )).toThrow(ValidationError);
  });

  it("rejects when Vendo-Signature header is missing", () => {
    const api = new WebhooksAPI();
    expect(() => api.verify({ "Vendo-Timestamp": "1700000000", "Vendo-Event-Id": "x" }, "{}")).toThrow(ValidationError);
  });

  it("rejects when Vendo-Timestamp header is missing", () => {
    const api = new WebhooksAPI();
    const body = "{}";
    expect(() => api.verify({ "Vendo-Signature": "x", "Vendo-Event-Id": "x" }, body)).toThrow(ValidationError);
  });

  it("rejects when secret is unset", () => {
    delete process.env.VENDO_WEBHOOK_SECRET;
    const api = new WebhooksAPI();
    const body = "{}";
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() => api.verify(
      { "Vendo-Signature": "x", "Vendo-Timestamp": ts, "Vendo-Event-Id": "x" },
      body,
    )).toThrow(ValidationError);
  });

  it("accepts a constructor-provided secret (overrides env)", () => {
    delete process.env.VENDO_WEBHOOK_SECRET;
    const api = new WebhooksAPI({ secret: SECRET });
    const body = JSON.stringify({ id: "evt_o", type: "x", occurred_at: "2026-01-01T00:00:00Z", data: {} });
    const ts = String(Math.floor(Date.now() / 1000));
    const event = api.verify(
      { "Vendo-Signature": sign(ts, body), "Vendo-Timestamp": ts, "Vendo-Event-Id": "evt_o" },
      body,
    );
    expect(event.id).toBe("evt_o");
  });

  it("rejects malformed JSON body", () => {
    const api = new WebhooksAPI();
    const body = "not json {";
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() => api.verify(
      { "Vendo-Signature": sign(ts, body), "Vendo-Timestamp": ts, "Vendo-Event-Id": "x" },
      body,
    )).toThrow(ValidationError);
  });
});


describe("Vendo.webhooks instance property", () => {
  it("exists on Vendo and uses constructor secret + env", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    process.env.VENDO_WEBHOOK_SECRET = SECRET;
    return import("./_client").then(({ Vendo }) => {
      const v = new Vendo();
      expect(v.webhooks).toBeInstanceOf(WebhooksAPI);
    });
  });
});
