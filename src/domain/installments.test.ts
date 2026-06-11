import { describe, expect, it } from "vitest";
import { addMonthsClamped, buildInstallmentSchedule, installmentLabel } from "./installments";

describe("addMonthsClamped", () => {
  it("steps plain months and pads", () => {
    expect(addMonthsClamped("2026-06-15", 1)).toBe("2026-07-15");
    expect(addMonthsClamped("2026-06-15", 7)).toBe("2027-01-15");
  });

  it("clamps to month end without drifting (anchored to original day)", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2026-01-31", 3)).toBe("2026-04-30");
    // Leap year February.
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("preserves a time suffix", () => {
    expect(addMonthsClamped("2026-01-31T14:30:00", 1)).toBe("2026-02-28T14:30:00");
  });
});

describe("buildInstallmentSchedule", () => {
  it("splits evenly and sums exactly to the total", () => {
    const schedule = buildInstallmentSchedule({ totalAmount: -12_000, periods: 12, startDate: "2026-06-11" });
    expect(schedule).toHaveLength(12);
    expect(schedule.every((p) => p.amount === -1000)).toBe(true);
    expect(schedule[0].date).toBe("2026-06-11");
    expect(schedule[11].date).toBe("2027-05-11");
    expect(schedule.map((p) => p.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("folds the rounding remainder into the first period", () => {
    const schedule = buildInstallmentSchedule({ totalAmount: -10_000, periods: 3, startDate: "2026-06-11" });
    expect(schedule[0].amount).toBe(-3333.34);
    expect(schedule[1].amount).toBe(-3333.33);
    expect(schedule[2].amount).toBe(-3333.33);
    const sum = schedule.reduce((s, p) => s + p.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(-10_000);
  });

  it("rejects invalid input", () => {
    expect(() => buildInstallmentSchedule({ totalAmount: -1000, periods: 1, startDate: "2026-06-11" })).toThrow();
    expect(() => buildInstallmentSchedule({ totalAmount: -1000, periods: 2.5, startDate: "2026-06-11" })).toThrow();
    expect(() => buildInstallmentSchedule({ totalAmount: 0, periods: 3, startDate: "2026-06-11" })).toThrow();
  });
});

describe("installmentLabel", () => {
  it("labels installment rows and skips normal rows", () => {
    expect(installmentLabel({ installmentIndex: 3, installmentTotal: 12 })).toBe("3/12期");
    expect(installmentLabel({ installmentIndex: null, installmentTotal: null })).toBeNull();
  });
});
