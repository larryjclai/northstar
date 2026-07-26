/**
 * Market-data persistence store.
 *
 * Extracted from BrowserFinanceRepository (repositories.ts) as the first seam
 * in the repositories.ts refactor (plan 009). The store is pure delegation —
 * it receives the shared-state reference via `ctx.data` (a getter/setter on the
 * owning repository) and calls `ctx.persist` rather than owning storage itself.
 *
 * The TauriSqlFinanceRepository continues to override the 11 methods at the
 * class level (SQLite path); this module only covers the in-memory / IndexedDB
 * path used by BrowserFinanceRepository.
 *
 * IMPORTANT: All methods read/write `ctx.data` rather than destructuring it,
 * because `BrowserFinanceRepository.data` is reassigned during `initialize()`
 * and `loadDataForTests()`. Using `ctx.data` through a getter/setter pair keeps
 * the store in sync with the live reference without copying.
 */

import type {
  DailyFxRate,
  DailyPrice,
  DailyPriceSeriesRow,
  ManualPriceSnapshot,
} from "../domain/types";
import type { MarketQuote } from "../features/market-data";
import type { ManualPriceSnapshotDraft, RepositoryData, StoredMarketQuote } from "./repositories";

export interface MarketDataStoreContext {
  /**
   * Getter/setter pointing at the repository's live data object. The store
   * always accesses `ctx.data` (never a captured snapshot) so that data
   * reassignments in initialize() / loadDataForTests() are visible.
   *
   * Typed as the full RepositoryData so the getter/setter pair in
   * BrowserFinanceRepository can bind `self.data` without a cast. The store
   * only touches the market-data and portfolioAssets slices at runtime.
   */
  data: RepositoryData;
  persist: () => Promise<void>;
  nowIso: () => string;
  createId: (prefix: string) => string;
}

export function createMarketDataStore(ctx: MarketDataStoreContext) {
  return {
    async listMarketQuotes(): Promise<StoredMarketQuote[]> {
      return ctx.data.marketQuotes;
    },

    async saveMarketQuotes(quotes: MarketQuote[], source: string): Promise<void> {
      const updatedAt = ctx.nowIso();
      const next = new Map(ctx.data.marketQuotes.map((quote) => [quote.symbol, quote]));
      for (const quote of quotes) {
        next.set(quote.symbol, { ...quote, source, updatedAt });
      }
      ctx.data.marketQuotes = [...next.values()];
      // Propagate localized names to any matching portfolio assets so
      // displayName() can pick zh / en based on user preference later.
      const bySymbol = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
      ctx.data.portfolioAssets = ctx.data.portfolioAssets.map((asset) => {
        const match = bySymbol.get(asset.ticker.toUpperCase());
        if (!match) return asset;
        const nameZh = match.nameZh ?? asset.nameZh ?? null;
        const nameEn = match.nameEn ?? asset.nameEn ?? null;
        if (nameZh === asset.nameZh && nameEn === asset.nameEn) return asset;
        return { ...asset, nameZh, nameEn };
      });
      await ctx.persist();
    },

    async listDailyFxRates(filter?: {
      from?: string;
      to?: string;
      since?: string;
    }): Promise<DailyFxRate[]> {
      const from = filter?.from?.toUpperCase();
      const to = filter?.to?.toUpperCase();
      const since = filter?.since;
      return ctx.data.dailyFxRates
        .filter((row) => (from ? row.from === from : true))
        .filter((row) => (to ? row.to === to : true))
        .filter((row) => (since ? row.date >= since : true))
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async saveDailyFxRates(rates: DailyFxRate[]): Promise<void> {
      if (!rates.length) return;
      const updatedAt = ctx.nowIso();
      const map = new Map<string, DailyFxRate>(
        ctx.data.dailyFxRates.map((row) => [`${row.from}|${row.to}|${row.date}`, row]),
      );
      for (const rate of rates) {
        const normalized: DailyFxRate = {
          from: rate.from.toUpperCase(),
          to: rate.to.toUpperCase(),
          date: rate.date.slice(0, 10),
          rate: Number(rate.rate),
          source: rate.source || "manual",
          updatedAt: rate.updatedAt || updatedAt,
        };
        if (
          !normalized.from ||
          !normalized.to ||
          !Number.isFinite(normalized.rate) ||
          normalized.rate <= 0
        )
          continue;
        map.set(`${normalized.from}|${normalized.to}|${normalized.date}`, normalized);
      }
      ctx.data.dailyFxRates = [...map.values()];
      await ctx.persist();
    },

    async getDailyFxRate(from: string, to: string, date: string): Promise<DailyFxRate | null> {
      const target = date.slice(0, 10);
      const fromCode = from.toUpperCase();
      const toCode = to.toUpperCase();
      const matches = ctx.data.dailyFxRates
        .filter((row) => row.from === fromCode && row.to === toCode && row.date <= target)
        .sort((a, b) => b.date.localeCompare(a.date));
      return matches[0] ?? null;
    },

    async listDailyPrices(filter?: { ticker?: string; since?: string }): Promise<DailyPrice[]> {
      const ticker = filter?.ticker?.toUpperCase();
      const since = filter?.since;
      return ctx.data.dailyPrices
        .filter((row) => (ticker ? row.ticker === ticker : true))
        .filter((row) => (since ? row.date >= since : true))
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    /**
     * Startup path: the four columns readers use. See DailyPriceSeriesRow.
     * NOT interchangeable with listDailyPrices() — that one feeds
     * exportSnapshot() and must keep returning full rows (plan 273).
     */
    async listDailyPriceSeries(filter?: {
      ticker?: string;
      since?: string;
    }): Promise<DailyPriceSeriesRow[]> {
      const ticker = filter?.ticker?.toUpperCase();
      const since = filter?.since;
      return ctx.data.dailyPrices
        .filter((row) => (ticker ? row.ticker === ticker : true))
        .filter((row) => (since ? row.date >= since : true))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((row) => ({
          ticker: row.ticker,
          date: row.date,
          close: row.close,
          currency: row.currency,
        }));
    },

    async saveDailyPrices(prices: DailyPrice[]): Promise<void> {
      if (!prices.length) return;
      const updatedAt = ctx.nowIso();
      const map = new Map<string, DailyPrice>(
        ctx.data.dailyPrices.map((row) => [`${row.ticker}|${row.date}`, row]),
      );
      for (const price of prices) {
        const normalized: DailyPrice = {
          ticker: price.ticker.toUpperCase(),
          date: price.date.slice(0, 10),
          close: Number(price.close),
          currency: price.currency || "",
          source: price.source || "manual",
          updatedAt: price.updatedAt || updatedAt,
        };
        if (
          !normalized.ticker ||
          !normalized.date ||
          !Number.isFinite(normalized.close) ||
          normalized.close <= 0
        )
          continue;
        map.set(`${normalized.ticker}|${normalized.date}`, normalized);
      }
      ctx.data.dailyPrices = [...map.values()];
      await ctx.persist();
    },

    async getDailyPrice(ticker: string, date: string): Promise<DailyPrice | null> {
      const target = date.slice(0, 10);
      const code = ticker.toUpperCase();
      const matches = ctx.data.dailyPrices
        .filter((row) => row.ticker === code && row.date <= target)
        .sort((a, b) => b.date.localeCompare(a.date));
      return matches[0] ?? null;
    },

    async listManualPriceSnapshots(filter?: { assetId?: string }): Promise<ManualPriceSnapshot[]> {
      return ctx.data.manualPriceSnapshots
        .filter((row) => (filter?.assetId ? row.assetId === filter.assetId : true))
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async createManualPriceSnapshot(input: ManualPriceSnapshotDraft): Promise<void> {
      ctx.data.manualPriceSnapshots.push({
        id: ctx.createId("mps"),
        assetId: input.assetId,
        date: input.date.slice(0, 10),
        price: input.price,
        note: input.note,
        createdAt: ctx.nowIso(),
      });
      await ctx.persist();
    },

    async deleteManualPriceSnapshot(id: string): Promise<void> {
      ctx.data.manualPriceSnapshots = ctx.data.manualPriceSnapshots.filter((row) => row.id !== id);
      await ctx.persist();
    },
  };
}

export type MarketDataStore = ReturnType<typeof createMarketDataStore>;
