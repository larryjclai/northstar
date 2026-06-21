import { describe, expect, it } from "vitest";
import { computeRolloverSeries, annualBudgetSummary } from "./budgetRollover";

describe("computeRolloverSeries", () => {
  it("rollover OFF: available always = monthlyBudget, carry always 0", () => {
    const series = computeRolloverSeries({
      monthlyBudget: 1000,
      rollover: false,
      monthlySpend: [600, 1200, 800],
    });
    expect(series.map((m) => m.available)).toEqual([1000, 1000, 1000]);
    expect(series.map((m) => m.carry)).toEqual([0, 0, 0]);
    expect(series.map((m) => m.budget)).toEqual([1000, 1000, 1000]);
    expect(series.map((m) => m.spend)).toEqual([600, 1200, 800]);
  });

  it("rollover ON underspend: month 2 available = budget + (budget − spend1)", () => {
    const series = computeRolloverSeries({
      monthlyBudget: 1000,
      rollover: true,
      monthlySpend: [600, 500],
    });
    // month 1: available 1000, carry 1000-600 = 400
    expect(series[0]).toMatchObject({ available: 1000, spend: 600, carry: 400 });
    // month 2: available 1000 + 400 = 1400, carry 1400-500 = 900
    expect(series[1]).toMatchObject({ available: 1400, spend: 500, carry: 900 });
  });

  it("rollover ON overspend: negative carry reduces next month's available", () => {
    const series = computeRolloverSeries({
      monthlyBudget: 1000,
      rollover: true,
      monthlySpend: [1300, 400],
    });
    // month 1: available 1000, carry 1000-1300 = -300
    expect(series[0]).toMatchObject({ available: 1000, spend: 1300, carry: -300 });
    // month 2: available 1000 + (-300) = 700, carry 700-400 = 300
    expect(series[1]).toMatchObject({ available: 700, spend: 400, carry: 300 });
  });

  it("multi-month accumulation (3+ months) compounds correctly", () => {
    const series = computeRolloverSeries({
      monthlyBudget: 1000,
      rollover: true,
      monthlySpend: [800, 700, 1500, 900],
    });
    // m1: avail 1000, carry 200
    // m2: avail 1200, carry 500
    // m3: avail 1500, carry 0
    // m4: avail 1000, carry 100
    expect(series.map((m) => m.available)).toEqual([1000, 1200, 1500, 1000]);
    expect(series.map((m) => m.carry)).toEqual([200, 500, 0, 100]);
  });

  it("startIndex excludes months before the start from accumulation", () => {
    const series = computeRolloverSeries({
      monthlyBudget: 1000,
      rollover: true,
      monthlySpend: [200, 100, 600, 500],
      startIndex: 2,
    });
    // months 0,1 are before start → no carry, available = monthlyBudget
    expect(series[0]).toMatchObject({ available: 1000, carry: 0 });
    expect(series[1]).toMatchObject({ available: 1000, carry: 0 });
    // accumulation begins at index 2
    // m2: avail 1000, carry 1000-600 = 400
    expect(series[2]).toMatchObject({ available: 1000, spend: 600, carry: 400 });
    // m3: avail 1400, carry 1400-500 = 900
    expect(series[3]).toMatchObject({ available: 1400, spend: 500, carry: 900 });
  });

  it("carries optional month labels through onto the result", () => {
    const series = computeRolloverSeries({
      monthlyBudget: 500,
      rollover: false,
      monthlySpend: [100, 200],
      months: ["2026-01", "2026-02"],
    });
    expect(series.map((m) => m.month)).toEqual(["2026-01", "2026-02"]);
  });

  it("no budget (0) with rollover off yields zero available", () => {
    const series = computeRolloverSeries({
      monthlyBudget: 0,
      rollover: false,
      monthlySpend: [100, 50],
    });
    expect(series.map((m) => m.available)).toEqual([0, 0]);
    expect(series.map((m) => m.carry)).toEqual([0, 0]);
  });
});

describe("annualBudgetSummary", () => {
  it("annual total = sum of 12 months' spend; annual budget = monthly × 12", () => {
    const monthlySpend = [100, 200, 300, 0, 0, 0, 0, 0, 0, 0, 0, 400];
    const summary = annualBudgetSummary({
      monthlyBudget: 1000,
      rollover: false,
      monthlySpend,
    });
    expect(summary.annualSpend).toBe(1000);
    expect(summary.annualBudget).toBe(12000);
    expect(summary.months).toHaveLength(12);
  });

  it("annual budget stays monthly × 12 even when rollover is on", () => {
    const monthlySpend = Array(12).fill(500);
    const summary = annualBudgetSummary({
      monthlyBudget: 1000,
      rollover: true,
      monthlySpend,
    });
    expect(summary.annualBudget).toBe(12000);
    expect(summary.annualSpend).toBe(6000);
    // rollover compounds the carry across the year
    expect(summary.months[11].available).toBeGreaterThan(1000);
  });
});
