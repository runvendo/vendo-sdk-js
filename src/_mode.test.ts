import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isVendoMode, requireVendoMode } from "./_mode";
import { VendoOnlyFeature } from "./errors";

describe("isVendoMode", () => {
  let original: string | undefined;
  beforeEach(() => { original = process.env.VENDO_API_KEY; });
  afterEach(() => {
    if (original === undefined) delete process.env.VENDO_API_KEY;
    else process.env.VENDO_API_KEY = original;
  });

  it("true when VENDO_API_KEY set", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    expect(isVendoMode()).toBe(true);
  });

  it("false when unset", () => {
    delete process.env.VENDO_API_KEY;
    expect(isVendoMode()).toBe(false);
  });

  it("false when empty", () => {
    process.env.VENDO_API_KEY = "";
    expect(isVendoMode()).toBe(false);
  });

  it("false when whitespace", () => {
    process.env.VENDO_API_KEY = "   ";
    expect(isVendoMode()).toBe(false);
  });
});

describe("requireVendoMode", () => {
  it("passes when VENDO_API_KEY set", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    expect(() => requireVendoMode("x.y")).not.toThrow();
  });

  it("throws VendoOnlyFeature in OSS", () => {
    delete process.env.VENDO_API_KEY;
    expect(() => requireVendoMode("billing.balance")).toThrow(VendoOnlyFeature);
  });

  it("error message names the feature and hints VENDO_API_KEY", () => {
    delete process.env.VENDO_API_KEY;
    try {
      requireVendoMode("billing.balance");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("billing.balance");
      expect(msg).toContain("VENDO_API_KEY");
    }
  });

  it("passes when explicit apiKey is supplied, even with no env", () => {
    delete process.env.VENDO_API_KEY;
    expect(() => requireVendoMode("connectUrl", "vendo_sk_test")).not.toThrow();
  });

  it("falls back to env when explicit apiKey is empty/whitespace", () => {
    delete process.env.VENDO_API_KEY;
    expect(() => requireVendoMode("connectUrl", "")).toThrow(VendoOnlyFeature);
    expect(() => requireVendoMode("connectUrl", "   ")).toThrow(VendoOnlyFeature);
  });
});
