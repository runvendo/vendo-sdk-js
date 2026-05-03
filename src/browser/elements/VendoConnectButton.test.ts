import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as popupModule from "../popup.js";

// Register the element once before tests run
let VendoConnectButtonClass: typeof import("./VendoConnectButton.js").VendoConnectButton;

beforeEach(async () => {
  const mod = await import("./VendoConnectButton.js");
  VendoConnectButtonClass = mod.VendoConnectButton;
  if (!customElements.get("vendo-connect-button")) {
    customElements.define("vendo-connect-button", VendoConnectButtonClass);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function createElement(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement("vendo-connect-button");
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  document.body.appendChild(el);
  return el;
}

describe("<vendo-connect-button>", () => {
  it("renders with a button in shadow DOM", async () => {
    const el = createElement({ slug: "telegram", "api-key": "vendo_sk_test" });
    await customElements.whenDefined("vendo-connect-button");
    // Allow synchronous `connectedCallback` and any microtasks to settle
    await Promise.resolve();
    const shadow = el.shadowRoot;
    expect(shadow).toBeTruthy();
    const btn = shadow!.querySelector("button");
    expect(btn).toBeTruthy();
  });

  it("dispatches vendo-connected event on successful popup", async () => {
    vi.spyOn(popupModule, "openPopup").mockResolvedValue({
      status: "connected",
      connectionId: "conn-abc",
      slug: "telegram",
    });

    const el = createElement({ slug: "telegram", "api-key": "vendo_sk_test" });
    await Promise.resolve();

    const connectedSpy = vi.fn();
    el.addEventListener("vendo-connected", connectedSpy);

    const shadow = el.shadowRoot!;
    const btn = shadow.querySelector("button")!;
    btn.click();

    // Allow async openPopup to resolve
    await vi.waitFor(() => expect(connectedSpy).toHaveBeenCalledOnce());
    const detail = (connectedSpy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ slug: "telegram", connectionId: "conn-abc" });
  });

  it("dispatches vendo-cancelled when popup is cancelled", async () => {
    vi.spyOn(popupModule, "openPopup").mockResolvedValue({ status: "cancelled" });

    const el = createElement({ slug: "telegram", "api-key": "vendo_sk_test" });
    await Promise.resolve();

    const cancelledSpy = vi.fn();
    el.addEventListener("vendo-cancelled", cancelledSpy);

    const btn = el.shadowRoot!.querySelector("button")!;
    btn.click();

    await vi.waitFor(() => expect(cancelledSpy).toHaveBeenCalledOnce());
  });

  it("dispatches vendo-timeout when popup times out", async () => {
    vi.spyOn(popupModule, "openPopup").mockResolvedValue({ status: "timeout" });

    const el = createElement({ slug: "telegram", "api-key": "vendo_sk_test" });
    await Promise.resolve();

    const timeoutSpy = vi.fn();
    el.addEventListener("vendo-timeout", timeoutSpy);

    const btn = el.shadowRoot!.querySelector("button")!;
    btn.click();

    await vi.waitFor(() => expect(timeoutSpy).toHaveBeenCalledOnce());
  });

  it("dispatches vendo-redirected when popup is blocked", async () => {
    vi.spyOn(popupModule, "openPopup").mockResolvedValue({
      status: "redirected",
      url: "https://vendo.run/connect/telegram",
    });

    const el = createElement({ slug: "telegram", "api-key": "vendo_sk_test" });
    await Promise.resolve();

    const redirectedSpy = vi.fn();
    el.addEventListener("vendo-redirected", redirectedSpy);

    const btn = el.shadowRoot!.querySelector("button")!;
    btn.click();

    await vi.waitFor(() => expect(redirectedSpy).toHaveBeenCalledOnce());
  });

  it("does not dispatch events after disconnectedCallback cancels in-flight popup", async () => {
    // Popup never resolves during the test — simulates a long-running popup
    let resolvePopup!: (r: { status: "cancelled" }) => void;
    vi.spyOn(popupModule, "openPopup").mockReturnValue(
      new Promise<{ status: "cancelled" }>((res) => { resolvePopup = res; }),
    );

    const el = createElement({ slug: "telegram", "api-key": "vendo_sk_test" });
    await Promise.resolve();

    const cancelledSpy = vi.fn();
    el.addEventListener("vendo-cancelled", cancelledSpy);

    const btn = el.shadowRoot!.querySelector("button")!;
    btn.click(); // starts the in-flight popup

    // Remove element before popup resolves — should cancel in-flight
    document.body.removeChild(el);

    // Now resolve the popup — event should NOT be dispatched (element is gone + cancelled)
    resolvePopup({ status: "cancelled" });
    await new Promise((r) => setTimeout(r, 20));

    expect(cancelledSpy).not.toHaveBeenCalled();
  });
});
