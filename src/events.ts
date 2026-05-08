import type { HttpAdapter } from "./_http";
import { requireVendoMode } from "./_mode";

export interface EventStreamMessage {
  type: string;
  data: unknown;
  id?: string;
  retry?: number;
}

export interface SubscribeOptions {
  signal?: AbortSignal;
  /** Cap the exponential reconnect backoff in milliseconds. Default 30_000. */
  maxBackoffMs?: number;
  /** Notified each time the stream reconnects after a transient error. */
  onReconnect?: (attempt: number, err?: Error) => void;
}

const DEFAULT_MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

export class EventsAPI {
  constructor(private readonly http: HttpAdapter) {}

  subscribe(opts: SubscribeOptions = {}): AsyncIterable<EventStreamMessage> {
    requireVendoMode("events.subscribe");
    return this._iterate(opts);
  }

  private async *_iterate(opts: SubscribeOptions): AsyncGenerator<EventStreamMessage> {
    const maxBackoff = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
    let attempt = 0;
    const url = `${this.http.baseUrl.replace(/\/$/, "")}/api/deployments/me/events`;

    while (!opts.signal?.aborted) {
      try {
        const res = await this.http.fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.http.apiKey}`,
            Accept: "text/event-stream",
          },
          signal: opts.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`SSE response not OK: ${res.status}`);
        }

        // Successful connection resets backoff
        attempt = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventType = "message";
        let dataLines: string[] = [];
        let lastEventId: string | undefined;
        let serverRetryMs: number | undefined;

        while (!opts.signal?.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true })
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (line.startsWith(":")) continue;  // comment / heartbeat
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            } else if (line.startsWith("id:")) {
              lastEventId = line.slice(3).trim();
            } else if (line.startsWith("retry:")) {
              const n = parseInt(line.slice(6).trim(), 10);
              if (!Number.isNaN(n)) serverRetryMs = n;
            } else if (line === "") {
              if (dataLines.length > 0) {
                const raw = dataLines.join("\n");
                let data: unknown;
                try {
                  data = JSON.parse(raw);
                } catch {
                  data = raw;
                }
                yield { type: eventType, data, id: lastEventId, retry: serverRetryMs };
                dataLines = [];
                eventType = "message";
              }
            }
          }
        }
      } catch (err) {
        if (opts.signal?.aborted) return;
        attempt++;
        const base = Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1), maxBackoff);
        const jitter = Math.random() * base * 0.25;
        const wait = base + jitter;
        opts.onReconnect?.(attempt, err as Error);
        await sleep(wait, opts.signal);
      }
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    }
  });
}
