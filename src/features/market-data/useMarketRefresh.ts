import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../data/hooks";
import { getFinanceRepository } from "../../data/repositories";
import type { DailyFxRate, DailyPrice } from "../../domain/types";
import { YahooFinanceProvider } from "./yahooFinanceProvider";

export function useRefreshQuotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (symbols: string[]) => {
      const provider = new YahooFinanceProvider();
      const repository = await getFinanceRepository();
      const quotesBySymbol = await provider.fetchQuotes(symbols);
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

export interface RefreshFxRatesInput {
  pairs: Array<{ from: string; to: string }>;
  range?: string;
}

export function useRefreshFxRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pairs, range = "1y" }: RefreshFxRatesInput) => {
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
      const provider = new YahooFinanceProvider();
      const repository = await getFinanceRepository();
      const collected: DailyPrice[] = [];
      const failed: string[] = [];
      const updatedAt = new Date().toISOString();

      const normalizedTickers = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
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
