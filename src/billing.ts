import type { HttpAdapter } from "./_http";
import { requireVendoMode } from "./_mode";

export interface Balance {
  creditsRemainingMicros: number;
  currency: string;
  topUpUrl: string;
}

export interface SpendCaps {
  dailyMicros: number | null;
  monthlyMicros: number | null;
  usedTodayMicros: number;
  usedMonthMicros: number;
}

export class BillingAPI {
  constructor(private http: HttpAdapter) {}

  async balance(): Promise<Balance> {
    requireVendoMode("billing.balance", this.http.apiKey);
    const r = await this.http.get<{
      credits_remaining_micros?: number;
      currency?: string;
      top_up_url?: string;
    }>("/api/billing/balance");
    return {
      creditsRemainingMicros: r.credits_remaining_micros ?? 0,
      currency: r.currency ?? "USD",
      topUpUrl: r.top_up_url ?? "",
    };
  }

  async spendCaps(): Promise<SpendCaps> {
    requireVendoMode("billing.spendCaps", this.http.apiKey);
    const r = await this.http.get<{
      daily_micros?: number | null;
      monthly_micros?: number | null;
      used_today_micros?: number;
      used_month_micros?: number;
    }>("/api/billing/spend-caps");
    return {
      dailyMicros: r.daily_micros ?? null,
      monthlyMicros: r.monthly_micros ?? null,
      usedTodayMicros: r.used_today_micros ?? 0,
      usedMonthMicros: r.used_month_micros ?? 0,
    };
  }

  async usage(opts: { period?: "day" | "month" } = {}): Promise<unknown> {
    requireVendoMode("billing.usage", this.http.apiKey);
    const period = opts.period ?? "month";
    return this.http.get(`/api/billing/usage?period=${period}`);
  }
}
