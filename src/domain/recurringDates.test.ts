import { describe, expect, it } from "vitest";
import { firstFutureRunDate, nextRecurringDate } from "./recurringDates";

describe("firstFutureRunDate", () => {
  it("advances a past monthly seed to the first run on-or-after the injected today", () => {
    // Monthly rule seeded 2026-06-05 (dayOfMonth 5); today is 2026-07-01.
    // The first future run should be 2026-07-05, not the seeded June date.
    expect(firstFutureRunDate("2026-06-05", "monthly", 5, "2026-07-01")).toBe("2026-07-05");
  });

  it("keeps a seed that is already on-or-after today unchanged", () => {
    expect(firstFutureRunDate("2026-07-05", "monthly", 5, "2026-07-01")).toBe("2026-07-05");
  });

  it("respects the injected today — the boundary moves with it", () => {
    // Same seed/frequency, but a later `today` pushes the first run forward.
    expect(firstFutureRunDate("2026-06-05", "monthly", 5, "2026-06-04")).toBe("2026-06-05");
    expect(firstFutureRunDate("2026-06-05", "monthly", 5, "2026-08-01")).toBe("2026-08-05");
  });

  it("advances weekly seeds relative to the injected today", () => {
    expect(firstFutureRunDate("2026-06-01", "weekly", 1, "2026-06-15")).toBe("2026-06-15");
  });

  it("defaults today to the real current UTC date when omitted", () => {
    // A seed far in the future is always >= today, so the default-today path
    // returns it unchanged regardless of when the test runs.
    const farFuture = "2999-01-15";
    expect(firstFutureRunDate(farFuture, "monthly", 15)).toBe(farFuture);
    // A seed far in the past is clamped to something >= the real today.
    const realToday = new Date().toISOString().slice(0, 10);
    expect(firstFutureRunDate("2000-01-10", "monthly", 10) >= realToday).toBe(true);
  });
});

describe("nextRecurringDate", () => {
  it("advances monthly by clamping to the shortest month", () => {
    expect(nextRecurringDate("2026-01-31", "monthly", 31)).toBe("2026-02-28");
  });
});
