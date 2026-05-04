export interface ConnectUrlOptions {
  apiKey: string;
  /** Root host, e.g. https://vendo.run (NOT /api suffix). */
  baseUrl?: string;
  returnTo?: string;
  state?: string;
}

export function connectUrl(slug: string, opts: ConnectUrlOptions): string {
  const base = (opts.baseUrl ?? "https://vendo.run").replace(/\/$/, "");
  const qs = new URLSearchParams();
  qs.set("app_key", opts.apiKey);
  if (opts.returnTo) qs.set("return_to", opts.returnTo);
  if (opts.state) qs.set("state", opts.state);
  return `${base}/connections/connect/${encodeURIComponent(slug)}?${qs.toString()}`;
}
