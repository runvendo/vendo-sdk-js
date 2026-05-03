import { VendoConnectButton } from "./elements/VendoConnectButton.js";
import { VendoConnectionCard } from "./elements/VendoConnectionCard.js";

export { VendoConnectButton } from "./elements/VendoConnectButton.js";
export { VendoConnectionCard } from "./elements/VendoConnectionCard.js";
export { openPopup } from "./popup.js";
export type { PopupResult } from "./popup.js";
export { validateMessage, expectedOrigin, subscribe } from "./postMessageBridge.js";
export type { BridgeMessageData } from "./postMessageBridge.js";
export { openSseStream } from "./sse-client.js";

/** Register the Vendo custom elements with the browser's customElements registry.
 *  Guarded against double-registration.
 *  Called automatically on import (side-effect), so:
 *    <script type="module" src=".../browser/index.js"></script>
 *  works without an explicit register() call.
 */
export function register(): void {
  if (!customElements.get("vendo-connect-button")) {
    customElements.define("vendo-connect-button", VendoConnectButton);
  }
  if (!customElements.get("vendo-connection-card")) {
    customElements.define("vendo-connection-card", VendoConnectionCard);
  }
}

// Side-effect registration on import
register();
