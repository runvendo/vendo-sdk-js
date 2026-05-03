import type { HttpAdapter } from "./_http";
import { VendoError } from "./errors";

export interface Integration {
  slug: string;
  name: string;
  description: string;
  category: string;
  logoUrl: string | null;
  brandColor: string | null;
  docsUrl: string | null;
  supportedProfiles: string[];
  defaultProfile: string;
  enabled: boolean;
  featured: boolean;
}

interface RawIntegration {
  slug: string;
  name: string;
  description?: string;
  category: string;
  logo_url: string | null;
  brand_color: string | null;
  docs_url: string | null;
  supported_profiles: string[];
  default_profile: string;
  enabled: boolean;
  featured?: boolean;
}

function fromRaw(r: RawIntegration): Integration {
  return {
    slug: r.slug,
    name: r.name,
    description: r.description ?? "",
    category: r.category,
    logoUrl: r.logo_url,
    brandColor: r.brand_color,
    docsUrl: r.docs_url,
    supportedProfiles: r.supported_profiles ?? [r.default_profile],
    defaultProfile: r.default_profile,
    enabled: r.enabled,
    featured: r.featured ?? false,
  };
}

export class IntegrationsAPI {
  constructor(private http: HttpAdapter) {}

  async list(): Promise<Integration[]> {
    const body = await this.http.get<{ integrations: RawIntegration[] }>("/api/integrations");
    return (body.integrations ?? []).map(fromRaw);
  }

  async get(slug: string): Promise<Integration | null> {
    try {
      const raw = await this.http.get<RawIntegration>(
        `/api/integrations/${encodeURIComponent(slug)}`,
      );
      return fromRaw(raw);
    } catch (e) {
      if (e instanceof VendoError && e.status === 404) return null;
      throw e;
    }
  }
}
