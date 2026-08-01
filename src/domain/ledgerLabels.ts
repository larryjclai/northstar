import type { LedgerTransaction } from "./types";

/** Which free-text label column of a ledger row is being catalogued. */
export type LedgerLabelField = "name" | "merchant";

export interface LedgerLabelStat {
  /** The label value exactly as stored on the rows (already trimmed). */
  value: string;
  /** How many active rows carry it. */
  count: number;
  /** Most recent `date` among those rows (ISO string, as stored). */
  lastUsed: string;
}

/**
 * Distinct non-empty values of one label column across active ledger history,
 * ranked by usage (count desc, then most-recent, then locale order).
 *
 * Powers three surfaces that must agree on "what labels exist":
 *   - 設定 → 名稱 / 商家 的主檔清單（含使用次數）
 *   - 記帳抽屜 + 快速記帳的 autocomplete
 *   - 改名前的「這會影響幾筆」預估
 *
 * Soft-deleted rows are excluded — a tombstoned row must not resurrect a label
 * the user already cleaned up. Values are compared *after* trim, so " 全家 "
 * and "全家" collapse into one entry (the trimmed form wins).
 */
export function buildLedgerLabelStats(
  rows: LedgerTransaction[],
  field: LedgerLabelField,
): LedgerLabelStat[] {
  const stats = new Map<string, { count: number; lastUsed: string }>();
  for (const row of rows) {
    if (row.deletedAt !== null) continue;
    const value = (row[field] ?? "").trim();
    if (!value) continue;
    const existing = stats.get(value);
    if (existing) {
      existing.count += 1;
      if (row.date > existing.lastUsed) existing.lastUsed = row.date;
    } else {
      stats.set(value, { count: 1, lastUsed: row.date });
    }
  }
  return [...stats.entries()]
    .map(([value, s]) => ({ value, count: s.count, lastUsed: s.lastUsed }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (a.lastUsed < b.lastUsed ? 1 : a.lastUsed > b.lastUsed ? -1 : 0) ||
        a.value.localeCompare(b.value),
    );
}

/**
 * The merchant master list shown in 設定: every merchant the user has actually
 * used, unioned with the curated `settings.merchants` seeds (which may have zero
 * usage). Seed-only entries get `count: 0` and sort last.
 *
 * Mirrors `merchantPool` in CashFlowRoute — the settings list and the form's
 * dropdown must not disagree about which merchants exist.
 */
export function buildMerchantMasterList(
  rows: LedgerTransaction[],
  settingsMerchants: string[],
): LedgerLabelStat[] {
  const used = buildLedgerLabelStats(rows, "merchant");
  const seen = new Set(used.map((s) => s.value));
  const seedOnly = settingsMerchants
    .map((m) => m.trim())
    .filter((m) => m && !seen.has(m))
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, count: 0, lastUsed: "" }));
  return [...used, ...seedOnly];
}
