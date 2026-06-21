/**
 * Pure budget-rollover math for advanced budgets (Plan 039).
 *
 * Decision A — derived opt-in rolling balance: when `rollover` is on, each month's
 * available budget folds in the previous month's leftover (or overspend):
 *   available[M] = monthlyBudget + (available[M-1] − spend[M-1])   (M ≥ startIndex+1)
 *   carry[M]     = available[M] − spend[M]                          (can be negative)
 * When off (default), available = monthlyBudget and carry = 0 every month, so existing
 * behaviour is unchanged.
 *
 * This module is intentionally pure: no React, no I/O. The spend series is built by the
 * caller from the canonical `categoryPeriodSpend()` helper (one call per month) — this
 * file never recomputes spend.
 */

export interface RolloverMonth {
  /** Optional YYYY-MM label, passed through from the caller. */
  month?: string;
  /** The base monthly budget for this month (always === monthlyBudget). */
  budget: number;
  /** Spend for this month (primary currency), from categoryPeriodSpend. */
  spend: number;
  /** Budget actually available to spend this month (base + carried-in balance). */
  available: number;
  /** Leftover after spend: available − spend (negative on overspend). Carried to next month when rollover is on. */
  carry: number;
}

export interface RolloverInput {
  /** The category's per-month budget. */
  monthlyBudget: number;
  /** Whether rollover (carry forward) is enabled for this category. */
  rollover: boolean;
  /** Per-month spend, oldest → newest, primary currency. */
  monthlySpend: number[];
  /**
   * Index into `monthlySpend` at which carry accumulation begins. Months before this
   * index get available = monthlyBudget and carry = 0 (excluded from accumulation).
   * Defaults to 0 (accumulate from the first month).
   */
  startIndex?: number;
  /** Optional YYYY-MM labels aligned with monthlySpend (oldest → newest). */
  months?: string[];
}

/**
 * Compute the per-month rollover series. Returns one entry per `monthlySpend` element,
 * in the same (oldest → newest) order.
 */
export function computeRolloverSeries(input: RolloverInput): RolloverMonth[] {
  const { monthlyBudget, rollover, monthlySpend, startIndex = 0, months } = input;
  const result: RolloverMonth[] = [];
  // Running carried-in balance from prior months (only meaningful when rollover on).
  let carriedIn = 0;

  for (let i = 0; i < monthlySpend.length; i += 1) {
    const spend = monthlySpend[i];
    const beforeStart = i < startIndex;
    const available = rollover && !beforeStart ? monthlyBudget + carriedIn : monthlyBudget;
    const carry = rollover && !beforeStart ? available - spend : 0;

    result.push({
      month: months?.[i],
      budget: monthlyBudget,
      spend,
      available,
      carry,
    });

    // Accumulate only once we're at/after the start month and rollover is on.
    carriedIn = rollover && !beforeStart ? carry : 0;
  }

  return result;
}

export interface AnnualBudgetSummary {
  /** The 12 (or fewer) per-month rollover entries. */
  months: RolloverMonth[];
  /** Sum of the period's spend. */
  annualSpend: number;
  /** Annual budget = monthlyBudget × 12 (Decision C). */
  annualBudget: number;
}

/**
 * Annual roll-up for the 12-month grid (Decision C). Annual budget is always
 * monthlyBudget × 12 — there is no separately-editable annual figure.
 */
export function annualBudgetSummary(input: RolloverInput): AnnualBudgetSummary {
  const months = computeRolloverSeries(input);
  const annualSpend = months.reduce((sum, m) => sum + m.spend, 0);
  return {
    months,
    annualSpend,
    annualBudget: input.monthlyBudget * 12,
  };
}
