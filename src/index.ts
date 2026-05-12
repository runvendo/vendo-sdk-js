// Public surface re-exports
export * from "./errors";
export * from "./connections";
export * from "./integrations";
export * from "./billing";
export { WebhooksAPI, type WebhookEvent, type WebhooksAPIOptions } from "./webhooks";
export { EventsAPI, type EventStreamMessage, type SubscribeOptions } from "./events";
export * from "./testing";
export { Vendo, type VendoOptions } from "./_client";
export { HttpAdapter, DEFAULT_RETRY, type RetryPolicy } from "./_http";
export { connectUrl, type ConnectUrlOptions } from "./connect";
export { isVendoMode } from "./_mode";

// Legacy — kept for backwards compatibility. Prefer the Vendo class.
export {
  getCredential,
  _clearCacheForTesting,
  type CredentialResponse,
  type GetCredentialOptions,
  VendoSdkError,
} from "./legacy";
