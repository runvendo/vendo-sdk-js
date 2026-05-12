import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Vendo } from "./_client";
import { IdentityNotPresent } from "./errors";

const captured: Record<string, string | undefined> = {};
beforeEach(() => { captured.VENDO_API_KEY = process.env.VENDO_API_KEY; });
afterEach(() => {
  if (captured.VENDO_API_KEY === undefined) delete process.env.VENDO_API_KEY;
  else process.env.VENDO_API_KEY = captured.VENDO_API_KEY;
});

describe("forUser injection", () => {
  it("forUser-cloned client sends X-Vendo-User-JWT", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const seenHeaders: Record<string, string> = {};
    const fakeFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      Object.assign(seenHeaders, headers);
      return new Response(JSON.stringify({ integrations: [] }), { status: 200 });
    });
    const v = new Vendo({ fetch: fakeFetch as unknown as typeof fetch });
    const u = v.forUser("user-jwt-abc");
    await u.integrations.list();
    expect(seenHeaders["X-Vendo-User-JWT"]).toBe("user-jwt-abc");
  });

  it("unscoped client does NOT send the JWT header", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const seenHeaders: Record<string, string> = {};
    const fakeFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      Object.assign(seenHeaders, headers);
      return new Response(JSON.stringify({ integrations: [] }), { status: 200 });
    });
    const v = new Vendo({ fetch: fakeFetch as unknown as typeof fetch });
    await v.integrations.list();
    expect("X-Vendo-User-JWT" in seenHeaders).toBe(false);
  });
});

describe("forRequest", () => {
  it("extracts JWT from canonical header (plain object)", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const u = new Vendo().forRequest({ "X-Vendo-User-JWT": "jwt-from-request" });
    expect(u._userJwt).toBe("jwt-from-request");
  });

  it("case-insensitive (lowercase header)", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const u = new Vendo().forRequest({ "x-vendo-user-jwt": "jwt-lower" });
    expect(u._userJwt).toBe("jwt-lower");
  });

  it("works with a Headers object", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const h = new Headers({ "X-Vendo-User-JWT": "jwt-from-headers" });
    const u = new Vendo().forRequest(h);
    expect(u._userJwt).toBe("jwt-from-headers");
  });

  it("throws IdentityNotPresent when header is missing", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    expect(() => new Vendo().forRequest({})).toThrow(IdentityNotPresent);
  });

  it("throws IdentityNotPresent when header is blank", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    expect(() => new Vendo().forRequest({ "X-Vendo-User-JWT": "   " })).toThrow(IdentityNotPresent);
  });

  it("works with apiKey from the instance even after env is unset (browser-safe)", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const v = new Vendo();
    delete process.env.VENDO_API_KEY;
    expect(v.forRequest({ "X-Vendo-User-JWT": "any.jwt.value" })).toBeInstanceOf(Vendo);
  });
});
