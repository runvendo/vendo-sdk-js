import type { ConnectionStatus } from "./connections";
import { NotConnected } from "./errors";

export interface FakeConnection {
  slug: string;
  status: ConnectionStatus;
  credential: Record<string, string | number> | null;
  profile: string;
  displayName: string;
  category: string;
}

export function fakeConnection(opts: { slug: string } & Partial<FakeConnection>): FakeConnection {
  return {
    slug: opts.slug,
    status: opts.status ?? "connected",
    credential: opts.credential ?? null,
    profile: opts.profile ?? "byok_static",
    displayName: opts.displayName ?? opts.slug,
    category: opts.category ?? "other",
  };
}

class MockConnectionsAPI {
  constructor(private conns: FakeConnection[]) {}

  async list(): Promise<FakeConnection[]> {
    return [...this.conns];
  }

  async get(slug: string): Promise<FakeConnection | null> {
    return this.conns.find((c) => c.slug === slug) ?? null;
  }
}

function pickToken(cred: Record<string, string | number>): string {
  for (const k of ["access_token", "bot_token", "api_key"]) {
    if (k in cred) return String(cred[k]);
  }
  const first = Object.values(cred)[0];
  return first !== undefined ? String(first) : "";
}

export class MockClient {
  connections: MockConnectionsAPI;

  constructor(conns: FakeConnection[]) {
    this.connections = new MockConnectionsAPI(conns);
  }

  static withConnections(conns: FakeConnection[]): MockClient {
    return new MockClient(conns);
  }

  async token(slug: string): Promise<string> {
    const c = await this.connections.get(slug);
    if (!c || c.status !== "connected" || !c.credential) {
      throw new NotConnected(`slug '${slug}' not connected`, { code: "binding_missing", slug });
    }
    return pickToken(c.credential);
  }
}
