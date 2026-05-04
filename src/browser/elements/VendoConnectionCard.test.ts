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
  it("renders loading skeleton initially before fetch completes", async () => {
    const el = createElement({ slug: "telegram" });
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow).toBeTruthy();
    const skeleton = shadow.querySelector(".vendo-card__skeleton--name");
    expect(skeleton).toBeTruthy();
    const skeletonBtn = shadow.querySelector(".vendo-card__skeleton--btn");
    expect(skeletonBtn).toBeTruthy();
  });

  it("renders in available state when set directly", async () => {
    const el = createElement({ slug: "telegram" });
    await waitRender();
    el._setState("available");
    await waitRender();
    const shadow = el.shadowRoot!;
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

  it("parses wrapped { connections: [...] } response from /api/deployments/me/connections", async () => {
    // Backend wire format wraps the array. Earlier code expected a bare array and
    // silently fell into the catch{}, leaving the card stuck in available state.
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        connections: [
          {
            slug: "telegram",
            status: "connected",
            id: "uuid-real",
            display_name: "My Bot",
          },
        ],
      }),
    } as unknown as Response);

    const el = createElement({ slug: "telegram", name: "Telegram", "api-key": "vendo_sk_test" });
    await waitRender();
    await new Promise((r) => setTimeout(r, 10));
    await waitRender();

    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".vendo-card__name")?.textContent).toBe("Telegram");
    expect(shadow.querySelector(".vendo-card__subtitle")?.textContent).toBe("My Bot");
    expect(shadow.querySelector(".vendo-card__status")?.textContent).toContain("Connected");
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

  it("renders logo image when logo-url attribute is set", async () => {
    const el = createElement({
      slug: "telegram",
      "logo-url": "https://example.com/telegram.png",
      "brand-color": "#0088cc",
    });
    // Move past loading state so logo renders
    el._setState("available");
    await waitRender();
    const shadow = el.shadowRoot!;
    const img = shadow.querySelector<HTMLImageElement>("img.vendo-card__logo");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("https://example.com/telegram.png");
    const card = shadow.querySelector<HTMLElement>(".vendo-card");
    expect(card!.getAttribute("style")).toContain("#0088cc");
  });

  it("renders fallback letter disc when logo-url is empty", async () => {
    const el = createElement({ slug: "telegram" });
    el._setState("available", { id: "x", displayName: "Telegram" });
    await waitRender();
    const shadow = el.shadowRoot!;
    const fallback = shadow.querySelector(".vendo-card__logo--fallback");
    expect(fallback).toBeTruthy();
    expect(fallback!.textContent).toBe("T");
  });

  it("rejects javascript: logo-url and unsafe brand-color values", async () => {
    const el = createElement({
      slug: "telegram",
      "logo-url": "javascript:alert(1)",
      "brand-color": "red; background: url(x)",
    });
    el._setState("available");
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector("img.vendo-card__logo")).toBeNull();
    expect(shadow.querySelector(".vendo-card__logo--fallback")).toBeTruthy();
    const card = shadow.querySelector<HTMLElement>(".vendo-card");
    expect(card!.getAttribute("style")).toBeNull();
  });

  it("picks up logo_url and brand_color from /connections response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        connections: [
          {
            slug: "telegram",
            status: "connected",
            id: "uuid-real",
            display_name: "My Bot",
            logo_url: "https://example.com/api-telegram.png",
            brand_color: "#229ED9",
          },
        ],
      }),
    } as unknown as Response);

    const el = createElement({ slug: "telegram", "api-key": "vendo_sk_test" });
    await waitRender();
    await new Promise((r) => setTimeout(r, 10));
    await waitRender();

    const shadow = el.shadowRoot!;
    const img = shadow.querySelector<HTMLImageElement>("img.vendo-card__logo");
    expect(img!.getAttribute("src")).toBe("https://example.com/api-telegram.png");
    const card = shadow.querySelector<HTMLElement>(".vendo-card");
    expect(card!.getAttribute("style")).toContain("#229ED9");
  });

  it("applies default (vendo) theme CSS variables", async () => {
    const el = createElement({ slug: "telegram" });
    el._setState("available");
    await waitRender();
    const shadow = el.shadowRoot!;
    const style = shadow.querySelector("style");
    expect(style!.textContent).toContain("--vendo-color-brand: #2B7A5E");
  });

  it("applies beige theme CSS variables", async () => {
    const el = createElement({ slug: "telegram", theme: "beige" });
    el._setState("available");
    await waitRender();
    const shadow = el.shadowRoot!;
    const style = shadow.querySelector("style");
    expect(style!.textContent).toContain("--vendo-color-surface: #FAF7F2");
  });

  it("applies dark theme CSS variables", async () => {
    const el = createElement({ slug: "telegram", theme: "dark" });
    el._setState("available");
    await waitRender();
    const shadow = el.shadowRoot!;
    const style = shadow.querySelector("style");
    expect(style!.textContent).toContain("--vendo-color-surface: #1C1B18");
  });

  it("shows integration name as title and display_name as subtitle", async () => {
    const el = createElement({ slug: "openai", name: "OpenAI" });
    el._setState("connected", { id: "conn-1", displayName: "OpenAI (Vendo managed)" });
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".vendo-card__name")?.textContent).toBe("OpenAI");
    expect(shadow.querySelector(".vendo-card__subtitle")?.textContent).toBe("OpenAI (Vendo managed)");
  });

  it("hides subtitle when display_name matches integration name", async () => {
    const el = createElement({ slug: "telegram", name: "Telegram" });
    el._setState("connected", { id: "conn-1", displayName: "Telegram" });
    await waitRender();
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector(".vendo-card__name")?.textContent).toBe("Telegram");
    expect(shadow.querySelector(".vendo-card__subtitle")).toBeNull();
  });

  it("resolves relative logo URLs against connect-origin", async () => {
    const el = createElement({
      slug: "openai",
      "logo-url": "/integrations/openai.svg",
      "connect-origin": "https://vendo.run",
    });
    el._setState("available");
    await waitRender();
    const shadow = el.shadowRoot!;
    const img = shadow.querySelector<HTMLImageElement>("img.vendo-card__logo");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("https://vendo.run/integrations/openai.svg");
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
