import type { DailyPriceSeriesRow } from "./types";
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

export type DailyPriceLookup = Map<string, DailyPriceSeriesRow[]>;

/** Index daily closes by every alias of their ticker, sorted ascending by date. */
export function buildDailyPriceLookup(rows: DailyPriceSeriesRow[]): DailyPriceLookup {
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
): DailyPriceSeriesRow | null {
  for (const key of quoteLookupKeys(ticker)) {
    const rows = lookup.get(key);
    if (!rows?.length) continue;
    let match: DailyPriceSeriesRow | null = null;
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
  /** Asset id — used to resolve manual-price snapshots for custom assets. */
  id?: string;
  /**
   * Discriminator. A value of `"custom"` marks a manually-priced asset that has
   * no Yahoo-resolvable ticker; such assets price from manual snapshots → cost
   * and never consult quote/daily-close. Any other value (or absent) keeps the
   * standard quote → close → cost order.
   */
  assetType?: string | null;
}

/** Minimal live-quote shape (a StoredMarketQuote satisfies this). */
export interface QuoteLike {
  price: number;
  currency: string;
}

export type PriceSource = "quote" | "close" | "cost" | "manual";

/** A manual-price snapshot resolved at-or-before a date, for a custom asset. */
export interface ManualPriceLike {
  price: number;
  currency: string;
}

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
  /**
   * Resolves the latest manual-price snapshot at-or-before `date` for a custom
   * asset. Only consulted when `asset.assetType === "custom"`. Absent → custom
   * assets fall back to average cost.
   */
  manualPriceLookup?: (assetId: string, date: string) => ManualPriceLike | undefined;
}

/** Canonical per-unit valuation. See the module contract for the resolution order. */
export function priceAssetOnDate(
  asset: PriceableAsset,
  date: string,
  opts: PriceAssetOptions,
): AssetPrice {
  const d = date.slice(0, 10);
  // Custom (manually-priced) assets value only from manual snapshots → cost;
  // they never consult a live quote or daily close. Gated tightly so non-custom
  // valuation is unaffected.
  if (asset.assetType === "custom") {
    const manual = asset.id ? opts.manualPriceLookup?.(asset.id, d) : undefined;
    if (manual && Number.isFinite(manual.price) && manual.price > 0) {
      return { value: manual.price, currency: manual.currency || asset.currency, source: "manual" };
    }
    return { value: asset.averageCost, currency: asset.currency, source: "cost" };
  }
  const isCurrent = d >= opts.todayIso;
  if (isCurrent && opts.quote && Number.isFinite(opts.quote.price) && opts.quote.price > 0) {
    return {
      value: opts.quote.price,
      currency: opts.quote.currency || asset.currency,
      source: "quote",
    };
  }
  const close = findDailyPriceAtOrBefore(opts.dailyPriceLookup, asset.ticker, d);
  if (close) {
    return {
      value: close.close,
      currency: close.currency || opts.quote?.currency || asset.currency,
      source: "close",
    };
  }
  return { value: asset.averageCost, currency: asset.currency, source: "cost" };
}

/**
 * Build a manual-price resolver from snapshots: for a given asset+date it returns
 * the latest snapshot with `date <= requested date` for that asset (mirrors
 * {@link findDailyPriceAtOrBefore}). Pure. Feed the result to
 * {@link priceAssetOnDate}/{@link holdingsMarketValue} as `manualPriceLookup`.
 */
export function buildManualPriceLookup(
  snapshots: { assetId: string; date: string; price: number; currency?: string }[],
): (assetId: string, date: string) => ManualPriceLike | undefined {
  const byAsset = new Map<string, { date: string; price: number; currency?: string }[]>();
  for (const snap of snapshots) {
    const bucket = byAsset.get(snap.assetId) ?? [];
    bucket.push(snap);
    byAsset.set(snap.assetId, bucket);
  }
  for (const bucket of byAsset.values()) bucket.sort((a, b) => a.date.localeCompare(b.date));
  return (assetId: string, date: string): ManualPriceLike | undefined => {
    const bucket = byAsset.get(assetId);
    if (!bucket?.length) return undefined;
    const d = date.slice(0, 10);
    let match: ManualPriceLike | undefined;
    for (const snap of bucket) {
      if (snap.date.slice(0, 10) > d) break;
      match = { price: snap.price, currency: snap.currency ?? "" };
    }
    return match;
  };
}

export interface HoldingsValueOptions {
  todayIso: string;
  dailyPriceLookup: DailyPriceLookup;
  quoteFor: (ticker: string) => QuoteLike | undefined;
  /** Manual-price resolver for custom assets; forwarded to {@link priceAssetOnDate}. */
  manualPriceLookup?: (assetId: string, date: string) => ManualPriceLike | undefined;
}

/**
 * Total market value (primary currency) of `assets` on `date`, valuing each at
 * {@link priceAssetOnDate}. Positions with no quantity contribute nothing.
 *
 * A leg whose currency has no rate on `date` is EXCLUDED and tallied in
 * `fxMissCount` rather than silently valued at 0, so callers can flag that the
 * headline `total` is incomplete. (Numerically identical to the old silent-0
 * when `toPrimary` never returns null.)
 */
export function holdingsMarketValue(
  assets: Array<PriceableAsset & { totalQuantity: number }>,
  date: string,
  toPrimary: (value: number, currency: string, asOf?: string) => number | null,
  opts: HoldingsValueOptions,
): { total: number; fxMissCount: number } {
  let total = 0;
  let fxMissCount = 0;
  for (const asset of assets) {
    if (Math.abs(asset.totalQuantity) < QTY_EPS) continue;
    const price = priceAssetOnDate(asset, date, {
      todayIso: opts.todayIso,
      dailyPriceLookup: opts.dailyPriceLookup,
      quote: opts.quoteFor(asset.ticker),
      manualPriceLookup: opts.manualPriceLookup,
    });
    const converted = toPrimary(price.value * asset.totalQuantity, price.currency, date);
    if (converted === null) {
      fxMissCount += 1;
      continue;
    }
    total += converted;
  }
  return { total, fxMissCount };
}
