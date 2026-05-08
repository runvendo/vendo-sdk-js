import { describe, it, expect } from "vitest";
import { primaryEnvVar, allEnvVars, isOauthSlug, knownSlugs } from "./_byok";

describe("primaryEnvVar", () => {
  it("returns env var for known slug", () => {
    expect(primaryEnvVar("openai")).toBe("OPENAI_API_KEY");
    expect(primaryEnvVar("telegram")).toBe("TELEGRAM_BOT_TOKEN");
  });
  it("returns null for unknown slug", () => {
    expect(primaryEnvVar("not-a-slug")).toBeNull();
  });
});

describe("allEnvVars", () => {
  it("returns full list for slack", () => {
    const v = allEnvVars("slack");
    expect(v).toContain("SLACK_BOT_TOKEN");
    expect(v).toContain("SLACK_SIGNING_SECRET");
  });
  it("returns [] for unknown slug", () => {
    expect(allEnvVars("not-a-slug")).toEqual([]);
  });
});

describe("isOauthSlug", () => {
  it("true for gmail", () => { expect(isOauthSlug("gmail")).toBe(true); });
  it("true for notion", () => { expect(isOauthSlug("notion")).toBe(true); });
  it("false for openai", () => { expect(isOauthSlug("openai")).toBe(false); });
  it("false for unknown", () => { expect(isOauthSlug("not-a-slug")).toBe(false); });
});

describe("knownSlugs", () => {
  it("includes the canonical set", () => {
    const s = knownSlugs();
    expect(s.has("openai")).toBe(true);
    expect(s.has("anthropic")).toBe(true);
    expect(s.has("telegram")).toBe(true);
    expect(s.has("slack")).toBe(true);
    expect(s.has("notion")).toBe(true);
  });
});
