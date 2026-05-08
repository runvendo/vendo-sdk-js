import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Vendo } from "./_client";
import { NotConnected } from "./errors";

const captured: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "VENDO_API_KEY",
  "VENDO_TOKEN_OPENAI",
  "VENDO_TOKEN_TELEGRAM",
  "VENDO_TOKEN_VENDO_TEST_PROBE",
  "OPENAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "ANTHROPIC_API_KEY",
];

beforeEach(() => {
  for (const k of ENV_KEYS) captured[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (captured[k] === undefined) delete process.env[k];
    else process.env[k] = captured[k];
  }
});

describe("Vendo.token BYOK resolution", () => {
  it("VENDO_TOKEN_<SLUG> override wins over Vendo mode", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    process.env.VENDO_TOKEN_OPENAI = "explicit-override";
    const fetchSpy = vi.fn();
    const v = new Vendo({ fetch: fetchSpy as unknown as typeof fetch });
    expect(await v.token("openai")).toBe("explicit-override");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("override wins over BYOK", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const v = new Vendo();
    delete process.env.VENDO_API_KEY;
    process.env.OPENAI_API_KEY = "from-byok";
    process.env.VENDO_TOKEN_OPENAI = "explicit-override";
    expect(await v.token("openai")).toBe("explicit-override");
  });

  it("hyphen slug override (vendo-test-probe -> VENDO_TOKEN_VENDO_TEST_PROBE)", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    process.env.VENDO_TOKEN_VENDO_TEST_PROBE = "probe-tok";
    const v = new Vendo();
    expect(await v.token("vendo-test-probe")).toBe("probe-tok");
  });

  it("Vendo mode hits credentials worker", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    delete process.env.VENDO_TOKEN_OPENAI;
    const fetchSpy = vi.fn(async () => new Response(
      JSON.stringify({ access_token: "from-vendo", expires_at: null }),
      { status: 200 },
    ));
    const v = new Vendo({ fetch: fetchSpy as unknown as typeof fetch });
    expect(await v.token("openai")).toBe("from-vendo");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("/openai");
  });

  it("BYOK reads conventional env var when VENDO_API_KEY unset", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const v = new Vendo();
    delete process.env.VENDO_API_KEY;
    delete process.env.VENDO_TOKEN_OPENAI;
    process.env.OPENAI_API_KEY = "sk-from-env";
    expect(await v.token("openai")).toBe("sk-from-env");
  });

  it("BYOK throws NotConnected when env var missing", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const v = new Vendo();
    delete process.env.VENDO_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.VENDO_TOKEN_OPENAI;
    await expect(v.token("openai")).rejects.toBeInstanceOf(NotConnected);
  });

  it("BYOK throws NotConnected for unknown slug", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const v = new Vendo();
    delete process.env.VENDO_API_KEY;
    await expect(v.token("not-a-slug")).rejects.toBeInstanceOf(NotConnected);
  });

  it("BYOK empty env var treated as missing", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const v = new Vendo();
    delete process.env.VENDO_API_KEY;
    delete process.env.VENDO_TOKEN_OPENAI;
    process.env.OPENAI_API_KEY = "   ";
    await expect(v.token("openai")).rejects.toBeInstanceOf(NotConnected);
  });
});

describe("Vendo.tokens BYOK resolution", () => {
  it("OSS mode reads env vars per slug", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const v = new Vendo();
    delete process.env.VENDO_API_KEY;
    process.env.OPENAI_API_KEY = "sk-from-env";
    process.env.TELEGRAM_BOT_TOKEN = "tele-from-env";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VENDO_TOKEN_OPENAI;
    delete process.env.VENDO_TOKEN_TELEGRAM;
    expect(await v.tokens(["openai", "telegram", "anthropic"])).toEqual({
      openai: "sk-from-env",
      telegram: "tele-from-env",
      anthropic: null,
    });
  });

  it("OSS unknown slug returns null", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const v = new Vendo();
    delete process.env.VENDO_API_KEY;
    expect(await v.tokens(["not-a-slug"])).toEqual({ "not-a-slug": null });
  });

  it("override wins per slug; remaining slugs go to /_bulk in Vendo mode", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    process.env.VENDO_TOKEN_OPENAI = "override-openai";
    delete process.env.VENDO_TOKEN_TELEGRAM;
    const fetchSpy = vi.fn(async () => new Response(
      JSON.stringify({ tokens: { telegram: { access_token: "tele-vendo", expires_at: null } } }),
      { status: 200 },
    ));
    const v = new Vendo({ fetch: fetchSpy as unknown as typeof fetch });
    const result = await v.tokens(["openai", "telegram"]);
    expect(result).toEqual({ openai: "override-openai", telegram: "tele-vendo" });
    // Only telegram should hit /_bulk; openai bypasses.
    expect(fetchSpy).toHaveBeenCalledOnce();
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("slugs=telegram");
    expect(url).not.toContain("openai");
  });

  it("OSS mode bypasses /_bulk entirely", async () => {
    process.env.VENDO_API_KEY = "vendo_sk_test";
    const fetchSpy = vi.fn();
    const v = new Vendo({ fetch: fetchSpy as unknown as typeof fetch });
    delete process.env.VENDO_API_KEY;
    delete process.env.VENDO_TOKEN_OPENAI;
    delete process.env.OPENAI_API_KEY;
    expect(await v.tokens(["openai"])).toEqual({ openai: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
