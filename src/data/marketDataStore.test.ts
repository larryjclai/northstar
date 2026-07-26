import { describe, expect, it, vi } from "vitest";
import { createMarketDataStore } from "./marketDataStore";
import type { RepositoryData } from "./repositories";

/** Minimal RepositoryData for the market-data store context. */
function makeData(overrides: Partial<RepositoryData> = {}): RepositoryData {
  return {
    books: [],
    invoices: [],
    clients: [],
    creditGroups: [],
    accounts: [],
    ledgerTransactions: [],
    portfolioAssets: [],
    investmentRecords: [],
    recurringTransactions: [],
    recurringInvestments: [],
    marketQuotes: [],
    settings: {
      primaryCurrency: "TWD",
      categories: [],
      merchants: [],
      exchangeRates: [],
    },
    settingsRevision: 1,
    settingsUpdatedAt: "2026-01-01T00:00:00.000Z",
    dailyFxRates: [],
    dailyPrices: [],
    financialGoals: [],
    manualPriceSnapshots: [],
    syncConflicts: [],
    ...overrides,
  };
}

let _idCounter = 0;
function makeCtx(data: RepositoryData) {
  const persist = vi.fn(async () => {});
  const nowIso = () => "2026-06-15T00:00:00.000Z";
  const createId = (prefix: string) => `${prefix}_test_${++_idCounter}`;
  const ctx = {
    get data(): RepositoryData {
      return data;
    },
    set data(v: RepositoryData) {
      data = v;
    },
    persist,
    nowIso,
    createId,
  };
  return { ctx, persist };
}

describe("createMarketDataStore — listMarketQuotes / saveMarketQuotes", () => {
  it("round-trips market quotes: save then list returns stored quotes", async () => {
    const data = makeData();
    const { ctx, persist } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveMarketQuotes(
      [
        {
          symbol: "0050.TW",
          name: "元大台灣50",
          nameZh: null,
          nameEn: null,
          currency: "TWD",
          price: 200,
          change: 1,
          changePercent: 0.5,
          marketTime: "2026-06-15T06:00:00.000Z",
        },
      ],
      "yahoo",
    );

    const quotes = await store.listMarketQuotes();
    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe("0050.TW");
    expect(quotes[0].price).toBe(200);
    expect(quotes[0].source).toBe("yahoo");
    expect(quotes[0].updatedAt).toBe("2026-06-15T00:00:00.000Z");
    expect(persist).toHaveBeenCalledOnce();
  });

  it("upserts on duplicate symbol — last write wins", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveMarketQuotes(
      [
        {
          symbol: "AAPL",
          name: "Apple",
          nameZh: null,
          nameEn: null,
          currency: "USD",
          price: 100,
          change: 0,
          changePercent: 0,
          marketTime: "",
        },
      ],
      "yahoo",
    );
    await store.saveMarketQuotes(
      [
        {
          symbol: "AAPL",
          name: "Apple Inc.",
          nameZh: null,
          nameEn: null,
          currency: "USD",
          price: 150,
          change: 2,
          changePercent: 1.3,
          marketTime: "",
        },
      ],
      "yahoo",
    );

    const quotes = await store.listMarketQuotes();
    expect(quotes).toHaveLength(1);
    expect(quotes[0].price).toBe(150);
    expect(quotes[0].name).toBe("Apple Inc.");
  });

  it("propagates nameZh / nameEn to matching portfolioAssets", async () => {
    const data = makeData({
      portfolioAssets: [
        {
          id: "asset_1",
          spaceId: "space_test",
          revision: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          deletedAt: null,
          ticker: "0050.TW",
          name: "Taiwan 50",
          nameZh: null,
          nameEn: null,
          currency: "TWD",
          totalQuantity: 10,
          averageCost: 150,
          acquisitionDate: null,
          accountId: null,
          holdingSource: "transactions",
          assetType: null,
          sector: null,
          industry: null,
          baseQuantity: null,
        },
      ],
    });
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveMarketQuotes(
      [
        {
          symbol: "0050.TW",
          name: "元大台灣50",
          nameZh: "元大台灣50",
          nameEn: "Yuanta Taiwan 50",
          currency: "TWD",
          price: 200,
          change: 0,
          changePercent: 0,
          marketTime: "",
        },
      ],
      "yahoo",
    );

    // The context data.portfolioAssets should be updated in place
    expect(ctx.data.portfolioAssets[0].nameZh).toBe("元大台灣50");
    expect(ctx.data.portfolioAssets[0].nameEn).toBe("Yuanta Taiwan 50");
  });
});

describe("createMarketDataStore — saveDailyFxRates / getDailyFxRate", () => {
  it("round-trips fx rates: save then lookup returns the rate", async () => {
    const data = makeData();
    const { ctx, persist } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveDailyFxRates([
      { from: "USD", to: "TWD", date: "2026-06-10", rate: 32.5, source: "ecb", updatedAt: "" },
      { from: "USD", to: "TWD", date: "2026-06-12", rate: 33.0, source: "ecb", updatedAt: "" },
    ]);

    const rate = await store.getDailyFxRate("USD", "TWD", "2026-06-15");
    expect(rate?.rate).toBe(33.0);
    expect(rate?.date).toBe("2026-06-12");
    expect(persist).toHaveBeenCalledOnce();
  });

  it("returns the most recent rate at-or-before the requested date", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveDailyFxRates([
      { from: "JPY", to: "TWD", date: "2026-01-01", rate: 0.21, source: "manual", updatedAt: "" },
      { from: "JPY", to: "TWD", date: "2026-06-01", rate: 0.22, source: "manual", updatedAt: "" },
    ]);

    expect((await store.getDailyFxRate("JPY", "TWD", "2026-03-15"))?.rate).toBe(0.21);
    expect((await store.getDailyFxRate("JPY", "TWD", "2026-06-01"))?.rate).toBe(0.22);
  });

  it("returns null for unknown pair", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);
    expect(await store.getDailyFxRate("EUR", "TWD", "2026-06-15")).toBeNull();
  });

  it("normalizes currency codes to uppercase", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveDailyFxRates([
      { from: "usd", to: "twd", date: "2026-06-15", rate: 32, source: "manual", updatedAt: "" },
    ]);
    const rate = await store.getDailyFxRate("USD", "TWD", "2026-06-15");
    expect(rate?.rate).toBe(32);
  });

  it("listDailyFxRates filters by from/to/since", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveDailyFxRates([
      { from: "USD", to: "TWD", date: "2026-01-01", rate: 31, source: "manual", updatedAt: "" },
      { from: "USD", to: "TWD", date: "2026-06-01", rate: 32, source: "manual", updatedAt: "" },
      { from: "JPY", to: "TWD", date: "2026-06-01", rate: 0.22, source: "manual", updatedAt: "" },
    ]);

    const usdOnly = await store.listDailyFxRates({ from: "USD" });
    expect(usdOnly).toHaveLength(2);
    expect(usdOnly.every((r) => r.from === "USD")).toBe(true);

    const since = await store.listDailyFxRates({ since: "2026-06-01" });
    expect(since).toHaveLength(2);
    expect(since.every((r) => r.date >= "2026-06-01")).toBe(true);
  });
});

describe("createMarketDataStore — saveDailyPrices / getDailyPrice", () => {
  it("round-trips daily prices: save then lookup", async () => {
    const data = makeData();
    const { ctx, persist } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveDailyPrices([
      {
        ticker: "0050.TW",
        date: "2026-06-10",
        close: 195.5,
        currency: "TWD",
        source: "twse",
        updatedAt: "",
      },
      {
        ticker: "0050.TW",
        date: "2026-06-13",
        close: 200.0,
        currency: "TWD",
        source: "twse",
        updatedAt: "",
      },
    ]);

    const price = await store.getDailyPrice("0050.TW", "2026-06-15");
    expect(price?.close).toBe(200.0);
    expect(price?.date).toBe("2026-06-13");
    expect(persist).toHaveBeenCalledOnce();
  });

  it("returns the most recent price at-or-before the date", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveDailyPrices([
      {
        ticker: "AAPL",
        date: "2026-01-02",
        close: 180,
        currency: "USD",
        source: "yahoo",
        updatedAt: "",
      },
      {
        ticker: "AAPL",
        date: "2026-06-01",
        close: 200,
        currency: "USD",
        source: "yahoo",
        updatedAt: "",
      },
    ]);

    expect((await store.getDailyPrice("AAPL", "2026-03-01"))?.close).toBe(180);
    expect((await store.getDailyPrice("AAPL", "2026-06-01"))?.close).toBe(200);
  });

  it("returns null for unknown ticker", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);
    expect(await store.getDailyPrice("UNKNOWN", "2026-06-15")).toBeNull();
  });

  it("normalizes ticker to uppercase and truncates date", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveDailyPrices([
      {
        ticker: "aapl",
        date: "2026-06-15T12:00:00Z",
        close: 210,
        currency: "USD",
        source: "yahoo",
        updatedAt: "",
      },
    ]);
    const price = await store.getDailyPrice("AAPL", "2026-06-15");
    expect(price?.close).toBe(210);
    expect(price?.date).toBe("2026-06-15");
  });

  it("listDailyPrices filters by ticker and since", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.saveDailyPrices([
      {
        ticker: "AAPL",
        date: "2026-01-02",
        close: 180,
        currency: "USD",
        source: "yahoo",
        updatedAt: "",
      },
      {
        ticker: "AAPL",
        date: "2026-06-01",
        close: 200,
        currency: "USD",
        source: "yahoo",
        updatedAt: "",
      },
      {
        ticker: "MSFT",
        date: "2026-06-01",
        close: 400,
        currency: "USD",
        source: "yahoo",
        updatedAt: "",
      },
    ]);

    const aaplOnly = await store.listDailyPrices({ ticker: "AAPL" });
    expect(aaplOnly).toHaveLength(2);
    expect(aaplOnly.every((p) => p.ticker === "AAPL")).toBe(true);

    const since = await store.listDailyPrices({ since: "2026-06-01" });
    expect(since).toHaveLength(2);
  });
});

describe("createMarketDataStore — createManualPriceSnapshot / listManualPriceSnapshots / deleteManualPriceSnapshot", () => {
  it("full lifecycle: create → list → delete", async () => {
    const data = makeData();
    const { ctx, persist } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    // Create
    await store.createManualPriceSnapshot({
      assetId: "asset_1",
      date: "2026-06-10",
      price: 150,
      note: "手動估值",
    });
    await store.createManualPriceSnapshot({
      assetId: "asset_1",
      date: "2026-06-15",
      price: 155,
      note: "",
    });
    await store.createManualPriceSnapshot({
      assetId: "asset_2",
      date: "2026-06-15",
      price: 200,
      note: "",
    });

    expect(persist).toHaveBeenCalledTimes(3);

    // List all
    const all = await store.listManualPriceSnapshots();
    expect(all).toHaveLength(3);

    // List filtered by assetId — sorted by date
    const asset1 = await store.listManualPriceSnapshots({ assetId: "asset_1" });
    expect(asset1).toHaveLength(2);
    expect(asset1[0].date).toBe("2026-06-10");
    expect(asset1[1].date).toBe("2026-06-15");
    expect(asset1[0].price).toBe(150);
    expect(asset1[0].note).toBe("手動估值");

    // Snapshot shape
    const snap = asset1[0];
    expect(snap.id).toMatch(/^mps_/);
    expect(snap.assetId).toBe("asset_1");
    expect(snap.createdAt).toBe("2026-06-15T00:00:00.000Z");

    // Delete
    await store.deleteManualPriceSnapshot(snap.id);

    const afterDelete = await store.listManualPriceSnapshots({ assetId: "asset_1" });
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].date).toBe("2026-06-15");
  });

  it("delete is a no-op for unknown id", async () => {
    const data = makeData();
    const { ctx } = makeCtx(data);
    const store = createMarketDataStore(ctx);

    await store.createManualPriceSnapshot({
      assetId: "asset_1",
      date: "2026-06-15",
      price: 100,
      note: "",
    });
    await store.deleteManualPriceSnapshot("nonexistent_id");

    const all = await store.listManualPriceSnapshots();
    expect(all).toHaveLength(1);
  });
});
