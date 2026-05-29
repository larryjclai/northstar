import type { LedgerTransaction } from "./types";

export type LedgerGroupKind = "singleton" | "split" | "transfer" | "unknown";

export function classifyLedgerGroup(rows: LedgerTransaction[]): LedgerGroupKind {
  const activeRows = rows.filter((row) => row.deletedAt === null);
  if (activeRows.length === 0) return "unknown";
  if (activeRows.length === 1 || !activeRows[0].groupId) return "singleton";

  const accountIds = new Set(activeRows.map((row) => row.accountId));
  const positiveCount = activeRows.filter((row) => row.amount > 0).length;
  const negativeCount = activeRows.filter((row) => row.amount < 0).length;

  // A transfer credits exactly one account (destination) and debits the source.
  // An optional same-account fee leg adds a second debit but keeps it a transfer.
  if (accountIds.size === 2 && positiveCount === 1 && negativeCount >= 1) {
    return "transfer";
  }

  if (accountIds.size === 1 && activeRows.every((row) => row.groupId === activeRows[0].groupId)) {
    return "split";
  }

  return "unknown";
}

