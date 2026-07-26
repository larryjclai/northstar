// Pure grouping helpers for the 記帳 「近期動態」 list. Two views of the SAME
// rows: `groupByDay` (short ranges — 本月 etc.) and `groupByMonth` (long ranges
// — YTD / 近12個月 / 全部 / a >92-day custom range, plan 169 variant D). Keep
// their net math in lock-step: a month's `net` is the sum of its days' `net`
// (both are Σ toPrimary(row) over non-neutral rows, no additional settlement
// filter — the list already shows unsettled 應收/應付 rows inline, so their
// signed amount contributes to both the day and month subtotal the same way).

import { isNeutralLedgerRow } from "../domain";
import type { LedgerTransaction } from "../domain";

export interface DayGroup<T> {
  date: string;
  rows: T[];
  net: number;
}

export interface MonthGroup<T> {
  month: string; // YYYY-MM
  rows: T[];
  count: number;
  income: number; // Σ positive primary amounts (non-neutral rows)
  expense: number; // Σ |negative primary amounts| (non-neutral rows)
  net: number; // income − expense
}

/** Newest day first (assumes `rows` is already sorted newest-first). */
export function groupByDay<T extends LedgerTransaction>(
  rows: T[],
  toPrimary: (row: LedgerTransaction, amount?: number) => number | null,
): DayGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const day = row.date.slice(0, 10);
    map.set(day, [...(map.get(day) ?? []), row]);
  }
  return [...map.entries()].map(([date, dayRows]) => ({
    date,
    rows: dayRows,
    net: dayRows.reduce(
      (sum, row) => (isNeutralLedgerRow(row) ? sum : sum + (toPrimary(row) ?? 0)),
      0,
    ),
  }));
}

/** Newest month first (assumes `rows` is already sorted newest-first). */
export function groupByMonth<T extends LedgerTransaction>(
  rows: T[],
  toPrimary: (row: LedgerTransaction, amount?: number) => number | null,
): MonthGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    map.set(month, [...(map.get(month) ?? []), row]);
  }
  return [...map.entries()].map(([month, monthRows]) => {
    let income = 0;
    let expense = 0;
    for (const row of monthRows) {
      if (isNeutralLedgerRow(row)) continue;
      const amount = toPrimary(row) ?? 0;
      if (amount >= 0) income += amount;
      else expense += -amount;
    }
    return {
      month,
      rows: monthRows,
      count: monthRows.length,
      income,
      expense,
      net: income - expense,
    };
  });
}
