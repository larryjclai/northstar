import { describe, expect, it } from "vitest";
import { calculateFireProjection, resolveTargetAmount } from "./fireGoal";

describe("calculateFireProjection", () => {
  it("flags achieved when current value already meets the target", () => {
    const result = calculateFireProjection({
      currentValue: 2_000_000,
      monthlyContribution: 30_000,
      expectedAnnualReturn: 0.07,
      targetAmount: 1_500_000,
    });
    expect(result.achieved).toBe(true);
    expect(result.monthsToTarget).toBe(0);
    expect(result.progressRatio).toBeGreaterThan(1);
  });

  it("converges on the 25x rule benchmark", () => {
    // Common FIRE setup: spending 600k/yr, target 15M, currently 1M,
    // contributing 50k/month at 7%. Crosshair check that we land in a
    // sensible range (10-25 yrs), not asserting the exact month.
    const result = calculateFireProjection({
      currentValue: 1_000_000,
      monthlyContribution: 50_000,
      expectedAnnualReturn: 0.07,
      targetAmount: 15_000_000,
    });
    expect(result.achieved).toBe(false);
    expect(result.monthsToTarget).not.toBeNull();
    const months = result.monthsToTarget!;
    expect(months).toBeGreaterThan(120);
    expect(months).toBeLessThan(300);
  });

  it("falls back to linear math when return is zero", () => {
    const result = calculateFireProjection({
      currentValue: 0,
      monthlyContribution: 10_000,
      expectedAnnualReturn: 0,
      targetAmount: 120_000,
    });
    expect(result.monthsToTarget).toBe(12);
  });

  it("returns null when there is no path to the target", () => {
    const result = calculateFireProjection({
      currentValue: 100,
      monthlyContribution: 0,
      expectedAnnualReturn: 0,
      targetAmount: 1_000_000,
    });
    expect(result.monthsToTarget).toBeNull();
    expect(result.yearsToTarget).toBeNull();
    expect(result.projectedTargetDate).toBeNull();
  });

  it("returns an empty projection for non-positive targets", () => {
    const result = calculateFireProjection({
      currentValue: 1_000,
      monthlyContribution: 100,
      expectedAnnualReturn: 0.05,
      targetAmount: 0,
    });
    expect(result.monthsToTarget).toBeNull();
    expect(result.progressRatio).toBe(0);
  });

  it("derives target from annual spending and withdrawal rate", () => {
    expect(resolveTargetAmount({ annualSpending: 600_000, withdrawalRate: 0.04, targetAmount: null })).toBe(15_000_000);
    expect(resolveTargetAmount({ annualSpending: 600_000, withdrawalRate: 0.04, targetAmount: 0 })).toBe(15_000_000);
    expect(resolveTargetAmount({ annualSpending: 600_000, withdrawalRate: 0.04, targetAmount: 9_000_000 })).toBe(9_000_000);
    expect(resolveTargetAmount({ annualSpending: 600_000, withdrawalRate: 0, targetAmount: null })).toBe(15_000_000);
  });
});
