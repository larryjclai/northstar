import { describe, expect, it } from "vitest";
import {
  alignByDate,
  allocationDriftSeries,
  annualizedVolatilityPct,
  buildBenchmarkSeries,
  buildPortfolioValueSeries,
  buildReturnAttribution,
  cumulativeReturnPct,
  dailyReturns,
  hasEnoughReturns,
  maxDrawdown,
  MIN_ANALYTICS_DAYS,
  rollingVolatilityPct,
  sharpeRatio,
  sortinoRatio,
  toCumulativeReturnSeries,
  dayChangeMovers,
  TRADING_DAYS_PER_YEAR,
  buildSectorBreakdown,
  buildCountryBreakdown,
  type AnalyticsPosition,
  type BreakdownEntry,
} from "./portfolioAnalytics";
import type { DailyPrice, ManualPriceSnapshot } from "./types";
import { resolveSectorLabel, resolveCanonicalSectorLabel } from "./sectorLabels";
import { resolveCountryLabel, resolveHoldingCountry } from "./assetCountry";

const identity = (value: number) => value;

function price(ticker: string, date: string, close: number): DailyPrice {
  return { ticker, date, close, currency: "USD", source: "test", updatedAt: `${date}T00:00:00.000Z` };
}

function snapshot(assetId: string, date: string, p: number): ManualPriceSnapshot {
  return { id: `${assetId}-${date}`, assetId, date, price: p, note: "", createdAt: `${date}T00:00:00.000Z` };
}

function pos(partial: Partial<AnalyticsPosition>): AnalyticsPosition {
  return { assetId: "a", ticker: "AAA", quantity: 10, currency: "USD", isManual: false, ...partial };
}

describe("dailyReturns", () => {
  it("computes simple period returns", () => {
    expect(dailyReturns([100, 110, 99])).toEqual([expect.closeTo(0.1, 10), expect.closeTo(-0.1, 10)]);
  });
  it("skips steps off a non-positive prior value", () => {
    expect(dailyReturns([100, 0, 50])).toEqual([-1]); // 0→50 skipped (prev 0)
    expect(dailyReturns([100])).toEqual([]);
  });
});

describe("cumulativeReturnPct", () => {
  it("is first→last percentage", () => {
    expect(cumulativeReturnPct([100, 150])).toBeCloseTo(50, 6);
    expect(cumulativeReturnPct([200, 150])).toBeCloseTo(-25, 6);
  });
  it("is 0 for degenerate series", () => {
    expect(cumulativeReturnPct([100])).toBe(0);
    expect(cumulativeReturnPct([])).toBe(0);
  });
});

describe("toCumulativeReturnSeries", () => {
  it("indexes off the first point", () => {
    const out = toCumulativeReturnSeries([
      { date: "d1", value: 100 },
      { date: "d2", value: 120 },
      { date: "d3", value: 90 },
    ]);
    expect(out).toEqual([
      { date: "d1", pct: 0 },
      { date: "d2", pct: expect.closeTo(20, 6) },
      { date: "d3", pct: expect.closeTo(-10, 6) },
    ]);
  });
});

describe("annualizedVolatilityPct", () => {
  it("is null below two observations", () => {
    expect(annualizedVolatilityPct([])).toBeNull();
    expect(annualizedVolatilityPct([0.01])).toBeNull();
  });
  it("is 0 for constant returns", () => {
    expect(annualizedVolatilityPct([0.01, 0.01, 0.01])).toBeCloseTo(0, 9);
  });
  it("matches sample-σ × √252 for a symmetric series", () => {
    // sampleStd([±0.01]×4) = sqrt(0.0004/3) = 0.0115470; × √252 × 100 = 18.3302%
    expect(annualizedVolatilityPct([0.01, -0.01, 0.01, -0.01])).toBeCloseTo(18.3302, 3);
  });
});

describe("sharpeRatio / sortinoRatio", () => {
  it("are null below two observations or with no variance", () => {
    expect(sharpeRatio([0.01])).toBeNull();
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBeNull(); // zero σ
    expect(sortinoRatio([0.01, 0.01, 0.01])).toBeNull(); // no downside
  });
  it("Sharpe matches (annRet − rf) / annVol", () => {
    // returns [0.02,0,0.02,0]: mean 0.01 → annRet 2.52; σ 0.0115470 → annVol 0.183302
    // (2.52 − 0.025) / 0.183302 = 13.6116
    expect(sharpeRatio([0.02, 0, 0.02, 0])).toBeCloseTo(13.6116, 2);
  });
  it("Sortino exceeds Sharpe when downside dispersion < total dispersion", () => {
    const returns = [0.03, -0.01, 0.025, -0.005, 0.02, 0.01];
    const sharpe = sharpeRatio(returns)!;
    const sortino = sortinoRatio(returns)!;
    expect(sortino).toBeGreaterThan(sharpe);
  });
  it("respects the risk-free rate (higher rf → lower Sharpe)", () => {
    const returns = [0.02, 0, 0.02, 0];
    expect(sharpeRatio(returns, 0.05)!).toBeLessThan(sharpeRatio(returns, 0.0)!);
  });
});

describe("maxDrawdown", () => {
  it("finds the deepest peak-to-trough and detects recovery", () => {
    const values = [100, 120, 90, 110, 80, 130];
    const dates = ["d0", "d1", "d2", "d3", "d4", "d5"];
    const dd = maxDrawdown(values, dates);
    expect(dd.drawdownPct).toBeCloseTo(-33.3333, 3); // 80 vs peak 120
    expect(dd.peakIndex).toBe(1);
    expect(dd.troughIndex).toBe(4);
    expect(dd.peakDate).toBe("d1");
    expect(dd.troughDate).toBe("d4");
    expect(dd.recovered).toBe(true); // climbs back to 120 (reaches 130)
  });
  it("reports no recovery for a monotonic decline", () => {
    const dd = maxDrawdown([100, 80, 60]);
    expect(dd.drawdownPct).toBeCloseTo(-40, 6);
    expect(dd.peakIndex).toBe(0);
    expect(dd.troughIndex).toBe(2);
    expect(dd.recovered).toBe(false);
  });
  it("is flat for a non-declining or tiny series", () => {
    expect(maxDrawdown([100, 110, 120]).drawdownPct).toBe(0);
    expect(maxDrawdown([100]).drawdownPct).toBe(0);
  });
});

describe("rollingVolatilityPct", () => {
  it("nulls the leading window-1 points and computes the rest", () => {
    const returns = [0.01, -0.01, 0.01, -0.01, 0.01];
    const roll = rollingVolatilityPct(returns, 3);
    expect(roll.length).toBe(5);
    expect(roll[0]).toBeNull();
    expect(roll[1]).toBeNull();
    expect(roll[2]).not.toBeNull();
    expect(roll[4]).not.toBeNull();
  });
  it("is 0 across a constant window", () => {
    const roll = rollingVolatilityPct([0.01, 0.01, 0.01, 0.01], 3);
    expect(roll[2]).toBeCloseTo(0, 9);
    expect(roll[3]).toBeCloseTo(0, 9);
  });
});

describe("hasEnoughReturns", () => {
  it("gates on MIN_ANALYTICS_DAYS", () => {
    expect(hasEnoughReturns(Array(MIN_ANALYTICS_DAYS - 1).fill(0.01))).toBe(false);
    expect(hasEnoughReturns(Array(MIN_ANALYTICS_DAYS).fill(0.01))).toBe(true);
  });
});

describe("buildPortfolioValueSeries", () => {
  it("values a single tracked holding across the window", () => {
    const positions = [pos({ assetId: "a", ticker: "AAA", quantity: 10 })];
    const dailyPrices = [price("AAA", "2024-01-01", 10), price("AAA", "2024-01-02", 11), price("AAA", "2024-01-03", 12)];
    const { series, excludedTickers, coverageStart } = buildPortfolioValueSeries({
      positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-03",
    });
    expect(series.map((p) => p.value)).toEqual([100, 110, 120]);
    expect(coverageStart).toBe("2024-01-01");
    expect(excludedTickers).toEqual([]);
  });

  it("carries the last close forward over gaps", () => {
    const positions = [
      pos({ assetId: "a", ticker: "AAA", quantity: 10 }),
      pos({ assetId: "b", ticker: "BBB", quantity: 10 }),
    ];
    const dailyPrices = [
      price("AAA", "2024-01-01", 10), price("AAA", "2024-01-02", 10), price("AAA", "2024-01-03", 10),
      price("BBB", "2024-01-01", 5), price("BBB", "2024-01-03", 5), // missing 01-02
    ];
    const { series } = buildPortfolioValueSeries({
      positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-03",
    });
    // 01-02 carries BBB's 01-01 close → basket stays 150 throughout.
    expect(series.map((p) => p.value)).toEqual([150, 150, 150]);
  });

  it("trims the series to where every position can be priced", () => {
    const positions = [
      pos({ assetId: "a", ticker: "AAA", quantity: 10 }),
      pos({ assetId: "b", ticker: "BBB", quantity: 10 }),
    ];
    const dailyPrices = [
      price("AAA", "2024-01-01", 10), price("AAA", "2024-01-02", 10), price("AAA", "2024-01-03", 10),
      price("BBB", "2024-01-02", 5), price("BBB", "2024-01-03", 5), // first price only on 01-02
    ];
    const { series, coverageStart } = buildPortfolioValueSeries({
      positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-03",
    });
    expect(coverageStart).toBe("2024-01-02");
    expect(series[0].date).toBe("2024-01-02");
    expect(series.length).toBe(2);
  });

  it("excludes positions with no price history but keeps the rest", () => {
    const positions = [
      pos({ assetId: "a", ticker: "AAA", quantity: 10 }),
      pos({ assetId: "c", ticker: "CCC", quantity: 99 }), // no prices
    ];
    const dailyPrices = [price("AAA", "2024-01-01", 10), price("AAA", "2024-01-02", 20)];
    const { series, excludedTickers } = buildPortfolioValueSeries({
      positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-02",
    });
    expect(excludedTickers).toEqual(["CCC"]);
    expect(series.map((p) => p.value)).toEqual([100, 200]);
  });

  it("prices manual holdings off their snapshots when the ticker has no daily history", () => {
    const positions = [pos({ assetId: "m1", ticker: "MAN", quantity: 10, isManual: true })];
    const manualSnapshots = [snapshot("m1", "2024-01-01", 7), snapshot("m1", "2024-01-02", 8)];
    const { series } = buildPortfolioValueSeries({
      positions, dailyPrices: [], manualSnapshots, toPrimary: identity, start: "2024-01-01", end: "2024-01-02",
    });
    expect(series.map((p) => p.value)).toEqual([70, 80]);
  });

  it("prices a MANUAL holding off its ticker's daily history when available (not its lone snapshot)", () => {
    // The key manual-holding fix: a manually-tracked lot of a listed ticker uses
    // the backfilled daily_prices, so it isn't collapsed to its creation snapshot.
    const positions = [pos({ assetId: "m1", ticker: "AAA", quantity: 10, isManual: true })];
    const dailyPrices = [price("AAA", "2024-01-01", 10), price("AAA", "2024-01-02", 11), price("AAA", "2024-01-03", 12)];
    const manualSnapshots = [snapshot("m1", "2024-01-03", 99)]; // stale single snapshot, ignored
    const { series, coverageStart, excludedTickers } = buildPortfolioValueSeries({
      positions, dailyPrices, manualSnapshots, toPrimary: identity, start: "2024-01-01", end: "2024-01-03",
    });
    expect(coverageStart).toBe("2024-01-01");
    expect(series.map((p) => p.value)).toEqual([100, 110, 120]);
    expect(excludedTickers).toEqual([]);
  });

  it("applies the currency converter with the as-of date", () => {
    const positions = [pos({ assetId: "a", ticker: "AAA", quantity: 1, currency: "USD" })];
    const dailyPrices = [price("AAA", "2024-01-01", 100)];
    const toPrimary = (value: number, currency: string) => (currency === "USD" ? value * 30 : value);
    const { series } = buildPortfolioValueSeries({
      positions, dailyPrices, manualSnapshots: [], toPrimary, start: "2024-01-01", end: "2024-01-01",
    });
    expect(series[0].value).toBe(3000);
  });

  it("does not let a small new/manual holding collapse the window", () => {
    // AAA spans the whole window and dominates value; BBB is a tiny lot that
    // only starts near the end. The basket should still span AAA's full history,
    // with BBB excluded (disclosed) rather than truncating everything to 2 days.
    const positions = [
      pos({ assetId: "a", ticker: "AAA", quantity: 100 }),
      pos({ assetId: "b", ticker: "BBB", quantity: 1 }),
    ];
    const dailyPrices = [
      price("AAA", "2024-01-01", 10), price("AAA", "2024-01-02", 10), price("AAA", "2024-01-03", 10),
      price("AAA", "2024-01-04", 10), price("AAA", "2024-01-05", 10),
      price("BBB", "2024-01-04", 5), price("BBB", "2024-01-05", 5),
    ];
    const { series, excludedTickers, coverageStart } = buildPortfolioValueSeries({
      positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-05",
    });
    expect(coverageStart).toBe("2024-01-01");
    expect(series.length).toBe(5);
    expect(excludedTickers).toEqual(["BBB"]);
    expect(series.map((p) => p.value)).toEqual([1000, 1000, 1000, 1000, 1000]); // AAA only
  });

  it("keeps a late holding when it dominates basket value (window shrinks instead)", () => {
    // Here BBB is the bulk of value but only has recent history → the window
    // shrinks to where ≥70% of value is priced, rather than excluding BBB.
    const positions = [
      pos({ assetId: "a", ticker: "AAA", quantity: 1 }),
      pos({ assetId: "b", ticker: "BBB", quantity: 100 }),
    ];
    const dailyPrices = [
      price("AAA", "2024-01-01", 10), price("AAA", "2024-01-02", 10), price("AAA", "2024-01-03", 10),
      price("BBB", "2024-01-02", 50), price("BBB", "2024-01-03", 50),
    ];
    const { series, coverageStart } = buildPortfolioValueSeries({
      positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-03",
    });
    expect(coverageStart).toBe("2024-01-02"); // BBB (dominant) prices from here
    expect(series.length).toBe(2);
    expect(series[0].value).toBe(5010); // AAA 10 + BBB 5000
  });

  it("ignores zero-quantity positions", () => {
    const positions = [pos({ assetId: "a", ticker: "AAA", quantity: 0 })];
    const dailyPrices = [price("AAA", "2024-01-01", 10)];
    const { series } = buildPortfolioValueSeries({
      positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-01",
    });
    expect(series).toEqual([]);
  });
});

describe("buildReturnAttribution", () => {
  it("attributes each holding's price contribution over the window, sorted by magnitude", () => {
    const positions = [
      pos({ assetId: "a", ticker: "AAA", quantity: 10 }),
      pos({ assetId: "b", ticker: "BBB", quantity: 5 }),
    ];
    const dailyPrices = [
      price("AAA", "2024-01-01", 10), price("AAA", "2024-01-03", 13), // (13−10)×10 = +30
      price("BBB", "2024-01-01", 20), price("BBB", "2024-01-03", 18), // (18−20)×5  = −10
    ];
    const { items, total, excludedTickers } = buildReturnAttribution({
      positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-03",
    });
    expect(excludedTickers).toEqual([]);
    expect(total).toBeCloseTo(20); // +30 − 10
    // Sorted by absolute contribution: AAA (30) before BBB (10).
    expect(items.map((i) => i.ticker)).toEqual(["AAA", "BBB"]);
    expect(items[0].contribution).toBeCloseTo(30);
    expect(items[1].contribution).toBeCloseTo(-10);
    expect(items[0].pct).toBeCloseTo(150); // 30 / 20
    expect(items[1].pct).toBeCloseTo(-50); // −10 / 20
  });

  it("follows the selected window — a later start captures only the recent move", () => {
    const positions = [pos({ assetId: "a", ticker: "AAA", quantity: 10 })];
    const dailyPrices = [
      price("AAA", "2024-01-01", 10),
      price("AAA", "2024-01-02", 12),
      price("AAA", "2024-01-03", 15),
    ];
    const full = buildReturnAttribution({ positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-03" });
    const recent = buildReturnAttribution({ positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-02", end: "2024-01-03" });
    expect(full.items[0].contribution).toBeCloseTo(50);   // (15−10)×10
    expect(recent.items[0].contribution).toBeCloseTo(30); // (15−12)×10
  });
});

describe("buildBenchmarkSeries", () => {
  it("extracts one ticker's closes within the window, sorted", () => {
    const dailyPrices = [
      price("0050.TW", "2024-01-03", 130),
      price("0050.TW", "2024-01-01", 100),
      price("AAA", "2024-01-02", 999),
      price("0050.TW", "2024-01-02", 120),
      price("0050.TW", "2023-12-31", 90), // outside window
    ];
    const series = buildBenchmarkSeries(dailyPrices, "0050.tw", "2024-01-01", "2024-01-03");
    expect(series).toEqual([
      { date: "2024-01-01", value: 100 },
      { date: "2024-01-02", value: 120 },
      { date: "2024-01-03", value: 130 },
    ]);
  });
});

describe("alignByDate", () => {
  it("keeps only common dates", () => {
    const a = [{ date: "d1", value: 1 }, { date: "d2", value: 2 }, { date: "d3", value: 3 }];
    const b = [{ date: "d2", value: 20 }, { date: "d3", value: 30 }, { date: "d4", value: 40 }];
    const out = alignByDate(a, b);
    expect(out.a.map((p) => p.date)).toEqual(["d2", "d3"]);
    expect(out.b.map((p) => p.date)).toEqual(["d2", "d3"]);
  });
});

describe("allocationDriftSeries", () => {
  it("expresses each class as a % of the fixed basket over time", () => {
    const positions = [
      pos({ assetId: "a", ticker: "AAA", quantity: 10, assetClass: "Equity" }),
      pos({ assetId: "b", ticker: "BBB", quantity: 10, assetClass: "Bond" }),
    ];
    const dailyPrices = [
      price("AAA", "2024-01-01", 10), price("AAA", "2024-01-02", 20),
      price("BBB", "2024-01-01", 10), price("BBB", "2024-01-02", 10),
    ];
    const drift = allocationDriftSeries({
      positions, dailyPrices, manualSnapshots: [], toPrimary: identity, start: "2024-01-01", end: "2024-01-02",
    });
    expect(drift.classes).toEqual(["Equity", "Bond"]);
    expect(drift.data[0][0]).toBeCloseTo(50, 6); // equity 100 / 200
    expect(drift.data[0][1]).toBeCloseTo(50, 6);
    expect(drift.data[1][0]).toBeCloseTo(66.6667, 3); // equity 200 / 300
    expect(drift.data[1][1]).toBeCloseTo(33.3333, 3);
    // weights sum to 100 each date
    drift.data.forEach((row) => expect(row.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 6));
  });
});

describe("dayChangeMovers", () => {
  it("intraday: quote newer than the latest close → live vs 昨收", () => {
    // Today's close isn't recorded yet; quote is dated after the latest close.
    const dailyPrices = [
      price("AAA", "2024-01-01", 100), price("AAA", "2024-01-02", 110), // latest close 110
      price("BBB", "2024-01-01", 60), price("BBB", "2024-01-02", 50), // latest close 50
    ];
    const quotes = [
      { symbol: "AAA", price: 121, marketTime: "2024-01-03T05:30:00Z" }, // +10% vs 110
      { symbol: "BBB", price: 45, marketTime: "2024-01-03T05:30:00Z" }, // −10% vs 50
    ];
    const movers = dayChangeMovers({ dailyPrices, quotes, heldTickers: ["AAA", "BBB"] });
    expect(movers.map((m) => m.ticker)).toEqual(["AAA", "BBB"]);
    expect(movers[0].changePercent).toBeCloseTo(10, 6);
    expect(movers[1].changePercent).toBeCloseTo(-10, 6);
    expect(movers[0].marketTime).toBe("2024-01-03T05:30:00Z");
  });

  it("after close: quote same session as the latest close → current vs the prior session", () => {
    // 01-03 close (121) is recorded and the quote is also dated 01-03; the
    // reference must step back to the 01-02 close, not compare 01-03 to itself.
    const dailyPrices = [price("AAA", "2024-01-02", 110), price("AAA", "2024-01-03", 121)];
    const quotes = [{ symbol: "AAA", price: 121, marketTime: "2024-01-03T09:00:00Z" }];
    const movers = dayChangeMovers({ dailyPrices, quotes, heldTickers: ["AAA"] });
    expect(movers[0].changePercent).toBeCloseTo(10, 6);
  });

  it("weekend: Friday close (== quote) vs Thursday, not 0%", () => {
    // Saturday: latest close is Friday and the live quote is still Friday's. The
    // change must be Friday vs Thursday (the reference steps back), not 0%.
    const dailyPrices = [
      price("AAA", "2024-01-04", 100), // Thursday
      price("AAA", "2024-01-05", 105), // Friday
    ];
    const quotes = [{ symbol: "AAA", price: 105, marketTime: "2024-01-05T13:30:00Z" }]; // Friday close
    const movers = dayChangeMovers({ dailyPrices, quotes, heldTickers: ["AAA"] });
    expect(movers[0].changePercent).toBeCloseTo(5, 6); // 105 vs 100, not 0
  });

  it("no quote: falls back to the two most recent daily closes", () => {
    const dailyPrices = [price("AAA", "2024-01-01", 100), price("AAA", "2024-01-02", 90)]; // −10%
    const movers = dayChangeMovers({ dailyPrices, quotes: [], heldTickers: ["AAA"] });
    expect(movers[0].changePercent).toBeCloseTo(-10, 6);
    expect(movers[0].marketTime).toBe("2024-01-02");
  });

  it("filters to held tickers, honors limit and the name resolver", () => {
    const dailyPrices = [
      price("AAA", "2024-01-01", 100), price("AAA", "2024-01-02", 110),
      price("ZZZ", "2024-01-01", 10), price("ZZZ", "2024-01-02", 99), // not held
    ];
    const quotes = [{ symbol: "AAA", price: 121, marketTime: "2024-01-03T00:00:00Z" }];
    const movers = dayChangeMovers({ dailyPrices, quotes, heldTickers: ["AAA"], nameFor: () => "台積電" });
    expect(movers).toHaveLength(1);
    expect(movers[0].name).toBe("台積電");
  });

  it("skips a ticker with a live quote but no prior close, and ignores bad quote prices", () => {
    const dailyPrices = [price("AAA", "2024-01-03", 121)]; // only one close, no prior session
    const quotes = [
      { symbol: "AAA", price: 121, marketTime: "2024-01-03T09:00:00Z" },
      { symbol: "BBB", price: 0 }, // non-positive price ignored
    ];
    expect(dayChangeMovers({ dailyPrices, quotes, heldTickers: ["AAA", "BBB"] })).toEqual([]);
  });
});

describe("constants", () => {
  it("annualizes on 252 trading days", () => {
    expect(TRADING_DAYS_PER_YEAR).toBe(252);
  });
});

const sumValues = (entries: BreakdownEntry[]) => entries.reduce((s, e) => s + e.value, 0);

// Default opts now resolve onto the canonical (GICS-11) taxonomy. `canonicalLabelOf`
// maps a canonical key → zh label; `sectorLabelOf` is kept for the fine industry level.
const sectorOpts = {
  sectorLabelOf: (raw: string | null | undefined) => resolveSectorLabel(raw, "zh-Hant"),
  canonicalLabelOf: (key: string | null | undefined) => resolveCanonicalSectorLabel(key, "zh-Hant"),
  etfBucket: "ETF / 基金",
  unknownLabel: "未知",
  otherLabel: "其他",
};

describe("buildSectorBreakdown", () => {
  it("gives ETFs/funds the ETF bucket instead of 未知, and Σ buckets = total", () => {
    const entries: BreakdownEntry[] = [
      { position: pos({ assetId: "tsmc", ticker: "2330.TW", sector: "24", assetType: "equity" }), value: 600 },
      { position: pos({ assetId: "etf", ticker: "0050.TW", sector: null, assetType: "etf" }), value: 400 },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    const labels = b.buckets.map((x) => x.label);
    // 半導體 (TWSE 24) collapses onto the canonical 資訊科技 bucket by default.
    expect(labels).toContain("資訊科技");
    expect(labels).not.toContain("半導體業");
    expect(labels).toContain("ETF / 基金");
    expect(labels).not.toContain("未知");
    expect(b.total).toBeCloseTo(sumValues(entries));
    expect(b.buckets.reduce((s, x) => s + x.value, 0)).toBeCloseTo(b.total);
  });

  it("collapses a TW 半導體 and a US Technology holding into ONE 資訊科技 bucket", () => {
    const entries: BreakdownEntry[] = [
      { position: pos({ assetId: "tsmc", ticker: "2330.TW", sector: "24", assetType: "equity" }), value: 300 },
      { position: pos({ assetId: "nvda", ticker: "NVDA", sector: "Technology", assetType: "equity" }), value: 200 },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    const byLabel = new Map(b.buckets.map((x) => [x.label, x.value]));
    expect([...byLabel.keys()]).toEqual(["資訊科技"]); // single combined bucket
    expect(byLabel.get("資訊科技")).toBeCloseTo(500);
    expect(b.total).toBeCloseTo(500);
  });

  it("level: \"industry\" keeps the fine TWSE/Yahoo split (drill-down)", () => {
    const entries: BreakdownEntry[] = [
      { position: pos({ assetId: "tsmc", ticker: "2330.TW", sector: "24", assetType: "equity" }), value: 300 },
      { position: pos({ assetId: "nvda", ticker: "NVDA", sector: "Technology", assetType: "equity" }), value: 200 },
    ];
    const b = buildSectorBreakdown(entries, { ...sectorOpts, level: "industry" });
    const byLabel = new Map(b.buckets.map((x) => [x.label, x.value]));
    expect(byLabel.get("半導體業")).toBeCloseTo(300); // fine TWSE label
    expect(byLabel.get("資訊科技")).toBeCloseTo(200); // Yahoo Technology → zh fine label
    expect(b.total).toBeCloseTo(500);
  });

  it("derives the canonical bucket from a legacy row's raw sector when sectorCanonical is null", () => {
    const entries: BreakdownEntry[] = [
      // Old row: only the TWSE code stored, no persisted canonical key.
      { position: pos({ assetId: "old", ticker: "2882.TW", sector: "17", sectorCanonical: null, assetType: "equity" }), value: 100 },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    expect(b.buckets.map((x) => x.label)).toEqual(["金融"]); // 金融保險 (17) → 金融
  });

  it("prefers a persisted sectorCanonical key over re-deriving from raw", () => {
    const entries: BreakdownEntry[] = [
      { position: pos({ assetId: "x", ticker: "X", sector: "24", sectorCanonical: "healthcare", assetType: "equity" }), value: 100 },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    expect(b.buckets.map((x) => x.label)).toEqual(["醫療保健"]);
  });

  it("manual (locked) tag beats fetched weights beats bucket", () => {
    const entries: BreakdownEntry[] = [
      // Locked sector tag on an ETF wins even when weights are present.
      {
        position: pos({
          assetId: "m",
          ticker: "0050.TW",
          assetType: "etf",
          sector: "24",
          classificationLocked: true,
          sectorWeights: [{ sector: "17", weight: 1 }],
        }),
        value: 100,
      },
      // Trustworthy weights split across buckets when not locked.
      {
        position: pos({
          assetId: "f",
          ticker: "006208.TW",
          assetType: "etf",
          sectorWeights: [
            { sector: "24", weight: 0.7 },
            { sector: "17", weight: 0.3 },
          ],
        }),
        value: 200,
      },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    const byLabel = new Map(b.buckets.map((x) => [x.label, x.value]));
    // Manual tag (24→資訊科技) 100 + 70% of the fetched split (24→資訊科技) = 140.
    expect(byLabel.get("資訊科技")).toBeCloseTo(100 + 140);
    expect(byLabel.get("金融")).toBeCloseTo(60); // 30% of 200, 17→金融
    expect(b.total).toBeCloseTo(300);
    expect(b.buckets.reduce((s, x) => s + x.value, 0)).toBeCloseTo(b.total);
  });

  it("renormalizes partial weights with an 其他 remainder, preserving Σ = value", () => {
    const entries: BreakdownEntry[] = [
      {
        position: pos({
          assetId: "f",
          ticker: "0056.TW",
          assetType: "etf",
          sectorWeights: [
            { sector: "24", weight: 0.6 },
            { sector: "17", weight: 0.2 },
          ], // coverage 0.8 < 1 → 20% remainder
        }),
        value: 100,
      },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    const byLabel = new Map(b.buckets.map((x) => [x.label, x.value]));
    expect(byLabel.get("資訊科技")).toBeCloseTo(60); // 24→資訊科技
    expect(byLabel.get("金融")).toBeCloseTo(20); // 17→金融
    expect(byLabel.get("其他")).toBeCloseTo(20);
    expect(b.buckets.reduce((s, x) => s + x.value, 0)).toBeCloseTo(100);
  });

  it("low-coverage weights are not trusted → ETF bucket", () => {
    const entries: BreakdownEntry[] = [
      {
        position: pos({
          assetId: "f",
          ticker: "00xx.TW",
          assetType: "etf",
          sectorWeights: [{ sector: "24", weight: 0.1 }], // below default 0.5 coverage
        }),
        value: 100,
      },
    ];
    const b = buildSectorBreakdown(entries, sectorOpts);
    expect(b.buckets.map((x) => x.label)).toEqual(["ETF / 基金"]);
    expect(b.buckets[0].value).toBeCloseTo(100);
  });
});

describe("buildCountryBreakdown", () => {
  it("attributes each direct holding to its listing country; Σ = total", () => {
    const entries: BreakdownEntry[] = [
      { position: pos({ ticker: "2330.TW", currency: "TWD" }), value: 500 },
      { position: pos({ ticker: "AAPL", currency: "USD" }), value: 300 },
      { position: pos({ ticker: "7203.T", currency: "JPY" }), value: 200 },
    ];
    const b = buildCountryBreakdown(entries, {
      countryOf: (p) => resolveCountryLabel(resolveHoldingCountry(p.ticker, p.currency), "zh-Hant"),
    });
    const byLabel = new Map(b.buckets.map((x) => [x.label, x.value]));
    expect(byLabel.get("台灣")).toBeCloseTo(500);
    expect(byLabel.get("美國")).toBeCloseTo(300);
    expect(byLabel.get("日本")).toBeCloseTo(200);
    expect(b.total).toBeCloseTo(1000);
    expect(b.buckets.reduce((s, x) => s + x.value, 0)).toBeCloseTo(b.total);
  });
});
