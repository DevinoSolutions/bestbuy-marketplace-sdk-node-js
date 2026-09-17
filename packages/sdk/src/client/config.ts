import type { BestBuyClientConfig } from "../types.js";
import { BestBuyValidationError, type BestBuyValidationIssue } from "../errors/index.js";
import { defaultUserAgent } from "../version.js";

const DEFAULT_BASE_URL = "https://marketplace.bestbuy.ca";
const DEFAULT_TIMEOUT_MS = 30_000;

/** Fully-resolved, validated configuration used internally by the client. */
export interface ResolvedConfig {
  apiKey: string;
  /** Origin (plus optional path prefix) with no trailing slash; endpoint paths are appended. */
  baseUrl: string;
  shopId?: string;
  timeoutMs: number;
  userAgent: string;
  fetch: typeof globalThis.fetch;
}

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function resolveBaseUrl(raw: string | undefined, issues: BestBuyValidationIssue[]): string {
  const value = raw ?? DEFAULT_BASE_URL;
  if (typeof value !== "string" || value.trim() === "") {
    issues.push({ path: "baseUrl", message: "must be a non-empty string", code: "invalid_type" });
    return DEFAULT_BASE_URL;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push({ path: "baseUrl", message: "must be a valid absolute URL", code: "invalid_url" });
    return DEFAULT_BASE_URL;
  }
  const httpsOk = url.protocol === "https:";
  const httpLoopbackOk = url.protocol === "http:" && isLoopbackHost(url.hostname);
  if (!httpsOk && !httpLoopbackOk) {
    issues.push({
      path: "baseUrl",
      message: "must use https (http is allowed only for localhost/127.0.0.1)",
      code: "invalid_url",
    });
  }
  return value.replace(/\/+$/, "");
}

/**
 * Validates and resolves client configuration. Throws {@link BestBuyValidationError} listing
 * every invalid field at once. Performs no network access and never echoes the API key: an
 * issue about `apiKey` reports the rule that failed, never the value.
 */
export function resolveConfig(config: BestBuyClientConfig): ResolvedConfig {
  const issues: BestBuyValidationIssue[] = [];

  if (config === null || typeof config !== "object") {
    throw new BestBuyValidationError("Invalid Best Buy client configuration", {
      issues: [{ path: "", message: "a configuration object is required", code: "invalid_type" }],
    });
  }

  const apiKey = config.apiKey;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    issues.push({ path: "apiKey", message: "must be a non-empty string", code: "invalid_type" });
  }

  const baseUrl = resolveBaseUrl(config.baseUrl, issues);

  let shopId: string | undefined;
  if (config.shopId !== undefined) {
    if (typeof config.shopId === "number") {
      if (!Number.isInteger(config.shopId)) {
        issues.push({ path: "shopId", message: "must be an integer", code: "invalid_type" });
      }
      shopId = String(config.shopId);
    } else if (typeof config.shopId === "string" && config.shopId.trim() !== "") {
      shopId = config.shopId.trim();
    } else {
      issues.push({
        path: "shopId",
        message: "must be a non-empty string or an integer",
        code: "invalid_type",
      });
    }
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    issues.push({ path: "timeoutMs", message: "must be a positive number", code: "too_small" });
  }

  const fetchImpl: typeof globalThis.fetch = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    issues.push({
      path: "fetch",
      message: "no fetch implementation available; pass config.fetch or run on Node >= 22",
      code: "invalid_type",
    });
  }

  const userAgent = config.userAgent ?? defaultUserAgent();
  if (typeof userAgent !== "string" || userAgent.trim() === "") {
    issues.push({ path: "userAgent", message: "must be a non-empty string", code: "invalid_type" });
  }

  if (issues.length > 0) {
    throw new BestBuyValidationError("Invalid Best Buy client configuration", { issues });
  }

  return {
    apiKey: String(apiKey),
    baseUrl,
    ...(shopId !== undefined ? { shopId } : {}),
    timeoutMs,
    userAgent,
    fetch: fetchImpl,
  };
}
