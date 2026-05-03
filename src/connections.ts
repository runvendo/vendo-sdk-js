import type { HttpAdapter } from "./_http";

export type ConnectionStatus =
  | "connected"
  | "available"
  | "pending_setup"
  | "needs_reauth"
  | "error"
  | "revoked";

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
}

function fromRaw(raw: RawConnection): Connection {
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
  };
}

export class ConnectionsAPI {
  constructor(private http: HttpAdapter) {}

  async list(): Promise<Connection[]> {
    const body = await this.http.get<{ connections: RawConnection[] }>(
      "/api/deployments/me/connections",
    );
    return (body.connections ?? []).map(fromRaw);
  }

  async get(slug: string): Promise<Connection | null> {
    const all = await this.list();
    return all.find((c) => c.slug === slug) ?? null;
  }
}
