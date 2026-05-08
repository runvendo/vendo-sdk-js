import { createHmac, timingSafeEqual } from "node:crypto";
import { ValidationError } from "./errors";

export interface WebhookEvent {
  id: string;
  type: string;
  occurredAt: string;  // ISO timestamp
  data: Record<string, unknown>;
}

export interface WebhooksAPIOptions {
  /** Override the webhook secret. Defaults to env.VENDO_WEBHOOK_SECRET. */
  secret?: string;
  /** Max clock skew between Vendo and the receiver, in seconds. Default 300 (5 min). */
  maxAgeSec?: number;
}

const DEFAULT_MAX_AGE_SEC = 300;

function readHeader(
  headers: Headers | Record<string, string>,
  name: string,
): string | null {
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const v = headers.get(name);
    return v && v.trim() ? v.trim() : null;
  }
  const target = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === target) {
      const s = String(v).trim();
      return s || null;
    }
  }
  return null;
}

export class WebhooksAPI {
  private readonly explicitSecret: string | undefined;
  private readonly maxAgeSec: number;

  constructor(opts: WebhooksAPIOptions = {}) {
    this.explicitSecret = opts.secret;
    this.maxAgeSec = opts.maxAgeSec ?? DEFAULT_MAX_AGE_SEC;
  }

  verify(headers: Headers | Record<string, string>, body: string): WebhookEvent {
    const secret = this.explicitSecret ?? (process.env.VENDO_WEBHOOK_SECRET ?? "").trim();
    if (!secret) {
      throw new ValidationError(
        "VENDO_WEBHOOK_SECRET is not set. Pass { secret } to WebhooksAPI or set the env var.",
      );
    }

    const sig = readHeader(headers, "Vendo-Signature");
    if (!sig) throw new ValidationError("Vendo-Signature header missing");
    const ts = readHeader(headers, "Vendo-Timestamp");
    if (!ts) throw new ValidationError("Vendo-Timestamp header missing");

    // Timestamp can be unix-epoch-seconds OR an RFC-3339 string. Normalize.
    let tsSec: number;
    if (/^\d+$/.test(ts)) {
      tsSec = parseInt(ts, 10);
    } else {
      const parsed = Date.parse(ts);
      if (Number.isNaN(parsed)) {
        throw new ValidationError(`Vendo-Timestamp not parseable: ${ts}`);
      }
      tsSec = Math.floor(parsed / 1000);
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - tsSec) > this.maxAgeSec) {
      throw new ValidationError(
        `Vendo-Timestamp drift exceeds ${this.maxAgeSec}s (got ${now - tsSec}s)`,
      );
    }

    const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    let sigBuf: Buffer;
    try {
      sigBuf = Buffer.from(sig, "hex");
    } catch {
      throw new ValidationError("Vendo-Signature is not valid hex");
    }
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      throw new ValidationError("Vendo-Signature mismatch");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new ValidationError("webhook body is not valid JSON");
    }

    return {
      id: (parsed.id as string) ?? "",
      type: (parsed.type as string) ?? "",
      occurredAt: (parsed.occurred_at as string) ?? "",
      data: (parsed.data as Record<string, unknown>) ?? {},
    };
  }
}
