import { describe, it, expect, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile, unlink, stat } from "node:fs/promises";
import { bootstrap, start, _applyDiffAndCall } from "./reconciler";

function tmpFile(suffix: string): string {
  return join(tmpdir(), `reconciler-test-${Date.now()}-${suffix}`);
}

async function tryUnlink(p: string): Promise<void> {
  try {
    await unlink(p);
  } catch {
    // ignore
  }
}

describe("reconciler", () => {
  const cleanupFiles: string[] = [];

  afterEach(async () => {
    for (const f of cleanupFiles) {
      await tryUnlink(f);
      await tryUnlink(`${f}.vendo-state.json`);
      await tryUnlink(`${f}.vendo-tmp`);
    }
    cleanupFiles.length = 0;
  });

  it("bootstrap() writes env file atomically", async () => {
    const envFile = tmpFile("bootstrap");
    cleanupFiles.push(envFile);

    await bootstrap({
      envFile,
      mapping: () => ({ FOO: "bar", BAZ: "qux" }),
    });

    const contents = await readFile(envFile, "utf-8");
    // Keys should be sorted
    expect(contents).toBe("BAZ=qux\nFOO=bar\n");
  });

  it("bootstrap() skips when env is unchanged and file exists", async () => {
    const envFile = tmpFile("bootstrap-skip");
    cleanupFiles.push(envFile);

    const env = { KEY: "value" };

    await bootstrap({ envFile, mapping: () => env });

    const statBefore = await stat(envFile);

    // Small delay to ensure mtime would differ if re-written
    await new Promise((r) => setTimeout(r, 10));

    await bootstrap({ envFile, mapping: () => env });

    const statAfter = await stat(envFile);

    // mtime should be the same — file was not rewritten
    expect(statAfter.mtimeMs).toBe(statBefore.mtimeMs);
  });

  it("_applyDiffAndCall() invokes callable with diff when env changes", async () => {
    const envFile = tmpFile("diff-call");
    cleanupFiles.push(envFile);

    // Bootstrap initial state
    await bootstrap({ envFile, mapping: () => ({ OLD_KEY: "old" }) });

    const receivedDiffs: { added: string[]; removed: string[]; changed: string[] }[] = [];
    const newEnv = { OLD_KEY: "updated", NEW_KEY: "new" };

    const result = await _applyDiffAndCall({
      envFile,
      newEnv,
      onChange: (d) => {
        receivedDiffs.push(d);
      },
    });

    expect(result).not.toBeNull();
    expect(receivedDiffs).toHaveLength(1);
    const d = receivedDiffs[0];
    expect(d.added).toEqual(["NEW_KEY"]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual(["OLD_KEY"]);
  });

  it("start() returns Reconciler with stop() and cancels polling", async () => {
    const envFile = tmpFile("start-stop");
    cleanupFiles.push(envFile);

    let callCount = 0;
    const reconciler = await start({
      envFile,
      mapping: () => {
        callCount++;
        return { CALL: String(callCount) };
      },
      pollIntervalMs: 50,
    });

    // stop immediately
    reconciler.stop();

    // Wait a bit to confirm no extra polls fired
    await new Promise((r) => setTimeout(r, 100));

    // mapping was called once by bootstrap, not again after stop
    expect(callCount).toBe(1);

    // Reconciler object has stop method
    expect(typeof reconciler.stop).toBe("function");
  });
});
