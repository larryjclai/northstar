import { describe, expect, it } from "vitest";
import type { RepositorySnapshot } from "../../data/repositories";
import { buildBackupDiff } from "./backupDiff";

// Minimal snapshot builder: the diff only reads array LENGTHS, so we fill the
// count-bearing arrays with cheap placeholder objects and leave the rest empty.
function fill(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({ i }));
}

function snapshot(
  exportedAt: string,
  counts: Partial<{
    accounts: number;
    ledgerTransactions: number;
    portfolioAssets: number;
    investmentRecords: number;
    recurringTransactions: number;
    recurringInvestments: number;
    financialGoals: number;
    manualPriceSnapshots: number;
    marketQuotes: number;
    dailyFxRates: number;
    dailyPrices: number;
  }>,
  opts: { omitOptionals?: boolean } = {},
): RepositorySnapshot {
  const base = {
    version: 1,
    exportedAt,
    accounts: fill(counts.accounts ?? 0),
    ledgerTransactions: fill(counts.ledgerTransactions ?? 0),
    portfolioAssets: fill(counts.portfolioAssets ?? 0),
    investmentRecords: fill(counts.investmentRecords ?? 0),
    recurringTransactions: fill(counts.recurringTransactions ?? 0),
    marketQuotes: fill(counts.marketQuotes ?? 0),
    settings: {} as RepositorySnapshot["settings"],
    dailyFxRates: fill(counts.dailyFxRates ?? 0),
    dailyPrices: fill(counts.dailyPrices ?? 0),
  } as unknown as RepositorySnapshot;
  if (!opts.omitOptionals) {
    base.recurringInvestments = fill(
      counts.recurringInvestments ?? 0,
    ) as RepositorySnapshot["recurringInvestments"];
    base.financialGoals = fill(counts.financialGoals ?? 0) as RepositorySnapshot["financialGoals"];
    base.manualPriceSnapshots = fill(
      counts.manualPriceSnapshots ?? 0,
    ) as RepositorySnapshot["manualPriceSnapshots"];
  }
  return base;
}

describe("buildBackupDiff", () => {
  it("backup with more of everything → all deltas positive, no decrease", () => {
    const current = snapshot("2026-01-01T00:00:00.000Z", {
      accounts: 1,
      ledgerTransactions: 2,
      portfolioAssets: 1,
      investmentRecords: 1,
      recurringTransactions: 1,
    });
    const backup = snapshot("2026-06-01T00:00:00.000Z", {
      accounts: 3,
      ledgerTransactions: 50,
      portfolioAssets: 5,
      investmentRecords: 10,
      recurringTransactions: 4,
    });
    const diff = buildBackupDiff(current, backup);
    expect(diff.hasDecrease).toBe(false);
    expect(diff.rows.every((r) => r.delta >= 0)).toBe(true);
    const accounts = diff.rows.find((r) => r.label === "帳戶")!;
    expect(accounts.current).toBe(1);
    expect(accounts.backup).toBe(3);
    expect(accounts.delta).toBe(2);
  });

  it("backup with fewer transactions than current → that row negative, hasDecrease true", () => {
    // The 驗收 case: spotting a too-small old backup.
    const current = snapshot("2026-06-20T00:00:00.000Z", { ledgerTransactions: 500 });
    const backup = snapshot("2026-01-01T00:00:00.000Z", { ledgerTransactions: 40 });
    const diff = buildBackupDiff(current, backup);
    const txRow = diff.rows.find((r) => r.label === "交易")!;
    expect(txRow.delta).toBe(-460);
    expect(txRow.delta).toBeLessThan(0);
    expect(diff.hasDecrease).toBe(true);
  });

  it("optional arrays missing on one side → treated as 0, no crash", () => {
    const current = snapshot("2026-06-20T00:00:00.000Z", { financialGoals: 3 });
    const backup = snapshot("2026-01-01T00:00:00.000Z", {}, { omitOptionals: true });
    const diff = buildBackupDiff(current, backup);
    const goalsRow = diff.rows.find((r) => r.label === "目標")!;
    expect(goalsRow.current).toBe(3);
    expect(goalsRow.backup).toBe(0);
    expect(goalsRow.delta).toBe(-3);
    // And the reverse direction: missing on current side counts as 0.
    const reverse = buildBackupDiff(backup, current);
    const goalsReverse = reverse.rows.find((r) => r.label === "目標")!;
    expect(goalsReverse.current).toBe(0);
    expect(goalsReverse.backup).toBe(3);
    expect(goalsReverse.delta).toBe(3);
  });

  it("exportedAt is carried through from the backup", () => {
    const current = snapshot("2026-06-20T00:00:00.000Z", {});
    const backup = snapshot("2026-02-14T08:30:00.000Z", {});
    expect(buildBackupDiff(current, backup).exportedAt).toBe("2026-02-14T08:30:00.000Z");
  });
});
