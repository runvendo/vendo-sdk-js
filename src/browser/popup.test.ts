import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openPopup } from "./popup.js";

describe("popup.ts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("happy path: resolves connected when popup sends correct postMessage", async () => {
    const fakePopup = {
      closed: false,
      close: vi.fn(),
      location: { href: "about:blank" },
    };
    vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);

    const resultPromise = openPopup({
      url: "https://vendo.run/connect/telegram",
      expectedOrigin: "https://vendo.run",
      expectedSlug: "telegram",
    });

    // Simulate postMessage from popup
    const event = new MessageEvent("message", {
      origin: "https://vendo.run",
      data: {
        type: "vendo:connection-completed",
        slug: "telegram",
        connectionId: "conn-123",
      },
    });
    window.dispatchEvent(event);

    const result = await resultPromise;
    expect(result).toEqual({ status: "connected", connectionId: "conn-123", slug: "telegram" });
  });

  it("popup-blocked: returns redirected when window.open returns null", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { href: "https://example.com/", assign: assignSpy },
      writable: true,
    });

    const result = await openPopup({
      url: "https://vendo.run/connect/telegram",
      expectedOrigin: "https://vendo.run",
      expectedSlug: "telegram",
    });

    expect(result.status).toBe("redirected");
    expect(assignSpy).toHaveBeenCalledWith("https://vendo.run/connect/telegram");
  });

  it("popup closed before completion: resolves cancelled", async () => {
    const fakePopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);

    const resultPromise = openPopup({
      url: "https://vendo.run/connect/telegram",
      expectedOrigin: "https://vendo.run",
      expectedSlug: "telegram",
    });

    // Mark popup closed and tick past poll interval
    fakePopup.closed = true;
    vi.advanceTimersByTime(600);

    const result = await resultPromise;
    expect(result.status).toBe("cancelled");
  });

  it("timeout: resolves timeout after timeoutMs", async () => {
    const fakePopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);

    const resultPromise = openPopup({
      url: "https://vendo.run/connect/telegram",
      expectedOrigin: "https://vendo.run",
      expectedSlug: "telegram",
      timeoutMs: 5000,
    });

    vi.advanceTimersByTime(5001);

    const result = await resultPromise;
    expect(result.status).toBe("timeout");
    expect(fakePopup.close).toHaveBeenCalled();
  });
});
