import type { AssetType } from "../../domain";

export interface MarketQuote {
  symbol: string;
  name: string;
  nameZh: string | null;
  nameEn: string | null;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  marketTime: string | null;
}

export interface MarketHistoryPoint {
  date: string;
  close: number;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  currency?: string;
  exchange?: string;
  typeLabel?: string;
  assetType?: AssetType | null;
}

export interface AssetProfile {
  symbol: string;
  nameZh?: string | null;
  nameEn?: string | null;
  assetType: AssetType | null;
  sector: string | null;
  industry: string | null;
}

export interface MarketDataProvider {
  readonly sourceName: string;
  fetchQuotes(symbols: string[]): Promise<Record<string, MarketQuote>>;
  fetchAssetProfiles(
    symbols: string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Record<string, AssetProfile>>;
  fetchHistory(symbol: string, range?: string, interval?: string): Promise<MarketHistoryPoint[]>;
  searchSymbols(query: string): Promise<SymbolSearchResult[]>;
  fetchFxRate(from: string, to: string): Promise<MarketQuote>;
}

export interface MarketCacheEntry<T> {
  data: T;
  updatedAt: number;
}

export function isFresh(entry: MarketCacheEntry<unknown> | undefined, maxAgeMs: number) {
  return entry !== undefined && Date.now() - entry.updatedAt < maxAgeMs;
}
