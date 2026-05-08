import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface ByokEntry {
  vars: string[];
  primary: string;
  oauth: boolean;
}

interface Byok {
  version: number;
  integrations: Record<string, ByokEntry>;
}

const PKG_DATA_DIR = (() => {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/_byok.ts at dev -> src/_data. dist/index.js at build -> dist/_data.
  return join(here, "_data");
})();

let _byok: Byok | null = null;

function load(): Byok {
  if (_byok === null) {
    const text = readFileSync(join(PKG_DATA_DIR, "byok.json"), "utf-8");
    _byok = JSON.parse(text) as Byok;
  }
  return _byok;
}

export function primaryEnvVar(slug: string): string | null {
  const entry = load().integrations[slug];
  return entry ? entry.primary : null;
}

export function allEnvVars(slug: string): string[] {
  const entry = load().integrations[slug];
  return entry ? [...entry.vars] : [];
}

export function isOauthSlug(slug: string): boolean {
  return Boolean(load().integrations[slug]?.oauth);
}

export function knownSlugs(): ReadonlySet<string> {
  return new Set(Object.keys(load().integrations));
}
