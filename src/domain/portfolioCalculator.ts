import { buildPositionMetrics } from "./portfolioMetrics";
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

    // Transaction-based: split records by accountId and run the canonical
    // moving-average engine (domain/portfolioMetrics) per account so quantity,
    // cost basis, and capital-reduction handling match the rest of the app.
    const byAccount = new Map<string, InvestmentRecord[]>();
    for (const record of records) {
      if (record.assetId !== asset.id || record.deletedAt !== null) continue;
      const key = record.linkedAccountId ?? "__unassigned__";
      byAccount.set(key, [...(byAccount.get(key) ?? []), record]);
    }

    for (const [accountKey, accountRecords] of byAccount) {
      const metrics = buildPositionMetrics(accountRecords);
      if (metrics.quantity <= 0) continue;
      const accountId = accountKey === "__unassigned__" ? null : accountKey;
      const averageCost = metrics.averageCost;
      const marketValue = marketPrice === null ? 0 : metrics.quantity * marketPrice;
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
