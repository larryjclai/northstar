import { describe, expect, it } from "vitest";
import { stripStartDate } from "./dateScope";

// Regression guard: a previous implementation built the date in local time but
// serialized via toISOString() (UTC), shifting the window start one day early in
// UTC+ zones (e.g. Asia/Taipei). These assertions pin exact strings so the
// off-by-one can never come back regardless of the host timezone.
describe("stripStartDate", () => {
  it("returns the day before for 1D", () => {
    expect(stripStartDate("1D", "2026-06-20")).toBe("2026-06-19");
  });

  it("returns 7 days before for 1W", () => {
    expect(stripStartDate("1W", "2026-06-20")).toBe("2026-06-13");
  });

  it("returns 31 days before for 1M", () => {
    expect(stripStartDate("1M", "2026-06-20")).toBe("2026-05-20");
  });

  it("returns 92 days before for 3M", () => {
    expect(stripStartDate("3M", "2026-06-20")).toBe("2026-03-20");
  });

  it("returns 365 days before for 1Y", () => {
    // 365 calendar days before 2026-06-20 (2024 was a leap year does not fall in
    // this window, so it lands cleanly one calendar year back).
    expect(stripStartDate("1Y", "2026-06-20")).toBe("2025-06-20");
  });

  it("returns 1825 days before for 5Y", () => {
    // 1825 = 5 * 365; the 2024 leap day inside this window shifts it one day off
    // a clean 5-calendar-year subtraction. Pinned to the produced value.
    expect(stripStartDate("5Y", "2026-06-20")).toBe("2021-06-21");
  });

  it("returns Jan 1 of the end year for YTD", () => {
    expect(stripStartDate("YTD", "2026-06-20")).toBe("2026-01-01");
  });

  it("returns the sentinel epoch for All", () => {
    expect(stripStartDate("All", "2026-06-20")).toBe("1900-01-01");
  });

  it("handles month boundaries for 1D", () => {
    expect(stripStartDate("1D", "2026-03-01")).toBe("2026-02-28");
  });

  it("handles year boundaries for 1D", () => {
    expect(stripStartDate("1D", "2026-01-01")).toBe("2025-12-31");
  });
});
