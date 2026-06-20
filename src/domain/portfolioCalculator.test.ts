import { describe, expect, it } from "vitest";
import { buildHoldingPositions, buildHoldingPositionsByAccount } from "./portfolioCalculator";
import { buildManualPriceLookup } from "./valuation";
import type { DailyPrice, InvestmentRecord, PortfolioAsset } from "./types";

const manualAsset: PortfolioAsset = {
  id: "asset_manual",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  ticker: "0050.TW",
  name: "元大台灣50",
  nameZh: "元大台灣50",
  nameEn: "Yuanta Taiwan 50 ETF",
  currency: "TWD",
  totalQuantity: 3000,
  averageCost: 50,
  holdingSource: "manual",
  acquisitionDate: "2026-05-24",
  assetType: null,
  sector: null,
  industry: null,
  accountId: "acct_test",
  baseQuantity: null,
};

const transactionAsset: PortfolioAsset = {
  ...manualAsset,
  id: "asset_tx",
  ticker: "QQQ",
  name: "Invesco QQQ",
  currency: "USD",
  totalQuantity: 0,
  averageCost: 450,
  holdingSource: "transactions",
  acquisitionDate: null,
};

const buyRecord: InvestmentRecord = {
  id: "inv_buy",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  assetId: "asset_tx",
  linkedAccountId: null,
  date: "2026-01-01",
  action: "buy",
  price: 450,
  quantity: 2,
  fee: 0,
  note: "",
  isReviewed: true,
  linkedLedgerTransactionId: null,
  cashless: false,
};

describe("portfolio calculator", () => {
  it("uses manual holding quantity without requiring investment records", () => {
    const [position] = buildHoldingPositions([manualAsset], [], {
      "0050.TW": { symbol: "0050.TW", price: 60, currency: "TWD" },
    });

    expect(position.quantity).toBe(3000);
    expect(position.costBasis).toBe(150000);
    expect(position.marketValue).toBe(180000);
  });

  it("derives transaction holdings from investment records", () => {
    const [position] = buildHoldingPositions([transactionAsset], [buyRecord], {
      QQQ: { symbol: "QQQ", price: 500, currency: "USD" },
    });

    expect(position.quantity).toBe(2);
    expect(position.costBasis).toBe(900);
    expect(position.unrealizedGain).toBe(100);
  });

  it("splits transaction holdings by linked account when computing per-account positions", () => {
    const schwab: InvestmentRecord = { ...buyRecord, id: "inv_schwab", linkedAccountId: "acct_schwab" };
    const firstrade: InvestmentRecord = {
      ...buyRecord,
      id: "inv_first",
      linkedAccountId: "acct_first",
      quantity: 3,
      price: 460,
    };
    const positions = buildHoldingPositionsByAccount([transactionAsset], [schwab, firstrade], {
      QQQ: { symbol: "QQQ", price: 500, currency: "USD" },
    });

    expect(positions).toHaveLength(2);
    const schwabPos = positions.find((p) => p.accountId === "acct_schwab")!;
    const firstradePos = positions.find((p) => p.accountId === "acct_first")!;
    expect(schwabPos.quantity).toBe(2);
    expect(schwabPos.marketValue).toBe(1000);
    expect(firstradePos.quantity).toBe(3);
    expect(firstradePos.costBasis).toBeCloseTo(1380);
  });

  it("treats manual holdings as one row per asset/account pair", () => {
    const positions = buildHoldingPositionsByAccount([manualAsset], [], {
      "0050.TW": { symbol: "0050.TW", price: 60, currency: "TWD" },
    });
    expect(positions).toHaveLength(1);
    expect(positions[0].accountId).toBe("acct_test");
    expect(positions[0].quantity).toBe(3000);
  });
});

describe("portfolio calculator — daily-close valuation fallback", () => {
  const closeRow = (date: string, value: number): DailyPrice => ({
    ticker: "0050.TW",
    date,
    close: value,
    currency: "TWD",
    source: "test",
    updatedAt: `${date}T00:00:00.000Z`,
  });
  const valuation = { dailyPrices: [closeRow("2026-06-06", 58)], asOf: "2026-06-08" };

  it("values an unquoted holding at its latest daily close instead of zero", () => {
    const [position] = buildHoldingPositionsByAccount([manualAsset], [], {}, valuation);
    expect(position.marketPrice).toBe(58);
    expect(position.marketValue).toBe(3000 * 58);
  });

  it("falls back to average cost (honest 0 P/L) when there is no quote or close", () => {
    const [position] = buildHoldingPositionsByAccount([manualAsset], [], {}, { dailyPrices: [], asOf: "2026-06-08" });
    expect(position.marketPrice).toBeNull();
    expect(position.marketValue).toBe(3000 * 50);
    expect(position.unrealizedGain).toBe(0);
  });

  it("still prefers a live quote over the daily close", () => {
    const [position] = buildHoldingPositionsByAccount(
      [manualAsset],
      [],
      { "0050.TW": { symbol: "0050.TW", price: 60, currency: "TWD" } },
      valuation,
    );
    expect(position.marketPrice).toBe(60);
    expect(position.marketValue).toBe(3000 * 60);
  });

  it("a manual lookup passed to a normal tickered asset is ignored (regression)", () => {
    // Adding manualPriceLookup must not change non-custom valuation: quote wins.
    const withManual = {
      ...valuation,
      manualPriceLookup: buildManualPriceLookup([
        { assetId: manualAsset.id, date: "2026-06-08", price: 7, currency: "TWD" },
      ]),
    };
    const [position] = buildHoldingPositionsByAccount(
      [manualAsset],
      [],
      { "0050.TW": { symbol: "0050.TW", price: 60, currency: "TWD" } },
      withManual,
    );
    expect(position.marketPrice).toBe(60);
    expect(position.marketValue).toBe(3000 * 60);
    // And without a quote it still uses the daily close, not the manual price.
    const [closePos] = buildHoldingPositionsByAccount([manualAsset], [], {}, withManual);
    expect(closePos.marketPrice).toBe(58);
    expect(closePos.marketValue).toBe(3000 * 58);
  });
});

describe("portfolio calculator — custom (manually-priced) assets", () => {
  const customAsset: PortfolioAsset = {
    ...manualAsset,
    id: "asset_custom",
    ticker: "",
    name: "未上市基金",
    currency: "TWD",
    totalQuantity: 10,
    averageCost: 100,
    assetType: "custom",
    accountId: "acct_test",
  };
  // A daily close exists for the (empty) ticker — must be ignored for custom assets.
  const closeRow = (date: string, value: number): DailyPrice => ({
    ticker: "",
    date,
    close: value,
    currency: "TWD",
    source: "test",
    updatedAt: `${date}T00:00:00.000Z`,
  });
  const asOf = "2026-06-08";

  it("values a custom asset from its manual snapshot (not cost, not quote/close)", () => {
    const valuation = {
      dailyPrices: [closeRow("2026-06-06", 9999)],
      asOf,
      manualPriceLookup: buildManualPriceLookup([
        { assetId: "asset_custom", date: "2026-06-05", price: 120, currency: "TWD" },
      ]),
    };
    const [position] = buildHoldingPositions([customAsset], [], { "": { symbol: "", price: 8888, currency: "TWD" } }, valuation);
    expect(position.marketPrice).toBe(120);
    expect(position.marketValue).toBe(10 * 120);
  });

  it("values a custom asset at average cost when no manual snapshot exists", () => {
    const valuation = {
      dailyPrices: [closeRow("2026-06-06", 9999)],
      asOf,
      manualPriceLookup: buildManualPriceLookup([]),
    };
    const [position] = buildHoldingPositions([customAsset], [], {}, valuation);
    expect(position.marketPrice).toBeNull();
    expect(position.marketValue).toBe(10 * 100);
    expect(position.unrealizedGain).toBe(0);
  });

  it("never values a custom asset by a quote/daily-close on its empty ticker", () => {
    const valuation = {
      dailyPrices: [closeRow("2026-06-06", 9999)],
      asOf,
      manualPriceLookup: buildManualPriceLookup([]),
    };
    // A quote keyed by the empty ticker exists but must be ignored.
    const [position] = buildHoldingPositions([customAsset], [], { "": { symbol: "", price: 8888, currency: "TWD" } }, valuation);
    expect(position.marketPrice).toBeNull();
    expect(position.marketValue).toBe(10 * 100);
  });

  it("values a custom asset per-account from its manual snapshot", () => {
    const valuation = {
      dailyPrices: [],
      asOf,
      manualPriceLookup: buildManualPriceLookup([
        { assetId: "asset_custom", date: "2026-06-05", price: 130, currency: "TWD" },
      ]),
    };
    const positions = buildHoldingPositionsByAccount([customAsset], [], {}, valuation);
    expect(positions).toHaveLength(1);
    expect(positions[0].marketPrice).toBe(130);
    expect(positions[0].marketValue).toBe(10 * 130);
  });
});
