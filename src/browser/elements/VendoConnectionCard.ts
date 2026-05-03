import { openPopup } from "../popup.js";
import { openSseStream, type SseCleanup } from "../sse-client.js";

type CardStatus =
  | "available"
  | "connecting"
  | "pending_setup"
  | "connected"
  | "needs_reauth"
  | "error";

interface ConnectionInfo {
  id: string;
  displayName?: string;
  errorMessage?: string;
}

/** Escape HTML special characters to prevent XSS when interpolating server-controlled
 *  strings into innerHTML template literals. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** <vendo-connection-card> — Vanilla Web Component (no Lit) mirroring ConnectionCard (React).
 *  Fetches live state from the Vendo API and opens an SSE stream for real-time updates.
 *
 *  Attributes:
 *   slug             (required) — integration slug
 *   api-key          (optional) — vendo_sk_* key
 *   base-url         (optional) — defaults to https://vendo.run
 *   manage-base-url  (optional) — override for the dashboard origin
 *   compact          (boolean)  — compact layout
 *
 *  Events dispatched:
 *   vendo-connected     { connectionId }
 *   vendo-disconnected  { connectionId }
 *
 *  CSS custom properties:
 *   --vendo-color-brand, --vendo-color-border, --vendo-color-surface,
 *   --vendo-color-muted, --vendo-color-success, --vendo-color-warning,
 *   --vendo-color-error, --vendo-radius
 */
export class VendoConnectionCard extends HTMLElement {
  static observedAttributes = ["slug", "api-key", "base-url", "manage-base-url", "compact"];

  private _status: CardStatus = "available";
  private _connection: ConnectionInfo | null = null;
  private _displayName = "";
  private _sseCleanup: SseCleanup | null = null;
  private _shadow: ShadowRoot | null = null;
  /** Cancel function for any in-flight popup; called in disconnectedCallback to prevent leaks. */
  private _cancelInFlight: (() => void) | null = null;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this._shadow = this.attachShadow({ mode: "open" });
      this._render();
    }
    const slug = this.getAttribute("slug");
    const apiKey = this._resolveApiKey();
    if (slug && apiKey) {
      void this._fetchState();
      this._openSse();
    }
  }

  disconnectedCallback(): void {
    this._sseCleanup?.();
    this._sseCleanup = null;
    // Cancel any pending popup to stop its polling interval/timeout/listener
    this._cancelInFlight?.();
    this._cancelInFlight = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    // When slug or api-key changes to a different value, restart fetch + SSE from scratch
    if ((name === "slug" || name === "api-key") && oldValue !== newValue && oldValue !== null) {
      this._sseCleanup?.();
      this._sseCleanup = null;
      this._status = "available";
      this._connection = null;
      this._displayName = "";
      const slug = this.getAttribute("slug");
      const apiKey = this._resolveApiKey();
      if (slug && apiKey) {
        void this._fetchState();
        this._openSse();
      }
    }
    this._render();
  }

  private _resolveApiKey(): string {
    const attr = this.getAttribute("api-key");
    if (attr) return attr;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="vendo-api-key"]');
    if (meta?.content) return meta.content;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((window as any).Vendo?.apiKey as string | undefined) ?? "";
  }

  private async _fetchState(): Promise<void> {
    const key = this._resolveApiKey();
    const baseUrl = this.getAttribute("base-url") || "https://vendo.run";
    const slug = this.getAttribute("slug") ?? "";
    if (!key) return;
    try {
      const res = await fetch(`${baseUrl}/api/deployments/me/connections`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return;
      const all = (await res.json()) as Array<{
        slug: string;
        status: string;
        id: string;
        display_name?: string;
        error_message?: string;
      }>;
      const conn = all.find((c) => c.slug === slug);
      if (conn) {
        this._connection = {
          id: conn.id,
          displayName: conn.display_name,
          errorMessage: conn.error_message,
        };
        this._status = (conn.status as CardStatus) ?? "available";
        this._displayName = conn.display_name ?? slug;
      }
      this._render();
    } catch {
      // Network error; leave current state
    }
  }

  private _openSse(): void {
    const key = this._resolveApiKey();
    const baseUrl = this.getAttribute("base-url") || "https://vendo.run";
    const slug = this.getAttribute("slug") ?? "";
    if (!key) return;
    this._sseCleanup = openSseStream(
      `${baseUrl}/api/deployments/me/events`,
      key,
      (event) => {
        if (
          event.type === "connection_updated" ||
          event.type === "connection_created" ||
          event.type === "connection_deleted"
        ) {
          const data = event.data as { slug?: string } | null;
          if (!data || data.slug === slug) {
            void this._fetchState();
          }
        }
      },
      // SSE auth errors are non-fatal — card stays usable; live updates simply won't arrive
      (err) => console.warn("[vendo-connection-card] SSE error:", err.message),
    );
  }

  /** Test helper — drive displayed state directly without network calls. */
  _setState(status: CardStatus, connection?: ConnectionInfo): void {
    this._status = status;
    this._connection = connection ?? null;
    this._displayName = connection?.displayName ?? (this.getAttribute("slug") ?? "");
    this._render();
  }

  private _buildConnectUrl(): string {
    const key = this._resolveApiKey();
    const baseUrl = this.getAttribute("base-url") || "https://vendo.run";
    const slug = this.getAttribute("slug") ?? "";
    const params = new URLSearchParams();
    if (key) params.set("app_key", key);
    params.set("return_to", window.location.href);
    return `${baseUrl}/connect/${slug}?${params.toString()}`;
  }

  private async _handleConnect(): Promise<void> {
    const slug = this.getAttribute("slug") ?? "";
    this._status = "connecting";
    this._render();
    const url = this._buildConnectUrl();

    let abortController: AbortController | null = new AbortController();
    let cancelled = false;
    this._cancelInFlight = () => {
      cancelled = true;
      abortController?.abort();
      abortController = null;
    };

    try {
      const result = await openPopup({ url, expectedSlug: slug });
      if (cancelled) return;
      if (result.status === "connected") {
        this._status = "connected";
        this._connection = { id: result.connectionId };
        this._displayName = slug;
        this.dispatchEvent(
          new CustomEvent("vendo-connected", {
            bubbles: true, composed: true,
            detail: { connectionId: result.connectionId },
          }),
        );
        void this._fetchState();
      } else if (result.status === "redirected") {
        return;
      } else {
        this._status = "available";
      }
    } catch {
      if (!cancelled) this._status = "error";
    } finally {
      this._cancelInFlight = null;
    }
    if (!cancelled) this._render();
  }

  private _handleManage(): void {
    if (!this._connection) return;
    const baseUrl = this.getAttribute("base-url") || "https://vendo.run";
    const manageBaseUrl = this.getAttribute("manage-base-url") || baseUrl.replace(/\/api\/?$/, "");
    const url = `${manageBaseUrl}/dashboard/connections/${this._connection.id}`;
    window.open(url, "vendo-manage", "width=960,height=720,popup");
  }

  private _handleCancel(): void {
    this._status = "available";
    this._render();
  }

  private _renderStatus(): string {
    switch (this._status) {
      case "available": return "";
      case "connecting":
        return `<span class="vendo-card__status"><span class="spinner"></span> Connecting…</span>`;
      case "pending_setup":
        return `<span class="vendo-card__status">Setup incomplete</span>`;
      case "connected":
        return `<span class="vendo-card__status vendo-card__status--connected">● Connected</span>`;
      case "needs_reauth":
        return `<span class="vendo-card__status vendo-card__status--warning">● Reauth needed</span>`;
      case "error": {
        // errorMessage is server-supplied — escape to prevent XSS via stored content
        const raw = this._connection?.errorMessage ?? "";
        const msg = raw ? `: ${escapeHtml(raw.slice(0, 60))}` : "";
        return `<span class="vendo-card__status vendo-card__status--error">● Error${msg}</span>`;
      }
      default: return "";
    }
  }

  private _renderActions(): string {
    switch (this._status) {
      case "available":
        return `<button data-action="connect">Connect</button>`;
      case "connecting":
        return `<button data-action="cancel">Cancel</button>`;
      case "pending_setup":
        return `
          <button data-action="connect">Continue setup</button>
          <button class="secondary" data-action="cancel">Cancel</button>
        `;
      case "connected":
        return `<button data-action="manage">Manage</button>`;
      case "needs_reauth":
        return `
          <button data-action="connect">Reconnect</button>
          <button class="secondary" data-action="manage">Manage</button>
        `;
      case "error":
        return `
          <button data-action="connect">Retry</button>
          <button class="secondary" data-action="manage">Manage</button>
        `;
      default:
        return `<button data-action="connect">Connect</button>`;
    }
  }

  private _render(): void {
    const shadow = this._shadow ?? this.shadowRoot;
    if (!shadow) return;

    // displayName is server-supplied — escape to prevent XSS via stored display_name values
    const displayName = escapeHtml(this._displayName || (this.getAttribute("slug") ?? ""));
    const compact = this.hasAttribute("compact");

    shadow.innerHTML = `
      <style>
        :host { display: block; font-family: inherit; }
        .vendo-card {
          display: flex; align-items: center; gap: 0.75rem;
          padding: ${compact ? "0.5rem 0.75rem" : "1rem"};
          border: 1px solid var(--vendo-color-border, #e2e8f0);
          border-radius: var(--vendo-radius, 8px);
          background: var(--vendo-color-surface, #fff);
        }
        .vendo-card__info { flex: 1; min-width: 0; }
        .vendo-card__name { font-weight: 600; font-size: 0.9rem; }
        .vendo-card__status { font-size: 0.78rem; color: var(--vendo-color-muted, #64748b); margin-top: 0.15rem; display: block; }
        .vendo-card__status--connected { color: var(--vendo-color-success, #16a34a); }
        .vendo-card__status--warning { color: var(--vendo-color-warning, #d97706); }
        .vendo-card__status--error { color: var(--vendo-color-error, #dc2626); }
        .vendo-card__actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
        button {
          padding: 0.35em 0.85em; border: none;
          border-radius: var(--vendo-radius, 6px);
          background: var(--vendo-color-brand, #6c47ff);
          color: #fff; font-family: inherit; font-size: 0.82rem;
          font-weight: 600; cursor: pointer; transition: opacity 0.15s;
        }
        button:hover { opacity: 0.88; }
        button.secondary {
          background: transparent; color: var(--vendo-color-muted, #64748b);
          border: 1px solid currentColor;
        }
        .spinner {
          display: inline-block; width: 0.9em; height: 0.9em;
          border: 2px solid currentColor; border-top-color: transparent;
          border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
      <div class="vendo-card">
        <div class="vendo-card__info">
          <div class="vendo-card__name">${displayName}</div>
          ${this._renderStatus()}
        </div>
        <div class="vendo-card__actions">
          ${this._renderActions()}
        </div>
      </div>
    `;

    // Wire button event handlers after innerHTML update
    shadow.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
      const action = btn.dataset["action"];
      if (action === "connect") btn.addEventListener("click", () => void this._handleConnect());
      else if (action === "manage") btn.addEventListener("click", () => this._handleManage());
      else if (action === "cancel") btn.addEventListener("click", () => this._handleCancel());
    });
  }
}
