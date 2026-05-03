import { openPopup } from "../popup.js";

/** <vendo-connect-button> — Vanilla Web Component (no Lit) for Vendo OAuth connect flow.
 *  Mirrors the popup + postMessage handshake used by @vendodev/connect-portal (React).
 *
 *  Attributes:
 *   slug       (required) — integration slug to connect
 *   return-to  (optional) — return URL after connect; defaults to window.location.href
 *   api-key    (optional) — vendo_sk_* key; falls back to <meta name="vendo-api-key"> then window.Vendo?.apiKey
 *   base-url   (optional) — defaults to https://vendo.run
 *
 *  Events dispatched:
 *   vendo-connected   { slug, connectionId }
 *   vendo-cancelled
 *   vendo-timeout
 *   vendo-redirected  { url }
 *   vendo-error       { error }
 *
 *  CSS custom properties:
 *   --vendo-color-brand  (default #6c47ff)
 *   --vendo-radius       (default 6px)
 */
export class VendoConnectButton extends HTMLElement {
  static observedAttributes = ["slug", "return-to", "api-key", "base-url"];

  private _btn: HTMLButtonElement | null = null;
  private _inFlight = false;
  /** Cancel function for any in-flight popup; called in disconnectedCallback to prevent leaks. */
  private _cancelInFlight: (() => void) | null = null;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: "open" });
      shadow.innerHTML = `
        <style>
          :host { display: inline-block; }
          button {
            display: inline-flex; align-items: center; gap: 0.4em;
            padding: 0.5em 1.1em; border: none;
            border-radius: var(--vendo-radius, 6px);
            background: var(--vendo-color-brand, #6c47ff);
            color: #fff; font-family: inherit; font-size: 0.9rem;
            font-weight: 600; cursor: pointer; transition: opacity 0.15s;
          }
          button:disabled { opacity: 0.55; cursor: not-allowed; }
          button:not(:disabled):hover { opacity: 0.88; }
        </style>
        <button part="button"><slot>Connect</slot></button>
      `;
      this._btn = shadow.querySelector("button");
      this._btn?.addEventListener("click", () => void this._handleClick());
    }
  }

  disconnectedCallback(): void {
    // Cancel any pending popup so its polling interval/timeout/listener don't outlive the element
    this._cancelInFlight?.();
    this._cancelInFlight = null;
  }

  attributeChangedCallback(): void {
    // No re-render needed — attributes are read on click
  }

  private _resolveApiKey(): string {
    const attr = this.getAttribute("api-key");
    if (attr) return attr;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="vendo-api-key"]');
    if (meta?.content) return meta.content;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((window as any).Vendo?.apiKey as string | undefined) ?? "";
  }

  private _buildConnectUrl(): string {
    const key = this._resolveApiKey();
    const returnTo = this.getAttribute("return-to") || window.location.href;
    const baseUrl = this.getAttribute("base-url") || "https://vendo.run";
    const slug = this.getAttribute("slug") ?? "";
    const params = new URLSearchParams();
    if (key) params.set("app_key", key);
    params.set("return_to", returnTo);
    return `${baseUrl}/connect/${slug}?${params.toString()}`;
  }

  private async _handleClick(): Promise<void> {
    const slug = this.getAttribute("slug");
    if (this._inFlight || !slug) return;
    this._inFlight = true;
    if (this._btn) this._btn.disabled = true;

    const url = this._buildConnectUrl();

    let cancelled = false;
    this._cancelInFlight = () => {
      cancelled = true;
    };

    try {
      const result = await openPopup({ url, expectedSlug: slug });
      if (cancelled) return;

      switch (result.status) {
        case "connected":
          this.dispatchEvent(
            new CustomEvent("vendo-connected", {
              bubbles: true, composed: true,
              detail: { slug: result.slug, connectionId: result.connectionId },
            }),
          );
          break;
        case "cancelled":
          this.dispatchEvent(new CustomEvent("vendo-cancelled", { bubbles: true, composed: true }));
          break;
        case "timeout":
          this.dispatchEvent(new CustomEvent("vendo-timeout", { bubbles: true, composed: true }));
          break;
        case "redirected":
          this.dispatchEvent(
            new CustomEvent("vendo-redirected", {
              bubbles: true, composed: true,
              detail: { url: result.url },
            }),
          );
          return; // page is navigating
      }
    } catch (err) {
      if (!cancelled) {
        this.dispatchEvent(
          new CustomEvent("vendo-error", {
            bubbles: true, composed: true, detail: { error: err },
          }),
        );
      }
    } finally {
      this._cancelInFlight = null;
      this._inFlight = false;
      if (this._btn) this._btn.disabled = false;
    }
  }
}
