import { describe, expect, it } from "vitest";
import { summarizeTransactions, type SummaryTxRow } from "./transactionsSummary";

// USD -> ×30 stub so the per-row conversion is observable; TWD passes through.
const toPrimary = (amount: number, currency: string): number =>
  currency === "USD" ? amount * 30 : amount;

function row(overrides: Partial<SummaryTxRow>): SummaryTxRow {
  return {
    kind: "investment",
    actionKey: "buy",
    quantity: 1,
    price: 100,
    currency: "TWD",
    date: "2026-01-01",
    isOpeningLot: false,
    ...overrides,
  };
}

describe("summarizeTransactions", () => {
  it("aggregates buys/sells/dividends with per-row currency conversion", () => {
    const rows: SummaryTxRow[] = [
      row({ actionKey: "buy", price: 100, quantity: 2, currency: "TWD" }), // 200
      row({ actionKey: "buy", price: 10, quantity: 2, currency: "USD" }), // 20 * 30 = 600
      row({ actionKey: "sell", price: 50, quantity: 3, currency: "TWD" }), // 150
      row({ actionKey: "cashDividend", price: 40, currency: "TWD" }), // 40
    ];
    const totals = summarizeTransactions(rows, toPrimary);
    expect(totals.bought).toBe(800);
    expect(totals.sold).toBe(150);
    expect(totals.dividends).toBe(40);
    expect(totals.count).toBe(4);
  });

  it("excludes opening-lot rows from bought but still counts them", () => {
    const rows: SummaryTxRow[] = [
      row({ actionKey: "buy", price: 100, quantity: 1, isOpeningLot: true }),
      row({ actionKey: "buy", price: 50, quantity: 1, isOpeningLot: false }),
    ];
    const totals = summarizeTransactions(rows, toPrimary);
    expect(totals.bought).toBe(50);
    expect(totals.count).toBe(2);
  });

  it("counts cash rows toward count but never toward bought/sold/dividends", () => {
    const rows: SummaryTxRow[] = [
      row({ kind: "cash", actionKey: "deposit", price: 0, quantity: 0 }),
      row({ kind: "cash", actionKey: "withdraw", price: 0, quantity: 0 }),
      row({ actionKey: "buy", price: 100, quantity: 1 }),
    ];
    const totals = summarizeTransactions(rows, toPrimary);
    expect(totals.count).toBe(3);
    expect(totals.bought).toBe(100);
    expect(totals.sold).toBe(0);
    expect(totals.dividends).toBe(0);
  });

  it("uses price as the total for cashDividend (mirrors the page's gross convention)", () => {
    const rows: SummaryTxRow[] = [row({ actionKey: "cashDividend", price: 123, quantity: 999 })];
    const totals = summarizeTransactions(rows, toPrimary);
    expect(totals.dividends).toBe(123);
  });

  it("returns all zeros for empty input", () => {
    const totals = summarizeTransactions([], toPrimary);
    expect(totals).toEqual({ count: 0, bought: 0, sold: 0, dividends: 0 });
  });
});
