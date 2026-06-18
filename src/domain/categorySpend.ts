import { isWithinDateScope, type ResolvedDateScope } from "./dateScope";
import { isNeutralLedgerRow } from "./ledgerTrust";
import type { LedgerTransaction } from "./types";

export interface CategorySpendRow {
  name: string;
  amount: number;
  count: number;
}

export interface CategoryPeriodSpend {
  /** Per-category totals, sorted descending by amount. */
  categories: CategorySpendRow[];
  /** Rows with a falsy/empty category field. */
  uncategorized: { amount: number; count: number };
  /** Sum of all category amounts + uncategorized amount. */
  total: number;
  /** Deduped list of currency pairs whose FX rate was missing (e.g. ["USD/TWD"]). */
  missingFxPairs: string[];
}

/**
 * Canonical period category-spend aggregation (cash-basis, settled-only,
 * excludes neutral/transfer rows, refunds net). `toPrimary` converts a row's
 * stored `amount` to the primary currency (asOf-aware) or returns null on
 * missing FX. Mirrors CashFlowRoute.allCategorySpend.
 *
 * Filter: isWithinDateScope && entryType === "expense" && settlementStatus === "settled" && !isNeutralLedgerRow
 * Per-row spend: -(toPrimary(row) ?? 0)  → refunds (positive-amount expenses) net down the category.
 *                null FX → contributes 0; pair recorded in missingFxPairs.
 */
export function categoryPeriodSpend(
  rows: LedgerTransaction[],
  dateRange: ResolvedDateScope,
  primaryCurrency: string,
  toPrimary: (row: LedgerTransaction) => number | null,
): CategoryPeriodSpend {
  const categoryMap = new Map<string, { amount: number; count: number }>();
  let uncategorizedAmount = 0;
  let uncategorizedCount = 0;
  const missingFxSet = new Set<string>();

  for (const row of rows) {
    if (!isWithinDateScope(row.date, dateRange)) continue;
    if (row.entryType !== "expense") continue;
    if (row.settlementStatus !== "settled") continue;
    if (isNeutralLedgerRow(row)) continue;

    const converted = toPrimary(row);
    let spend: number;
    if (converted === null) {
      missingFxSet.add(`${row.currency}/${primaryCurrency}`);
      spend = 0;
    } else {
      spend = -converted;
    }

    const key = row.category;
    if (!key) {
      uncategorizedAmount += spend;
      uncategorizedCount += 1;
    } else {
      const curr = categoryMap.get(key) ?? { amount: 0, count: 0 };
      curr.amount += spend;
      curr.count += 1;
      categoryMap.set(key, curr);
    }
  }

  const categories: CategorySpendRow[] = [...categoryMap.entries()]
    .map(([name, stats]) => ({ name, amount: stats.amount, count: stats.count }))
    .sort((a, b) => b.amount - a.amount);

  const total = categories.reduce((s, c) => s + c.amount, 0) + uncategorizedAmount;

  return {
    categories,
    uncategorized: { amount: uncategorizedAmount, count: uncategorizedCount },
    total,
    missingFxPairs: [...missingFxSet],
  };
}
