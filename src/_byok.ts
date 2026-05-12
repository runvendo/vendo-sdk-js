import byokData from "./_data/byok.json";

interface ByokEntry {
  vars: string[];
  primary: string;
  oauth: boolean;
}

interface Byok {
  version: number;
  integrations: Record<string, ByokEntry>;
}

const _byok = byokData as Byok;

export function primaryEnvVar(slug: string): string | null {
  const entry = _byok.integrations[slug];
  return entry ? entry.primary : null;
}

export function allEnvVars(slug: string): string[] {
  const entry = _byok.integrations[slug];
  return entry ? [...entry.vars] : [];
}

export function isOauthSlug(slug: string): boolean {
  return Boolean(_byok.integrations[slug]?.oauth);
}

export function knownSlugs(): ReadonlySet<string> {
  return new Set(Object.keys(_byok.integrations));
}
