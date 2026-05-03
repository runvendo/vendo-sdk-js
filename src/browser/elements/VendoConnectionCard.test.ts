import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  // Allow Lit to complete its async render cycle
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
});
