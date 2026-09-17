import { describe, expect, it } from "vitest";
import { formatMiraklDate, parseMiraklDate } from "../src/dates.js";

describe("date helpers", () => {
  it("parses an ISO-8601 timestamp with an offset", () => {
    expect(parseMiraklDate("2026-09-11T14:03:00Z")?.toISOString()).toBe("2026-09-11T14:03:00.000Z");
  });

  it("returns undefined for null, empty and unparseable values", () => {
    expect(parseMiraklDate(null)).toBeUndefined();
    expect(parseMiraklDate(undefined)).toBeUndefined();
    expect(parseMiraklDate("")).toBeUndefined();
    expect(parseMiraklDate("not a date")).toBeUndefined();
  });

  it("formats a Date as UTC and passes strings through untouched", () => {
    expect(formatMiraklDate(new Date("2026-09-11T14:03:00Z"))).toBe("2026-09-11T14:03:00.000Z");
    expect(formatMiraklDate("2026-09-11T10:03:00-04:00")).toBe("2026-09-11T10:03:00-04:00");
  });
});
