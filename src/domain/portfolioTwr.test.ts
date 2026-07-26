import { describe, expect, it } from "vitest";
import { buildPortfolioTwr, type AnalyticsPosition } from "./portfolioAnalytics";
import type { DailyPrice, InvestmentRecord } from "./types";

const identity = (value: number) => value;

/** N consecutive daily prices for one ticker starting at `from`, via `priceFn`. */
function dailySeries(
  ticker: string,
  from: string,
  n: number,
  priceFn: (i: number) => number,
): DailyPrice[] {
  const out: DailyPrice[] = [];
  const base = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < n; i += 1) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    out.push({
      ticker,
      date,
      close: priceFn(i),
      currency: "USD",
      source: "test",
      updatedAt: `${date}T00:00:00.000Z`,
    });
  }
  return out;
}

function record(
  overrides: Partial<InvestmentRecord> & Pick<InvestmentRecord, "assetId" | "date" | "action">,
): InvestmentRecord {
  return {
    id: `rec_${Math.random().toString(36).slice(2)}`,
    spaceId: "space",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    linkedAccountId: null,
    price: 0,
    quantity: 0,
    fee: 0,
    note: "",
    isReviewed: false,
    linkedLedgerTransactionId: null,
    cashless: false,
    ...overrides,
  };
}

const position: AnalyticsPosition = {
  assetId: "a",
  ticker: "AAA",
  quantity: 20,
  currency: "USD",
  isManual: false,
};

describe("buildPortfolioTwr", () => {
  it("is cash-flow neutral: a mid-window top-up does not create a return", () => {
    // Price never moves (flat 100) across 35 days → TWR must be ~0% even though
    // the portfolio's market value doubles from a mid-window purchase.
    const prices = dailySeries("AAA", "2026-01-01", 35, () => 100);
    const records = [
      record({ assetId: "a", date: "2025-12-01", action: "buy", price: 100, quantity: 10 }), // opening 10 shares
      record({ assetId: "a", date: "2026-01-15", action: "buy", price: 100, quantity: 10 }), // top-up to 20
    ];
    const twr = buildPortfolioTwr({
      positions: [position],
      records,
      dailyPrices: prices,
      toPrimary: identity,
      start: "2026-01-01",
      end: "2026-02-04",
    });

    expect(twr.observations).toBeGreaterThanOrEqual(30);
    expect(twr.twrPct).not.toBeNull();
    expect(twr.twrPct!).toBeCloseTo(0, 6);
    // The naive value-based return would be +100% (1000 → 2000); TWR rejects it.
    const naive = twr.series.at(-1)!.pct;
    expect(naive).toBeCloseTo(0, 6);
  });

  it("equals price return when there are no in-window flows", () => {
    // 10 shares held throughout; price 100 → 110 over the window → TWR ≈ +10%.
    const prices = dailySeries("AAA", "2026-01-01", 35, (i) => 100 + (10 * i) / 34);
    const records = [
      record({ assetId: "a", date: "2025-12-01", action: "buy", price: 100, quantity: 10 }),
    ];
    const twr = buildPortfolioTwr({
      positions: [{ ...position, quantity: 10 }],
      records,
      dailyPrices: prices,
      toPrimary: identity,
      start: "2026-01-01",
      end: "2026-02-04",
    });

    expect(twr.twrPct).not.toBeNull();
    expect(twr.twrPct!).toBeCloseTo(10, 4);
  });

  it("counts cash dividends as return (income added back)", () => {
    // Flat price 100, 10 shares, a $50 cash dividend mid-window. Securities value
    // never changes, so the only return is the dividend: 50 / 1000 = +5%.
    const prices = dailySeries("AAA", "2026-01-01", 35, () => 100);
    const records = [
      record({ assetId: "a", date: "2025-12-01", action: "buy", price: 100, quantity: 10 }),
      record({ assetId: "a", date: "2026-01-15", action: "cashDividend", price: 50, quantity: 0 }),
    ];
    const twr = buildPortfolioTwr({
      positions: [{ ...position, quantity: 10 }],
      records,
      dailyPrices: prices,
      toPrimary: identity,
      start: "2026-01-01",
      end: "2026-02-04",
    });

    expect(twr.twrPct).not.toBeNull();
    expect(twr.twrPct!).toBeCloseTo(5, 6);
  });

  it("ignores flows from unpriced (excluded) tickers so they can't corrupt TWR", () => {
    // AAA priced & flat → its TWR is 0%. BBB has no price history but real
    // buys/sells; its flows must not leak into the daily return (the bug that
    // produced an impossible −109% before the fix).
    const prices = dailySeries("AAA", "2026-01-01", 35, () => 100);
    const records = [
      record({ assetId: "a", date: "2025-12-01", action: "buy", price: 100, quantity: 10 }),
      record({ assetId: "b", date: "2026-01-10", action: "buy", price: 980, quantity: 50 }), // unpriced ticker
      record({ assetId: "b", date: "2026-01-20", action: "sell", price: 1100, quantity: 20 }),
    ];
    const positions: AnalyticsPosition[] = [
      { ...position, quantity: 10 },
      { assetId: "b", ticker: "BBB", quantity: 30, currency: "USD", isManual: false },
    ];
    const twr = buildPortfolioTwr({
      positions,
      records,
      dailyPrices: prices,
      toPrimary: identity,
      start: "2026-01-01",
      end: "2026-02-04",
    });

    expect(twr.excludedTickers).toContain("BBB");
    expect(twr.twrPct).not.toBeNull();
    expect(twr.twrPct!).toBeCloseTo(0, 6); // BBB's flows didn't leak in
  });

  it("gates on too-few observations and discloses unpriced tickers", () => {
    const prices = dailySeries("AAA", "2026-01-01", 5, () => 100); // only 5 days
    const records = [
      record({ assetId: "a", date: "2025-12-01", action: "buy", price: 100, quantity: 10 }),
    ];
    const twr = buildPortfolioTwr({
      positions: [{ ...position, quantity: 10 }],
      records,
      dailyPrices: prices,
      toPrimary: identity,
      start: "2026-01-01",
      end: "2026-01-05",
    });
    expect(twr.twrPct).toBeNull(); // < MIN_ANALYTICS_DAYS

    const noHistory = buildPortfolioTwr({
      positions: [{ ...position, ticker: "ZZZ" }],
      records: [],
      dailyPrices: prices,
      toPrimary: identity,
      start: "2026-01-01",
      end: "2026-02-04",
    });
    expect(noHistory.excludedTickers).toContain("ZZZ");
  });
});
