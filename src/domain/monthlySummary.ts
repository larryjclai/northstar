/**
 * Monthly summary input assembler — privacy-safe.
 *
 * PRIVACY INVARIANT: the output contains ONLY aggregate numbers and
 * category names + amounts. Raw transactions, merchant names, account
 * names, and tickers are NEVER included. A unit test enforces this.
 */

export interface MonthlySummaryInput {
  /** Month key, e.g. "2026-06" */
  month: string;
  /** Total income for the month (primary currency). */
  income: number;
  /** Total expense for the month (primary currency, positive). */
  expense: number;
  /** Savings rate as a percentage (can be negative). */
  savingsRatePct: number;
  /** Net worth change over the month (primary currency). */
  netWorthChange: number;
  /** Primary currency code, e.g. "TWD". */
  currency: string;
  /** Top spending categories (name + amount only), capped to 3. */
  topCategories: Array<{ name: string; amount: number }>;
}

export interface MonthlySummaryAggregates {
  month: string;
  income: number;
  expense: number;
  savingsRatePct: number;
  netWorthChange: number;
  currency: string;
  /** Category spending: name → positive spend amount. */
  categorySpend: Map<string, number>;
}

/**
 * Build a privacy-safe monthly summary input from pre-computed aggregates.
 * Only aggregate numbers and category names pass through — no raw
 * transactions, merchant names, account names, or tickers.
 */
export function buildMonthlySummaryInput(
  aggregates: MonthlySummaryAggregates,
): MonthlySummaryInput {
  // Top 3 categories by spend, descending.
  const sorted = [...aggregates.categorySpend.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return {
    month: aggregates.month,
    income: aggregates.income,
    expense: aggregates.expense,
    savingsRatePct: aggregates.savingsRatePct,
    netWorthChange: aggregates.netWorthChange,
    currency: aggregates.currency,
    topCategories: sorted.map(([name, amount]) => ({ name, amount })),
  };
}
