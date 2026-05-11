import type { HttpAdapter } from "./_http";

export type ConnectionStatus =
  | "connected"
  | "available"
  | "pending_setup"
  | "needs_reauth"
  | "error"
  | "revoked";

export interface EnvBootstrapVar {
  name: string;
  valueFrom: string;
}

export interface EnvBootstrap {
  vars: EnvBootstrapVar[];
  restart: "gateway" | "none";
}

export interface Connection {
  id: string;
  externalId: string;
  slug: string;
  displayName: string;
  category: string;
  profile: string;
  status: ConnectionStatus;
  metadata: Record<string, unknown>;
  credential: Record<string, string | number> | null;
  setupUrl: string | null;
  errorMessage: string | null;
  connectedAt: string | null;
  logoUrl: string;
  brandColor: string;
  docsUrl: string;
  envBootstrap: EnvBootstrap | null;
}

interface RawConnection {
  id: string;
  external_id: string;
  slug: string;
  display_name: string;
  category: string;
  profile: string;
  status: ConnectionStatus;
  metadata?: Record<string, unknown>;
  credential: Record<string, string | number> | null;
  setup_url: string | null;
  error_message: string | null;
  connected_at: string | null;
  logo_url?: string;
  brand_color?: string;
  docs_url?: string;
  env_bootstrap?: {
    vars?: Array<{ name: string; value_from: string }>;
    restart?: "gateway" | "none";
  } | null;
}

function fromRaw(raw: RawConnection): Connection {
  const eb = raw.env_bootstrap;
  const envBootstrap: EnvBootstrap | null =
    eb && Array.isArray(eb.vars)
      ? {
          vars: eb.vars.map((v) => ({ name: v.name, valueFrom: v.value_from })),
          restart:
            eb.restart === "gateway" || eb.restart === "none"
              ? eb.restart
              : "none",
        }
      : null;
  return {
    id: raw.id,
    externalId: raw.external_id,
    slug: raw.slug,
    displayName: raw.display_name,
    category: raw.category,
    profile: raw.profile,
    status: raw.status,
    metadata: raw.metadata ?? {},
    credential: raw.credential,
    setupUrl: raw.setup_url,
    errorMessage: raw.error_message,
    connectedAt: raw.connected_at,
    logoUrl: raw.logo_url ?? "",
    brandColor: raw.brand_color ?? "",
    docsUrl: raw.docs_url ?? "",
    envBootstrap,
  };
}

export class ConnectionsAPI {
  // Concurrent `list()` calls share one HTTP request. Cleared as soon as
  // the response (or error) settles, so this is *not* a TTL cache — it only
  // collapses SSE-event storms where VendoProvider fires `c.connections.get`
  // for every connection.* event arriving in the same tick.
  private _inFlight: Promise<Connection[]> | null = null;

  constructor(private http: HttpAdapter) {}

  async list(): Promise<Connection[]> {
    if (this._inFlight) return this._inFlight;
    this._inFlight = (async () => {
      try {
        const body = await this.http.get<{ connections: RawConnection[] }>(
          "/api/deployments/me/connections",
        );
        return (body.connections ?? []).map(fromRaw);
      } finally {
        this._inFlight = null;
      }
    })();
    return this._inFlight;
  }

  async get(slug: string): Promise<Connection | null> {
    const all = await this.list();
    return all.find((c) => c.slug === slug) ?? null;
  }
}
