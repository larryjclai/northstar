import { buildPositionMetrics } from "./portfolioMetrics";
import type { DailyPrice, HoldingPosition, InvestmentRecord, PortfolioAsset } from "./types";
import { buildDailyPriceLookup, findDailyPriceAtOrBefore, type DailyPriceLookup } from "./valuation";

export interface MarketQuote {
  symbol: string;
  price: number;
  currency: string;
}

/**
 * Optional daily-close fallback for market value. When supplied, a holding with
 * no live quote is valued at its latest recorded close (then average cost) — the
 * same canonical order as {@link priceAssetOnDate} — instead of reading 0. This
 * keeps the 投資 page market value in lock-step with the Dashboard / net-worth
 * trend. Omit it to keep the legacy quote-only behaviour (value 0 when unpriced).
 */
export interface HoldingValuation {
  dailyPrices: DailyPrice[];
  /** Valuation date (today, YYYY-MM-DD) for the close lookup. */
  asOf: string;
}

/**
 * Resolve a holding's per-unit market price and the price used to value it.
 *   - `marketPrice` is the honest *market* price (quote → latest close, else
 *     null when no market price is known at all).
 *   - `valuePrice` is what the position is valued at: marketPrice, or the
 *     asset's average cost when no market price exists (so value never reads 0).
 */
function resolveHoldingPrice(
  ticker: string,
  averageCost: number,
  quote: MarketQuote | undefined,
  lookup: DailyPriceLookup | null,
  asOf: string | null,
): { marketPrice: number | null; valuePrice: number } {
  const quotePrice = quote?.price ?? null;
  const closePrice = lookup && asOf ? findDailyPriceAtOrBefore(lookup, ticker, asOf)?.close ?? null : null;
  const marketPrice = quotePrice ?? closePrice;
  // Cost fallback only applies once a valuation context exists; without it we
  // preserve the legacy "0 when unpriced" behaviour (marketPrice stays null and
  // callers compute marketValue = 0).
  const valuePrice = marketPrice ?? (lookup ? averageCost : 0);
  return { marketPrice, valuePrice };
}

export function buildHoldingPositions(
  assets: PortfolioAsset[],
  records: InvestmentRecord[],
  quotes: Record<string, MarketQuote | undefined>,
  valuation?: HoldingValuation,
): HoldingPosition[] {
  const lookup = valuation ? buildDailyPriceLookup(valuation.dailyPrices) : null;
  const asOf = valuation?.asOf ?? null;
  return assets
    .filter((asset) => asset.deletedAt === null)
    .map((asset) => {
      const assetRecords = records.filter((record) => record.assetId === asset.id && record.deletedAt === null);
      const quantity = asset.holdingSource === "manual"
        ? asset.totalQuantity
        : assetRecords
          .sort((a, b) => a.date.localeCompare(b.date))
          .reduce((sum, record) => {
            if (record.action === "buy" || record.action === "stockDividend") return sum + record.quantity;
            if (record.action === "sell") return sum - record.quantity;
            if (record.action === "stockSplit" && record.quantity > 0) return sum * record.quantity;
            return sum;
          }, 0);
      const quote = quotes[asset.ticker];
      const { marketPrice, valuePrice } = resolveHoldingPrice(asset.ticker, asset.averageCost, quote, lookup, asOf);
      const marketValue = quantity * valuePrice;
      const costBasis = quantity * asset.averageCost;
      const unrealizedGain = marketValue - costBasis;
      const unrealizedGainPercent = costBasis === 0 ? 0 : (unrealizedGain / costBasis) * 100;

      return {
        assetId: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        currency: asset.currency,
        quantity,
        averageCost: asset.averageCost,
        marketPrice,
        marketValue,
        costBasis,
        unrealizedGain,
        unrealizedGainPercent,
        accountId: asset.accountId,
      };
    });
}

/**
 * Like buildHoldingPositions but returns one row per (asset, account) pair.
 *
 * - Manual holdings: one row per asset (the asset already carries accountId).
 * - Transaction-based holdings: one row per accountId observed on the records;
 *   buys/sells/dividends are FIFO-aggregated within each account so the
 *   quantity, cost basis, and unrealized P/L are accurate per brokerage.
 *
 * The combined cross-account view can still be obtained from
 * `buildHoldingPositions`; this helper is for the "per-broker" breakdown.
 */
export function buildHoldingPositionsByAccount(
  assets: PortfolioAsset[],
  records: InvestmentRecord[],
  quotes: Record<string, MarketQuote | undefined>,
  valuation?: HoldingValuation,
): HoldingPosition[] {
  const positions: HoldingPosition[] = [];
  const lookup = valuation ? buildDailyPriceLookup(valuation.dailyPrices) : null;
  const asOf = valuation?.asOf ?? null;

  for (const asset of assets) {
    if (asset.deletedAt !== null) continue;
    const quote = quotes[asset.ticker];
    const { marketPrice, valuePrice } = resolveHoldingPrice(asset.ticker, asset.averageCost, quote, lookup, asOf);

    const assetRecords = records.filter((record) => record.assetId === asset.id && record.deletedAt === null);

    // Defensive fallback for a manual snapshot with no records yet
    // (pre-migration edge): one row from the asset's stored (derived) fields.
    // Migrated manual holdings carry a cashless opening record, so they flow
    // through the per-account record path below — which also splits correctly
    // when the same ticker is later bought in a different brokerage.
    if (assetRecords.length === 0) {
      if (asset.totalQuantity <= 0) continue;
      const marketValue = asset.totalQuantity * valuePrice;
      const costBasis = asset.totalQuantity * asset.averageCost;
      const unrealizedGain = marketValue - costBasis;
      positions.push({
        assetId: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        currency: asset.currency,
        quantity: asset.totalQuantity,
        averageCost: asset.averageCost,
        marketPrice,
        marketValue,
        costBasis,
        unrealizedGain,
        unrealizedGainPercent: costBasis === 0 ? 0 : (unrealizedGain / costBasis) * 100,
        accountId: asset.accountId,
      });
      continue;
    }

    // Split records by accountId and run the canonical moving-average engine
    // (domain/portfolioMetrics) per account so quantity, cost basis, and
    // capital-reduction handling match the rest of the app.
    const byAccount = new Map<string, InvestmentRecord[]>();
    for (const record of assetRecords) {
      const key = record.linkedAccountId ?? "__unassigned__";
      byAccount.set(key, [...(byAccount.get(key) ?? []), record]);
    }

    for (const [accountKey, accountRecords] of byAccount) {
      const metrics = buildPositionMetrics(accountRecords);
      if (metrics.quantity <= 0) continue;
      const accountId = accountKey === "__unassigned__" ? null : accountKey;
      const averageCost = metrics.averageCost;
      // Per-account cost fallback: when no market price exists, value at this
      // account's own average cost so its unrealized P/L reads an honest 0.
      const acctValuePrice = marketPrice ?? (lookup ? averageCost : 0);
      const marketValue = metrics.quantity * acctValuePrice;
      const costBasis = metrics.costBasis;
      const unrealizedGain = marketValue - costBasis;
      positions.push({
        assetId: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        currency: asset.currency,
        quantity: metrics.quantity,
        averageCost,
        marketPrice,
        marketValue,
        costBasis,
        unrealizedGain,
        unrealizedGainPercent: costBasis === 0 ? 0 : (unrealizedGain / costBasis) * 100,
        accountId,
      });
    }
  }

  return positions;
}
