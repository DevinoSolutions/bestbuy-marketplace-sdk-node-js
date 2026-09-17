/**
 * Mirakl speaks ISO-8601 with an explicit offset (`2026-09-11T14:03:00Z`), which is the one
 * pleasant surprise of this API: there is no ambiguous local-time parsing to do. The SDK
 * therefore hands dates back as strings, exactly as received, and offers these two helpers
 * for callers that want `Date` objects.
 */

/**
 * Parses an ISO-8601 timestamp from a response. Returns `undefined` for `null`, `undefined`,
 * an empty string, or anything `Date` cannot parse — a bad timestamp is never worth throwing
 * over in the middle of an otherwise usable payload.
 */
export function parseMiraklDate(value: string | null | undefined): Date | undefined {
  if (value === null || value === undefined || value.trim() === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Formats a value for a Mirakl date query parameter. `Date` instances become UTC ISO-8601
 * strings; strings are passed through so a caller can send an offset the SDK did not build.
 */
export function formatMiraklDate(value: Date | string): string {
  return typeof value === "string" ? value : value.toISOString();
}
