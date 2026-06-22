import type { InvestmentRecord, PortfolioAsset } from "./types";

/**
 * Taiwan year-end / tax report — realized capital gains (證券交易所得) and
 * dividend income (股利所得) bucketed by the calendar year the gain was
 * realized. See docs/annual-report-plan.md for the locked decisions.
 *
 * This module RE-DERIVES per-year buckets using the SAME moving-average
 * accounting as `buildPositionMetrics`; it does not edit that function. The
 * load-bearing invariant is that summing every year's `realizedGain` for one
 * position EQUALS `buildPositionMetrics(records).realizedGain` (proven in the
 * test). Cost-basis math is unchanged.
 *
 * Decision A — disposal-date year, moving-average: each sell / capitalReduction
 *   realized amount is attributed to `r.date.slice(0,4)`.
 * Decision B — three elements per year: realized gain (net), dividends (net),
 *   and trading cost (Σ fee, informational only). `total = realized + dividends`;
 *   trading cost is NOT subtracted (fees are already netted into realized gain).
 * Decision C — disposal-date FX rate else today, via the injected `toPrimary`
 *   seam (`createFxConverter`'s toPrimary already implements this口徑).
 */

const EPS = 1e-7;

const day = (s: string) => s.slice(0, 10);
const yearOf = (s: string) => s.slice(0, 4);

/** Mirror `buildPositionMetrics` ordering: opening (cashless) lot first, then by date. */
function openingFirst(a: InvestmentRecord, b: InvestmentRecord): number {
  if (a.cashless !== b.cashless) return a.cashless ? -1 : 1;
  return a.date.localeCompare(b.date);
}

export interface AnnualReportYear {
  /** Calendar year, e.g. "2025". */
  year: string;
  /** Realized P/L attributed to this year (primary currency, net of fees, moving-average). */
  realizedGain: number;
  /** Cash dividends received this year (from dividendAnalysis.byYear, net). */
  dividends: number;
  /** Σ of record.fee for this year (informational — already netted into realizedGain). */
  tradingCost: number;
  /** realizedGain + dividends (does NOT subtract tradingCost). */
  total: number;
}

/**
 * Per-year realized gains for ONE asset's records, attributed to the disposal
 * date's year, converted to the primary currency at the disposal date.
 *
 * Walks records exactly like `buildPositionMetrics` (moving-average, opening lot
 * first, `settle()` when the position closes) so the per-year sum equals the
 * lifetime `realizedGain`.
 */
function realizedByYearForAsset(
  records: InvestmentRecord[],
  currency: string,
  toPrimary: (value: number, currency: string, asOfDate?: string) => number,
): Map<string, number> {
  const sorted = records.filter((r) => r.deletedAt === null).sort(openingFirst);
  const byYear = new Map<string, number>();

  let quantity = 0;
  let cost = 0;

  const settle = () => {
    if (quantity <= EPS) {
      quantity = 0;
      cost = 0;
    }
  };
  const add = (date: string, nativeAmount: number) => {
    const y = yearOf(day(date));
    byYear.set(y, (byYear.get(y) ?? 0) + toPrimary(nativeAmount, currency, day(date)));
  };

  for (const r of sorted) {
    if (r.action === "buy") {
      quantity += r.quantity;
      cost += r.price * r.quantity + r.fee;
    } else if (r.action === "sell") {
      const avg = quantity === 0 ? 0 : cost / quantity;
      const soldQty = Math.min(r.quantity, quantity);
      const proceeds = r.price * r.quantity - r.fee;
      add(r.date, proceeds - avg * soldQty);
      quantity -= r.quantity;
      cost -= avg * soldQty;
      settle();
    } else if (r.action === "stockDividend") {
      quantity += r.quantity;
    } else if (r.action === "stockSplit" && r.quantity > 0) {
      quantity *= r.quantity;
    } else if (r.action === "capitalReduction") {
      const cancelled = Math.min(r.quantity, quantity);
      const cashReturned = r.price * r.quantity;
      quantity -= cancelled;
      if (cashReturned > 0) {
        const basisReduced = Math.min(cashReturned, cost);
        cost -= basisReduced;
        if (cashReturned > basisReduced) add(r.date, cashReturned - basisReduced);
      }
      settle();
    }
    // cashDividend is handled via the injected dividendByYear (Decision B).
  }

  return byYear;
}

export interface BuildAnnualReportInput {
  /** All portfolio assets (used for per-asset currency + grouping). */
  assets: PortfolioAsset[];
  /** Resolve one asset's investment records (deleted rows are filtered internally). */
  recordsByAsset: (assetId: string) => InvestmentRecord[];
  /** Per-year net dividends, primary currency — pass `dividendAnalysis.byYear`. */
  dividendByYear: Array<{ year: string; total: number }>;
  /** FX seam (Decision C): convert a native amount to primary, dated at disposal. */
  toPrimary: (value: number, currency: string, asOfDate?: string) => number;
}

/**
 * Build the year-by-year tax report. Ascending by year. Any year that has a
 * realized gain, a dividend, OR a trading cost appears (so a dividends-only year
 * still shows with realizedGain 0).
 */
export function buildAnnualReport(input: BuildAnnualReportInput): AnnualReportYear[] {
  const { assets, recordsByAsset, dividendByYear, toPrimary } = input;

  const realizedMap = new Map<string, number>();
  const tradingCostMap = new Map<string, number>();
  const dividendMap = new Map<string, number>();

  for (const asset of assets) {
    if (asset.deletedAt !== null) continue;
    const records = recordsByAsset(asset.id);
    const currency = asset.currency;

    // Per-year realized gains (Decision A), converted at disposal date (Decision C).
    const realized = realizedByYearForAsset(records, currency, toPrimary);
    for (const [year, amount] of realized) {
      realizedMap.set(year, (realizedMap.get(year) ?? 0) + amount);
    }

    // Per-year trading cost = Σ fee (Decision B, informational), converted at the
    // record's own date so the口徑 matches the realized line.
    for (const r of records) {
      if (r.deletedAt !== null || !r.fee) continue;
      const year = yearOf(day(r.date));
      tradingCostMap.set(year, (tradingCostMap.get(year) ?? 0) + toPrimary(r.fee, currency, day(r.date)));
    }
  }

  for (const { year, total } of dividendByYear) {
    dividendMap.set(year, (dividendMap.get(year) ?? 0) + total);
  }

  const years = new Set<string>([
    ...realizedMap.keys(),
    ...dividendMap.keys(),
    ...tradingCostMap.keys(),
  ]);

  return [...years]
    .map((year) => {
      const realizedGain = realizedMap.get(year) ?? 0;
      const dividends = dividendMap.get(year) ?? 0;
      const tradingCost = tradingCostMap.get(year) ?? 0;
      // total excludes tradingCost — fees are already netted into realizedGain.
      return { year, realizedGain, dividends, tradingCost, total: realizedGain + dividends };
    })
    .sort((a, b) => a.year.localeCompare(b.year));
}
