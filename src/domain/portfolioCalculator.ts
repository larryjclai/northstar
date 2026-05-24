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
      const quantity = assetRecords.reduce((sum, record) => {
        if (record.action === "buy" || record.action === "stockDividend") return sum + record.quantity;
        if (record.action === "sell") return sum - record.quantity;
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
      };
    });
}
