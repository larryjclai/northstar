// Pure diff between two RepositorySnapshots, for the restore preview (plan 047).
//
// A restore overwrites the live database, so before confirming we show the user
// what the backup contains (per-entity counts) vs what they have now, with
// decreases flagged. This is read-only: it never writes anything.

import type { RepositorySnapshot } from "../../data/repositories";

export interface BackupDiffRow {
  label: string;
  current: number;
  backup: number;
  delta: number; // backup − current; negative = restore would shrink this entity
}

export interface BackupDiff {
  exportedAt: string;
  rows: BackupDiffRow[];
  hasDecrease: boolean;
}

function row(label: string, current: readonly unknown[], backup: readonly unknown[]): BackupDiffRow {
  return { label, current: current.length, backup: backup.length, delta: backup.length - current.length };
}

/** Build the per-entity counts diff between the CURRENT snapshot and a BACKUP. */
export function buildBackupDiff(current: RepositorySnapshot, backup: RepositorySnapshot): BackupDiff {
  const rows: BackupDiffRow[] = [
    row("帳戶", current.accounts, backup.accounts),
    row("交易", current.ledgerTransactions, backup.ledgerTransactions),
    row("持倉", current.portfolioAssets, backup.portfolioAssets),
    row("投資紀錄", current.investmentRecords, backup.investmentRecords),
    row("週期交易", current.recurringTransactions, backup.recurringTransactions),
    row("週期投資", current.recurringInvestments ?? [], backup.recurringInvestments ?? []),
    row("目標", current.financialGoals ?? [], backup.financialGoals ?? []),
    row("手動報價", current.manualPriceSnapshots ?? [], backup.manualPriceSnapshots ?? []),
    row("市場報價", current.marketQuotes, backup.marketQuotes),
    row("匯率紀錄", current.dailyFxRates, backup.dailyFxRates),
    row("價格紀錄", current.dailyPrices, backup.dailyPrices),
  ];
  return { exportedAt: backup.exportedAt, rows, hasDecrease: rows.some((r) => r.delta < 0) };
}
