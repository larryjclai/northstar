import { describe, expect, it } from "vitest";
import { buildDailyPriceLookup, priceAssetOnDate, holdingsMarketValue } from "./valuation";
import type { DailyPrice } from "./types";

const asset = { ticker: "0050.TW", currency: "TWD", averageCost: 50 };
const TODAY = "2026-06-08";

function close(date: string, value: number): DailyPrice {
  return { ticker: "0050.TW", date, close: value, currency: "TWD", source: "test", updatedAt: `${date}T00:00:00.000Z` };
}

describe("priceAssetOnDate", () => {
  const lookup = buildDailyPriceLookup([close("2026-06-02", 55), close("2026-06-06", 58)]);

  it("prefers the live quote for today", () => {
    const price = priceAssetOnDate(asset, TODAY, { todayIso: TODAY, dailyPriceLookup: lookup, quote: { price: 60, currency: "TWD" } });
    expect(price).toEqual({ value: 60, currency: "TWD", source: "quote" });
  });

  it("falls back to the latest daily close for today when there is no quote", () => {
    const price = priceAssetOnDate(asset, TODAY, { todayIso: TODAY, dailyPriceLookup: lookup });
    expect(price).toEqual({ value: 58, currency: "TWD", source: "close" });
  });

  it("falls back to average cost when neither quote nor close exists", () => {
    const empty = buildDailyPriceLookup([]);
    const price = priceAssetOnDate(asset, TODAY, { todayIso: TODAY, dailyPriceLookup: empty });
    expect(price).toEqual({ value: 50, currency: "TWD", source: "cost" });
  });

  it("ignores the live quote on a historical date and uses the close on/before it", () => {
    const price = priceAssetOnDate(asset, "2026-06-04", { todayIso: TODAY, dailyPriceLookup: lookup, quote: { price: 99, currency: "TWD" } });
    expect(price).toEqual({ value: 55, currency: "TWD", source: "close" });
  });

  it("uses average cost for a historical date predating any close", () => {
    const price = priceAssetOnDate(asset, "2026-05-01", { todayIso: TODAY, dailyPriceLookup: lookup });
    expect(price).toEqual({ value: 50, currency: "TWD", source: "cost" });
  });
});

describe("holdingsMarketValue", () => {
  const identity = (v: number) => v; // single-currency, no FX
  const lookup = buildDailyPriceLookup([close("2026-06-06", 58)]);

  it("sums each holding at its canonical price and skips zero-quantity lots", () => {
    const assets = [
      { ticker: "0050.TW", currency: "TWD", averageCost: 50, totalQuantity: 100 },
      { ticker: "2330.TW", currency: "TWD", averageCost: 600, totalQuantity: 0 },
    ];
    const total = holdingsMarketValue(assets, TODAY, identity, {
      todayIso: TODAY,
      dailyPriceLookup: lookup,
      quoteFor: (t) => (t === "0050.TW" ? undefined : { price: 700, currency: "TWD" }),
    });
    // 0050 has no quote → latest close 58 × 100; 2330 has 0 qty → skipped.
    expect(total).toBe(5800);
  });
});
