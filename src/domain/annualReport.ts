import { resolveHoldingCountry } from "./assetCountry";
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

/** Per-holding realized gain + dividends for one tax year. */
export interface AnnualHoldingTaxDetail {
  assetId: string;
  ticker: string;
  /** ISO alpha-2 from `resolveHoldingCountry`; null = undeterminable (treated as overseas). */
  country: string | null;
  /** This holding's realized P/L attributed to this year (primary currency). */
  realizedGain: number;
  /** This holding's cash dividends received this year (primary currency, net). */
  dividends: number;
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
  /** Per-holding breakdown, descending by |realizedGain| + dividends. */
  byHolding: AnnualHoldingTaxDetail[];
  /** Sum of byHolding entries where country === "TW". */
  domestic: { realizedGain: number; dividends: number };
  /** Sum of byHolding entries where country !== "TW" (including null/undeterminable). */
  overseas: { realizedGain: number; dividends: number };
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
  toPrimary: (value: number, currency: string, asOfDate?: string) => number | null,
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
    // A null (unpriced) leg is skipped and counted by the injected converter;
    // dropping it here mirrors the exclude-and-warn口徑 used for dividends/fees.
    const converted = toPrimary(nativeAmount, currency, day(date));
    if (converted === null) return;
    const y = yearOf(day(date));
    byYear.set(y, (byYear.get(y) ?? 0) + converted);
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
  /**
   * FX seam (Decision C): convert a native amount to primary, dated at disposal.
   * Returns `null` when no rate covers the pair — such legs are EXCLUDED from the
   * year buckets and tallied in {@link AnnualReport.fxMisses} instead of silently
   * contributing 0.
   */
  toPrimary: (value: number, currency: string, asOfDate?: string) => number | null;
}

export interface AnnualReport {
  /** Year-by-year buckets, ascending by year. */
  years: AnnualReportYear[];
  /**
   * Amounts (realized legs, fees, dividends) EXCLUDED because no FX rate covered
   * their currency on their date. `currencies` lists the distinct source
   * currencies that missed, ascending.
   */
  fxMisses: { count: number; currencies: string[] };
}

/**
 * Build the year-by-year tax report. Ascending by year. Any year that has a
 * realized gain, a dividend, OR a trading cost appears (so a dividends-only year
 * still shows with realizedGain 0).
 */
/** Net dividend total of a single cashDividend record, in its native currency. Mirrors dividendAnalysis.ts's `dividendNative`. */
function dividendNative(record: InvestmentRecord): number {
  const gross = record.quantity > 0 ? record.price * record.quantity : record.price;
  return gross - record.fee;
}

type HoldingYearBucket = { ticker: string; country: string | null; realizedGain: number; dividends: number };

export function buildAnnualReport(input: BuildAnnualReportInput): AnnualReport {
  const { assets, recordsByAsset, dividendByYear, toPrimary } = input;

  // Wrap the injected converter so every unpriced (null) leg is counted once and
  // reported via `fxMisses`, keeping tax totals from silently absorbing a 0.
  let fxMissCount = 0;
  const fxMissCurrencies = new Set<string>();
  const convert = (value: number, currency: string, asOfDate?: string): number | null => {
    const converted = toPrimary(value, currency, asOfDate);
    if (converted === null) {
      fxMissCount += 1;
      fxMissCurrencies.add(currency);
    }
    return converted;
  };

  const realizedMap = new Map<string, number>();
  const tradingCostMap = new Map<string, number>();
  const dividendMap = new Map<string, number>();
  // year -> assetId -> per-holding bucket (Decision A/B/C mirrored per-asset).
  const byHoldingMap = new Map<string, Map<string, HoldingYearBucket>>();

  const bucketFor = (year: string, assetId: string, ticker: string, country: string | null): HoldingYearBucket => {
    let yearMap = byHoldingMap.get(year);
    if (!yearMap) {
      yearMap = new Map();
      byHoldingMap.set(year, yearMap);
    }
    let bucket = yearMap.get(assetId);
    if (!bucket) {
      bucket = { ticker, country, realizedGain: 0, dividends: 0 };
      yearMap.set(assetId, bucket);
    }
    return bucket;
  };

  for (const asset of assets) {
    if (asset.deletedAt !== null) continue;
    const records = recordsByAsset(asset.id);
    const currency = asset.currency;
    const country = resolveHoldingCountry(asset.ticker, asset.currency);

    // Per-year realized gains (Decision A), converted at disposal date (Decision C).
    const realized = realizedByYearForAsset(records, currency, convert);
    for (const [year, amount] of realized) {
      realizedMap.set(year, (realizedMap.get(year) ?? 0) + amount);
      bucketFor(year, asset.id, asset.ticker, country).realizedGain += amount;
    }

    // Per-year trading cost = Σ fee (Decision B, informational), converted at the
    // record's own date so the口徑 matches the realized line.
    for (const r of records) {
      if (r.deletedAt !== null || !r.fee) continue;
      const feePrimary = convert(r.fee, currency, day(r.date));
      if (feePrimary === null) continue;
      const year = yearOf(day(r.date));
      tradingCostMap.set(year, (tradingCostMap.get(year) ?? 0) + feePrimary);
    }

    // Per-year, per-holding dividends — mirrors buildDividendAnalysis's cashDividend
    // loop (Decision B/C) but keyed by (assetId, year) instead of just year.
    for (const r of records) {
      if (r.deletedAt !== null || r.action !== "cashDividend") continue;
      const rd = day(r.date);
      const amount = convert(dividendNative(r), currency, rd);
      if (amount === null || amount === 0) continue;
      const year = yearOf(rd);
      bucketFor(year, asset.id, asset.ticker, country).dividends += amount;
    }
  }

  for (const { year, total } of dividendByYear) {
    dividendMap.set(year, (dividendMap.get(year) ?? 0) + total);
  }

  const years = new Set<string>([
    ...realizedMap.keys(),
    ...dividendMap.keys(),
    ...tradingCostMap.keys(),
    ...byHoldingMap.keys(),
  ]);

  const yearRows = [...years]
    .map((year) => {
      const realizedGain = realizedMap.get(year) ?? 0;
      const dividends = dividendMap.get(year) ?? 0;
      const tradingCost = tradingCostMap.get(year) ?? 0;

      const yearHoldings = byHoldingMap.get(year);
      const byHolding: AnnualHoldingTaxDetail[] = yearHoldings
        ? [...yearHoldings.entries()]
            .map(([assetId, bucket]) => ({
              assetId,
              ticker: bucket.ticker,
              country: bucket.country,
              realizedGain: bucket.realizedGain,
              dividends: bucket.dividends,
            }))
            .filter((h) => h.realizedGain !== 0 || h.dividends !== 0)
            .sort((a, b) => Math.abs(b.realizedGain) + b.dividends - (Math.abs(a.realizedGain) + a.dividends))
        : [];

      const domestic = { realizedGain: 0, dividends: 0 };
      const overseas = { realizedGain: 0, dividends: 0 };
      for (const h of byHolding) {
        const bucket = h.country === "TW" ? domestic : overseas;
        bucket.realizedGain += h.realizedGain;
        bucket.dividends += h.dividends;
      }

      // total excludes tradingCost — fees are already netted into realizedGain.
      return { year, realizedGain, dividends, tradingCost, total: realizedGain + dividends, byHolding, domestic, overseas };
    })
    .sort((a, b) => a.year.localeCompare(b.year));

  return { years: yearRows, fxMisses: { count: fxMissCount, currencies: [...fxMissCurrencies].sort() } };
}
