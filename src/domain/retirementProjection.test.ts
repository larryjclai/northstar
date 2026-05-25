import { describe, expect, it } from "vitest";
import { projectRetirement, resolveAnnualSpending } from "./retirementProjection";
import type { FinancialGoal } from "./types";

function baseGoal(overrides: Partial<FinancialGoal> = {}): FinancialGoal {
  return {
    id: "goal_test",
    spaceId: "space_personal_default",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    kind: "fire",
    name: "FIRE",
    currency: "TWD",
    annualSpending: 600_000,
    withdrawalRate: 0.04,
    expectedAnnualReturn: 0.07,
    monthlyContribution: 30_000,
    targetAmount: null,
    startDate: "2026-01-01",
    currentAge: 30,
    retirementAge: 50,
    planThroughAge: 90,
    preRetirementReturn: 0.07,
    postRetirementReturn: 0.04,
    inflationRate: 0.02,
    annualFee: 0.006,
    contributionGrowthRate: 0.02,
    spendingItems: [],
    incomeItems: [],
    displayMode: "today",
    accountShareMap: {},
    ...overrides,
  };
}

describe("projectRetirement", () => {
  it("produces a full series from currentAge to planThroughAge", () => {
    const projection = projectRetirement({ goal: baseGoal(), currentValue: 1_000_000 });
    const ages = projection.series.map((row) => row.age);
    expect(ages[0]).toBe(30);
    expect(ages[ages.length - 1]).toBe(90);
    expect(projection.series.length).toBe(61);
  });

  it("transitions phase at retirement age", () => {
    const projection = projectRetirement({ goal: baseGoal({ retirementAge: 55 }), currentValue: 1_000_000 });
    const lastAcc = projection.series.find((row) => row.age === 54)!;
    const firstRet = projection.series.find((row) => row.age === 55)!;
    expect(lastAcc.phase).toBe("accumulation");
    expect(firstRet.phase).toBe("retirement");
    // During retirement contributions stop:
    expect(firstRet.contribution).toBe(0);
    // During retirement spending kicks in:
    expect(firstRet.plannedSpending).toBeGreaterThan(0);
  });

  it("flags onTrack when balance survives to plan-through", () => {
    // Heavy contributions and decent return — should finish solvent.
    const projection = projectRetirement({
      goal: baseGoal({
        monthlyContribution: 60_000,
        annualSpending: 300_000,
      }),
      currentValue: 2_000_000,
    });
    expect(projection.onTrack).toBe(true);
    expect(projection.series[projection.series.length - 1].endBalance).toBeGreaterThan(0);
  });

  it("flags off track when balance is exhausted before plan-through age", () => {
    // Tiny portfolio, no contribution, huge spending — guaranteed to bust.
    const projection = projectRetirement({
      goal: baseGoal({
        monthlyContribution: 0,
        annualSpending: 1_200_000,
      }),
      currentValue: 100_000,
    });
    expect(projection.onTrack).toBe(false);
    // Should hit zero at some point during retirement.
    const ranOutAt = projection.series.find((row) => row.phase === "retirement" && row.endBalance === 0);
    expect(ranOutAt).toBeDefined();
  });

  it("finds an FI age when the contribution path crosses 25× spending", () => {
    const projection = projectRetirement({
      goal: baseGoal({ monthlyContribution: 50_000, annualSpending: 600_000 }),
      currentValue: 1_000_000,
    });
    expect(projection.fiAge).not.toBeNull();
    expect(projection.fiAge!).toBeGreaterThan(30);
    expect(projection.fiAge!).toBeLessThan(55);
  });

  it("derives Coast / Lean / FI / Fat amounts off the 25× target", () => {
    const projection = projectRetirement({
      goal: baseGoal({ annualSpending: 600_000 }),
      currentValue: 100_000,
    });
    expect(projection.targetAtRetirement).toBe(15_000_000);
    expect(projection.leanFireAmount).toBe(15_000_000 * 0.7);
    expect(projection.fatFireAmount).toBe(15_000_000 * 1.5);
    // Coast = target / (1 + real)^20. With 7% gross, 0.6% fee, 2% inflation:
    // real ≈ (1.064) / (1.02) - 1 = 4.31%. So coast ≈ 15M / 1.0431^20 ≈ 6.46M.
    expect(projection.coastFireAmount).toBeGreaterThan(6_000_000);
    expect(projection.coastFireAmount).toBeLessThan(7_000_000);
  });

  it("nominal mode inflates spending year over year, today mode keeps it flat", () => {
    const today = projectRetirement({
      goal: baseGoal({ displayMode: "today" }),
      currentValue: 500_000,
    });
    const nominal = projectRetirement({
      goal: baseGoal({ displayMode: "nominal" }),
      currentValue: 500_000,
    });
    const todayLast = today.series[today.series.length - 1];
    const nominalLast = nominal.series[nominal.series.length - 1];
    // Same spending input — should be identical in today's-money mode.
    expect(todayLast.plannedSpending).toBe(600_000);
    // ...and clearly inflated by 40 years of 2% in nominal mode (~2.2×).
    expect(nominalLast.plannedSpending).toBeGreaterThan(1_200_000);
  });

  it("uses spendingItems sum when present, otherwise legacy annualSpending", () => {
    expect(resolveAnnualSpending(baseGoal({ annualSpending: 100_000 }))).toBe(100_000);
    expect(
      resolveAnnualSpending(
        baseGoal({
          annualSpending: 100_000, // ignored when items exist
          spendingItems: [
            { id: "s1", name: "Living", monthlyAmount: 3_000, mustHave: true },
            { id: "s2", name: "Healthcare", monthlyAmount: 300, mustHave: true },
          ],
        }),
      ),
    ).toBe((3_000 + 300) * 12);
  });
});
