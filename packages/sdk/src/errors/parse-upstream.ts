/**
 * Turns an upstream error response into a {@link BestBuyApiError}.
 *
 * Mirakl error bodies are usually a JSON object with `message` and `status`, but gateways in
 * front of the platform (and some endpoints) answer with a bare string, an HTML page, a JSON
 * array of errors, or an object with an `errors` array. Nothing here throws: an unparseable
 * body becomes the error's `body` verbatim.
 */
import { BestBuyApiError } from "./index.js";
import { isRecord } from "../util.js";

/** Best-effort JSON parse; returns the original string when the text is not JSON. */
function parseBody(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return text;
  }
}

function firstString(value: unknown, keys: readonly string[]): string | undefined {
  if (!isRecord(value)) return undefined;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return undefined;
}

/** Pulls a human message out of any of the shapes Mirakl and its gateways emit. */
function extractMessage(body: unknown): string | undefined {
  if (typeof body === "string") return body.trim() === "" ? undefined : body.trim();
  if (Array.isArray(body)) {
    const messages = body
      .map((entry) => firstString(entry, ["message", "error", "reason"]))
      .filter((entry): entry is string => entry !== undefined);
    return messages.length > 0 ? messages.join("; ") : undefined;
  }
  const direct = firstString(body, ["message", "error_message", "error", "reason"]);
  if (direct !== undefined) return direct;
  if (isRecord(body) && Array.isArray(body.errors)) return extractMessage(body.errors);
  return undefined;
}

/** Pulls an upstream error code out of the body, when present. */
function extractCode(body: unknown): string | undefined {
  const direct = firstString(body, ["code", "error_code", "errorCode"]);
  if (direct !== undefined) return direct;
  if (isRecord(body) && Array.isArray(body.errors)) {
    return firstString(body.errors[0], ["code", "error_code", "errorCode"]);
  }
  if (Array.isArray(body)) return firstString(body[0], ["code", "error_code", "errorCode"]);
  return undefined;
}

/** Short, stable description of the common statuses, used when the body carries no message. */
function statusSummary(status: number): string {
  if (status === 400) return "Bad request";
  if (status === 401) return "Unauthorized - the API key was rejected";
  if (status === 403) return "Forbidden - the API key lacks permission for this operation";
  if (status === 404) return "Not found";
  if (status === 429) return "Rate limited";
  if (status >= 500) return "Upstream server error";
  return "Request failed";
}

/**
 * Builds the error for a failed request. `text` must already be redacted by the caller, so
 * this function never handles credentials.
 */
export function apiErrorFromResponse(args: {
  status: number;
  text: string;
  method: string;
  path: string;
  requestId?: string;
}): BestBuyApiError {
  const body = parseBody(args.text);
  const detail = extractMessage(body) ?? statusSummary(args.status);
  const message = `${args.method} ${args.path} failed with HTTP ${args.status}: ${detail}`;
  const code = extractCode(body);
  return new BestBuyApiError(args.status, message, {
    body,
    ...(code !== undefined ? { code } : {}),
    ...(args.requestId !== undefined ? { requestId: args.requestId } : {}),
  });
}
