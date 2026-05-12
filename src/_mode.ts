import { VendoOnlyFeature } from "./errors";

export function isVendoMode(): boolean {
  const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
  return Boolean((env.VENDO_API_KEY ?? "").trim());
}

// `apiKey` lets callers prove Vendo mode at runtime in environments that don't
// expose `process.env` (browsers). If a non-empty key is in scope, the feature
// is allowed regardless of env. Env-based detection stays for CLI / Node
// callers that haven't explicitly threaded a key through.
export function requireVendoMode(featureName: string, apiKey?: string): void {
  if (apiKey && apiKey.trim()) return;
  if (!isVendoMode()) {
    throw new VendoOnlyFeature(
      `${featureName} is not available in OSS mode. Set VENDO_API_KEY to enable Vendo mode.`,
    );
  }
}
