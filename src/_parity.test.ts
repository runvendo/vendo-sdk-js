import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = YAML.parse(
  readFileSync(join(__dirname, "..", "docs", "sdk-surface.yaml"), "utf-8"),
);

const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

describe("SDK surface parity (per docs/sdk-surface.yaml)", () => {
  it("Vendo class has all client methods", async () => {
    const { Vendo } = await import("./_client");
    const proto = Vendo.prototype as unknown as Record<string, unknown>;
    for (const entry of manifest.client) {
      const name = snakeToCamel(entry.name);
      expect(proto[name], `Vendo.${name} missing`).toBeDefined();
    }
  });

  it("ConnectionsAPI has list + get", async () => {
    const { ConnectionsAPI } = await import("./connections");
    const proto = ConnectionsAPI.prototype as unknown as Record<string, unknown>;
    for (const entry of manifest.connections_api) {
      expect(proto[entry.name], `ConnectionsAPI.${entry.name} missing`).toBeDefined();
    }
  });

  it("IntegrationsAPI + BillingAPI have all required methods", async () => {
    const { IntegrationsAPI } = await import("./integrations");
    const { BillingAPI } = await import("./billing");
    for (const entry of manifest.integrations_api) {
      const name = snakeToCamel(entry.name);
      expect((IntegrationsAPI.prototype as unknown as Record<string, unknown>)[name],
        `IntegrationsAPI.${name} missing`).toBeDefined();
    }
    for (const entry of manifest.billing_api) {
      const name = snakeToCamel(entry.name);
      expect((BillingAPI.prototype as unknown as Record<string, unknown>)[name],
        `BillingAPI.${name} missing`).toBeDefined();
    }
  });

  it("All typed errors are exported from vendo.errors", async () => {
    const errors = await import("./errors");
    for (const cls of manifest.errors) {
      expect((errors as Record<string, unknown>)[cls],
        `errors.${cls} missing`).toBeDefined();
    }
  });

  it("Testing module exports MockClient + fakeConnection + MockSSE", async () => {
    const testing = await import("./testing");
    expect(testing.MockClient).toBeDefined();
    expect(testing.fakeConnection).toBeDefined();
    expect((testing as Record<string, unknown>).MockSSE,
      "MockSSE missing — required by parity manifest").toBeDefined();
  });

  it("Reconciler has bootstrap + start", async () => {
    const reconciler = await import("./reconciler");
    expect(reconciler.bootstrap).toBeDefined();
    expect(reconciler.start).toBeDefined();
  });

  it("DataAPI has all data_api methods", async () => {
    const { DataAPI } = await import("./data");
    const proto = DataAPI.prototype as unknown as Record<string, unknown>;
    for (const entry of manifest.data_api ?? []) {
      const name = snakeToCamel(entry.name);
      expect(proto[name], `DataAPI.${name} missing`).toBeDefined();
    }
  });
});
