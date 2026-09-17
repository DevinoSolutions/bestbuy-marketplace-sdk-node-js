/**
 * Guards for caller-supplied arguments. These run before any request is built, so a bad
 * argument costs nothing and fails with the same {@link BestBuyValidationError} shape as a
 * bad response.
 */
import { BestBuyValidationError } from "../errors/index.js";

/** Throws unless `value` is a non-empty string; returns it trimmed of nothing else. */
export function requireNonEmptyString(value: unknown, path: string, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BestBuyValidationError(`Invalid argument for ${context}`, {
      issues: [{ path, message: "must be a non-empty string", code: "invalid_type" }],
    });
  }
  return value;
}

/** Accepts the string-or-number identifiers Mirakl uses for offers and imports. */
export function requireIdentifier(value: unknown, path: string, context: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  return requireNonEmptyString(value, path, context);
}

/** Throws unless `value` is a non-empty array. */
export function requireNonEmptyArray<T>(value: readonly T[], path: string, context: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BestBuyValidationError(`Invalid argument for ${context}`, {
      issues: [{ path, message: "must contain at least one entry", code: "too_small" }],
    });
  }
}

/** Normalizes a `string | string[]` filter into a comma-joined query value. */
export function joinList(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  const list = typeof value === "string" ? [value] : value;
  const filtered = list.filter((entry) => entry.trim() !== "");
  return filtered.length > 0 ? filtered.join(",") : undefined;
}

/** Turns file input into a `Blob` so it can be appended to a `FormData` body. */
export function toBlob(file: Blob | Uint8Array, path: string, context: string): Blob {
  if (file instanceof Blob) return file;
  if (file instanceof Uint8Array) return new Blob([file]);
  throw new BestBuyValidationError(`Invalid argument for ${context}`, {
    issues: [{ path, message: "must be a Blob or a Uint8Array/Buffer", code: "invalid_type" }],
  });
}
