import type { LedgerTransaction } from "./types";

export type LedgerGroupKind = "singleton" | "split" | "transfer" | "unknown";

export function classifyLedgerGroup(rows: LedgerTransaction[]): LedgerGroupKind {
  const activeRows = rows.filter((row) => row.deletedAt === null);
  if (activeRows.length === 0) return "unknown";
  if (activeRows.length === 1 || !activeRows[0].groupId) return "singleton";

  const accountIds = new Set(activeRows.map((row) => row.accountId));
  const hasPositive = activeRows.some((row) => row.amount > 0);
  const hasNegative = activeRows.some((row) => row.amount < 0);

  if (activeRows.length === 2 && accountIds.size === 2 && hasPositive && hasNegative) {
    return "transfer";
  }

  if (accountIds.size === 1 && activeRows.every((row) => row.groupId === activeRows[0].groupId)) {
    return "split";
  }

  return "unknown";
}

