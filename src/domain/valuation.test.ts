import { describe, expect, it } from "vitest";
import { buildDailyPriceLookup, buildManualPriceLookup, priceAssetOnDate, holdingsMarketValue } from "./valuation";
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

describe("priceAssetOnDate — custom (manually-priced) assets", () => {
  const customAsset = { id: "fund-1", ticker: "", currency: "TWD", averageCost: 100, assetType: "custom" };
  const lookup = buildDailyPriceLookup([close("2026-06-06", 58)]);

  // A manual-snapshot resolver mirroring findDailyPriceAtOrBefore: latest at/before date.
  function manualLookupFrom(snaps: Array<{ date: string; price: number; currency: string }>) {
    return (_assetId: string, date: string) => {
      let match: { price: number; currency: string } | undefined;
      for (const s of [...snaps].sort((a, b) => a.date.localeCompare(b.date))) {
        if (s.date > date) break;
        match = { price: s.price, currency: s.currency };
      }
      return match;
    };
  }

  it("uses the manual snapshot at-or-before the date with source 'manual'", () => {
    const manualPriceLookup = manualLookupFrom([
      { date: "2026-06-01", price: 110, currency: "TWD" },
      { date: "2026-06-05", price: 120, currency: "TWD" },
    ]);
    const price = priceAssetOnDate(customAsset, "2026-06-06", {
      todayIso: TODAY,
      dailyPriceLookup: lookup,
      quote: { price: 999, currency: "TWD" }, // ignored for custom assets
      manualPriceLookup,
    });
    expect(price).toEqual({ value: 120, currency: "TWD", source: "manual" });
  });

  it("never consults quote or daily close even for the current date", () => {
    const manualPriceLookup = manualLookupFrom([{ date: "2026-06-01", price: 110, currency: "TWD" }]);
    const price = priceAssetOnDate(customAsset, TODAY, {
      todayIso: TODAY,
      dailyPriceLookup: lookup,
      quote: { price: 999, currency: "TWD" },
      manualPriceLookup,
    });
    expect(price).toEqual({ value: 110, currency: "TWD", source: "manual" });
  });

  it("falls back to cost when snapshots exist only after the date", () => {
    const manualPriceLookup = manualLookupFrom([{ date: "2026-06-10", price: 130, currency: "TWD" }]);
    const price = priceAssetOnDate(customAsset, "2026-06-06", {
      todayIso: TODAY,
      dailyPriceLookup: lookup,
      manualPriceLookup,
    });
    expect(price).toEqual({ value: 100, currency: "TWD", source: "cost" });
  });

  it("falls back to cost when there are no snapshots at all", () => {
    const price = priceAssetOnDate(customAsset, TODAY, {
      todayIso: TODAY,
      dailyPriceLookup: lookup,
      manualPriceLookup: () => undefined,
    });
    expect(price).toEqual({ value: 100, currency: "TWD", source: "cost" });
  });

  it("falls back to cost when no manual lookup is provided", () => {
    const price = priceAssetOnDate(customAsset, TODAY, { todayIso: TODAY, dailyPriceLookup: lookup });
    expect(price).toEqual({ value: 100, currency: "TWD", source: "cost" });
  });

  it("regression: a normal tickered asset is unaffected (quote/close/cost order intact)", () => {
    const opts = { todayIso: TODAY, dailyPriceLookup: lookup, manualPriceLookup: () => ({ price: 7, currency: "TWD" }) };
    // Today with a quote → quote wins; the manual lookup must be ignored for non-custom.
    expect(priceAssetOnDate(asset, TODAY, { ...opts, quote: { price: 60, currency: "TWD" } }))
      .toEqual({ value: 60, currency: "TWD", source: "quote" });
    // Historical date → daily close on/before.
    expect(priceAssetOnDate(asset, "2026-06-06", opts)).toEqual({ value: 58, currency: "TWD", source: "close" });
    // No quote/close available → cost.
    expect(priceAssetOnDate(asset, "2026-05-01", { ...opts, dailyPriceLookup: buildDailyPriceLookup([]) }))
      .toEqual({ value: 50, currency: "TWD", source: "cost" });
  });
});

describe("buildManualPriceLookup", () => {
  const snaps = [
    { assetId: "a", date: "2026-06-01", price: 110, currency: "TWD" },
    { assetId: "a", date: "2026-06-05", price: 120, currency: "TWD" },
    { assetId: "b", date: "2026-06-03", price: 9 },
  ];

  it("returns the latest snapshot at-or-before the date for that asset", () => {
    const lookup = buildManualPriceLookup(snaps);
    expect(lookup("a", "2026-06-06")).toEqual({ price: 120, currency: "TWD" });
    expect(lookup("a", "2026-06-05")).toEqual({ price: 120, currency: "TWD" });
    expect(lookup("a", "2026-06-04")).toEqual({ price: 110, currency: "TWD" });
  });

  it("defaults currency to empty string when the snapshot has none", () => {
    const lookup = buildManualPriceLookup(snaps);
    expect(lookup("b", "2026-06-03")).toEqual({ price: 9, currency: "" });
  });

  it("returns undefined when only later snapshots exist", () => {
    const lookup = buildManualPriceLookup(snaps);
    expect(lookup("a", "2026-05-31")).toBeUndefined();
  });

  it("returns undefined for an unknown asset", () => {
    const lookup = buildManualPriceLookup(snaps);
    expect(lookup("z", "2026-06-06")).toBeUndefined();
  });

  it("returns undefined when there are no snapshots at all", () => {
    const lookup = buildManualPriceLookup([]);
    expect(lookup("a", "2026-06-06")).toBeUndefined();
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

  it("sums a mix of one tickered and one custom asset in primary currency", () => {
    const assets = [
      { ticker: "0050.TW", currency: "TWD", averageCost: 50, totalQuantity: 100 },
      { id: "fund-1", ticker: "", currency: "TWD", averageCost: 100, assetType: "custom", totalQuantity: 10 },
    ];
    const total = holdingsMarketValue(assets, TODAY, identity, {
      todayIso: TODAY,
      dailyPriceLookup: lookup,
      quoteFor: () => undefined, // 0050 → latest close 58 × 100 = 5800
      manualPriceLookup: (_id, _date) => ({ price: 120, currency: "TWD" }), // custom → 120 × 10 = 1200
    });
    expect(total).toBe(5800 + 1200);
  });
});
