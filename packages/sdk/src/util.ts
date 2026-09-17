/** Narrows an unknown value to a plain object without using `any`. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Removes every occurrence of `secret` from `text`. Used to guarantee that an API key can
 * never reach an error message, an error body, or a log line — even when the upstream
 * response echoes the `Authorization` header back to us.
 */
export function redact(text: string, secret: string): string {
  if (secret.length < 4) return text;
  return text.split(secret).join("[redacted]");
}
