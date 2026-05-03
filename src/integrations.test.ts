import { describe, it, expect, vi } from "vitest";
import type { HttpAdapter } from "./_http";
import { IntegrationsAPI } from "./integrations";
import { VendoError } from "./errors";

function makeHttp(overrides?: Partial<HttpAdapter>): HttpAdapter {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as HttpAdapter;
}

const RAW_INTEGRATION = {
  slug: "telegram",
  name: "Telegram",
  description: "Telegram Bot integration",
  category: "messaging",
  logo_url: "https://example.com/telegram.png",
  brand_color: "#0088cc",
  docs_url: "https://docs.vendo.run/telegram",
  supported_profiles: ["byok_static", "managed"],
  default_profile: "byok_static",
  enabled: true,
  featured: true,
};

describe("IntegrationsAPI", () => {
  it("list() returns mapped Integration objects", async () => {
    const http = makeHttp({
      get: vi.fn().mockResolvedValue({ integrations: [RAW_INTEGRATION] }),
    });
    const api = new IntegrationsAPI(http);
    const integrations = await api.list();

    expect(integrations).toHaveLength(1);
    expect(integrations[0].slug).toBe("telegram");
    expect(integrations[0].name).toBe("Telegram");
    expect(integrations[0].enabled).toBe(true);
  });

  it("list() maps snake_case to camelCase correctly", async () => {
    const http = makeHttp({
      get: vi.fn().mockResolvedValue({ integrations: [RAW_INTEGRATION] }),
    });
    const api = new IntegrationsAPI(http);
    const [integration] = await api.list();

    // Verify explicit camelCase field names
    expect(integration.logoUrl).toBe("https://example.com/telegram.png");
    expect(integration.brandColor).toBe("#0088cc");
    expect(integration.docsUrl).toBe("https://docs.vendo.run/telegram");
    expect(integration.supportedProfiles).toEqual(["byok_static", "managed"]);
    expect(integration.defaultProfile).toBe("byok_static");
    expect(integration.featured).toBe(true);
  });

  it("get(slug) returns single integration", async () => {
    const http = makeHttp({
      get: vi.fn().mockResolvedValue(RAW_INTEGRATION),
    });
    const api = new IntegrationsAPI(http);
    const integration = await api.get("telegram");

    expect(integration).not.toBeNull();
    expect(integration?.slug).toBe("telegram");
  });

  it("get(slug) returns null on 404", async () => {
    const err = new VendoError("Not found", { code: "not_found", status: 404 });
    const http = makeHttp({
      get: vi.fn().mockRejectedValue(err),
    });
    const api = new IntegrationsAPI(http);
    const integration = await api.get("nonexistent");

    expect(integration).toBeNull();
  });

  it("get(slug) re-throws non-404 errors", async () => {
    const err = new VendoError("Server error", { code: "internal_error", status: 500 });
    const http = makeHttp({
      get: vi.fn().mockRejectedValue(err),
    });
    const api = new IntegrationsAPI(http);

    await expect(api.get("telegram")).rejects.toThrow(VendoError);
  });
});
