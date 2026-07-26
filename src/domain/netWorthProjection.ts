/**
 * Net-worth projection adapter for the Dashboard card.
 *
 * Wraps `projectRetirementScenarios` (the same engine the FIRE Calculator uses)
 * to produce a 30-year forward-looking curve from the user's current net worth
 * and estimated annual contribution.  All financial math stays inside the
 * engine — this module only maps Dashboard inputs → ProjectionInput and
 * extracts the milestones the card needs.
 *
 * Design notes:
 *  - "currentAge=1, planThroughAge=30, retirementAge=99" keeps the engine in
 *    pure accumulation mode for the full 30-year horizon (no retirement phase).
 *    `series[i].age` therefore equals years-from-now+1; we remap to
 *    `yearsFromNow = age - 1` for the chart x-axis.
 *  - `displayMode = "nominal"` — projection is shown in nominal terms by default
 *    (plan says "nominal by default, no inflation toggle in v1").
 *  - Fees and inflation are set to 0 so the nominal curve is a clean gross-
 *    return series; the FIRE page handles real-return adjustment separately.
 *  - `annualContribution` is passed in as-is; callers are expected to supply
 *    trailing-net × 12 (or 0 if unknown).
 */

import { projectRetirementScenarios } from "./retirementProjection";
import type { FinancialGoal } from "./types";

/** A single year in the 30-year projection curve. */
export interface NetWorthProjectionYear {
  /** Calendar year (current year + yearsFromNow). */
  year: number;
  /** Years from now (0 = current, 30 = end of horizon). */
  yearsFromNow: number;
  /** Bear-scenario balance (neutral − 2.5pp return). */
  bearBalance: number;
  /** Neutral-scenario balance. */
  neutralBalance: number;
  /** Bull-scenario balance (neutral + 2.5pp return). */
  bullBalance: number;
}

/** Output of `projectNetWorth`. */
export interface NetWorthProjectionResult {
  /** 31-point series (year 0 = today through year 30). */
  series: NetWorthProjectionYear[];
  /** Neutral balance at year 10. */
  at10: number;
  /** Neutral balance at year 20. */
  at20: number;
  /** Neutral balance at year 30. */
  at30: number;
  /** The returnPct that was used (as a %, e.g. 7.0). */
  returnPct: number;
  /** Bear scenario CAGR used (returnPct − 2.5). */
  bearCagr: number;
  /** Bull scenario CAGR used (returnPct + 2.5). */
  bullCagr: number;
}

/**
 * Project future net worth over 30 years using the shared retirement engine.
 *
 * @param netWorth           Current net worth in the primary currency.
 * @param annualContribution Expected annual net contribution (income − expense × 12).
 *                           Pass 0 or negative to model zero-contribution growth.
 * @param returnPct          Expected annual return as a percentage (e.g. 7.0 for 7%).
 *                           Defaults to 7.
 * @param primaryCurrency    ISO currency code (passed through to the goal stub).
 */
export function projectNetWorth(
  netWorth: number,
  annualContribution: number,
  returnPct = 7,
  primaryCurrency = "TWD",
): NetWorthProjectionResult {
  // Clamp to safe ranges.
  const clampedReturn = Math.max(0, Math.min(30, returnPct));
  const clampedContribution = Math.max(0, annualContribution);

  // Build the minimal FinancialGoal stub required by the engine.
  // - currentAge=1, planThroughAge=30, retirementAge=99: pure accumulation for 30 yr.
  // - displayMode="nominal": show raw nominal figures (no inflation adjustment in v1).
  // - annualFee=0, inflationRate=0, contributionGrowthRate=0: keep nominal gross-return.
  // - annualSpending / withdrawalRate are required fields but irrelevant in pure
  //   accumulation mode (retirementAge > planThroughAge so retirement phase never runs).
  const goalStub: FinancialGoal = {
    id: "dashboard-nw-projection",
    spaceId: "",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    kind: "fire",
    name: "Net Worth Projection",
    currency: primaryCurrency,
    annualSpending: 0,
    withdrawalRate: 0.04,
    expectedAnnualReturn: clampedReturn / 100,
    monthlyContribution: clampedContribution / 12,
    targetAmount: null,
    startDate: new Date().toISOString().slice(0, 10),
    currentAge: 1,
    retirementAge: 99,
    planThroughAge: 30,
    preRetirementReturn: clampedReturn / 100,
    postRetirementReturn: clampedReturn / 100,
    inflationRate: 0,
    annualFee: 0,
    contributionGrowthRate: 0,
    spendingItems: [],
    incomeItems: [],
    displayMode: "nominal",
    accountShareMap: {},
    targetDate: null,
  };

  const scenarios = projectRetirementScenarios(
    { goal: goalStub, currentValue: Math.max(0, netWorth) },
    0.025,
  );

  const bearByAge = new Map(
    scenarios.pessimistic.projection.series.map((r) => [r.age, r.endBalance]),
  );
  const bullByAge = new Map(
    scenarios.optimistic.projection.series.map((r) => [r.age, r.endBalance]),
  );

  const currentYear = new Date().getFullYear();

  // Engine series starts at age=1 (the first year-end balance). We prepend a
  // year-0 anchor at the current net worth so the chart starts from today.
  const seriesFromEngine = scenarios.neutral.projection.series.map((r) => {
    const yearsFromNow = r.age; // age 1 → 1 year from now, age 30 → 30 years from now
    return {
      year: currentYear + yearsFromNow,
      yearsFromNow,
      bearBalance: bearByAge.get(r.age) ?? r.endBalance,
      neutralBalance: r.endBalance,
      bullBalance: bullByAge.get(r.age) ?? r.endBalance,
    };
  });

  // Prepend the "year 0 = today" anchor.
  const anchor: NetWorthProjectionYear = {
    year: currentYear,
    yearsFromNow: 0,
    bearBalance: Math.max(0, netWorth),
    neutralBalance: Math.max(0, netWorth),
    bullBalance: Math.max(0, netWorth),
  };

  const series = [anchor, ...seriesFromEngine];

  // Extract milestones: yearsFromNow = 10, 20, 30.
  const findAt = (y: number) => series.find((p) => p.yearsFromNow === y)?.neutralBalance ?? 0;

  return {
    series,
    at10: findAt(10),
    at20: findAt(20),
    at30: findAt(30),
    returnPct: clampedReturn,
    bearCagr: clampedReturn - 2.5,
    bullCagr: clampedReturn + 2.5,
  };
}
