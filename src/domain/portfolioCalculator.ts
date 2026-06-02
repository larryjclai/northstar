import type { HoldingPosition, InvestmentRecord, PortfolioAsset } from "./types";

export interface MarketQuote {
  symbol: string;
  price: number;
  currency: string;
}

export function buildHoldingPositions(
  assets: PortfolioAsset[],
  records: InvestmentRecord[],
  quotes: Record<string, MarketQuote | undefined>,
): HoldingPosition[] {
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
      const marketPrice = quote?.price ?? null;
      const marketValue = marketPrice === null ? 0 : quantity * marketPrice;
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
): HoldingPosition[] {
  const positions: HoldingPosition[] = [];

  for (const asset of assets) {
    if (asset.deletedAt !== null) continue;
    const quote = quotes[asset.ticker];
    const marketPrice = quote?.price ?? null;

    if (asset.holdingSource === "manual") {
      // Manual snapshot already maps 1:1 to a brokerage account.
      const marketValue = marketPrice === null ? 0 : asset.totalQuantity * marketPrice;
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

    // Transaction-based: split records by accountId and aggregate each
    // account's quantity + cost basis independently.
    const sortedRecords = records
      .filter((record) => record.assetId === asset.id && record.deletedAt === null)
      .sort((a, b) => a.date.localeCompare(b.date));

    const buckets = new Map<string, { quantity: number; cost: number }>();
    for (const record of sortedRecords) {
      const key = record.linkedAccountId ?? "__unassigned__";
      const bucket = buckets.get(key) ?? { quantity: 0, cost: 0 };
      if (record.action === "buy") {
        bucket.quantity += record.quantity;
        bucket.cost += record.price * record.quantity + record.fee;
      } else if (record.action === "sell") {
        const avg = bucket.quantity === 0 ? 0 : bucket.cost / bucket.quantity;
        bucket.quantity -= record.quantity;
        bucket.cost -= avg * record.quantity;
      } else if (record.action === "stockDividend") {
        bucket.quantity += record.quantity;
      } else if (record.action === "capitalReduction") {
        bucket.cost = Math.max(0, bucket.cost - record.price * record.quantity);
      } else if (record.action === "stockSplit" && record.quantity > 0) {
        bucket.quantity *= record.quantity;
      }
      buckets.set(key, bucket);
    }

    for (const [accountKey, bucket] of buckets) {
      if (bucket.quantity <= 0) continue;
      const accountId = accountKey === "__unassigned__" ? null : accountKey;
      const averageCost = bucket.quantity === 0 ? 0 : bucket.cost / bucket.quantity;
      const marketValue = marketPrice === null ? 0 : bucket.quantity * marketPrice;
      const costBasis = bucket.quantity * averageCost;
      const unrealizedGain = marketValue - costBasis;
      positions.push({
        assetId: asset.id,
        ticker: asset.ticker,
        name: asset.name,
        currency: asset.currency,
        quantity: bucket.quantity,
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
