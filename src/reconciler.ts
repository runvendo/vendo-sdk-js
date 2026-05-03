export type ReconcilerDiff = { added: string[]; removed: string[]; changed: string[] };
export type OnChange = "restart" | "reload-hook" | ((diff: ReconcilerDiff) => void | Promise<void>);

export interface ReconcilerOptions {
  envFile: string;
  mapping: () => Promise<Record<string, string>> | Record<string, string>;
  onChange?: OnChange;
  reloadUrl?: string;
  pollIntervalMs?: number;
}

export interface Reconciler {
  stop(): void;
}

function isNode(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}

async function readState(envFile: string): Promise<Record<string, string>> {
  const { readFile } = await import("node:fs/promises");
  try {
    const text = await readFile(`${envFile}.vendo-state.json`, "utf-8");
    return JSON.parse(text) as Record<string, string>;
  } catch {
    return {};
  }
}

async function writeState(envFile: string, env: Record<string, string>): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(`${envFile}.vendo-state.json`, JSON.stringify(env, null, 0));
}

async function atomicWriteEnv(envFile: string, env: Record<string, string>): Promise<void> {
  const { writeFile, rename } = await import("node:fs/promises");
  const sorted =
    Object.keys(env)
      .sort()
      .map((k) => `${k}=${env[k]}`)
      .join("\n") + "\n";
  const tmp = `${envFile}.vendo-tmp`;
  await writeFile(tmp, sorted, "utf-8");
  await rename(tmp, envFile);
}

function diff(
  oldEnv: Record<string, string>,
  newEnv: Record<string, string>,
): ReconcilerDiff {
  const oldKeys = new Set(Object.keys(oldEnv));
  const newKeys = new Set(Object.keys(newEnv));
  return {
    added: [...newKeys].filter((k) => !oldKeys.has(k)).sort(),
    removed: [...oldKeys].filter((k) => !newKeys.has(k)).sort(),
    changed: [...oldKeys].filter((k) => newKeys.has(k) && oldEnv[k] !== newEnv[k]).sort(),
  };
}

async function existsFile(p: string): Promise<boolean> {
  const { stat } = await import("node:fs/promises");
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function bootstrap(opts: ReconcilerOptions): Promise<void> {
  if (!isNode()) throw new Error("reconciler requires Node.js (no-op in browsers)");
  const env = await opts.mapping();
  const last = await readState(opts.envFile);
  if (JSON.stringify(env) === JSON.stringify(last) && (await existsFile(opts.envFile))) return;
  await atomicWriteEnv(opts.envFile, env);
  await writeState(opts.envFile, env);
}

export async function _applyDiffAndCall(args: {
  envFile: string;
  newEnv: Record<string, string>;
  onChange?: OnChange;
  reloadUrl?: string;
}): Promise<ReconcilerDiff | null> {
  const last = await readState(args.envFile);
  const d = diff(last, args.newEnv);
  if (d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0) return null;
  await atomicWriteEnv(args.envFile, args.newEnv);
  await writeState(args.envFile, args.newEnv);
  if (args.onChange === "restart") {
    process.exit(0);
  } else if (args.onChange === "reload-hook" && args.reloadUrl) {
    try {
      await fetch(args.reloadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changed: [...d.added, ...d.changed] }),
      });
    } catch {
      // swallow
    }
  } else if (typeof args.onChange === "function") {
    await args.onChange(d);
  }
  return d;
}

export async function start(opts: ReconcilerOptions): Promise<Reconciler> {
  await bootstrap(opts);
  const intervalMs = opts.pollIntervalMs ?? 30_000;
  let stopped = false;
  const handle = setInterval(async () => {
    if (stopped) return;
    try {
      const newEnv = await opts.mapping();
      await _applyDiffAndCall({
        envFile: opts.envFile,
        newEnv,
        onChange: opts.onChange,
        reloadUrl: opts.reloadUrl,
      });
    } catch {
      // swallow
    }
  }, intervalMs);
  // Don't keep Node alive just for the reconciler.
  if (typeof handle === "object" && handle !== null && "unref" in handle) {
    (handle as { unref(): void }).unref();
  }
  return {
    stop() {
      stopped = true;
      clearInterval(handle);
    },
  };
}
