import { describe, expect, it } from "vitest";
import { buildDividendAnalysis } from "./dividendAnalysis";
import type { InvestmentRecord } from "./types";

const identity = (value: number) => value;

function record(overrides: Partial<InvestmentRecord> & Pick<InvestmentRecord, "assetId" | "date" | "action">): InvestmentRecord {
  return {
    id: `r_${Math.random().toString(36).slice(2)}`,
    spaceId: "space", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
    linkedAccountId: null, price: 0, quantity: 0, fee: 0, note: "",
    isReviewed: false, linkedLedgerTransactionId: null, cashless: false,
    ...overrides,
  };
}

const meta = new Map([
  ["a", { ticker: "AAA", currency: "TWD" }],
  ["b", { ticker: "BBB", currency: "TWD" }],
]);

describe("buildDividendAnalysis", () => {
  it("aggregates by year and holding, net of fee, and computes TTM yield", () => {
    const records = [
      // total-amount form (quantity 0, price = total)
      record({ assetId: "a", date: "2025-08-01", action: "cashDividend", price: 1_000, quantity: 0, fee: 100 }), // 900, within TTM of 2026-06-11
      record({ assetId: "a", date: "2024-08-01", action: "cashDividend", price: 800, quantity: 0 }), // 800, older
      // per-share form (quantity > 0)
      record({ assetId: "b", date: "2026-01-15", action: "cashDividend", price: 2, quantity: 500 }), // 1000, within TTM
      // non-dividend rows ignored
      record({ assetId: "a", date: "2026-02-01", action: "buy", price: 100, quantity: 10 }),
    ];
    const r = buildDividendAnalysis({ records, assetMeta: meta, toPrimary: identity, currentMarketValue: 100_000, asOf: "2026-06-11" });

    expect(r.total).toBeCloseTo(900 + 800 + 1000, 6);
    expect(r.byYear).toEqual([
      { year: "2024", total: 800 },
      { year: "2025", total: 900 },
      { year: "2026", total: 1000 },
    ]);
    // TTM = 365 days up to 2026-06-11 → includes 2025-08-01 (900) + 2026-01-15 (1000), excludes 2024.
    expect(r.ttmTotal).toBeCloseTo(1900, 6);
    expect(r.yieldPct).toBeCloseTo((1900 / 100_000) * 100, 6); // 1.9%
    // Holdings sorted by total desc: AAA 1700, BBB 1000.
    expect(r.byHolding.map((h) => h.ticker)).toEqual(["AAA", "BBB"]);
    expect(r.byHolding[0].total).toBeCloseTo(1700, 6);
  });

  it("returns null yield when market value is unknown", () => {
    const records = [record({ assetId: "a", date: "2026-03-01", action: "cashDividend", price: 500, quantity: 0 })];
    const r = buildDividendAnalysis({ records, assetMeta: meta, toPrimary: identity, currentMarketValue: 0, asOf: "2026-06-11" });
    expect(r.yieldPct).toBeNull();
    expect(r.total).toBeCloseTo(500, 6);
  });

  it("is empty when there are no dividends", () => {
    const records = [record({ assetId: "a", date: "2026-03-01", action: "buy", price: 100, quantity: 5 })];
    const r = buildDividendAnalysis({ records, assetMeta: meta, toPrimary: identity, currentMarketValue: 5_000, asOf: "2026-06-11" });
    expect(r.byYear).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.ttmTotal).toBe(0);
  });

  it("excludes and counts a dividend whose currency has no rate (null conversion)", () => {
    // toPrimary returns null for USD (no rate), passes TWD through.
    const toPrimary = (v: number, c: string): number | null => (c === "USD" ? null : v);
    const usdMeta = new Map([
      ["a", { ticker: "AAA", currency: "TWD" }],
      ["u", { ticker: "UUU", currency: "USD" }],
    ]);
    const records = [
      record({ assetId: "a", date: "2026-02-01", action: "cashDividend", price: 1_000, quantity: 0 }), // counted
      record({ assetId: "u", date: "2026-03-01", action: "cashDividend", price: 500, quantity: 0 }), // no USD rate → excluded
    ];
    const r = buildDividendAnalysis({ records, assetMeta: usdMeta, toPrimary, currentMarketValue: 0, asOf: "2026-06-11" });
    // Only the TWD dividend counts; the USD one is excluded, not valued at 0.
    expect(r.total).toBeCloseTo(1_000, 6);
    expect(r.byHolding.map((h) => h.ticker)).toEqual(["AAA"]);
    expect(r.fxMisses.count).toBe(1);
    expect(r.fxMisses.currencies).toEqual(["USD"]);
  });

  it("reports zero fx misses when every dividend converts", () => {
    const records = [record({ assetId: "a", date: "2026-03-01", action: "cashDividend", price: 500, quantity: 0 })];
    const r = buildDividendAnalysis({ records, assetMeta: meta, toPrimary: identity, currentMarketValue: 0, asOf: "2026-06-11" });
    expect(r.total).toBeCloseTo(500, 6);
    expect(r.fxMisses).toEqual({ count: 0, currencies: [] });
  });
});
