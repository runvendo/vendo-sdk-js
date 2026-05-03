/** Tiny fetch-based SSE reader with bearer auth.
 *  The host page provides the apiKey; no server-side session needed.
 */

export interface SseEvent {
  type: string;
  data: unknown;
}

export type SseHandler = (event: SseEvent) => void;
export type SseCleanup = () => void;

/** Open an SSE stream.  Returns a cleanup function that aborts the stream.
 *  @param onError — called on non-OK HTTP responses (4xx/5xx); stream does not retry.
 */
export function openSseStream(
  url: string,
  apiKey: string,
  onEvent: SseHandler,
  onError?: (err: Error) => void,
): SseCleanup {
  const controller = new AbortController();

  void (async () => {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        // Signal auth/client errors so callers can react (e.g. surface a warning)
        if (!res.ok) {
          onError?.(new Error(`SSE auth/client error: ${res.status}`));
        }
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Normalise CR+LF and bare CR to LF so the SSE line-split works uniformly
        let chunk = decoder.decode(value, { stream: true });
        chunk = chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "message";
        let dataLines: string[] = [];

        for (const line of lines) {
          // Skip SSE comment / heartbeat lines (start with ':')
          if (line.startsWith(":")) continue;

          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          } else if (line === "") {
            if (dataLines.length > 0) {
              const raw = dataLines.join("\n");
              try {
                const parsed = JSON.parse(raw) as unknown;
                onEvent({ type: eventType, data: parsed });
              } catch {
                onEvent({ type: eventType, data: raw });
              }
              dataLines = [];
              eventType = "message";
            }
          }
        }
      }
    } catch {
      // Abort and network errors are expected during cleanup — swallow silently
    }
  })();

  return () => controller.abort();
}
