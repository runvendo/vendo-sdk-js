import { describe, it, expect } from "vitest";
import { MockClient, fakeConnection, MockSSE } from "./testing";
import { NotConnected } from "./errors";

describe("MockClient", () => {
  it("token() returns the bot_token credential", async () => {
    const mock = MockClient.withConnections([
      fakeConnection({ slug: "telegram", credential: { bot_token: "fake" } }),
    ]);

    const token = await mock.token("telegram");
    expect(token).toBe("fake");
  });

  it("connections.list() returns the seeded connection list", async () => {
    const conns = [
      fakeConnection({ slug: "telegram", credential: { bot_token: "fake" } }),
      fakeConnection({ slug: "notion", credential: { access_token: "secret" } }),
    ];
    const mock = MockClient.withConnections(conns);

    const list = await mock.connections.list();
    expect(list).toHaveLength(2);
    expect(list[0].slug).toBe("telegram");
    expect(list[1].slug).toBe("notion");
  });

  it("token() throws NotConnected for missing slug", async () => {
    const mock = MockClient.withConnections([
      fakeConnection({ slug: "telegram", credential: { bot_token: "fake" } }),
    ]);

    await expect(mock.token("missing")).rejects.toThrow(NotConnected);
    await expect(mock.token("missing")).rejects.toMatchObject({
      name: "NotConnected",
      code: "binding_missing",
    });
  });
});

describe("MockSSE", () => {
  it("iterates synchronously with for...of", () => {
    const events = [
      { kind: "connection.connected", slug: "telegram" },
      { kind: "connection.disconnected", slug: "notion" },
    ];
    const sse = new MockSSE(events);
    const collected: unknown[] = [];
    for (const ev of sse) {
      collected.push(ev);
    }
    expect(collected).toHaveLength(2);
    expect(collected[0]).toMatchObject({ kind: "connection.connected" });
    expect(collected[1]).toMatchObject({ slug: "notion" });
  });

  it("iterates asynchronously with for await...of", async () => {
    const events = [
      { kind: "billing.balance_low" },
      { kind: "connection.connected", slug: "github" },
    ];
    const sse = new MockSSE(events);
    const collected: unknown[] = [];
    for await (const ev of sse) {
      collected.push(ev);
    }
    expect(collected).toHaveLength(2);
    expect(collected[0]).toMatchObject({ kind: "billing.balance_low" });
    expect(collected[1]).toMatchObject({ kind: "connection.connected" });
  });

  it(".push() appends an event", () => {
    const sse = new MockSSE([{ kind: "initial" }]);
    sse.push({ kind: "appended", slug: "stripe" });
    const collected = [...sse];
    expect(collected).toHaveLength(2);
    expect(collected[1]).toMatchObject({ kind: "appended", slug: "stripe" });
  });
});
