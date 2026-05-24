import type { MarketDataProvider, MarketHistoryPoint, MarketQuote, SymbolSearchResult } from "./provider";

interface YahooChartEnvelope {
  chart: {
    result?: YahooChartResult[];
    error?: { description?: string };
  };
}

interface YahooChartResult {
  meta: {
    symbol?: string;
    shortName?: string;
    longName?: string;
    currency?: string;
    regularMarketPrice?: number;
    previousClose?: number;
    chartPreviousClose?: number;
    regularMarketTime?: number;
  };
  timestamp?: number[];
  indicators: {
    quote: Array<{
      close?: Array<number | null>;
    }>;
  };
}

interface YahooSearchEnvelope {
  quotes: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
    quoteType?: string;
    typeDisp?: string;
  }>;
}

const quoteCache = new Map<string, { quote: MarketQuote; updatedAt: number }>();
const historyCache = new Map<string, { points: MarketHistoryPoint[]; updatedAt: number }>();
const quoteMaxAgeMs = 60_000;
const fxMaxAgeMs = 5 * 60_000;

export class YahooFinanceProvider implements MarketDataProvider {
  readonly sourceName = "Yahoo Finance";

  async fetchQuotes(symbols: string[]): Promise<Record<string, MarketQuote>> {
    const normalized = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))].sort();
    const result: Record<string, MarketQuote> = {};
    const missing = normalized.filter((symbol) => {
      const cached = quoteCache.get(symbol);
      if (cached && Date.now() - cached.updatedAt < quoteMaxAgeMs) {
        result[symbol] = cached.quote;
        return false;
      }
      return true;
    });

    const fetched = await Promise.allSettled(missing.map((symbol) => this.fetchQuoteFromChart(symbol)));
    for (const item of fetched) {
      if (item.status === "fulfilled") {
        quoteCache.set(item.value.symbol, { quote: item.value, updatedAt: Date.now() });
        result[item.value.symbol] = item.value;
      }
    }

    return result;
  }

  async fetchHistory(symbol: string, range = "1y", interval = "1d"): Promise<MarketHistoryPoint[]> {
    const normalized = normalizeSymbol(symbol);
    const key = `${normalized}:${range}:${interval}`;
    const cached = historyCache.get(key);
    if (cached && Date.now() - cached.updatedAt < quoteMaxAgeMs) {
      return cached.points;
    }

    const chart = await this.fetchChart(normalized, range, interval);
    const timestamps = chart.timestamp ?? [];
    const closes = chart.indicators.quote[0]?.close ?? [];
    const points: MarketHistoryPoint[] = [];
    const count = Math.min(timestamps.length, closes.length);

    for (let index = 0; index < count; index += 1) {
      const close = closes[index];
      if (close === null || close === undefined || close <= 0) continue;
      points.push({
        date: new Date(timestamps[index] * 1000).toISOString(),
        close,
      });
    }

    historyCache.set(key, { points, updatedAt: Date.now() });
    return points;
  }

  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("quotesCount", "10");
    url.searchParams.set("newsCount", "0");

    const envelope = await fetchJson<YahooSearchEnvelope>(url);
    const allowed = new Set(["EQUITY", "ETF", "MUTUALFUND", "INDEX"]);
    return envelope.quotes
      .filter((item) => item.symbol && (!item.quoteType || allowed.has(item.quoteType.toUpperCase())))
      .map((item) => ({
        symbol: item.symbol ?? "",
        name: item.shortname ?? item.longname ?? item.symbol ?? "",
        exchange: item.exchange,
        typeLabel: item.typeDisp ?? item.quoteType,
      }));
  }

  async fetchFxRate(from: string, to: string): Promise<MarketQuote> {
    const symbol = `${from.toUpperCase()}${to.toUpperCase()}=X`;
    const cached = quoteCache.get(symbol);
    if (cached && Date.now() - cached.updatedAt < fxMaxAgeMs) {
      return cached.quote;
    }
    const quote = await this.fetchQuoteFromChart(symbol);
    quoteCache.set(symbol, { quote, updatedAt: Date.now() });
    return quote;
  }

  private async fetchQuoteFromChart(symbol: string): Promise<MarketQuote> {
    const chart = await this.fetchChart(symbol, "1y", "1d");
    const closes = chart.indicators.quote[0]?.close?.filter((close): close is number => Boolean(close && close > 0)) ?? [];
    const price = chart.meta.regularMarketPrice ?? closes.at(-1);
    if (!price) throw new Error(`Yahoo Finance did not return a quote for ${symbol}.`);
    const previousClose = chart.meta.previousClose ?? chart.meta.chartPreviousClose ?? closes.at(-2) ?? price;
    const change = price - previousClose;

    return {
      symbol: chart.meta.symbol ?? symbol,
      name: chart.meta.shortName ?? chart.meta.longName ?? chart.meta.symbol ?? symbol,
      currency: chart.meta.currency ?? "USD",
      price,
      change,
      changePercent: previousClose === 0 ? 0 : (change / previousClose) * 100,
      marketTime: chart.meta.regularMarketTime
        ? new Date(chart.meta.regularMarketTime * 1000).toISOString()
        : null,
    };
  }

  private async fetchChart(symbol: string, range: string, interval: string): Promise<YahooChartResult> {
    const encodedSymbol = encodeURIComponent(symbol);
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}`);
    url.searchParams.set("range", range);
    url.searchParams.set("interval", interval);
    const envelope = await fetchJson<YahooChartEnvelope>(url);
    const result = envelope.chart.result?.[0];
    if (!result) {
      throw new Error(envelope.chart.error?.description ?? `Yahoo Finance did not return chart data for ${symbol}.`);
    }
    return result;
  }
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}
