import { describe, expect, it } from "vitest";
import { buildReturnAttribution, buildPortfolioValueSeries, type AnalyticsPosition } from "./portfolioAnalytics";
import type { DailyPrice } from "./types";

const identity = (value: number) => value;

function price(ticker: string, date: string, close: number): DailyPrice {
  return { ticker, date, close, currency: "USD", source: "test", updatedAt: `${date}T00:00:00.000Z` };
}

const dates = ["2026-01-01", "2026-01-02", "2026-01-03"];

describe("buildReturnAttribution", () => {
  const positions: AnalyticsPosition[] = [
    { assetId: "a", ticker: "AAA", quantity: 10, currency: "USD", isManual: false },
    { assetId: "b", ticker: "BBB", quantity: 5, currency: "USD", isManual: false },
  ];
  // AAA: 100 → 120 (+20/sh × 10 = +200). BBB: 50 → 40 (−10/sh × 5 = −50).
  const prices = [
    price("AAA", dates[0], 100), price("AAA", dates[1], 110), price("AAA", dates[2], 120),
    price("BBB", dates[0], 50), price("BBB", dates[1], 45), price("BBB", dates[2], 40),
  ];

  it("contributions sum to the basket's period value change", () => {
    const attr = buildReturnAttribution({ positions, dailyPrices: prices, manualSnapshots: [], toPrimary: identity, start: dates[0], end: dates[2] });
    const { series } = buildPortfolioValueSeries({ positions, dailyPrices: prices, manualSnapshots: [], toPrimary: identity, start: dates[0], end: dates[2] });
    const seriesChange = series[series.length - 1].value - series[0].value;
    expect(attr.total).toBeCloseTo(seriesChange, 6);
    expect(attr.total).toBeCloseTo(150, 6); // +200 − 50
  });

  it("attributes the right gain/loss per holding and sorts by magnitude", () => {
    const attr = buildReturnAttribution({ positions, dailyPrices: prices, manualSnapshots: [], toPrimary: identity, start: dates[0], end: dates[2] });
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
    const withGhost: AnalyticsPosition[] = [...positions, { assetId: "c", ticker: "ZZZ", quantity: 3, currency: "USD", isManual: false }];
    const attr = buildReturnAttribution({ positions: withGhost, dailyPrices: prices, manualSnapshots: [], toPrimary: identity, start: dates[0], end: dates[2] });
    expect(attr.excludedTickers).toContain("ZZZ");
    expect(attr.items.some((i) => i.ticker === "ZZZ")).toBe(false);
  });
});
