import { describe, it, expect } from "vitest";
import { validateMessage, expectedOrigin } from "./postMessageBridge.js";

describe("postMessageBridge.ts", () => {
  it("valid message: returns ok with data", () => {
    const event = new MessageEvent("message", {
      origin: "https://vendo.run",
      data: {
        type: "vendo:connection-completed",
        slug: "telegram",
        connectionId: "conn-abc",
      },
    });

    const result = validateMessage(event, "https://vendo.run", "telegram");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.connectionId).toBe("conn-abc");
      expect(result.data.slug).toBe("telegram");
    }
  });

  it("wrong origin: returns origin_mismatch", () => {
    const event = new MessageEvent("message", {
      origin: "https://evil.com",
      data: { type: "vendo:connection-completed", slug: "telegram", connectionId: "x" },
    });

    const result = validateMessage(event, "https://vendo.run", "telegram");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("origin_mismatch");
  });

  it("wrong type: returns unexpected_type", () => {
    const event = new MessageEvent("message", {
      origin: "https://vendo.run",
      data: { type: "vendo:other-event", slug: "telegram", connectionId: "x" },
    });

    const result = validateMessage(event, "https://vendo.run", "telegram");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unexpected_type");
  });

  it("wrong slug: returns slug_mismatch", () => {
    const event = new MessageEvent("message", {
      origin: "https://vendo.run",
      data: { type: "vendo:connection-completed", slug: "stripe", connectionId: "x" },
    });

    const result = validateMessage(event, "https://vendo.run", "telegram");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("slug_mismatch");
  });

  it("expectedOrigin strips /api suffix", () => {
    expect(expectedOrigin("https://vendo.run/api")).toBe("https://vendo.run");
    expect(expectedOrigin("https://vendo.run/api/")).toBe("https://vendo.run");
    expect(expectedOrigin("https://vendo.run")).toBe("https://vendo.run");
  });
});
