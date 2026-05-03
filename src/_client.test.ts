import { describe, it, expect, vi, afterEach } from "vitest";
import { Vendo } from "./_client";
import { AuthError } from "./errors";

// Stub fetch so HttpAdapter constructor doesn't throw
const noopFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Vendo", () => {
  it("accepts explicit apiKey and baseUrl", () => {
    const v = new Vendo({ apiKey: "sk-test", baseUrl: "https://custom.api.com", fetch: noopFetch });
    expect(v.apiKey).toBe("sk-test");
    expect(v.baseUrl).toBe("https://custom.api.com");
  });

  it("reads apiKey and baseUrl from process.env when not provided", () => {
    vi.stubEnv("VENDO_API_KEY", "env-key-123");
    vi.stubEnv("VENDO_BASE_URL", "https://env.api.com");
    const v = new Vendo({ fetch: noopFetch });
    expect(v.apiKey).toBe("env-key-123");
    expect(v.baseUrl).toBe("https://env.api.com");
  });

  it("throws AuthError when no apiKey is provided anywhere", () => {
    vi.stubEnv("VENDO_API_KEY", "");
    expect(() => new Vendo({ fetch: noopFetch })).toThrow(AuthError);
  });

  it("defaults baseUrl to https://vendo.run/api when env var is not set", () => {
    vi.stubEnv("VENDO_API_KEY", "sk-test");
    // Ensure VENDO_BASE_URL is not set
    vi.stubEnv("VENDO_BASE_URL", "");
    const v = new Vendo({ fetch: noopFetch });
    expect(v.baseUrl).toBe("https://vendo.run/api");
  });

  it("forUser(jwt) returns a new Vendo instance with _userJwt set", () => {
    const v = new Vendo({ apiKey: "sk-test", fetch: noopFetch });
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig";
    const scoped = v.forUser(jwt);
    expect(scoped).not.toBe(v);
    expect(scoped).toBeInstanceOf(Vendo);
    expect(scoped._userJwt).toBe(jwt);
    expect(v._userJwt).toBeUndefined();
  });
});
