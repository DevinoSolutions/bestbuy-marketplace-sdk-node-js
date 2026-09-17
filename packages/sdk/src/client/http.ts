/**
 * The one place this SDK talks to the network.
 *
 * Responsibilities, in order: build the URL from the {@link OPERATIONS} table, attach auth
 * and content headers, enforce the timeout, redact the API key out of every response body
 * before anything else looks at it, and translate failures into SDK errors.
 *
 * Authentication is a raw API key in the `Authorization` header — no `Bearer` prefix, no
 * token exchange. The key is written into the request and never read back out: it appears in
 * no error, no log and no thrown value.
 */
import { OPERATIONS, type OperationName } from "../operations.js";
import { BestBuyNetworkError, BestBuyValidationError } from "../errors/index.js";
import { apiErrorFromResponse } from "../errors/parse-upstream.js";
import { redact } from "../util.js";
import type { RequestOptions } from "../types.js";
import type { ResolvedConfig } from "./config.js";

/** Query values the SDK knows how to serialize. `undefined` entries are dropped. */
export type QueryValue = string | number | boolean | undefined;

/** A single outbound request, described in terms of the operations table. */
interface RequestSpec {
  operation: OperationName;
  /** Values substituted into the `{placeholder}` segments of the operation path. */
  pathParams?: Record<string, string>;
  query?: Record<string, QueryValue>;
  /** JSON request body. Mutually exclusive with `form`. */
  json?: unknown;
  /** Multipart body for file imports. Mutually exclusive with `json`. */
  form?: FormData;
  /** `json` (default) parses the response; `text` returns it verbatim, e.g. CSV reports. */
  accept?: "json" | "text";
}

function fillPath(template: string, params: Record<string, string> | undefined): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name];
    if (value === undefined || value === "") {
      throw new BestBuyValidationError(`Missing path parameter "${name}"`, {
        issues: [{ path: name, message: "is required", code: "invalid_type" }],
      });
    }
    return encodeURIComponent(value);
  });
}

/** Thin HTTP layer shared by every module API. */
export class BestBuyHttpClient {
  constructor(private readonly config: ResolvedConfig) {}

  /** Performs the request and returns the parsed JSON body (`undefined` for 204). */
  async requestJson(spec: RequestSpec, options?: RequestOptions): Promise<unknown> {
    const { text } = await this.send(spec, options);
    if (text.trim() === "") return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BestBuyValidationError(
        `${OPERATIONS[spec.operation].method} ${OPERATIONS[spec.operation].path} returned a non-JSON body`,
        { issues: [{ path: "", message: "expected a JSON response body", code: "invalid_type" }] },
      );
    }
  }

  /** Performs the request and returns the raw response text (CSV reports, mostly). */
  async requestText(spec: RequestSpec, options?: RequestOptions): Promise<string> {
    const { text } = await this.send({ ...spec, accept: "text" }, options);
    return text;
  }

  private buildUrl(spec: RequestSpec): URL {
    const operation = OPERATIONS[spec.operation];
    const url = new URL(this.config.baseUrl + fillPath(operation.path, spec.pathParams));
    for (const [key, value] of Object.entries(spec.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    // Mirakl multi-shop users must say which shop they are acting for.
    if (this.config.shopId !== undefined && !url.searchParams.has("shop_id")) {
      url.searchParams.set("shop_id", this.config.shopId);
    }
    return url;
  }

  private async send(
    spec: RequestSpec,
    options?: RequestOptions,
  ): Promise<{ status: number; text: string }> {
    const operation = OPERATIONS[spec.operation];
    const url = this.buildUrl(spec);

    const headers = new Headers({
      // Raw API key: Mirakl does NOT use a "Bearer" prefix.
      Authorization: this.config.apiKey,
      Accept: spec.accept === "text" ? "text/plain, text/csv, */*" : "application/json",
      "User-Agent": this.config.userAgent,
    });

    let body: FormData | string | undefined;
    if (spec.form !== undefined) {
      // Deliberately no Content-Type header: fetch sets it with the multipart boundary.
      body = spec.form;
    } else if (spec.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(spec.json);
    }

    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal =
      options?.signal !== undefined
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;

    let response: Response;
    try {
      response = await this.config.fetch(url, {
        method: operation.method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal,
      });
    } catch (cause) {
      const timedOut = timeoutSignal.aborted;
      const reason = timedOut
        ? `timed out after ${timeoutMs}ms`
        : options?.signal?.aborted === true
          ? "was aborted by the caller"
          : "failed before a response was received";
      throw new BestBuyNetworkError(
        `${operation.method} ${operation.path} ${reason}`,
        // `cause` is the fetch failure; it never carries request headers.
        { timedOut, cause },
      );
    }

    const raw = await response.text();
    // Redact BEFORE anything reads the body: an upstream that echoes the Authorization
    // header must not be able to smuggle the key into an error, a log or a return value.
    const text = redact(raw, this.config.apiKey);
    const requestId = response.headers.get("x-request-id") ?? undefined;

    if (!response.ok) {
      throw apiErrorFromResponse({
        status: response.status,
        text,
        method: operation.method,
        path: operation.path,
        ...(requestId !== undefined ? { requestId } : {}),
      });
    }

    return { status: response.status, text };
  }
}
