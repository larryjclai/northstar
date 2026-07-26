import { describe, expect, it } from "vitest";
import {
  buildCostBasisTimeline,
  buildPositionMetrics,
  buildQuantityTimeline,
  calculateXirr,
  cashflowSpanDays,
} from "./portfolioMetrics";
import type { InvestmentRecord } from "./types";

function record(partial: Partial<InvestmentRecord>): InvestmentRecord {
  return {
    id: Math.random().toString(36).slice(2),
    spaceId: "s",
    revision: 1,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    deletedAt: null,
    assetId: "asset-1",
    linkedAccountId: "acct-1",
    date: "2024-01-01",
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

describe("buildPositionMetrics (moving average)", () => {
  it("averages buy cost including fees", () => {
    const m = buildPositionMetrics([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 10, fee: 20 }),
      record({ date: "2024-02-01", action: "buy", price: 120, quantity: 10, fee: 20 }),
    ]);
    expect(m.quantity).toBe(20);
    // (1000+20 + 1200+20) / 20 = 2240/20 = 112
    expect(m.averageCost).toBeCloseTo(112, 6);
    expect(m.costBasis).toBeCloseTo(2240, 6);
  });

  it("realizes P/L at the moving-average cost, net of sell fee", () => {
    const m = buildPositionMetrics([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 10, fee: 0 }),
      record({ date: "2024-02-01", action: "sell", price: 150, quantity: 4, fee: 10 }),
    ]);
    // proceeds = 150*4 - 10 = 590; cost of 4 @ avg 100 = 400 → realized 190
    expect(m.realizedGain).toBeCloseTo(190, 6);
    expect(m.quantity).toBe(6);
    expect(m.averageCost).toBeCloseTo(100, 6);
    expect(m.costBasis).toBeCloseTo(600, 6);
  });

  it("clamps an oversell to shares held: no proceeds for phantom shares, quantity floors at 0", () => {
    const records = [
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 4, fee: 0 }),
      record({ date: "2024-02-01", action: "sell", price: 150, quantity: 10, fee: 10 }),
    ];
    const m = buildPositionMetrics(records);
    // Only 4 shares held: proceeds = 150*4 - 10 = 590 (not 150*10 - 10 = 1490).
    expect(m.quantity).toBe(0);
    expect(m.costBasis).toBeCloseTo(0, 6);
    // realized = proceeds - cost of 4 @ avg 100 = 590 - 400 = 190.
    expect(m.realizedGain).toBeCloseTo(190, 6);
    const sellFlow = m.cashflows.find((c) => c.date === "2024-02-01");
    expect(sellFlow?.amount).toBeCloseTo(590, 6);
    // The XIRR cashflow must agree with the quantity timeline (which clamps too).
    const finalQty = buildQuantityTimeline(records).reduce((sum, d) => sum + d.delta, 0);
    expect(finalQty).toBe(0);
  });

  it("stock dividend keeps total cost and lowers average", () => {
    const m = buildPositionMetrics([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 10, fee: 0 }),
      record({ date: "2024-02-01", action: "stockDividend", quantity: 2 }),
    ]);
    expect(m.quantity).toBe(12);
    expect(m.costBasis).toBeCloseTo(1000, 6);
    expect(m.averageCost).toBeCloseTo(1000 / 12, 6);
  });

  it("stock split scales quantity, not total cost", () => {
    const m = buildPositionMetrics([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 10, fee: 0 }),
      record({ date: "2024-02-01", action: "stockSplit", quantity: 2 }),
    ]);
    expect(m.quantity).toBe(20);
    expect(m.averageCost).toBeCloseTo(50, 6);
  });

  it("cash dividend (total amount, quantity 0) counts as income, not P/L", () => {
    const m = buildPositionMetrics([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 10, fee: 0 }),
      record({ date: "2024-06-01", action: "cashDividend", price: 300, quantity: 0, fee: 0 }),
    ]);
    expect(m.totalDividends).toBeCloseTo(300, 6);
    expect(m.realizedGain).toBeCloseTo(0, 6);
    expect(m.quantity).toBe(10);
  });

  it("cash dividend (legacy per-share × quantity) still totals correctly", () => {
    const m = buildPositionMetrics([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 10, fee: 0 }),
      record({ date: "2024-06-01", action: "cashDividend", price: 3, quantity: 10, fee: 0 }),
    ]);
    expect(m.totalDividends).toBeCloseTo(30, 6);
  });

  it("cash capital reduction cuts shares and returns capital (lowers basis)", () => {
    const m = buildPositionMetrics([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 100, fee: 0 }),
      // 減資20%: cancel 20 shares, return 10/share cash
      record({ date: "2024-03-01", action: "capitalReduction", price: 10, quantity: 20 }),
    ]);
    expect(m.quantity).toBe(80);
    expect(m.totalReturnOfCapital).toBeCloseTo(200, 6);
    // cost 10000 - 200 returned = 9800 over 80 shares
    expect(m.costBasis).toBeCloseTo(9800, 6);
    expect(m.averageCost).toBeCloseTo(122.5, 6);
    expect(m.realizedGain).toBeCloseTo(0, 6);
  });

  it("deficit-offset reduction (no cash) cuts shares, raises average", () => {
    const m = buildPositionMetrics([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 100, fee: 0 }),
      record({ date: "2024-03-01", action: "capitalReduction", price: 0, quantity: 20 }),
    ]);
    expect(m.quantity).toBe(80);
    expect(m.costBasis).toBeCloseTo(10000, 6);
    expect(m.averageCost).toBeCloseTo(125, 6);
  });

  it("processes a cashless opening lot before backdated transactions", () => {
    // Opening lot dated AFTER the sell (acquisitionDate unknown → falls back to
    // today). It must still settle first, else the sell hits zero inventory.
    const m = buildPositionMetrics([
      record({ id: "sell", date: "2026-05-26", action: "sell", price: 90, quantity: 2 }),
      record({
        id: "open",
        date: "2026-06-04",
        action: "buy",
        price: 88,
        quantity: 11,
        cashless: true,
      }),
    ]);
    expect(m.quantity).toBe(9);
    // The opening still contributes its −cost cashflow (anchors XIRR).
    expect(m.cashflows.some((cf) => cf.amount === -(88 * 11))).toBe(true);
  });
});

describe("buildCostBasisTimeline", () => {
  it("emits cost on buy and removes moving-average cost on sell", () => {
    const t = buildCostBasisTimeline([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 10, fee: 0 }),
      record({ date: "2024-02-01", action: "buy", price: 200, quantity: 10, fee: 0 }),
      record({ date: "2024-03-01", action: "sell", price: 300, quantity: 5, fee: 0 }),
    ]);
    expect(t).toHaveLength(3);
    expect(t[0]).toEqual({ date: "2024-01-01", delta: 1000 });
    expect(t[1]).toEqual({ date: "2024-02-01", delta: 2000 });
    // avg after two buys = 3000/20 = 150; sell 5 removes 750 of cost.
    expect(t[2]).toEqual({ date: "2024-03-01", delta: -750 });
    // Sum of deltas = remaining cost basis = matches buildPositionMetrics.
    const remaining = t.reduce((s, d) => s + d.delta, 0);
    expect(remaining).toBeCloseTo(
      buildPositionMetrics([
        record({ date: "2024-01-01", action: "buy", price: 100, quantity: 10, fee: 0 }),
        record({ date: "2024-02-01", action: "buy", price: 200, quantity: 10, fee: 0 }),
        record({ date: "2024-03-01", action: "sell", price: 300, quantity: 5, fee: 0 }),
      ]).costBasis,
      6,
    );
  });

  it("ignores stock dividends and splits (no cost change)", () => {
    const t = buildCostBasisTimeline([
      record({ date: "2024-01-01", action: "buy", price: 100, quantity: 10, fee: 0 }),
      record({ date: "2024-02-01", action: "stockSplit", quantity: 2 }),
      record({ date: "2024-03-01", action: "stockDividend", quantity: 3 }),
    ]);
    expect(t).toEqual([{ date: "2024-01-01", delta: 1000 }]);
  });
});

describe("cashflowSpanDays", () => {
  it("returns 0 for no cash flows", () => {
    expect(cashflowSpanDays([], "2025-01-01")).toBe(0);
  });

  it("measures days from the earliest flow to asOf", () => {
    const flows = [
      { date: "2025-01-10", amount: -500 },
      { date: "2025-01-01", amount: -1000 },
    ];
    expect(cashflowSpanDays(flows, "2025-01-31")).toBe(30);
  });

  it("ignores datetime suffixes (uses the date portion)", () => {
    expect(cashflowSpanDays([{ date: "2025-01-01T09:30:00Z", amount: -1 }], "2025-01-06")).toBe(5);
  });
});

describe("calculateXirr", () => {
  it("returns ~simple rate for a one-year doubling", () => {
    const r = calculateXirr([{ date: "2024-01-01", amount: -1000 }], {
      date: "2025-01-01",
      amount: 1100,
    });
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(0.1, 2);
  });

  it("annualizes a 6-month 10% gain to ~21%", () => {
    const r = calculateXirr([{ date: "2024-01-01", amount: -1000 }], {
      date: "2024-07-01",
      amount: 1100,
    });
    expect(r as number).toBeGreaterThan(0.19);
    expect(r as number).toBeLessThan(0.23);
  });

  it("counts interim dividends in the money-weighted return", () => {
    const r = calculateXirr(
      [
        { date: "2024-01-01", amount: -1000 },
        { date: "2024-06-01", amount: 50 },
      ],
      { date: "2025-01-01", amount: 1000 },
    );
    // got 50 dividend + flat price → positive return
    expect(r as number).toBeGreaterThan(0.04);
  });

  it("returns null without both an inflow and an outflow", () => {
    expect(calculateXirr([{ date: "2024-01-01", amount: -1000 }])).toBeNull();
    expect(
      calculateXirr([{ date: "2024-01-01", amount: 100 }], { date: "2025-01-01", amount: 200 }),
    ).toBeNull();
  });

  it("handles a loss", () => {
    const r = calculateXirr([{ date: "2024-01-01", amount: -1000 }], {
      date: "2025-01-01",
      amount: 800,
    });
    expect(r as number).toBeCloseTo(-0.2, 2);
  });

  // bisectXirr is the fallback path when Newton–Raphson breaks down (its
  // derivative hits zero or a non-finite value) and is not exported for
  // direct testing. This series was found by driving calculateXirr's public
  // entry point: three inflows over several years followed by one large
  // outflow is badly-conditioned enough that Newton's derivative blows up
  // partway through, forcing the bisection fallback. Plan 272.
  it("falls back to bisection when Newton's method breaks down", () => {
    const flows = [
      { date: "2020-01-01", amount: 3_000_000 },
      { date: "2021-06-01", amount: 5_000_000 },
      { date: "2022-06-01", amount: 4_000_000 },
      { date: "2023-06-01", amount: -3_500_000 },
    ];
    const r = calculateXirr(flows);
    expect(r).not.toBeNull();
    expect(Number.isFinite(r as number)).toBe(true);

    // Independently recompute NPV at the returned rate (same formula
    // calculateXirr uses internally) to confirm it's actually a root, not
    // just "not null".
    const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
    const t0 = Date.parse(sorted[0].date);
    const npvAtRate = sorted.reduce(
      (sum, f) =>
        sum +
        f.amount / Math.pow(1 + (r as number), (Date.parse(f.date) - t0) / (365 * 86_400_000)),
      0,
    );
    expect(npvAtRate).toBeCloseTo(0, 5);
  });
});
