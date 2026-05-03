/** Tiny fetch-based SSE reader with bearer auth.
 *  The host page provides the apiKey; no server-side session needed.
 */

export interface SseEvent {
  type: string;
  data: unknown;
}

export type SseHandler = (event: SseEvent) => void;
export type SseCleanup = () => void;

/** Open an SSE stream.  Returns a cleanup function that aborts the stream. */
export function openSseStream(url: string, apiKey: string, onEvent: SseHandler): SseCleanup {
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

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "message";
        let dataLines: string[] = [];

        for (const line of lines) {
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
