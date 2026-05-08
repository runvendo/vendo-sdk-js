import { VendoOnlyFeature } from "./errors";

export function isVendoMode(): boolean {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return Boolean((env.VENDO_API_KEY ?? "").trim());
}

export function requireVendoMode(featureName: string): void {
  if (!isVendoMode()) {
    throw new VendoOnlyFeature(
      `${featureName} is not available in OSS mode. Set VENDO_API_KEY to enable Vendo mode.`,
    );
  }
}
