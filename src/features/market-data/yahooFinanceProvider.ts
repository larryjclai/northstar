import { invoke } from "@tauri-apps/api/core";
import type { AssetType } from "../../domain";
import type { AssetProfile, MarketDataProvider, MarketHistoryPoint, MarketQuote, SymbolSearchResult } from "./provider";

interface YahooChartEnvelope {
  northstarError?: string;
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
  northstarError?: string;
  quotes: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    currency?: string;
    exchange?: string;
    quoteType?: string;
    typeDisp?: string;
  }>;
}

interface YahooQuoteSummaryEnvelope {
  northstarError?: string;
  quoteSummary: {
    result?: YahooQuoteSummaryResult[];
    error?: { description?: string };
  };
}

interface YahooQuoteSummaryResult {
  quoteType?: {
    quoteType?: string;
  };
  assetProfile?: {
    sector?: string;
    industry?: string;
  };
  summaryProfile?: {
    sector?: string;
    industry?: string;
  };
  fundProfile?: {
    categoryName?: string;
  };
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
    const searchParams = new URLSearchParams({
      q: trimmed,
      quotesCount: "10",
      newsCount: "0",
      lang: "zh-Hant-TW",
      region: "TW",
    });

    const envelope = await fetchYahooJson<YahooSearchEnvelope>("/v1/finance/search", searchParams);
    if (envelope.northstarError) throw new Error(envelope.northstarError);
    const allowed = new Set(["EQUITY", "ETF", "MUTUALFUND", "INDEX", "CRYPTOCURRENCY", "CRYPTO"]);
    return envelope.quotes
      .filter((item) => item.symbol && (!item.quoteType || allowed.has(item.quoteType.toUpperCase())))
      .map((item) => ({
        symbol: item.symbol ?? "",
        name: item.shortname ?? item.longname ?? item.symbol ?? "",
        currency: item.currency,
        exchange: item.exchange,
        typeLabel: item.typeDisp ?? item.quoteType,
        assetType: mapYahooAssetType(item.quoteType),
      }));
  }

  async fetchAssetProfiles(symbols: string[], onProgress?: (done: number, total: number) => void): Promise<Record<string, AssetProfile>> {
    const normalized = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))].sort();
    const result: Record<string, AssetProfile> = {};
    let done = 0;

    for (let index = 0; index < normalized.length; index += 4) {
      const chunk = normalized.slice(index, index + 4);
      const fetched = await Promise.allSettled(chunk.map((symbol) => this.fetchAssetProfile(symbol)));
      for (const item of fetched) {
        done += 1;
        if (item.status === "fulfilled") {
          result[item.value.symbol] = item.value;
        }
        onProgress?.(done, normalized.length);
      }
    }

    return result;
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
    // Fetch the primary (zh-Hant) chart for price + Chinese name in parallel
    // with a second English-language chart for the English name. If the
    // primary fails (e.g. symbol not found in zh-Hant locale) we fall back
    // to the English chart for price data too.
    const [zhResult, enResult] = await Promise.allSettled([
      this.fetchChart(symbol, "1y", "1d", "zh-Hant-TW"),
      this.fetchChart(symbol, "1y", "1d", "en-US"),
    ]);

    const primary = pickPrimary(zhResult, enResult);
    if (!primary) {
      const reason = zhResult.status === "rejected" ? zhResult.reason : enResult.status === "rejected" ? enResult.reason : null;
      throw reason instanceof Error ? reason : new Error(`Yahoo Finance did not return a quote for ${symbol}.`);
    }

    const closes = primary.indicators.quote[0]?.close?.filter((close): close is number => Boolean(close && close > 0)) ?? [];
    const price = primary.meta.regularMarketPrice ?? closes.at(-1);
    if (!price) throw new Error(`Yahoo Finance did not return a quote for ${symbol}.`);
    const previousClose = primary.meta.previousClose ?? primary.meta.chartPreviousClose ?? closes.at(-2) ?? price;
    const change = price - previousClose;

    const nameZh = zhResult.status === "fulfilled" ? extractName(zhResult.value) : null;
    const nameEn = enResult.status === "fulfilled" ? extractName(enResult.value) : null;

    return {
      symbol: primary.meta.symbol ?? symbol,
      name: nameZh ?? nameEn ?? primary.meta.symbol ?? symbol,
      nameZh,
      nameEn,
      currency: primary.meta.currency ?? "USD",
      price,
      change,
      changePercent: previousClose === 0 ? 0 : (change / previousClose) * 100,
      marketTime: primary.meta.regularMarketTime
        ? new Date(primary.meta.regularMarketTime * 1000).toISOString()
        : null,
    };
  }

  private async fetchChart(symbol: string, range: string, interval: string, lang?: string): Promise<YahooChartResult> {
    const encodedSymbol = encodeURIComponent(symbol);
    const params: Record<string, string> = { range, interval };
    if (lang) params.lang = lang;
    const searchParams = new URLSearchParams(params);
    const envelope = await fetchYahooJson<YahooChartEnvelope>(`/v8/finance/chart/${encodedSymbol}`, searchParams);
    const result = envelope.chart.result?.[0];
    if (!result) {
      throw new Error(envelope.northstarError ?? envelope.chart.error?.description ?? `Yahoo Finance did not return chart data for ${symbol}.`);
    }
    return result;
  }

  private async fetchAssetProfile(symbol: string): Promise<AssetProfile> {
    const encodedSymbol = encodeURIComponent(symbol);
    const searchParams = new URLSearchParams({
      modules: "assetProfile,summaryProfile,quoteType,fundProfile",
    });
    const envelope = await fetchYahooJson<YahooQuoteSummaryEnvelope>(`/v10/finance/quoteSummary/${encodedSymbol}`, searchParams);
    const result = envelope.quoteSummary.result?.[0];
    if (!result) {
      throw new Error(envelope.northstarError ?? envelope.quoteSummary.error?.description ?? `Yahoo Finance did not return profile data for ${symbol}.`);
    }

    const assetType = mapYahooAssetType(result.quoteType?.quoteType);
    const equitySector = cleanText(result.assetProfile?.sector) ?? cleanText(result.summaryProfile?.sector);
    const equityIndustry = cleanText(result.assetProfile?.industry) ?? cleanText(result.summaryProfile?.industry);
    const fundCategory = cleanText(result.fundProfile?.categoryName);
    const useFundCategory = assetType === "etf" || assetType === "mutual_fund";

    return {
      symbol,
      assetType,
      sector: useFundCategory ? fundCategory : equitySector ?? fundCategory,
      industry: useFundCategory ? null : equityIndustry,
    };
  }
}

function pickPrimary(
  zh: PromiseSettledResult<YahooChartResult>,
  en: PromiseSettledResult<YahooChartResult>,
): YahooChartResult | null {
  // Prefer the zh-Hant response so the cached display name matches Taiwanese
  // tickers (台積電 not Taiwan Semiconductor). Fall back to English on failure.
  if (zh.status === "fulfilled" && zh.value.meta.regularMarketPrice !== undefined) return zh.value;
  if (en.status === "fulfilled") return en.value;
  if (zh.status === "fulfilled") return zh.value;
  return null;
}

function extractName(result: YahooChartResult): string | null {
  return result.meta.shortName ?? result.meta.longName ?? null;
}

function mapYahooAssetType(value: string | undefined): AssetType | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "EQUITY") return "equity";
  if (normalized === "ETF") return "etf";
  if (normalized === "MUTUALFUND") return "mutual_fund";
  if (normalized === "INDEX") return "index";
  if (normalized === "CRYPTOCURRENCY" || normalized === "CRYPTO") return "crypto";
  if (normalized === "CURRENCY") return "cash";
  return "other";
}

function cleanText(value: string | undefined) {
  const text = value?.trim();
  return text || null;
}

async function fetchYahooJson<T>(path: string, searchParams: URLSearchParams): Promise<T> {
  const pathAndQuery = `${path}?${searchParams.toString()}`;
  if (isTauriRuntime()) {
    const body = await invoke<string>("fetch_yahoo", { pathAndQuery });
    return JSON.parse(body) as T;
  }

  const response = await fetch(`/api/yahoo${pathAndQuery}`);
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned HTTP ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}
