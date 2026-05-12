import { openPopup } from "../popup.js";
import {
  subscribeConnection,
  refreshConnections,
  type RawConn,
  type ConnectionStatus,
} from "../connectionsStore.js";

type CardStatus =
  | "loading"
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// `--vendo-card-backdrop-filter` is only meaningful for `glass-*` themes, which
// set it to `blur(16px) saturate(140%)` so the card surface frosts over the
// host page background. Non-glass themes leave it `none` so opaque surfaces
// render without compositor overhead.
const THEMES: Record<string, string> = {
  default: `
    --vendo-color-brand: #2B7A5E;
    --vendo-color-border: #E6DDD0;
    --vendo-color-surface: #FFFFFF;
    --vendo-color-text: #000000;
    --vendo-color-muted: #6B6B65;
    --vendo-color-success: #3A8B52;
    --vendo-color-warning: #C4922A;
    --vendo-color-error: #C44B3B;
    --vendo-color-skeleton: #E6DDD0;
    --vendo-radius: 8px;
    --vendo-card-backdrop-filter: none;
  `,
  beige: `
    --vendo-color-brand: #2B7A5E;
    --vendo-color-border: #D5C9B8;
    --vendo-color-surface: #FAF7F2;
    --vendo-color-text: #1C1B18;
    --vendo-color-muted: #6B6B65;
    --vendo-color-success: #3A8B52;
    --vendo-color-warning: #C4922A;
    --vendo-color-error: #C44B3B;
    --vendo-color-skeleton: #D5C9B8;
    --vendo-radius: 8px;
    --vendo-card-backdrop-filter: none;
  `,
  dark: `
    --vendo-color-brand: #4D9E7C;
    --vendo-color-border: #35342F;
    --vendo-color-surface: #1C1B18;
    --vendo-color-text: #F3EEE6;
    --vendo-color-muted: #A59885;
    --vendo-color-success: #4D9E7C;
    --vendo-color-warning: #DBA83A;
    --vendo-color-error: #E5796A;
    --vendo-color-skeleton: #35342F;
    --vendo-radius: 8px;
    --vendo-card-backdrop-filter: none;
  `,
  "glass-light": `
    --vendo-color-brand: #2B7A5E;
    --vendo-color-border: rgba(28, 27, 24, 0.10);
    --vendo-color-surface: rgba(255, 255, 255, 0.45);
    --vendo-color-text: #1C1B18;
    --vendo-color-muted: #4E4D49;
    --vendo-color-success: #3A8B52;
    --vendo-color-warning: #C4922A;
    --vendo-color-error: #C44B3B;
    --vendo-color-skeleton: rgba(28, 27, 24, 0.08);
    --vendo-radius: 8px;
    --vendo-card-backdrop-filter: blur(16px) saturate(140%);
  `,
  "glass-dark": `
    --vendo-color-brand: #4D9E7C;
    --vendo-color-border: rgba(250, 247, 242, 0.12);
    --vendo-color-surface: rgba(28, 27, 24, 0.45);
    --vendo-color-text: #FAF7F2;
    --vendo-color-muted: #C1B7AB;
    --vendo-color-success: #4D9E7C;
    --vendo-color-warning: #DBA83A;
    --vendo-color-error: #E16D5A;
    --vendo-color-skeleton: rgba(250, 247, 242, 0.10);
    --vendo-radius: 8px;
    --vendo-card-backdrop-filter: blur(16px) saturate(140%);
  `,
};

/** <vendo-connection-card> — Vanilla Web Component (no Lit) mirroring ConnectionCard (React).
 *
 *  Attributes:
 *   slug             (required) — integration slug
 *   name             (optional) — human-readable integration name (title); falls back to slug
 *   api-key          (optional) — vendo_sk_* key
 *   base-url         (optional) — API base (empty = same-origin proxy); defaults to https://vendo.run
 *   connect-origin   (optional) — origin for OAuth popups + manage links; defaults to https://vendo.run
 *   manage-base-url  (optional) — override for the dashboard origin
 *   theme            (optional) — "default" | "beige" | "dark" | "glass-light" | "glass-dark"
 *   compact          (boolean)  — compact layout
 *   logo-url         (optional) — logo image URL
 *   brand-color      (optional) — hex color for left accent border
 */
export class VendoConnectionCard extends HTMLElement {
  static observedAttributes = [
    "slug",
    "name",
    "api-key",
    "base-url",
    "connect-origin",
    "manage-base-url",
    "compact",
    "logo-url",
    "brand-color",
    "theme",
  ];

  private _status: CardStatus = "loading";
  private _connection: ConnectionInfo | null = null;
  private _displayName = "";
  private _logoUrl = "";
  private _brandColor = "";
  private _storeUnsubscribe: (() => void) | null = null;
  private _shadow: ShadowRoot | null = null;
  private _cancelInFlight: (() => void) | null = null;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      this._shadow = this.attachShadow({ mode: "open" });
      this._logoUrl = this.getAttribute("logo-url") ?? "";
      this._brandColor = this.getAttribute("brand-color") ?? "";
      this._render();
    }
    this._subscribeToStore();
  }

  disconnectedCallback(): void {
    this._storeUnsubscribe?.();
    this._storeUnsubscribe = null;
    this._cancelInFlight?.();
    this._cancelInFlight = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if ((name === "slug" || name === "api-key") && oldValue !== newValue && oldValue !== null) {
      // Drop the previous subscription and resubscribe under the new
      // (baseUrl, apiKey, slug) tuple. The store collapses repeat
      // (baseUrl, apiKey) pairs into one fetch + one SSE stream regardless
      // of how many slugs are subscribed.
      this._storeUnsubscribe?.();
      this._storeUnsubscribe = null;
      this._status = "loading";
      this._connection = null;
      this._displayName = "";
      this._subscribeToStore();
    }
    if (name === "logo-url") this._logoUrl = newValue ?? "";
    if (name === "brand-color") this._brandColor = newValue ?? "";
    this._render();
  }

  private _subscribeToStore(): void {
    const slug = this.getAttribute("slug");
    const apiKey = this._resolveApiKey();
    if (!slug || !apiKey) return;
    const baseUrl = this._apiBaseUrl();
    this._storeUnsubscribe = subscribeConnection(
      baseUrl,
      apiKey,
      slug,
      (conn, status) => this._applyStoreUpdate(conn, status),
    );
  }

  private _applyStoreUpdate(conn: RawConn | undefined, status: ConnectionStatus): void {
    const slug = this.getAttribute("slug") ?? "";
    // While the very first fetch is in flight and we have no cached row,
    // keep the skeleton up. After the fetch resolves (or errors), absence
    // of a matching row means the integration is `available`.
    if (status === "loading" && !conn) {
      this._status = "loading";
      this._render();
      return;
    }
    if (conn) {
      this._connection = {
        id: conn.id,
        displayName: conn.display_name,
        errorMessage: conn.error_message,
      };
      this._status = (conn.status as CardStatus) ?? "available";
      this._displayName = conn.display_name ?? slug;
      if (conn.logo_url && !this.getAttribute("logo-url")) this._logoUrl = conn.logo_url;
      if (conn.brand_color && !this.getAttribute("brand-color")) this._brandColor = conn.brand_color;
    } else {
      this._connection = null;
      this._status = "available";
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

  private _apiBaseUrl(): string {
    return this.getAttribute("base-url") ?? "https://vendo.run";
  }

  private _connectOrigin(): string {
    return this.getAttribute("connect-origin")?.trim()
      || this.getAttribute("base-url")?.trim()
      || "https://vendo.run";
  }

  private _resolveLogoUrl(raw: string): string {
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("/")) {
      const origin = this._connectOrigin();
      return `${origin}${raw}`;
    }
    return "";
  }

  _setState(status: CardStatus, connection?: ConnectionInfo): void {
    this._status = status;
    this._connection = connection ?? null;
    this._displayName = connection?.displayName ?? (this.getAttribute("slug") ?? "");
    this._render();
  }

  private _buildConnectUrl(): string {
    const key = this._resolveApiKey();
    const origin = this._connectOrigin();
    const slug = this.getAttribute("slug") ?? "";
    const params = new URLSearchParams();
    if (key) params.set("app_key", key);
    params.set("return_to", window.location.href);
    return `${origin}/connections/connect/${slug}?${params.toString()}`;
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
        // SSE will eventually deliver the connection_updated event, but a
        // proactive refetch flips every subscribed card to the new state
        // immediately rather than waiting on stream latency.
        const apiKey = this._resolveApiKey();
        if (apiKey) void refreshConnections(this._apiBaseUrl(), apiKey);
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
    const origin = this._connectOrigin();
    const manageBaseUrl = this.getAttribute("manage-base-url") || origin.replace(/\/api\/?$/, "");
    const url = `${manageBaseUrl}/connections/${this._connection.id}`;
    window.open(url, "vendo-manage", "width=960,height=720,popup");
  }

  private _handleCancel(): void {
    this._status = "available";
    this._render();
  }

  private _renderStatus(): string {
    switch (this._status) {
      case "loading": return "";
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
        const raw = this._connection?.errorMessage ?? "";
        const msg = raw ? `: ${escapeHtml(raw.slice(0, 60))}` : "";
        return `<span class="vendo-card__status vendo-card__status--error">● Error${msg}</span>`;
      }
      default: return "";
    }
  }

  private _renderActions(): string {
    switch (this._status) {
      case "loading":
        return `<div class="vendo-card__skeleton vendo-card__skeleton--btn"></div>`;
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
        return `<button class="secondary" data-action="manage">Manage</button>`;
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

    const slug = this.getAttribute("slug") ?? "";
    const integrationName = escapeHtml(this.getAttribute("name") || slug);
    const subtitle = this._displayName && this._displayName !== slug && this._displayName !== (this.getAttribute("name") || "")
      ? escapeHtml(this._displayName)
      : "";
    const compact = this.hasAttribute("compact");
    const safeLogoUrl = this._resolveLogoUrl(this._logoUrl);
    const safeBrandColor = /^#[0-9a-fA-F]{3,8}$/.test(this._brandColor) ? this._brandColor : "";
    const logoSize = compact ? "1.5rem" : "2rem";
    const isLoading = this._status === "loading";

    const themeName = this.getAttribute("theme") || "default";
    const themeVars = THEMES[themeName] || THEMES["default"];

    let logoHtml: string;
    if (isLoading) {
      logoHtml = `<div class="vendo-card__logo vendo-card__skeleton vendo-card__skeleton--logo" aria-hidden="true"></div>`;
    } else if (safeLogoUrl) {
      logoHtml = `<img class="vendo-card__logo" src="${escapeHtml(safeLogoUrl)}" alt="" aria-hidden="true" />`;
    } else {
      logoHtml = `<div class="vendo-card__logo vendo-card__logo--fallback" aria-hidden="true">${escapeHtml((integrationName.charAt(0) || "?").toUpperCase())}</div>`;
    }
    const accentStyle = safeBrandColor ? ` style="border-left-color: ${safeBrandColor};"` : "";

    const subtitleHtml = subtitle
      ? `<div class="vendo-card__subtitle">${subtitle}</div>`
      : "";

    shadow.innerHTML = `
      <style>
        :host { display: block; font-family: inherit; ${themeVars} }
        .vendo-card {
          display: flex; align-items: center; gap: 0.75rem;
          padding: ${compact ? "0.5rem 0.75rem" : "1rem"};
          border: 1px solid var(--vendo-color-border);
          border-left: 3px solid var(--vendo-color-border);
          border-radius: var(--vendo-radius);
          background: var(--vendo-color-surface);
          color: var(--vendo-color-text);
          backdrop-filter: var(--vendo-card-backdrop-filter, none);
          -webkit-backdrop-filter: var(--vendo-card-backdrop-filter, none);
          transition: border-left-color 0.2s, box-shadow 0.2s;
        }
        .vendo-card:hover {
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .vendo-card__logo {
          width: ${logoSize}; height: ${logoSize};
          flex-shrink: 0; border-radius: 6px; object-fit: contain;
          background: #fff; padding: 2px;
        }
        .vendo-card__logo--fallback {
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--vendo-color-border);
          color: var(--vendo-color-muted);
          font-weight: 700; font-size: 0.85rem;
        }
        .vendo-card__info { flex: 1; min-width: 0; }
        .vendo-card__name { font-weight: 600; font-size: 0.9rem; }
        .vendo-card__subtitle { font-size: 0.78rem; color: var(--vendo-color-muted); margin-top: 0.1rem; }
        .vendo-card__status { font-size: 0.78rem; color: var(--vendo-color-muted); margin-top: 0.15rem; display: block; }
        .vendo-card__status--connected { color: var(--vendo-color-success); }
        .vendo-card__status--warning { color: var(--vendo-color-warning); }
        .vendo-card__status--error { color: var(--vendo-color-error); }
        .vendo-card__actions { display: flex; gap: 0.4rem; flex-shrink: 0; }
        button {
          padding: 0.35em 0.85em; border: none;
          border-radius: var(--vendo-radius, 6px);
          background: var(--vendo-color-brand);
          color: #fff; font-family: inherit; font-size: 0.82rem;
          font-weight: 600; cursor: pointer; transition: opacity 0.15s;
        }
        button:hover { opacity: 0.88; }
        button.secondary {
          background: transparent; color: var(--vendo-color-muted);
          border: 1px solid currentColor;
        }
        .spinner {
          display: inline-block; width: 0.9em; height: 0.9em;
          border: 2px solid currentColor; border-top-color: transparent;
          border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .vendo-card__skeleton {
          border-radius: 4px;
          background: linear-gradient(
            90deg,
            var(--vendo-color-skeleton) 25%,
            color-mix(in srgb, var(--vendo-color-skeleton), transparent 40%) 50%,
            var(--vendo-color-skeleton) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        .vendo-card__skeleton--logo {
          width: ${logoSize}; height: ${logoSize}; flex-shrink: 0;
        }
        .vendo-card__skeleton--name {
          height: 0.9rem; width: 7rem; border-radius: 4px;
        }
        .vendo-card__skeleton--btn {
          height: 1.8rem; width: 4.5rem; border-radius: var(--vendo-radius, 6px);
        }
      </style>
      <div class="vendo-card"${accentStyle}>
        ${logoHtml}
        <div class="vendo-card__info">
          ${isLoading
            ? `<div class="vendo-card__skeleton vendo-card__skeleton--name"></div>`
            : `<div class="vendo-card__name">${integrationName}</div>${subtitleHtml}${this._renderStatus()}`
          }
        </div>
        <div class="vendo-card__actions">
          ${this._renderActions()}
        </div>
      </div>
    `;

    shadow.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
      const action = btn.dataset["action"];
      if (action === "connect") btn.addEventListener("click", () => void this._handleConnect());
      else if (action === "manage") btn.addEventListener("click", () => this._handleManage());
      else if (action === "cancel") btn.addEventListener("click", () => this._handleCancel());
    });
  }
}
