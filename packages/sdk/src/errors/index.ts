/**
 * Error hierarchy for the SDK. Every error is JSON-safe and, by construction, free of
 * credential material: the HTTP layer redacts the API key from response text before any
 * error is built, and no error ever carries request headers.
 */

/** A single failed expectation while validating configuration or a wire payload. */
export interface BestBuyValidationIssue {
  /** Dotted path to the offending field, e.g. `offers.0.price`. */
  path: string;
  message: string;
  /** Validator code (`invalid_type`, `too_small`, ...) when one is available. */
  code?: string;
}

/** Options shared by every SDK error. */
export interface BestBuyErrorInit {
  /** Upstream correlation id, when the response carried one. */
  requestId?: string;
  cause?: unknown;
}

/**
 * Base class for every error thrown by this SDK. Catch this to handle "anything the Best Buy
 * client can fail with"; catch a subclass to distinguish transport from protocol failures.
 */
export class BestBuyError extends Error {
  readonly requestId?: string;

  constructor(message: string, init: BestBuyErrorInit = {}) {
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = "BestBuyError";
    this.requestId = init.requestId;
  }

  toJSON(): Record<string, unknown> {
    return { name: this.name, message: this.message, requestId: this.requestId };
  }
}

/** Options for {@link BestBuyApiError}. */
export interface BestBuyApiErrorInit extends BestBuyErrorInit {
  /** Upstream error code when the body carried one (Mirakl `code` / `error_code`). */
  code?: string;
  /** Parsed response body: a JSON value when the body parsed as JSON, otherwise the text. */
  body: unknown;
}

/**
 * The API answered with a non-2xx status. `body` is the parsed response payload (already
 * redacted), `code` the upstream error code when one was present.
 */
export class BestBuyApiError extends BestBuyError {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;
  /** True for 408, 429 and 5xx — the request may succeed if retried. */
  readonly retryable: boolean;

  constructor(status: number, message: string, init: BestBuyApiErrorInit) {
    super(message, init);
    this.name = "BestBuyApiError";
    this.status = status;
    this.code = init.code;
    this.body = init.body;
    this.retryable = status === 408 || status === 429 || status >= 500;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), status: this.status, code: this.code, retryable: this.retryable };
  }
}

/** Options for {@link BestBuyNetworkError}. */
export interface BestBuyNetworkErrorInit extends BestBuyErrorInit {
  /** True when the request was aborted by the SDK timeout rather than by the caller. */
  timedOut?: boolean;
}

/** The request never produced an HTTP response: DNS, TLS, socket, abort or timeout. */
export class BestBuyNetworkError extends BestBuyError {
  readonly timedOut: boolean;

  constructor(message: string, init: BestBuyNetworkErrorInit = {}) {
    super(message, init);
    this.name = "BestBuyNetworkError";
    this.timedOut = init.timedOut ?? false;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), timedOut: this.timedOut };
  }
}

/** Options for {@link BestBuyValidationError}. */
export interface BestBuyValidationErrorInit extends BestBuyErrorInit {
  issues: readonly BestBuyValidationIssue[];
}

/**
 * Input or response validation failed. Thrown for invalid client configuration, invalid
 * method arguments, and for responses that do not match the documented wire shape.
 */
export class BestBuyValidationError extends BestBuyError {
  readonly issues: readonly BestBuyValidationIssue[];

  constructor(message: string, init: BestBuyValidationErrorInit) {
    super(message, init);
    this.name = "BestBuyValidationError";
    this.issues = init.issues;
  }

  override toJSON(): Record<string, unknown> {
    return { ...super.toJSON(), issues: this.issues };
  }
}
