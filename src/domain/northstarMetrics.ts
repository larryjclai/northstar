import { isNeutralLedgerRow } from "./ledgerTrust";
import type { LedgerTransaction } from "./types";

/**
 * Northstar metric helpers — pure, dependency-light domain functions.
 *
 * Expense convention (mirrors DashboardRoute.monthExpense + categoryPeriodSpend):
 *   - entryType === "expense"
 *   - settlementStatus === "settled"
 *   - !isNeutralLedgerRow (excludes transfers + counterAccountId pass-throughs)
 *   - spend per row = toPrimary(-row.amount, ...) — expense amounts are stored
 *     negative, so negating gives a positive spend figure; refunds (positive-
 *     amount expenses) net back out.
 */

/** Month key YYYY-MM from a date string (accepts ISO datetime or date-only). */
function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Subtract N whole calendar months from a YYYY-MM-DD date. Returns YYYY-MM-DD. */
function subtractMonths(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  let newM = m - n;
  let newY = y;
  while (newM <= 0) {
    newM += 12;
    newY -= 1;
  }
  // Clamp day to last day of resulting month
  const lastDay = new Date(Date.UTC(newY, newM, 0)).getUTCDate();
  const clampedD = Math.min(d, lastDay);
  return [
    String(newY).padStart(4, "0"),
    String(newM).padStart(2, "0"),
    String(clampedD).padStart(2, "0"),
  ].join("-");
}

/**
 * Average monthly expense over the trailing `months` whole months before
 * the month containing `asOf`.
 *
 * "Whole months" = the `months` complete calendar months immediately before
 * the current month. E.g. if asOf = 2026-06-15 and months = 3, the window is
 * 2026-03, 2026-04, 2026-05 (the 3 months before June).
 *
 * Expense convention: settled, entryType === "expense", !isNeutralLedgerRow,
 * spend = toPrimary(-row.amount, row.currency, row.date).
 */
export function trailingMonthlyExpense(
  rows: LedgerTransaction[],
  toPrimary: (amount: number, currency: string, asOf?: string) => number,
  asOf: string,
  months = 3,
): number {
  if (months <= 0) return 0;
  const asOfDate = asOf.slice(0, 10);
  const currentMonthKey = asOfDate.slice(0, 7); // YYYY-MM of asOf

  // Build the set of trailing whole month keys
  const monthKeys = new Set<string>();
  for (let i = 1; i <= months; i++) {
    const d = subtractMonths(asOfDate, i);
    monthKeys.add(d.slice(0, 7));
  }

  let total = 0;
  for (const row of rows) {
    if (row.deletedAt !== null) continue;
    if (row.entryType !== "expense") continue;
    if (row.settlementStatus !== "settled") continue;
    if (isNeutralLedgerRow(row)) continue;
    const mk = monthKeyOf(row.date);
    if (mk === currentMonthKey) continue; // exclude current (partial) month
    if (!monthKeys.has(mk)) continue;
    total += toPrimary(-row.amount, row.currency, row.date.slice(0, 10));
  }

  return total / months;
}

/**
 * Average monthly net cash flow (income − expense) over the trailing `months`
 * whole months before the month containing `asOf`.
 *
 * Uses the same settled/non-neutral/!deleted conventions as `trailingMonthlyExpense`.
 * Income rows: entryType === "income", toPrimary(row.amount, ...) (positive).
 * Expense rows: entryType === "expense", toPrimary(-row.amount, ...) (positive spend).
 * Net per month = income − expense.  Returns 0 when there are no qualifying rows.
 *
 * Used as the annual-contribution input for the net-worth projection card:
 *   annualContribution = trailingMonthlyNet(..., 3) × 12
 */
export function trailingMonthlyNet(
  rows: LedgerTransaction[],
  toPrimary: (amount: number, currency: string, asOf?: string) => number,
  asOf: string,
  months = 3,
): number {
  if (months <= 0) return 0;
  const asOfDate = asOf.slice(0, 10);
  const currentMonthKey = asOfDate.slice(0, 7);

  const monthKeys = new Set<string>();
  for (let i = 1; i <= months; i++) {
    const d = subtractMonths(asOfDate, i);
    monthKeys.add(d.slice(0, 7));
  }

  let totalIncome = 0;
  let totalExpense = 0;
  for (const row of rows) {
    if (row.deletedAt !== null) continue;
    if (row.settlementStatus !== "settled") continue;
    if (isNeutralLedgerRow(row)) continue;
    const mk = monthKeyOf(row.date);
    if (mk === currentMonthKey) continue;
    if (!monthKeys.has(mk)) continue;
    if (row.entryType === "income") {
      totalIncome += toPrimary(row.amount, row.currency, row.date.slice(0, 10));
    } else if (row.entryType === "expense") {
      totalExpense += toPrimary(-row.amount, row.currency, row.date.slice(0, 10));
    }
  }

  return (totalIncome - totalExpense) / months;
}

/**
 * Passive-income coverage of annual expenses, as a percent (0–∞).
 * Returns null when annualExpense ≤ 0 (no divisor).
 *
 * coverageRatioPct = ttmPassiveIncome / annualExpense * 100
 *
 * @param ttmPassiveIncome  Trailing-twelve-month passive income (primary ccy).
 *                          Source: buildDividendAnalysis(...).ttmTotal
 * @param annualExpense     Annual expense = trailingMonthlyExpense(...) × 12
 */
export function coverageRatioPct(ttmPassiveIncome: number, annualExpense: number): number | null {
  if (annualExpense <= 0) return null;
  return (ttmPassiveIncome / annualExpense) * 100;
}

/**
 * Months of liquid-asset runway at current spending rate.
 * Returns null when monthlyExpense ≤ 0 (no divisor).
 *
 * @param liquidAssets   Available liquid assets (primary ccy).
 *                       Source: calculateAvailableCash(accounts, toPrimary)
 * @param monthlyExpense Average monthly expense (trailing); use trailingMonthlyExpense().
 */
export function runwayMonths(liquidAssets: number, monthlyExpense: number): number | null {
  if (monthlyExpense <= 0) return null;
  return liquidAssets / monthlyExpense;
}
