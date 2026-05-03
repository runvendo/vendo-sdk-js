import { describe, it, expect } from "vitest";
import { MockClient, fakeConnection } from "./testing";
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
