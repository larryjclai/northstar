import type { Account, PortfolioAsset } from "./types";

export interface DashboardQuote {
  symbol: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface HoldingSummaryRow {
  asset: PortfolioAsset;
  currency: string;
  marketValue: number;
  marketValuePrimary: number;
  dayChange: number | null;
  dayChangePrimary: number | null;
  dayChangePercent: number | null;
  hasQuote: boolean;
}

export function calculateAvailableCash(accounts: Account[], toPrimary: (amount: number, currency: string) => number) {
  return accounts.reduce((sum, account) => {
    if (account.deletedAt !== null) return sum;
    if (account.type === "loan" || account.type === "credit") return sum;
    return sum + toPrimary(Math.max(0, account.balance), account.currency);
  }, 0);
}

export function calculateLiabilities(accounts: Account[], toPrimary: (amount: number, currency: string) => number) {
  return accounts.reduce((sum, account) => {
    if (account.deletedAt !== null) return sum;
    if (account.type === "loan") return sum + toPrimary(Math.abs(account.balance), account.currency);
    if (account.type === "credit") return sum + toPrimary(Math.max(0, -account.balance), account.currency);
    return sum;
  }, 0);
}

export function buildTopHoldingSummaries(
  assets: PortfolioAsset[],
  quotes: DashboardQuote[],
  toPrimary: (amount: number, currency: string) => number,
  limit = 5,
) {
  const quoteBySymbol = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
  return assets
    .filter((asset) => asset.deletedAt === null && asset.totalQuantity > 0)
    .map((asset): HoldingSummaryRow => {
      const quote = quoteBySymbol.get(asset.ticker.toUpperCase());
      const currency = quote?.currency ?? asset.currency;
      const marketValue = (quote?.price ?? asset.averageCost) * asset.totalQuantity;
      const dayChange = quote ? quote.change * asset.totalQuantity : null;
      return {
        asset,
        currency,
        marketValue,
        marketValuePrimary: toPrimary(marketValue, currency),
        dayChange,
        dayChangePrimary: dayChange === null ? null : toPrimary(dayChange, currency),
        dayChangePercent: quote?.changePercent ?? null,
        hasQuote: Boolean(quote),
      };
    })
    .sort((a, b) => b.marketValuePrimary - a.marketValuePrimary)
    .slice(0, limit);
}

