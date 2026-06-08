import type { DailyPrice } from "./types";
import { quoteLookupKeys } from "./marketSymbols";

/**
 * Asset valuation — the single source of truth for "what is one unit of this
 * asset worth on a given date". Every screen that needs a holding's market value
 * (Dashboard KPI / net-worth trend, holdings detail, the 投資 page P/L) routes
 * through {@link priceAssetOnDate} so the numbers always agree.
 *
 * Price resolution order:
 *   - Today (or a future date): the live quote → the latest recorded daily close
 *     → the asset's average cost.
 *   - A historical date: the latest daily close on/before that date → average
 *     cost. (Live quotes are "now", so they never apply to past points; past
 *     points must use recorded closes to stay reproducible offline.)
 *
 * Falling back to average cost — rather than 0 — means an un-priced lot is valued
 * at what it cost instead of vanishing or faking a −100% loss. When that happens
 * the reported `source` is `"cost"`, so callers can keep a *market* price field
 * honest (null) while the *value* stays sensible.
 */

const QTY_EPS = 1e-9;

export type DailyPriceLookup = Map<string, DailyPrice[]>;

/** Index daily closes by every alias of their ticker, sorted ascending by date. */
export function buildDailyPriceLookup(rows: DailyPrice[]): DailyPriceLookup {
  const map: DailyPriceLookup = new Map();
  for (const row of rows) {
    for (const key of quoteLookupKeys(row.ticker)) {
      const bucket = map.get(key) ?? [];
      bucket.push(row);
      map.set(key, bucket);
    }
  }
  for (const bucket of map.values()) bucket.sort((a, b) => a.date.localeCompare(b.date));
  return map;
}

/** The most recent daily close on or before `date`, across the ticker's aliases. */
export function findDailyPriceAtOrBefore(
  lookup: DailyPriceLookup,
  ticker: string,
  date: string,
): DailyPrice | null {
  for (const key of quoteLookupKeys(ticker)) {
    const rows = lookup.get(key);
    if (!rows?.length) continue;
    let match: DailyPrice | null = null;
    for (const row of rows) {
      if (row.date > date) break;
      match = row;
    }
    if (match) return match;
  }
  return null;
}

/** Minimal asset shape this engine needs (decoupled from repositories). */
export interface PriceableAsset {
  ticker: string;
  currency: string;
  averageCost: number;
}

/** Minimal live-quote shape (a StoredMarketQuote satisfies this). */
export interface QuoteLike {
  price: number;
  currency: string;
}

export type PriceSource = "quote" | "close" | "cost";

export interface AssetPrice {
  /** Price per unit, in `currency`. */
  value: number;
  currency: string;
  /** Where the price came from — lets callers keep a market-price field honest. */
  source: PriceSource;
}

export interface PriceAssetOptions {
  /** Today as YYYY-MM-DD; dates ≥ this may use the live quote. */
  todayIso: string;
  dailyPriceLookup: DailyPriceLookup;
  /** The asset's current live quote, if any. */
  quote?: QuoteLike;
}

/** Canonical per-unit valuation. See the module contract for the resolution order. */
export function priceAssetOnDate(
  asset: PriceableAsset,
  date: string,
  opts: PriceAssetOptions,
): AssetPrice {
  const d = date.slice(0, 10);
  const isCurrent = d >= opts.todayIso;
  if (isCurrent && opts.quote && Number.isFinite(opts.quote.price) && opts.quote.price > 0) {
    return { value: opts.quote.price, currency: opts.quote.currency || asset.currency, source: "quote" };
  }
  const close = findDailyPriceAtOrBefore(opts.dailyPriceLookup, asset.ticker, d);
  if (close) {
    return { value: close.close, currency: close.currency || opts.quote?.currency || asset.currency, source: "close" };
  }
  return { value: asset.averageCost, currency: asset.currency, source: "cost" };
}

export interface HoldingsValueOptions {
  todayIso: string;
  dailyPriceLookup: DailyPriceLookup;
  quoteFor: (ticker: string) => QuoteLike | undefined;
}

/**
 * Total market value (primary currency) of `assets` on `date`, valuing each at
 * {@link priceAssetOnDate}. Positions with no quantity contribute nothing.
 */
export function holdingsMarketValue(
  assets: Array<PriceableAsset & { totalQuantity: number }>,
  date: string,
  toPrimary: (value: number, currency: string, asOf?: string) => number,
  opts: HoldingsValueOptions,
): number {
  let sum = 0;
  for (const asset of assets) {
    if (Math.abs(asset.totalQuantity) < QTY_EPS) continue;
    const price = priceAssetOnDate(asset, date, {
      todayIso: opts.todayIso,
      dailyPriceLookup: opts.dailyPriceLookup,
      quote: opts.quoteFor(asset.ticker),
    });
    sum += toPrimary(price.value * asset.totalQuantity, price.currency, date);
  }
  return sum;
}
