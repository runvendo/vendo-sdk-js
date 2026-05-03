/**
 * Duplicated intentionally from packages/connect-portal/src/popup/usePopupConnect.ts.
 * Source of truth is the React package — keep in sync manually when the popup lifecycle changes.
 * Removed the React hook wrapper; exposes a plain async function instead.
 */
import { subscribe, expectedOrigin } from "./postMessageBridge.js";

export type PopupResult =
  | { status: "connected"; connectionId: string; slug: string }
  | { status: "cancelled" }
  | { status: "timeout" }
  | { status: "redirected"; url: string };

interface OpenOpts {
  url: string;
  expectedOrigin?: string;
  expectedSlug: string;
  /** Milliseconds before the popup is considered timed out. Defaults to 300_000 (5 min). */
  timeoutMs?: number;
}

/** Open a connect popup and wait for the postMessage handshake.
 *  Falls back to window.location.assign() when the popup is blocked,
 *  dispatching a 'redirected' result so callers can update UI.
 */
export async function openPopup(opts: OpenOpts): Promise<PopupResult> {
  const { url, expectedSlug, timeoutMs = 300_000 } = opts;
  // Derive expected origin from url if not explicitly provided
  const origin = opts.expectedOrigin ?? expectedOrigin(url);

  const popup = window.open(url, "vendo-connect", "width=480,height=720,popup");

  if (!popup) {
    // Popup blocked — fall back to full navigation
    window.location.assign(url);
    return { status: "redirected", url };
  }

  return new Promise<PopupResult>((resolve) => {
    let settled = false;

    function settle(result: PopupResult): void {
      if (settled) return;
      settled = true;
      clearInterval(pollId);
      clearTimeout(timeoutId);
      unsubscribe();
      resolve(result);
    }

    const unsubscribe = subscribe(
      (data) => {
        settle({ status: "connected", connectionId: data.connectionId, slug: data.slug });
      },
      { expectedOrigin: origin, expectedSlug },
    );

    // Poll every 500ms to detect popup closed before completion
    const pollId = setInterval(() => {
      if (popup.closed) settle({ status: "cancelled" });
    }, 500);

    const timeoutId = setTimeout(() => {
      if (!popup.closed) popup.close();
      settle({ status: "timeout" });
    }, timeoutMs);
  });
}
