import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isDemoMode } from "../../data/demoData";
import { queryKeys } from "../../data/hooks";
import { getFinanceRepository } from "../../data/repositories";
import { expandMarketDataSymbols } from "../../domain/marketSymbols";
import type { DailyFxRate, DailyPrice } from "../../domain/types";
import { TaiwanMarketDataProvider } from "./taiwanMarketDataProvider";
import { YahooFinanceProvider } from "./yahooFinanceProvider";

// Demo data pairs real tickers with synthetic prices (e.g. 0050.TW pre-split),
// so letting live quotes in would show absurd P&L. Every refresh path must
// bail while the demo flag is set; call sites show DEMO_MARKET_MESSAGE.
export const DEMO_MARKET_MESSAGE = "示範模式使用內建行情，已略過線上更新。";

export async function refreshLatestMarketData() {
  if (isDemoMode()) return { quotes: 0, fxRates: 0 };
  const provider = new YahooFinanceProvider();
  const repository = await getFinanceRepository();
  const [assets, settings] = await Promise.all([
    repository.listPortfolioAssets(),
    repository.getAppSettings(),
  ]);
  const symbols = expandMarketDataSymbols(assets.map((asset) => asset.ticker));
  const quotesBySymbol = symbols.length ? await provider.fetchQuotes(symbols) : {};
  const quotes = Object.values(quotesBySymbol);
  if (quotes.length) await repository.saveMarketQuotes(quotes, provider.sourceName);

  const updatedAt = new Date().toISOString();
  const dailyRates: DailyFxRate[] = [];
  const latestRates = new Map(settings.exchangeRates.map((row) => [`${row.from}|${row.to}`, row]));
  for (const row of settings.exchangeRates) {
    const from = row.from.trim().toUpperCase();
    const to = row.to.trim().toUpperCase();
    if (!from || !to || from === to) continue;
    try {
      const points = await provider.fetchHistory(`${from}${to}=X`, "5d", "1d");
      for (const point of points) {
        dailyRates.push({ from, to, date: point.date.slice(0, 10), rate: point.close, source: provider.sourceName, updatedAt });
      }
      const last = points.at(-1);
      if (last) latestRates.set(`${from}|${to}`, { from, to, rate: last.close, updatedAt });
    } catch (error) {
      console.warn(`[market] unable to update ${from}/${to}`, error);
    }
  }
  if (dailyRates.length) await repository.saveDailyFxRates(dailyRates);
  if (dailyRates.length) await repository.updateAppSettings({ ...settings, exchangeRates: [...latestRates.values()] });
  await repository.recalculateDerivedData();
  return { quotes: quotes.length, fxRates: dailyRates.length };
}

export function useRefreshQuotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (symbols: string[]) => {
      if (isDemoMode()) throw new Error(DEMO_MARKET_MESSAGE);
      const provider = new YahooFinanceProvider();
      const repository = await getFinanceRepository();
      const quotesBySymbol = await provider.fetchQuotes(expandMarketDataSymbols(symbols));
      const quotes = Object.values(quotesBySymbol);
      if (quotes.length === 0) throw new Error("報價來源暫時限制更新，請稍後再試。既有快取仍會保留。");
      await repository.saveMarketQuotes(quotes, provider.sourceName);
      return quotes;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.quotes });
    },
  });
}

export interface BackfillAssetProfilesInput {
  force?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export function useBackfillAssetProfiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ force = false, onProgress }: BackfillAssetProfilesInput = {}) => {
      if (isDemoMode()) throw new Error(DEMO_MARKET_MESSAGE);
      const provider = new YahooFinanceProvider();
      const taiwanProvider = new TaiwanMarketDataProvider();
      const repository = await getFinanceRepository();
      const assets = await repository.listPortfolioAssets();
      const candidates = assets.filter((asset) => {
        if (!asset.ticker.trim()) return false;
        // A user who hand-edited the classification owns it — backfill never
        // overwrites a locked row, not even under `force`. (`force` only widens
        // the re-qualify net for UNlocked rows; it is not a re-classify-locked
        // override.)
        if (asset.classificationLocked) return false;
        const ticker = asset.ticker.trim().toUpperCase();
        const taiwanNeedsProfile = isTaiwanTicker(ticker) && (!asset.nameZh || !asset.industry || !asset.sector);
        // Equities anywhere (not just TW) re-qualify while sector/industry are
        // missing — Yahoo's profile fetch was crumb-broken for a long time, so
        // many rows have assetType but no classification.
        const equityNeedsSector = asset.assetType === "equity" && (!asset.sector || !asset.industry);
        return force || !asset.assetType || equityNeedsSector || taiwanNeedsProfile;
      });
      const symbols = [...new Set(candidates.map((asset) => asset.ticker.trim().toUpperCase()))];
      if (symbols.length === 0) return { updated: 0, total: 0, failed: [] as string[] };

      const [taiwanResult, yahooProfiles] = await Promise.all([
        taiwanProvider.fetchAssetProfiles(symbols).catch((error) => {
          console.warn("[market] unable to fetch Taiwan company profiles", error);
          return {};
        }),
        provider.fetchAssetProfiles(symbols, onProgress),
      ]);
      const profiles = { ...yahooProfiles, ...taiwanResult };
      let updated = 0;
      const failed = symbols.filter((symbol) => !profiles[symbol]);

      for (const asset of candidates) {
        const profile = profiles[asset.ticker.trim().toUpperCase()];
        if (!profile) continue;
        await repository.updateAssetClassification(asset.id, {
          assetType: profile.assetType,
          sector: profile.sector,
          industry: profile.industry,
          nameZh: profile.nameZh ?? null,
          nameEn: profile.nameEn ?? null,
        });
        updated += 1;
      }

      return { updated, total: candidates.length, failed };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assets });
    },
  });
}

function isTaiwanTicker(ticker: string) {
  return /^\d{4,6}$/.test(ticker) || /^\d{4,6}\.(TW|TWO)$/.test(ticker);
}

export interface RefreshFxRatesInput {
  pairs: Array<{ from: string; to: string }>;
  range?: string;
}

export function useRefreshFxRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pairs, range = "1y" }: RefreshFxRatesInput) => {
      if (isDemoMode()) throw new Error(DEMO_MARKET_MESSAGE);
      const provider = new YahooFinanceProvider();
      const repository = await getFinanceRepository();
      const collected: DailyFxRate[] = [];
      const failed: string[] = [];
      const updatedAt = new Date().toISOString();
      const latestByPair: Array<{ from: string; to: string; rate: number; updatedAt: string }> = [];

      for (const pair of pairs) {
        const from = pair.from.trim().toUpperCase();
        const to = pair.to.trim().toUpperCase();
        if (!from || !to || from === to) continue;
        try {
          const symbol = `${from}${to}=X`;
          const points = await provider.fetchHistory(symbol, range, "1d");
          for (const point of points) {
            collected.push({
              from,
              to,
              date: point.date.slice(0, 10),
              rate: point.close,
              source: provider.sourceName,
              updatedAt,
            });
          }
          const last = points.at(-1);
          if (last) {
            latestByPair.push({ from, to, rate: last.close, updatedAt });
          }
        } catch (error) {
          failed.push(`${from}→${to}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (collected.length === 0) {
        throw new Error(failed.length ? `匯率取得失敗：${failed.join("；")}` : "沒有可更新的匯率。");
      }

      await repository.saveDailyFxRates(collected);

      if (latestByPair.length) {
        const settings = await repository.getAppSettings();
        const map = new Map<string, { from: string; to: string; rate: number; updatedAt: string }>(
          settings.exchangeRates.map((row) => [`${row.from}|${row.to}`, row]),
        );
        for (const row of latestByPair) {
          map.set(`${row.from}|${row.to}`, row);
        }
        await repository.updateAppSettings({ ...settings, exchangeRates: [...map.values()] });
      }

      return { saved: collected.length, failed, latestByPair };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.dailyFxRates }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
      ]);
    },
  });
}

export interface RefreshDailyPricesInput {
  tickers: string[];
  range?: string;
}

export function useRefreshDailyPrices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tickers, range = "1y" }: RefreshDailyPricesInput) => {
      if (isDemoMode()) throw new Error(DEMO_MARKET_MESSAGE);
      const provider = new YahooFinanceProvider();
      const repository = await getFinanceRepository();
      const collected: DailyPrice[] = [];
      const failed: string[] = [];
      const updatedAt = new Date().toISOString();

      const normalizedTickers = expandMarketDataSymbols(tickers);
      for (const ticker of normalizedTickers) {
        try {
          const points = await provider.fetchHistory(ticker, range, "1d");
          for (const point of points) {
            collected.push({
              ticker,
              date: point.date.slice(0, 10),
              close: point.close,
              currency: "",
              source: provider.sourceName,
              updatedAt,
            });
          }
        } catch (error) {
          failed.push(`${ticker}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (collected.length === 0) {
        throw new Error(failed.length ? `每日股價取得失敗：${failed.join("；")}` : "沒有可更新的股價。");
      }

      await repository.saveDailyPrices(collected);
      return { saved: collected.length, failed, tickers: normalizedTickers };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.dailyPrices });
    },
  });
}
