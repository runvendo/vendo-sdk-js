/**
 * Duplicated intentionally from packages/connect-portal/src/popup/postMessageBridge.ts.
 * Source of truth is the React package — keep in sync manually when the handshake changes.
 */

/** Derive the expected postMessage origin from a URL.
 *  Returns protocol + host only — event.origin never includes a path.
 */
export function expectedOrigin(baseUrl: string): string {
  const u = new URL(baseUrl);
  return u.origin;
}

export interface BridgeMessageData {
  type: "vendo:connection-completed";
  slug: string;
  connectionId: string;
}

type ValidateResult =
  | { ok: true; data: BridgeMessageData }
  | { ok: false; reason: "origin_mismatch" | "unexpected_type" | "slug_mismatch" };

/** Validate an incoming MessageEvent against the expected origin + slug. */
export function validateMessage(
  event: MessageEvent,
  expectedOrig: string,
  expectedSlug: string,
): ValidateResult {
  if (event.origin !== expectedOrig) {
    return { ok: false, reason: "origin_mismatch" };
  }

  const data = event.data as Record<string, unknown>;
  if (data?.type !== "vendo:connection-completed") {
    return { ok: false, reason: "unexpected_type" };
  }

  if (data?.slug !== expectedSlug) {
    return { ok: false, reason: "slug_mismatch" };
  }

  return { ok: true, data: data as unknown as BridgeMessageData };
}

/** Register a postMessage listener that validates each message and calls handler on success.
 *  Returns an unsubscribe function.
 */
export function subscribe(
  handler: (data: BridgeMessageData) => void,
  opts: { expectedOrigin: string; expectedSlug: string },
): () => void {
  function listener(event: MessageEvent): void {
    const result = validateMessage(event, opts.expectedOrigin, opts.expectedSlug);
    if (result.ok) handler(result.data);
  }

  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
