export interface MarketQuote {
  symbol: string;
  name: string;
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
  exchange?: string;
  typeLabel?: string;
}

export interface MarketDataProvider {
  readonly sourceName: string;
  fetchQuotes(symbols: string[]): Promise<Record<string, MarketQuote>>;
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

