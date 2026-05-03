import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as sseModule from "../sse-client.js";

// Register the element once before tests run
let VendoConnectionCardClass: typeof import("./VendoConnectionCard.js").VendoConnectionCard;

beforeEach(async () => {
  const mod = await import("./VendoConnectionCard.js");
  VendoConnectionCardClass = mod.VendoConnectionCard;
  if (!customElements.get("vendo-connection-card")) {
    customElements.define("vendo-connection-card", VendoConnectionCardClass);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function createElement(attrs: Record<string, string> = {}): InstanceType<typeof VendoConnectionCardClass> {
  const el = document.createElement("vendo-connection-card") as InstanceType<typeof VendoConnectionCardClass>;
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  document.body.appendChild(el);
  return el;
}

async function waitRender(): Promise<void> {
  // Allow synchronous `_render()` and any microtasks to settle
  await new Promise((r) => setTimeout(r, 10));
}

describe("<vendo-connection-card>", () => {
  it("renders in available state by default", async () => {
    const el = createElement({ slug: "telegram" });
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow).toBeTruthy();
    // available state shows a connect button
    const btn = shadow.querySelector("button");
    expect(btn).toBeTruthy();
    expect(btn!.textContent).toContain("Connect");
  });

  it("renders connected state", async () => {
    const el = createElement({ slug: "telegram" });
    await waitRender();
    // Drive state directly via the element's internal method
    el._setState("connected", { displayName: "My Telegram", id: "conn-1" });
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".vendo-card__status")?.textContent).toContain("Connected");
    expect(shadow.querySelector("button")?.textContent).toContain("Manage");
  });

  it("renders connecting state", async () => {
    const el = createElement({ slug: "telegram" });
    await waitRender();
    el._setState("connecting");
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".vendo-card__status")?.textContent).toContain("Connecting");
    expect(shadow.querySelector("button")?.textContent).toContain("Cancel");
  });

  it("renders pending_setup state", async () => {
    const el = createElement({ slug: "telegram" });
    await waitRender();
    el._setState("pending_setup", { displayName: "Telegram", id: "conn-2" });
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".vendo-card__status")?.textContent).toContain("Setup incomplete");
    expect(shadow.querySelector("button")?.textContent).toContain("Continue setup");
  });

  it("renders needs_reauth state", async () => {
    const el = createElement({ slug: "telegram" });
    await waitRender();
    el._setState("needs_reauth", { displayName: "Telegram", id: "conn-3" });
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".vendo-card__status")?.textContent).toContain("Reauth needed");
    expect(shadow.querySelector("button")?.textContent).toContain("Reconnect");
  });

  it("renders error state", async () => {
    const el = createElement({ slug: "telegram" });
    await waitRender();
    el._setState("error", { displayName: "Telegram", id: "conn-4", errorMessage: "Token expired" });
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".vendo-card__status")?.textContent).toContain("Error");
    expect(shadow.querySelector("button")?.textContent).toContain("Retry");
  });

  it("escapes XSS payload in display_name — does not render raw <img> tag", async () => {
    // Simulate server returning a malicious display_name value
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          slug: "telegram",
          status: "connected",
          id: "conn-xss",
          display_name: '<img src=x onerror=alert(1)>',
          error_message: undefined,
        },
      ],
    } as unknown as Response);

    const el = createElement({ slug: "telegram", "api-key": "vendo_sk_test" });
    await waitRender();

    const shadow = el.shadowRoot!;
    // The raw tag must NOT appear — only the escaped version
    expect(shadow.innerHTML).not.toContain('<img src=x');
    expect(shadow.innerHTML).toContain('&lt;img');
  });

  it("escapes XSS payload in error_message", async () => {
    const el = createElement({ slug: "telegram" });
    await waitRender();
    el._setState("error", {
      id: "conn-xss",
      displayName: "Telegram",
      errorMessage: '<script>alert(1)</script>',
    });
    await waitRender();

    const shadow = el.shadowRoot!;
    expect(shadow.innerHTML).not.toContain('<script>');
    expect(shadow.innerHTML).toContain('&lt;script&gt;');
  });

  it("restarts fetch and SSE when slug attribute changes", async () => {
    const openSseSpy = vi.spyOn(sseModule, "openSseStream").mockReturnValue(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [],
    } as unknown as Response);

    const el = createElement({ slug: "telegram", "api-key": "vendo_sk_test" });
    await waitRender();

    const callsBefore = openSseSpy.mock.calls.length;
    const fetchCallsBefore = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    // Change slug — should trigger a new fetch + new SSE stream
    el.setAttribute("slug", "slack");
    await waitRender();

    expect(openSseSpy.mock.calls.length).toBeGreaterThan(callsBefore);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(fetchCallsBefore);
  });
});
