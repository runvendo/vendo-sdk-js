/**
 * Process-wide connections store shared by every `<vendo-connection-card>`
 * and `<vendo-connect-button>` on the page.
 *
 * Before this existed, each card called `GET /api/deployments/me/connections`
 * and opened its own SSE stream on mount. With ~30 enabled integrations
 * that was 30 redundant full-list fetches and 30 concurrent SSE streams to
 * the same origin — browsers serialized the requests under per-origin
 * connection limits and cards appeared one-by-one over many seconds.
 *
 * The store collapses that to a single fetch + a single SSE stream per
 * `(baseUrl, apiKey)` pair, refcounted by subscribers. Cards subscribe to
 * the slugs they care about and receive callbacks when the underlying row
 * changes.
 */
import { openSseStream, type SseCleanup } from "./sse-client.js";

export interface RawConn {
  slug: string;
  status: string;
  id: string;
  display_name?: string;
  error_message?: string;
  logo_url?: string;
  brand_color?: string;
}

export type ConnectionStatus = "loading" | "ready" | "error";

export type ConnectionSubscriber = (
  conn: RawConn | undefined,
  status: ConnectionStatus,
) => void;

interface StoreEntry {
  baseUrl: string;
  apiKey: string;
  status: ConnectionStatus;
  bySlug: Map<string, RawConn>;
  subs: Map<string, Set<ConnectionSubscriber>>;
  refcount: number;
  inFlight: Promise<void> | null;
  sse: SseCleanup | null;
}

const stores = new Map<string, StoreEntry>();

function keyFor(baseUrl: string, apiKey: string): string {
  return `${baseUrl}|${apiKey}`;
}

/**
 * Subscribe to updates for a single integration slug. Returns a cleanup
 * function that must be called on unmount. The callback fires once
 * synchronously with the current cached value (if any) plus the load
 * status, then again on every refresh.
 */
export function subscribeConnection(
  baseUrl: string,
  apiKey: string,
  slug: string,
  onUpdate: ConnectionSubscriber,
): () => void {
  const k = keyFor(baseUrl, apiKey);
  let entry = stores.get(k);
  if (!entry) {
    entry = {
      baseUrl,
      apiKey,
      status: "loading",
      bySlug: new Map(),
      subs: new Map(),
      refcount: 0,
      inFlight: null,
      sse: null,
    };
    stores.set(k, entry);
  }

  let set = entry.subs.get(slug);
  if (!set) {
    set = new Set();
    entry.subs.set(slug, set);
  }
  set.add(onUpdate);
  entry.refcount++;

  // Fire immediately with whatever we have so the caller can render its
  // skeleton-vs-data branch without waiting a tick.
  onUpdate(entry.bySlug.get(slug), entry.status);

  // First subscriber on this (baseUrl, apiKey) triggers the shared load + SSE.
  if (entry.refcount === 1) {
    void loadConnections(entry);
    openSse(entry);
  } else if (entry.status === "loading" && !entry.inFlight) {
    // Defensive: an earlier subscriber may have dropped before the fetch
    // finished and torn things down mid-flight.
    void loadConnections(entry);
  }

  return () => {
    const e = stores.get(k);
    if (!e) return;
    const s = e.subs.get(slug);
    if (s) {
      s.delete(onUpdate);
      if (s.size === 0) e.subs.delete(slug);
    }
    e.refcount--;
    if (e.refcount <= 0) {
      e.sse?.();
      e.sse = null;
      stores.delete(k);
    }
  };
}

/**
 * Force a refresh of the cached connections for this (baseUrl, apiKey).
 * Returns the in-flight promise (no-op if already in flight).
 * Useful after a successful connect popup completes so the card flips to
 * "connected" without waiting on SSE.
 */
export function refreshConnections(
  baseUrl: string,
  apiKey: string,
): Promise<void> {
  const entry = stores.get(keyFor(baseUrl, apiKey));
  if (!entry) return Promise.resolve();
  return loadConnections(entry);
}

async function loadConnections(entry: StoreEntry): Promise<void> {
  if (entry.inFlight) return entry.inFlight;
  entry.inFlight = (async () => {
    try {
      const res = await fetch(`${entry.baseUrl}/api/deployments/me/connections`, {
        headers: { Authorization: `Bearer ${entry.apiKey}` },
      });
      if (!res.ok) {
        // Don't strand subscribers in `loading` — flip to `error` so cards
        // fall through to their "available" affordance, matching the
        // pre-store behaviour when fetch returned non-200.
        if (entry.status === "loading") {
          entry.status = "error";
          notifyAll(entry);
        }
        return;
      }
      const body = (await res.json()) as
        | Array<RawConn>
        | { connections?: Array<RawConn> };
      const all: Array<RawConn> = Array.isArray(body) ? body : body.connections ?? [];
      entry.bySlug = new Map(all.map((c) => [c.slug, c]));
      entry.status = "ready";
      notifyAll(entry);
    } catch {
      if (entry.status === "loading") {
        entry.status = "error";
        notifyAll(entry);
      }
    } finally {
      entry.inFlight = null;
    }
  })();
  return entry.inFlight;
}

function openSse(entry: StoreEntry): void {
  if (entry.sse) return;
  entry.sse = openSseStream(
    `${entry.baseUrl}/api/deployments/me/events`,
    entry.apiKey,
    (event) => {
      if (
        event.type === "connection_updated" ||
        event.type === "connection_created" ||
        event.type === "connection_deleted"
      ) {
        // One refetch covers every subscriber. The dedupe inside
        // loadConnections collapses rapid event bursts into a single HTTP
        // call. We deliberately refetch on every connection event regardless
        // of the slug payload — the wire format only carries the slug, not
        // the full row, so a refetch is the only way to learn the new
        // status/credential.
        void loadConnections(entry);
      }
    },
    () => {
      // SSE auth/network errors: subscribers stay on the last good cache.
      // The store does not retry; a manual refreshConnections() call after
      // a connect-popup result is the recovery path.
    },
  );
}

function notifyAll(entry: StoreEntry): void {
  for (const [slug, subs] of entry.subs.entries()) {
    const conn = entry.bySlug.get(slug);
    for (const cb of subs) cb(conn, entry.status);
  }
}

/** @internal Test-only — tears down every store entry so each test sees
 *  a clean slate. Do not call from production code. */
export function _resetConnectionsStoreForTesting(): void {
  for (const entry of stores.values()) {
    entry.sse?.();
  }
  stores.clear();
}
