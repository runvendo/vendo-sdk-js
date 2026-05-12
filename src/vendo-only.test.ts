import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Vendo } from "./_client";
import { BillingAPI } from "./billing";
import { connectUrl } from "./connect";
import { VendoOnlyFeature } from "./errors";

const captured: Record<string, string | undefined> = {};
beforeEach(() => { captured.VENDO_API_KEY = process.env.VENDO_API_KEY; });
afterEach(() => {
  if (captured.VENDO_API_KEY === undefined) delete process.env.VENDO_API_KEY;
  else process.env.VENDO_API_KEY = captured.VENDO_API_KEY;
});

describe("BillingAPI in OSS mode", () => {
  it("balance throws VendoOnlyFeature", async () => {
    delete process.env.VENDO_API_KEY;
    const fakeHttp = { get: () => { throw new Error("must not call"); } };
    const api = new BillingAPI(fakeHttp as never);
    await expect(api.balance()).rejects.toBeInstanceOf(VendoOnlyFeature);
  });
  it("spendCaps throws VendoOnlyFeature", async () => {
    delete process.env.VENDO_API_KEY;
    const fakeHttp = { get: () => { throw new Error(); } };
    const api = new BillingAPI(fakeHttp as never);
    await expect(api.spendCaps()).rejects.toBeInstanceOf(VendoOnlyFeature);
  });
  it("usage throws VendoOnlyFeature", async () => {
    delete process.env.VENDO_API_KEY;
    const fakeHttp = { get: () => { throw new Error(); } };
    const api = new BillingAPI(fakeHttp as never);
    await expect(api.usage()).rejects.toBeInstanceOf(VendoOnlyFeature);
  });
});

describe("connectUrl gate", () => {
  it("module-level throws when no apiKey is supplied and env is unset", () => {
    delete process.env.VENDO_API_KEY;
    expect(() => connectUrl("openai", { apiKey: "", returnTo: "https://x" }))
      .toThrow(VendoOnlyFeature);
  });

  it("module-level accepts an explicit apiKey even without env (browser-safe)", () => {
    delete process.env.VENDO_API_KEY;
    expect(
      connectUrl("openai", { apiKey: "vendo_sk_x", returnTo: "https://x" }),
    ).toContain("app_key=vendo_sk_x");
  });

  it("Vendo.connectUrl works with apiKey from the instance, regardless of env", () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const v = new Vendo();
    delete process.env.VENDO_API_KEY;
    expect(v.connectUrl("openai")).toContain("/connections/connect/openai");
  });
});
