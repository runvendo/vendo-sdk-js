import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { HttpAdapter } from "./_http";
import { BillingAPI } from "./billing";

beforeEach(() => { vi.stubEnv("VENDO_API_KEY", "vendo_sk_test"); });
afterEach(() => { vi.unstubAllEnvs(); });

function makeHttp(overrides?: Partial<HttpAdapter>): HttpAdapter {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as HttpAdapter;
}

describe("BillingAPI", () => {
  describe("balance()", () => {
    it("returns mapped Balance object", async () => {
      const http = makeHttp({
        get: vi.fn().mockResolvedValue({
          credits_remaining_micros: 5_000_000,
          currency: "USD",
          top_up_url: "https://vendo.run/billing/topup",
        }),
      });
      const api = new BillingAPI(http);
      const balance = await api.balance();

      expect(balance.creditsRemainingMicros).toBe(5_000_000);
      expect(balance.currency).toBe("USD");
      expect(balance.topUpUrl).toBe("https://vendo.run/billing/topup");
    });

    it("maps snake_case to camelCase (topUpUrl)", async () => {
      const http = makeHttp({
        get: vi.fn().mockResolvedValue({
          credits_remaining_micros: 0,
          currency: "USD",
          top_up_url: "https://vendo.run/topup",
        }),
      });
      const api = new BillingAPI(http);
      const balance = await api.balance();

      // Verify explicit camelCase field
      expect(balance.topUpUrl).toBe("https://vendo.run/topup");
    });

    it("defaults missing fields", async () => {
      const http = makeHttp({
        get: vi.fn().mockResolvedValue({}),
      });
      const api = new BillingAPI(http);
      const balance = await api.balance();

      expect(balance.creditsRemainingMicros).toBe(0);
      expect(balance.currency).toBe("USD");
      expect(balance.topUpUrl).toBe("");
    });
  });

  describe("spendCaps()", () => {
    it("returns mapped SpendCaps object", async () => {
      const http = makeHttp({
        get: vi.fn().mockResolvedValue({
          daily_micros: 1_000_000,
          monthly_micros: 10_000_000,
          used_today_micros: 250_000,
          used_month_micros: 2_500_000,
        }),
      });
      const api = new BillingAPI(http);
      const caps = await api.spendCaps();

      expect(caps.dailyMicros).toBe(1_000_000);
      expect(caps.monthlyMicros).toBe(10_000_000);
      expect(caps.usedTodayMicros).toBe(250_000);
      expect(caps.usedMonthMicros).toBe(2_500_000);
    });

    it("maps snake_case to camelCase (usedTodayMicros)", async () => {
      const http = makeHttp({
        get: vi.fn().mockResolvedValue({
          used_today_micros: 42,
          used_month_micros: 100,
        }),
      });
      const api = new BillingAPI(http);
      const caps = await api.spendCaps();

      // Verify explicit camelCase field name
      expect(caps.usedTodayMicros).toBe(42);
    });

    it("null caps are preserved as null", async () => {
      const http = makeHttp({
        get: vi.fn().mockResolvedValue({
          daily_micros: null,
          monthly_micros: null,
        }),
      });
      const api = new BillingAPI(http);
      const caps = await api.spendCaps();

      expect(caps.dailyMicros).toBeNull();
      expect(caps.monthlyMicros).toBeNull();
    });
  });

  describe("usage()", () => {
    it("calls with default month period", async () => {
      const mockGet = vi.fn().mockResolvedValue({ items: [] });
      const http = makeHttp({ get: mockGet });
      const api = new BillingAPI(http);

      await api.usage();
      expect(mockGet).toHaveBeenCalledWith("/api/billing/usage?period=month");
    });

    it("calls with specified period", async () => {
      const mockGet = vi.fn().mockResolvedValue({ items: [] });
      const http = makeHttp({ get: mockGet });
      const api = new BillingAPI(http);

      await api.usage({ period: "day" });
      expect(mockGet).toHaveBeenCalledWith("/api/billing/usage?period=day");
    });
  });
});
