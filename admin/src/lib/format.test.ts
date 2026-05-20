import { describe, expect, it } from "vitest";
import { DASH, formatDate, formatDateTime, formatNumber } from "./format";

describe("format", () => {
  it("returns an em dash for missing or invalid dates", () => {
    expect(formatDate(null)).toBe(DASH);
    expect(formatDate(undefined)).toBe(DASH);
    expect(formatDate("")).toBe(DASH);
    expect(formatDate("not-a-date")).toBe(DASH);
    expect(formatDateTime(null)).toBe(DASH);
  });

  it("formats a valid ISO date into a non-empty string", () => {
    const formatted = formatDate("2026-05-20T10:00:00Z");
    expect(formatted).not.toBe(DASH);
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("formats numbers and falls back for missing values", () => {
    expect(formatNumber(1234)).toBe(new Intl.NumberFormat().format(1234));
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(null)).toBe(DASH);
    expect(formatNumber(undefined)).toBe(DASH);
  });
});
