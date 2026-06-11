import type { InvestmentRecord } from "./types";

/**
 * Dividend / income analysis from cashDividend records — the year-by-year and
 * per-holding view that buy-and-hold (存股) investors care about, plus a
 * trailing-twelve-month portfolio yield.
 *
 * A cashDividend record stores the total as `price * quantity` when quantity > 0
 * (legacy: per-share × shares) or as `price` alone when quantity is 0 (newer:
 * total amount), always net of any withholding `fee`. Amounts are converted to
 * the primary currency at the record's own date.
 */

const day = (s: string) => s.slice(0, 10);

/** Net dividend total of a single cashDividend record, in its native currency. */
function dividendNative(record: InvestmentRecord): number {
  const gross = record.quantity > 0 ? record.price * record.quantity : record.price;
  return gross - record.fee;
}

export interface DividendAnalysis {
  /** Per calendar year, ascending. Only years with dividends appear. */
  byYear: Array<{ year: string; total: number }>;
  /** Per holding, descending by total (all-time). */
  byHolding: Array<{ assetId: string; ticker: string; total: number }>;
  /** All-time dividend total (primary currency). */
  total: number;
  /** Trailing-twelve-month dividend total. */
  ttmTotal: number;
  /** TTM yield on current market value (%), or null when value is unknown/zero. */
  yieldPct: number | null;
}

export function buildDividendAnalysis(opts: {
  records: InvestmentRecord[];
  /** assetId → {ticker, currency} for labelling and FX conversion. */
  assetMeta: Map<string, { ticker: string; currency: string }>;
  toPrimary: (value: number, currency: string, asOf?: string) => number;
  /** Current portfolio market value (primary currency) for the yield denominator. */
  currentMarketValue: number;
  /** Today (YYYY-MM-DD); the TTM window is the 365 days up to this date. */
  asOf: string;
}): DividendAnalysis {
  const { records, assetMeta, toPrimary, currentMarketValue } = opts;
  const asOf = day(opts.asOf);
  const ttmCutoff = (() => {
    const d = new Date(`${asOf}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const byYearMap = new Map<string, number>();
  const byHoldingMap = new Map<string, { ticker: string; total: number }>();
  let total = 0;
  let ttmTotal = 0;

  for (const r of records) {
    if (r.deletedAt !== null || r.action !== "cashDividend") continue;
    const meta = assetMeta.get(r.assetId);
    const currency = meta?.currency ?? "TWD";
    const rd = day(r.date);
    const amount = toPrimary(dividendNative(r), currency, rd);
    if (amount === 0) continue;
    total += amount;
    if (rd > ttmCutoff && rd <= asOf) ttmTotal += amount;
    const year = rd.slice(0, 4);
    byYearMap.set(year, (byYearMap.get(year) ?? 0) + amount);
    const ticker = meta?.ticker ?? r.assetId;
    const cur = byHoldingMap.get(r.assetId) ?? { ticker, total: 0 };
    cur.total += amount;
    byHoldingMap.set(r.assetId, cur);
  }

  const byYear = [...byYearMap.entries()]
    .map(([year, t]) => ({ year, total: t }))
    .sort((a, b) => a.year.localeCompare(b.year));
  const byHolding = [...byHoldingMap.entries()]
    .map(([assetId, v]) => ({ assetId, ticker: v.ticker, total: v.total }))
    .sort((a, b) => b.total - a.total);
  const yieldPct = currentMarketValue > 0 ? (ttmTotal / currentMarketValue) * 100 : null;

  return { byYear, byHolding, total, ttmTotal, yieldPct };
}
