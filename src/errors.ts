export class VendoError extends Error {
  code: string;
  status?: number;
  slug?: string;
  connectUrl?: string;
  retryAfter?: number;
  suggestedFix?: string;

  constructor(
    message: string,
    init?: {
      code?: string;
      status?: number;
      slug?: string;
      connectUrl?: string;
      retryAfter?: number;
      suggestedFix?: string;
    },
  ) {
    super(message);
    this.name = "VendoError";
    this.code = init?.code ?? "internal_error";
    this.status = init?.status;
    this.slug = init?.slug;
    this.connectUrl = init?.connectUrl;
    this.retryAfter = init?.retryAfter;
    this.suggestedFix = init?.suggestedFix;
  }
}

export class AuthError extends VendoError {
  constructor(message: string, init?: ConstructorParameters<typeof VendoError>[1]) {
    super(message, init);
    this.name = "AuthError";
  }
}

export class NotConnected extends VendoError {
  constructor(message: string, init?: ConstructorParameters<typeof VendoError>[1]) {
    super(message, init);
    this.name = "NotConnected";
  }
}

export class NeedsReauth extends VendoError {
  constructor(message: string, init?: ConstructorParameters<typeof VendoError>[1]) {
    super(message, init);
    this.name = "NeedsReauth";
  }
}

export class BalanceExhausted extends VendoError {
  constructor(message: string, init?: ConstructorParameters<typeof VendoError>[1]) {
    super(message, init);
    this.name = "BalanceExhausted";
  }
}

export class SpendCapExceeded extends VendoError {
  constructor(message: string, init?: ConstructorParameters<typeof VendoError>[1]) {
    super(message, init);
    this.name = "SpendCapExceeded";
  }
}

export class RateLimited extends VendoError {
  constructor(message: string, init?: ConstructorParameters<typeof VendoError>[1]) {
    super(message, init);
    this.name = "RateLimited";
  }
}

export class UpstreamError extends VendoError {
  constructor(message: string, init?: ConstructorParameters<typeof VendoError>[1]) {
    super(message, init);
    this.name = "UpstreamError";
  }
}

export class ValidationError extends VendoError {
  constructor(message: string, init?: ConstructorParameters<typeof VendoError>[1]) {
    super(message, init);
    this.name = "ValidationError";
  }
}

export class IdempotencyConflict extends VendoError {
  constructor(message: string, init?: ConstructorParameters<typeof VendoError>[1]) {
    super(message, init);
    this.name = "IdempotencyConflict";
  }
}

type VendoErrorInit = ConstructorParameters<typeof VendoError>[1];
type VendoErrorCtor = new (message: string, init?: VendoErrorInit) => VendoError;

const CODE_TO_CLASS: Record<string, VendoErrorCtor> = {
  app_unknown: AuthError,
  app_revoked: AuthError,
  app_expired: AuthError,
  binding_missing: NotConnected,
  connection_revoked: NotConnected,
  connection_needs_reauth: NeedsReauth,
  balance_exhausted: BalanceExhausted,
  spend_cap_daily: SpendCapExceeded,
  spend_cap_monthly: SpendCapExceeded,
  upstream_rate_limited: RateLimited,
  upstream_error: UpstreamError,
  validation_failed: ValidationError,
  idempotency_conflict: IdempotencyConflict,
};

export function fromResponse(args: {
  status: number;
  headers: Headers | Record<string, string>;
  body: unknown;
}): VendoError {
  const headerCode =
    args.headers instanceof Headers
      ? args.headers.get("Vendo-Error-Code")
      : (args.headers["Vendo-Error-Code"] ?? args.headers["vendo-error-code"]);

  const bodyErr =
    args.body && typeof args.body === "object" && "error" in args.body
      ? ((args.body as { error?: Record<string, unknown> }).error ?? {})
      : {};

  const code = (
    headerCode ||
    (bodyErr as { code?: string }).code ||
    "internal_error"
  ) as string;

  const message =
    (bodyErr as { message?: string }).message || `HTTP ${args.status} (${code})`;

  const Cls = CODE_TO_CLASS[code] ?? VendoError;

  return new Cls(message, {
    code,
    status: args.status,
    slug: (bodyErr as { slug?: string }).slug,
    connectUrl: (bodyErr as { connect_url?: string }).connect_url,
    retryAfter: (bodyErr as { retry_after?: number }).retry_after,
    suggestedFix: (bodyErr as { suggested_fix?: string }).suggested_fix,
  });
}
