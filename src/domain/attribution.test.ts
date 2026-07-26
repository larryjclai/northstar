import { describe, expect, it } from "vitest";
import {
  buildCostBasisAttribution,
  buildReturnAttribution,
  buildPortfolioValueSeries,
  type AnalyticsPosition,
} from "./portfolioAnalytics";
import type { DailyPrice, InvestmentRecord } from "./types";

const identity = (value: number) => value;

function price(ticker: string, date: string, close: number): DailyPrice {
  return {
    ticker,
    date,
    close,
    currency: "USD",
    source: "test",
    updatedAt: `${date}T00:00:00.000Z`,
  };
}

function record(partial: Partial<InvestmentRecord>): InvestmentRecord {
  return {
    id: Math.random().toString(36).slice(2),
    spaceId: "s",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    assetId: "a",
    linkedAccountId: "acct-1",
    date: "2026-01-01",
    action: "buy",
    price: 0,
    quantity: 0,
    fee: 0,
    note: "",
    isReviewed: false,
    linkedLedgerTransactionId: null,
    cashless: false,
    ...partial,
  };
}

const dates = ["2026-01-01", "2026-01-02", "2026-01-03"];

describe("buildReturnAttribution", () => {
  const positions: AnalyticsPosition[] = [
    { assetId: "a", ticker: "AAA", quantity: 10, currency: "USD", isManual: false },
    { assetId: "b", ticker: "BBB", quantity: 5, currency: "USD", isManual: false },
  ];
  // AAA: 100 → 120 (+20/sh × 10 = +200). BBB: 50 → 40 (−10/sh × 5 = −50).
  const prices = [
    price("AAA", dates[0], 100),
    price("AAA", dates[1], 110),
    price("AAA", dates[2], 120),
    price("BBB", dates[0], 50),
    price("BBB", dates[1], 45),
    price("BBB", dates[2], 40),
  ];

  it("contributions sum to the basket's period value change", () => {
    const attr = buildReturnAttribution({
      positions,
      dailyPrices: prices,
      manualSnapshots: [],
      toPrimary: identity,
      start: dates[0],
      end: dates[2],
    });
    const { series } = buildPortfolioValueSeries({
      positions,
      dailyPrices: prices,
      manualSnapshots: [],
      toPrimary: identity,
      start: dates[0],
      end: dates[2],
    });
    const seriesChange = series[series.length - 1].value - series[0].value;
    expect(attr.total).toBeCloseTo(seriesChange, 6);
    expect(attr.total).toBeCloseTo(150, 6); // +200 − 50
  });

  it("attributes the right gain/loss per holding and sorts by magnitude", () => {
    const attr = buildReturnAttribution({
      positions,
      dailyPrices: prices,
      manualSnapshots: [],
      toPrimary: identity,
      start: dates[0],
      end: dates[2],
    });
    // Biggest mover first: AAA +200, then BBB −50.
    expect(attr.items[0].ticker).toBe("AAA");
    expect(attr.items[0].contribution).toBeCloseTo(200, 6);
    expect(attr.items[1].ticker).toBe("BBB");
    expect(attr.items[1].contribution).toBeCloseTo(-50, 6);
    // Percentages are signed shares of the net total (150).
    expect(attr.items[0].pct).toBeCloseTo((200 / 150) * 100, 4);
    expect(attr.items[1].pct).toBeCloseTo((-50 / 150) * 100, 4);
  });

  it("discloses unpriced tickers and excludes them from contributions", () => {
    const withGhost: AnalyticsPosition[] = [
      ...positions,
      { assetId: "c", ticker: "ZZZ", quantity: 3, currency: "USD", isManual: false },
    ];
    const attr = buildReturnAttribution({
      positions: withGhost,
      dailyPrices: prices,
      manualSnapshots: [],
      toPrimary: identity,
      start: dates[0],
      end: dates[2],
    });
    expect(attr.excludedTickers).toContain("ZZZ");
    expect(attr.items.some((i) => i.ticker === "ZZZ")).toBe(false);
  });
});

describe("buildCostBasisAttribution", () => {
  it("uses moving-average cost basis for unrealized P/L and per-holding return", () => {
    const positions: AnalyticsPosition[] = [
      { assetId: "a", ticker: "AAA", quantity: 15, currency: "USD", isManual: false },
      { assetId: "b", ticker: "BBB", quantity: 5, currency: "USD", isManual: false },
    ];
    const records = [
      record({ assetId: "a", date: "2026-01-01", action: "buy", price: 100, quantity: 10 }),
      record({ assetId: "a", date: "2026-01-02", action: "buy", price: 120, quantity: 5 }),
      record({ assetId: "b", date: "2026-01-01", action: "buy", price: 50, quantity: 5 }),
    ];
    const prices = [price("AAA", dates[2], 130), price("BBB", dates[2], 40)];

    const attr = buildCostBasisAttribution({
      positions,
      records,
      dailyPrices: prices,
      manualSnapshots: [],
      toPrimary: identity,
      end: dates[2],
    });

    const aaa = attr.items.find((item) => item.ticker === "AAA")!;
    expect(aaa.costBasis).toBeCloseTo(1600, 6);
    expect(aaa.marketValue).toBeCloseTo(1950, 6);
    expect(aaa.contribution).toBeCloseTo(350, 6);
    expect(aaa.pct).toBeCloseTo((350 / 1600) * 100, 6);

    const bbb = attr.items.find((item) => item.ticker === "BBB")!;
    expect(bbb.contribution).toBeCloseTo(-50, 6);
    expect(bbb.pct).toBeCloseTo(-20, 6);
    expect(attr.total).toBeCloseTo(300, 6);
  });

  it("falls back to the position currency when a daily price row has an empty currency", () => {
    // Synced daily-price rows can arrive with currency: "". Sending "" into a
    // real FX converter returns 0 (no rate) → marketValue 0 → a bogus −100%.
    // Mimic that converter: only the position currency resolves.
    const fxToPrimary = (value: number, currency: string) => (currency === "USD" ? value : 0);
    const positions: AnalyticsPosition[] = [
      { assetId: "a", ticker: "AAA", quantity: 10, currency: "USD", isManual: false },
    ];
    const records = [
      record({ assetId: "a", date: "2026-01-01", action: "buy", price: 100, quantity: 10 }),
    ];
    const emptyCurrencyPrice: DailyPrice = {
      ticker: "AAA",
      date: dates[2],
      close: 130,
      currency: "",
      source: "test",
      updatedAt: `${dates[2]}T00:00:00.000Z`,
    };

    const attr = buildCostBasisAttribution({
      positions,
      records,
      dailyPrices: [emptyCurrencyPrice],
      manualSnapshots: [],
      toPrimary: fxToPrimary,
      end: dates[2],
    });

    const aaa = attr.items[0];
    expect(aaa.marketValue).toBeCloseTo(1300, 6); // 130 × 10, NOT 0
    expect(aaa.contribution).toBeCloseTo(300, 6); // 1300 − 1000
    expect(aaa.pct).toBeCloseTo(30, 6); // not −100
  });

  it("falls back to averageCost when no transaction records exist", () => {
    const positions: AnalyticsPosition[] = [
      {
        assetId: "legacy",
        ticker: "LEG",
        quantity: 4,
        currency: "USD",
        averageCost: 25,
        isManual: true,
      },
    ];

    const attr = buildCostBasisAttribution({
      positions,
      records: [],
      dailyPrices: [price("LEG", dates[2], 30)],
      manualSnapshots: [],
      toPrimary: identity,
      end: dates[2],
    });

    expect(attr.items[0].costBasis).toBeCloseTo(100, 6);
    expect(attr.items[0].contribution).toBeCloseTo(20, 6);
    expect(attr.items[0].pct).toBeCloseTo(20, 6);
  });
});
