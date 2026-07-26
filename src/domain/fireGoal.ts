import type { FinancialGoal } from "./types";

export interface FireProjectionInput {
  /** Net worth invested toward the goal today, in the goal's currency. */
  currentValue: number;
  /** Amount contributed every month going forward, in the goal's currency. */
  monthlyContribution: number;
  /** Expected annual return as a decimal (0.07 = 7%/yr). */
  expectedAnnualReturn: number;
  /** Target amount in the goal's currency. */
  targetAmount: number;
}

export interface FireProjection {
  /** True when current value already meets/exceeds target. */
  achieved: boolean;
  /** 0..1 ratio of current value vs target. May exceed 1 when achieved. */
  progressRatio: number;
  /** Months until projected to reach the target. null if never reachable. */
  monthsToTarget: number | null;
  /** Convenience version of monthsToTarget in years (with two decimals). */
  yearsToTarget: number | null;
  /** Projected calendar date the user crosses the target. null if never. */
  projectedTargetDate: Date | null;
}

/**
 * Project when the user reaches `targetAmount` given today's balance and a
 * constant monthly contribution. Uses the standard future-value-with-PMT
 * formula at monthly compounding:
 *
 *   FV(n) = PV * (1+r)^n + PMT * ((1+r)^n - 1) / r
 *
 * where `r` is the monthly rate (annualReturn / 12). Solves for the smallest
 * `n` such that FV(n) >= target. For r = 0 the formula collapses to the
 * linear case PV + PMT * n.
 *
 * Returns `monthsToTarget = null` when contributions and growth combined can
 * never reach the target (e.g. PMT = 0 and PV < target with non-positive r).
 */
export function calculateFireProjection(
  input: FireProjectionInput,
  now: Date = new Date(),
): FireProjection {
  const { currentValue, monthlyContribution, expectedAnnualReturn, targetAmount } = input;
  const progressRatio = targetAmount > 0 ? currentValue / targetAmount : 0;
  const achieved = currentValue >= targetAmount && targetAmount > 0;

  if (targetAmount <= 0) {
    return {
      achieved: false,
      progressRatio: 0,
      monthsToTarget: null,
      yearsToTarget: null,
      projectedTargetDate: null,
    };
  }
  if (achieved) {
    return {
      achieved: true,
      progressRatio,
      monthsToTarget: 0,
      yearsToTarget: 0,
      projectedTargetDate: now,
    };
  }

  const monthlyRate = expectedAnnualReturn / 12;
  let months: number | null;

  if (monthlyRate === 0) {
    // Linear case: PV + PMT * n >= target  =>  n >= (target - PV) / PMT.
    if (monthlyContribution <= 0) {
      months = null;
    } else {
      months = Math.ceil((targetAmount - currentValue) / monthlyContribution);
    }
  } else if (monthlyRate < 0) {
    // Negative real return — only reachable through contributions, and only
    // if PMT outweighs the decay. Treat as the linear floor for safety.
    if (monthlyContribution <= 0) {
      months = null;
    } else {
      months = Math.ceil((targetAmount - currentValue) / monthlyContribution);
    }
  } else {
    // Closed-form solve for n in FV(n) >= target.
    // Let g(n) = PV*(1+r)^n + PMT*((1+r)^n - 1)/r = target
    //         => (PV + PMT/r) * (1+r)^n - PMT/r = target
    //         => (1+r)^n = (target + PMT/r) / (PV + PMT/r)
    //         => n = ln(...) / ln(1+r)
    const pmtOverR = monthlyContribution / monthlyRate;
    const denominator = currentValue + pmtOverR;
    const numerator = targetAmount + pmtOverR;
    if (denominator <= 0 || numerator / denominator <= 0) {
      months = null;
    } else {
      const raw = Math.log(numerator / denominator) / Math.log(1 + monthlyRate);
      if (!Number.isFinite(raw) || raw < 0) {
        months = monthlyContribution <= 0 ? null : 0;
      } else {
        months = Math.ceil(raw);
      }
    }
  }

  const years = months === null ? null : Math.round((months / 12) * 100) / 100;
  const projectedDate = months === null ? null : addMonths(now, months);

  return {
    achieved: false,
    progressRatio,
    monthsToTarget: months,
    yearsToTarget: years,
    projectedTargetDate: projectedDate,
  };
}

/**
 * Resolve a goal's actual target amount. If `targetAmount` is provided we
 * trust it; otherwise we derive it from annual spending and the safe
 * withdrawal rate (Trinity-study "25× rule" when rate = 4%).
 */
export function resolveTargetAmount(
  goal: Pick<FinancialGoal, "targetAmount" | "annualSpending" | "withdrawalRate">,
): number {
  if (goal.targetAmount && goal.targetAmount > 0) return goal.targetAmount;
  if (goal.withdrawalRate <= 0) return goal.annualSpending * 25;
  return goal.annualSpending / goal.withdrawalRate;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}
