import { describe, it, expect } from "vitest";
import {
  VendoError,
  AuthError,
  NotConnected,
  NeedsReauth,
  BalanceExhausted,
  SpendCapExceeded,
  RateLimited,
  UpstreamError,
  ValidationError,
  IdempotencyConflict,
  fromResponse,
} from "./errors";

describe("fromResponse", () => {
  it("binding_missing returns NotConnected with slug + connectUrl populated", () => {
    const err = fromResponse({
      status: 403,
      headers: { "Vendo-Error-Code": "binding_missing" },
      body: {
        error: {
          code: "binding_missing",
          message: "No binding found",
          slug: "my-app",
          connect_url: "https://vendo.run/connect/my-app",
        },
      },
    });
    expect(err).toBeInstanceOf(NotConnected);
    expect(err.code).toBe("binding_missing");
    expect(err.slug).toBe("my-app");
    expect(err.connectUrl).toBe("https://vendo.run/connect/my-app");
    expect(err.status).toBe(403);
  });

  it("connection_needs_reauth returns NeedsReauth", () => {
    const err = fromResponse({
      status: 401,
      headers: { "Vendo-Error-Code": "connection_needs_reauth" },
      body: {
        error: {
          code: "connection_needs_reauth",
          message: "Re-auth required",
        },
      },
    });
    expect(err).toBeInstanceOf(NeedsReauth);
    expect(err.code).toBe("connection_needs_reauth");
    expect(err.status).toBe(401);
  });

  it("upstream_rate_limited threads retryAfter", () => {
    const err = fromResponse({
      status: 429,
      headers: { "Vendo-Error-Code": "upstream_rate_limited" },
      body: {
        error: {
          code: "upstream_rate_limited",
          message: "Rate limited",
          retry_after: 30,
        },
      },
    });
    expect(err).toBeInstanceOf(RateLimited);
    expect(err.retryAfter).toBe(30);
  });

  it("unknown code falls back to VendoError (not a subclass)", () => {
    const err = fromResponse({
      status: 500,
      headers: {},
      body: {
        error: {
          code: "some_unknown_code",
          message: "Something broke",
        },
      },
    });
    expect(err).toBeInstanceOf(VendoError);
    expect(err.constructor).toBe(VendoError);
    expect(err.code).toBe("some_unknown_code");
  });

  it("all 9 subclasses inherit from VendoError", () => {
    const classes = [
      AuthError,
      NotConnected,
      NeedsReauth,
      BalanceExhausted,
      SpendCapExceeded,
      RateLimited,
      UpstreamError,
      ValidationError,
      IdempotencyConflict,
    ];
    for (const Cls of classes) {
      const instance = new Cls("test", { code: "test" });
      expect(instance).toBeInstanceOf(VendoError);
    }
  });
});
