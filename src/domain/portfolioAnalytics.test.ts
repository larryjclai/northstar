import { describe, expect, it } from "vitest";
import {
  alignByDate,
  allocationDriftSeries,
  annualizedVolatilityPct,
  buildBenchmarkSeries,
  buildPortfolioValueSeries,
  cumulativeReturnPct,
  dailyReturns,
  hasEnoughReturns,
  maxDrawdown,
  MIN_ANALYTICS_DAYS,
  rollingVolatilityPct,
  sharpeRatio,
  sortinoRatio,
  toCumulativeReturnSeries,
  topMovers,
  topMoversFromHistory,
  TRADING_DAYS_PER_YEAR,
  type AnalyticsPosition,
  type MoverQuote,
} from "./portfolioAnalytics";
import type { DailyPrice, ManualPriceSnapshot } from "./types";

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

  it("prices manual holdings off their snapshots", () => {
    const positions = [pos({ assetId: "m1", ticker: "MAN", quantity: 10, isManual: true })];
    const manualSnapshots = [snapshot("m1", "2024-01-01", 7), snapshot("m1", "2024-01-02", 8)];
    const { series } = buildPortfolioValueSeries({
      positions, dailyPrices: [], manualSnapshots, toPrimary: identity, start: "2024-01-01", end: "2024-01-02",
    });
    expect(series.map((p) => p.value)).toEqual([70, 80]);
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

describe("topMovers", () => {
  const quotes: MoverQuote[] = [
    { symbol: "AAA", changePercent: 1.8, name: "Alpha", marketTime: "14:30" },
    { symbol: "BBB", changePercent: -2.1, name: "Beta" },
    { symbol: "CCC", changePercent: 0.4, name: "Gamma" },
    { symbol: "ZZZ", changePercent: 5.0, name: "NotHeld" },
  ];

  it("filters to held tickers and sorts best → worst", () => {
    const movers = topMovers(quotes, ["aaa", "BBB", "ccc"]);
    expect(movers.map((m) => m.ticker)).toEqual(["AAA", "CCC", "BBB"]);
    expect(movers.map((m) => m.changePercent)).toEqual([1.8, 0.4, -2.1]);
  });
  it("respects the limit", () => {
    expect(topMovers(quotes, ["AAA", "BBB", "CCC"], { limit: 2 })).toHaveLength(2);
  });
  it("uses the name resolver, falling back to quote name then ticker", () => {
    const movers = topMovers(quotes, ["AAA"], { nameFor: () => "台積電" });
    expect(movers[0].name).toBe("台積電");
    const noName = topMovers([{ symbol: "AAA", changePercent: 1 }], ["AAA"]);
    expect(noName[0].name).toBe("AAA");
  });
  it("drops non-finite change percentages", () => {
    const movers = topMovers([{ symbol: "AAA", changePercent: NaN }], ["AAA"]);
    expect(movers).toEqual([]);
  });
});

describe("topMoversFromHistory", () => {
  it("computes day change from the last two closes, sorted best → worst", () => {
    const dailyPrices = [
      price("AAA", "2024-01-01", 100), price("AAA", "2024-01-02", 110), // +10%
      price("BBB", "2024-01-01", 50), price("BBB", "2024-01-02", 45), // −10%
      price("CCC", "2024-01-01", 20), price("CCC", "2024-01-02", 21), // +5%
      price("ZZZ", "2024-01-01", 10), price("ZZZ", "2024-01-02", 99), // not held
    ];
    const movers = topMoversFromHistory(dailyPrices, ["aaa", "BBB", "ccc"]);
    expect(movers.map((m) => m.ticker)).toEqual(["AAA", "CCC", "BBB"]);
    expect(movers[0].changePercent).toBeCloseTo(10, 6);
    expect(movers[2].changePercent).toBeCloseTo(-10, 6);
    expect(movers[0].marketTime).toBe("2024-01-02");
  });
  it("skips tickers with fewer than two closes or a non-positive prior close", () => {
    const dailyPrices = [
      price("AAA", "2024-01-02", 110), // single close
      price("BBB", "2024-01-01", 0), price("BBB", "2024-01-02", 5), // prior close 0
    ];
    expect(topMoversFromHistory(dailyPrices, ["AAA", "BBB"])).toEqual([]);
  });
  it("uses the name resolver", () => {
    const dailyPrices = [price("2330.TW", "2024-01-01", 100), price("2330.TW", "2024-01-02", 101)];
    const movers = topMoversFromHistory(dailyPrices, ["2330.TW"], { nameFor: () => "台積電" });
    expect(movers[0].name).toBe("台積電");
  });
});

describe("constants", () => {
  it("annualizes on 252 trading days", () => {
    expect(TRADING_DAYS_PER_YEAR).toBe(252);
  });
});
