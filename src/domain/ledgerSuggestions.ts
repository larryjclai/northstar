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
    if (row.deletedAt !== null || row.entryType !== "expense" || row.settlementStatus !== "settled") continue;
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
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey))
    .map(([key]) => key);
}
