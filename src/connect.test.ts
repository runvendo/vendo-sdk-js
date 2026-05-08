import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { connectUrl } from "./connect";

beforeEach(() => { vi.stubEnv("VENDO_API_KEY", "vendo_sk_test"); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("connectUrl", () => {
  it("generates the correct URL with apiKey", () => {
    const url = connectUrl("telegram", { apiKey: "k" });
    expect(url).toBe("https://vendo.run/connections/connect/telegram?app_key=k");
  });

  it("uses custom baseUrl", () => {
    const url = connectUrl("telegram", {
      apiKey: "mykey",
      baseUrl: "https://staging.vendo.run",
    });
    expect(url).toContain("https://staging.vendo.run/connections/connect/telegram");
  });

  it("strips trailing slash from baseUrl", () => {
    const url = connectUrl("telegram", {
      apiKey: "k",
      baseUrl: "https://vendo.run/",
    });
    expect(url).toContain("https://vendo.run/connections/connect/telegram");
    expect(url).not.toContain("//connect");
  });

  it("URL-encodes returnTo", () => {
    const url = connectUrl("telegram", {
      apiKey: "k",
      returnTo: "https://app.example.com/connected?foo=bar",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("return_to")).toBe(
      "https://app.example.com/connected?foo=bar",
    );
  });

  it("URL-encodes state", () => {
    const url = connectUrl("telegram", {
      apiKey: "k",
      state: "user=123&session=abc",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("state")).toBe("user=123&session=abc");
  });

  it("URL-encodes slug with special characters", () => {
    const url = connectUrl("my integration", { apiKey: "k" });
    expect(url).toContain("/connections/connect/my%20integration");
  });

  it("omits returnTo and state when not provided", () => {
    const url = connectUrl("telegram", { apiKey: "k" });
    const parsed = new URL(url);
    expect(parsed.searchParams.has("return_to")).toBe(false);
    expect(parsed.searchParams.has("state")).toBe(false);
  });
});
