import type { LedgerTransaction } from "./types";

export interface LedgerSuggestions {
  merchants: string[];
  accountIds: string[];
}

export function buildLedgerSuggestions(
  rows: LedgerTransaction[],
  filters: { category?: string; merchant?: string } = {},
): LedgerSuggestions {
  const merchantCounts = new Map<string, number>();
  const accountCounts = new Map<string, number>();
  const category = filters.category?.trim();
  const merchant = filters.merchant?.trim();

  for (const row of rows) {
    if (row.deletedAt !== null || row.entryType !== "expense" || row.settlementStatus !== "settled")
      continue;
    if (category && row.category !== category) continue;
    if (merchant && row.merchant !== merchant) continue;
    if (row.merchant) merchantCounts.set(row.merchant, (merchantCounts.get(row.merchant) ?? 0) + 1);
    accountCounts.set(row.accountId, (accountCounts.get(row.accountId) ?? 0) + 1);
  }

  return {
    merchants: rankedKeys(merchantCounts).slice(0, 5),
    accountIds: rankedKeys(accountCounts).slice(0, 3),
  };
}

function rankedKeys(counts: Map<string, number>) {
  return [...counts.entries()]
    .sort(
      ([leftKey, leftCount], [rightKey, rightCount]) =>
        rightCount - leftCount || leftKey.localeCompare(rightKey),
    )
    .map(([key]) => key);
}

/**
 * The account most frequently used for settled expenses in `category` (§6.5).
 * Powers Quick Add's "remember the usual account per category" default: when the
 * parser resolves a category but no account, the confirm card prefills this so
 * the user rarely has to pick an account by hand.
 *
 * Pure and derived from ledger history — no schema/settings change. Returns null
 * when the category has no settled-expense history to learn from.
 */
export function defaultAccountForCategory(
  rows: LedgerTransaction[],
  category: string,
): string | null {
  const trimmed = category.trim();
  if (!trimmed) return null;
  return buildLedgerSuggestions(rows, { category: trimmed }).accountIds[0] ?? null;
}
