import { describe, it, expect, vi } from "vitest";
import type { HttpAdapter } from "./_http";
import { ConnectionsAPI } from "./connections";

function makeHttp(overrides?: Partial<HttpAdapter>): HttpAdapter {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as HttpAdapter;
}

const RAW_CONN = {
  id: "conn_1",
  external_id: "ext_abc",
  slug: "telegram",
  display_name: "Telegram",
  category: "messaging",
  profile: "byok_static",
  status: "connected" as const,
  metadata: { foo: "bar" },
  credential: { bot_token: "tgbottoken" },
  setup_url: null,
  error_message: null,
  connected_at: "2024-01-01T00:00:00Z",
  logo_url: "https://example.com/logo.png",
  brand_color: "#0088cc",
  docs_url: "https://docs.example.com",
};

describe("ConnectionsAPI", () => {
  it("list() returns mapped Connection objects", async () => {
    const http = makeHttp({
      get: vi.fn().mockResolvedValue({ connections: [RAW_CONN] }),
    });
    const api = new ConnectionsAPI(http);
    const conns = await api.list();

    expect(conns).toHaveLength(1);
    expect(conns[0].slug).toBe("telegram");
    expect(conns[0].displayName).toBe("Telegram");
    expect(conns[0].status).toBe("connected");
  });

  it("list() maps snake_case to camelCase correctly", async () => {
    const http = makeHttp({
      get: vi.fn().mockResolvedValue({ connections: [RAW_CONN] }),
    });
    const api = new ConnectionsAPI(http);
    const [conn] = await api.list();

    // Verify explicit camelCase field names
    expect(conn.externalId).toBe("ext_abc");
    expect(conn.displayName).toBe("Telegram");
    expect(conn.setupUrl).toBeNull();
    expect(conn.errorMessage).toBeNull();
    expect(conn.connectedAt).toBe("2024-01-01T00:00:00Z");
    expect(conn.logoUrl).toBe("https://example.com/logo.png");
    expect(conn.brandColor).toBe("#0088cc");
    expect(conn.docsUrl).toBe("https://docs.example.com");
  });

  it("get(slug) returns single connection by slug", async () => {
    const http = makeHttp({
      get: vi.fn().mockResolvedValue({ connections: [RAW_CONN] }),
    });
    const api = new ConnectionsAPI(http);
    const conn = await api.get("telegram");

    expect(conn).not.toBeNull();
    expect(conn?.slug).toBe("telegram");
  });

  it("get(slug) returns null for unknown slug", async () => {
    const http = makeHttp({
      get: vi.fn().mockResolvedValue({ connections: [RAW_CONN] }),
    });
    const api = new ConnectionsAPI(http);
    const conn = await api.get("notion");

    expect(conn).toBeNull();
  });
});

describe("Connection.envBootstrap (Plan 8 schema unification)", () => {
  it("env_bootstrap parsed from raw payload", async () => {
    const { ConnectionsAPI } = await import("./connections");
    const fakeHttp = {
      get: async () => ({
        connections: [{
          id: "conn_x",
          external_id: "ext_y",
          slug: "openai",
          display_name: "OpenAI",
          category: "ai",
          profile: "vendo_managed_pool",
          status: "connected",
          metadata: {},
          credential: null,
          setup_url: null,
          error_message: null,
          connected_at: "2026-05-08T01:00:00Z",
          env_bootstrap: {
            vars: [
              { name: "OPENAI_API_KEY", value_from: "credential.vendo_sk" },
            ],
            restart: "gateway",
          },
        }],
      }),
    };
    const api = new ConnectionsAPI(fakeHttp as never);
    const [conn] = await api.list();
    expect(conn.envBootstrap).toEqual({
      vars: [{ name: "OPENAI_API_KEY", valueFrom: "credential.vendo_sk" }],
      restart: "gateway",
    });
  });

  it("env_bootstrap absent results in null", async () => {
    const { ConnectionsAPI } = await import("./connections");
    const fakeHttp = {
      get: async () => ({
        connections: [{
          id: "c", external_id: "e", slug: "telegram", display_name: "Telegram",
          category: "messaging", profile: "byok_static", status: "connected",
          metadata: {}, credential: null, setup_url: null, error_message: null,
          connected_at: null,
        }],
      }),
    };
    const api = new ConnectionsAPI(fakeHttp as never);
    const [conn] = await api.list();
    expect(conn.envBootstrap).toBeNull();
  });

  it("env_bootstrap with restart=none parses correctly", async () => {
    const { ConnectionsAPI } = await import("./connections");
    const fakeHttp = {
      get: async () => ({
        connections: [{
          id: "c", external_id: "e", slug: "telegram", display_name: "Telegram",
          category: "messaging", profile: "byok_static", status: "connected",
          metadata: {}, credential: null, setup_url: null, error_message: null,
          connected_at: null,
          env_bootstrap: {
            vars: [{ name: "TELEGRAM_BOT_TOKEN", value_from: "credential.bot_token" }],
            restart: "none",
          },
        }],
      }),
    };
    const api = new ConnectionsAPI(fakeHttp as never);
    const [conn] = await api.list();
    expect(conn.envBootstrap?.restart).toBe("none");
  });
});
