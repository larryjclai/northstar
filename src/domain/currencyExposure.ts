/**
 * Currency exposure of the investment holdings — what share of the portfolio
 * sits in each currency. A TWD investor holding US stocks carries USD exposure
 * (and FX risk) that the headline allocation-by-class view doesn't surface.
 *
 * Kept as a pure grouping over pre-valued entries so it's trivially testable;
 * the caller supplies each holding's current value already converted to the
 * primary currency.
 */

const EPS = 1e-9;

export interface CurrencyExposureEntry {
  currency: string;
  /** Current value of the holding, in the primary currency. */
  value: number;
}

export interface CurrencyExposureItem {
  currency: string;
  value: number;
  /** Share of the total (%). */
  pct: number;
}

export interface CurrencyExposure {
  items: CurrencyExposureItem[];
  total: number;
  /** Distinct currencies with positive value. The card hides when < 2. */
  currencyCount: number;
}

export function buildCurrencyExposure(entries: CurrencyExposureEntry[]): CurrencyExposure {
  const byCurrency = new Map<string, number>();
  let total = 0;
  for (const e of entries) {
    if (!(e.value > EPS)) continue;
    const code = e.currency.trim().toUpperCase() || "—";
    byCurrency.set(code, (byCurrency.get(code) ?? 0) + e.value);
    total += e.value;
  }
  const items = [...byCurrency.entries()]
    .map(([currency, value]) => ({ currency, value, pct: total > EPS ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  return { items, total, currencyCount: items.length };
}
