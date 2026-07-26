import { describe, expect, it } from "vitest";
import { trailingMonthlyExpense, coverageRatioPct, runwayMonths } from "./northstarMetrics";
import type { LedgerTransaction } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const identity = (amount: number) => amount;

function row(overrides: Partial<LedgerTransaction>): LedgerTransaction {
  return {
    id: "tx",
    spaceId: "s",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    accountId: "a",
    counterAccountId: null,
    date: "2026-05-01T00:00",
    name: "",
    amount: -100,
    currency: "TWD",
    originalAmount: null,
    originalCurrency: null,
    category: "",
    subcategory: "",
    merchant: "",
    entryType: "expense",
    settlementStatus: "settled",
    note: "",
    linkedInvestmentRecordId: null,
    groupId: null,
    isReviewed: false,
    receiptAttachmentId: null,
    recurringRuleId: null,
    ...overrides,
  };
}

// toPrimary that accepts (amount, currency, asOf?) — identity for single-currency tests
const toPrimary = (amount: number, _currency: string, _asOf?: string) => amount;

// ---------------------------------------------------------------------------
// trailingMonthlyExpense
// ---------------------------------------------------------------------------

describe("trailingMonthlyExpense", () => {
  it("averages 3 trailing whole months (excluding current month)", () => {
    // asOf = 2026-06-15 → trailing months: 2026-03, 2026-04, 2026-05
    const rows = [
      row({ id: "m3", date: "2026-03-10T00:00", amount: -600 }),
      row({ id: "m4", date: "2026-04-15T00:00", amount: -300 }),
      row({ id: "m5a", date: "2026-05-05T00:00", amount: -200 }),
      row({ id: "m5b", date: "2026-05-20T00:00", amount: -100 }),
      // Current month — must be excluded
      row({ id: "m6", date: "2026-06-01T00:00", amount: -999 }),
      // Too old — outside the 3-month window
      row({ id: "m2", date: "2026-02-28T00:00", amount: -500 }),
    ];
    // Total in window: 600 + 300 + 200 + 100 = 1200 → avg = 400
    expect(trailingMonthlyExpense(rows, toPrimary, "2026-06-15", 3)).toBe(400);
  });

  it("excludes unsettled rows", () => {
    const rows = [
      row({ id: "settled", date: "2026-05-10T00:00", amount: -300 }),
      row({
        id: "unsettled",
        date: "2026-05-10T00:00",
        amount: -900,
        settlementStatus: "receivable",
      }),
    ];
    expect(trailingMonthlyExpense(rows, toPrimary, "2026-06-01", 3)).toBeCloseTo(100); // 300/3
  });

  it("excludes income rows", () => {
    const rows = [
      row({ id: "exp", date: "2026-05-01T00:00", amount: -300 }),
      row({ id: "inc", date: "2026-05-01T00:00", amount: 1000, entryType: "income" }),
    ];
    expect(trailingMonthlyExpense(rows, toPrimary, "2026-06-01", 3)).toBeCloseTo(100);
  });

  it("excludes transfer (neutral) rows", () => {
    const rows = [
      row({ id: "exp", date: "2026-05-01T00:00", amount: -300 }),
      row({ id: "xfer", date: "2026-05-01T00:00", amount: -1000, entryType: "transfer" }),
    ];
    expect(trailingMonthlyExpense(rows, toPrimary, "2026-06-01", 3)).toBeCloseTo(100);
  });

  it("excludes counterAccountId pass-through rows (neutral)", () => {
    const rows = [
      row({ id: "exp", date: "2026-05-01T00:00", amount: -300 }),
      row({
        id: "passthru",
        date: "2026-05-01T00:00",
        amount: -500,
        counterAccountId: "other-acct",
      }),
    ];
    expect(trailingMonthlyExpense(rows, toPrimary, "2026-06-01", 3)).toBeCloseTo(100);
  });

  it("excludes deleted rows", () => {
    const rows = [
      row({ id: "exp", date: "2026-05-01T00:00", amount: -300 }),
      row({ id: "del", date: "2026-05-01T00:00", amount: -900, deletedAt: "2026-05-02" }),
    ];
    expect(trailingMonthlyExpense(rows, toPrimary, "2026-06-01", 3)).toBeCloseTo(100);
  });

  it("refunds (positive-amount expense) net down the month's spend", () => {
    const rows = [
      row({ id: "exp", date: "2026-05-01T00:00", amount: -600 }),
      row({ id: "refund", date: "2026-05-15T00:00", amount: 150 }), // expense refund
    ];
    // Net = 600 - 150 = 450 → avg over 3 = 150
    expect(trailingMonthlyExpense(rows, toPrimary, "2026-06-01", 3)).toBeCloseTo(150);
  });

  it("returns 0 when there are no qualifying rows", () => {
    expect(trailingMonthlyExpense([], toPrimary, "2026-06-01", 3)).toBe(0);
  });

  it("uses only 1 trailing month when months=1", () => {
    const rows = [
      row({ id: "m5", date: "2026-05-10T00:00", amount: -900 }),
      row({ id: "m4", date: "2026-04-10T00:00", amount: -300 }), // outside 1-month window
    ];
    expect(trailingMonthlyExpense(rows, toPrimary, "2026-06-01", 1)).toBe(900);
  });

  it("handles month boundary correctly at month start (asOf = first of month)", () => {
    // asOf = 2026-06-01 → current month = 2026-06 → trailing: 2026-03, 2026-04, 2026-05
    const rows = [
      row({ id: "m5", date: "2026-05-31T00:00", amount: -300 }),
      row({ id: "m6", date: "2026-06-01T00:00", amount: -999 }), // current month → excluded
    ];
    expect(trailingMonthlyExpense(rows, toPrimary, "2026-06-01", 3)).toBeCloseTo(100);
  });
});

// ---------------------------------------------------------------------------
// coverageRatioPct
// ---------------------------------------------------------------------------

describe("coverageRatioPct", () => {
  it("computes coverage as ttmIncome / annualExpense * 100", () => {
    // 120_000 passive income / 240_000 annual expense = 50%
    expect(coverageRatioPct(120_000, 240_000)).toBeCloseTo(50);
  });

  it("returns > 100 when income exceeds expense", () => {
    expect(coverageRatioPct(300_000, 240_000)).toBeCloseTo(125);
  });

  it("returns null when annualExpense is 0", () => {
    expect(coverageRatioPct(120_000, 0)).toBeNull();
  });

  it("returns null when annualExpense is negative", () => {
    expect(coverageRatioPct(120_000, -1)).toBeNull();
  });

  it("returns 0 when ttmPassiveIncome is 0 and expense > 0", () => {
    expect(coverageRatioPct(0, 240_000)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runwayMonths
// ---------------------------------------------------------------------------

describe("runwayMonths", () => {
  it("divides liquid assets by monthly expense", () => {
    // 600_000 liquid / 20_000 monthly = 30 months
    expect(runwayMonths(600_000, 20_000)).toBeCloseTo(30);
  });

  it("returns null when monthlyExpense is 0", () => {
    expect(runwayMonths(600_000, 0)).toBeNull();
  });

  it("returns null when monthlyExpense is negative", () => {
    expect(runwayMonths(600_000, -1)).toBeNull();
  });

  it("returns 0 when liquidAssets is 0 and expense > 0", () => {
    expect(runwayMonths(0, 20_000)).toBe(0);
  });

  it("handles fractional months", () => {
    expect(runwayMonths(10_000, 30_000)).toBeCloseTo(1 / 3);
  });
});

// ---------------------------------------------------------------------------
// Integration: trailingMonthlyExpense → coverageRatioPct + runwayMonths
// ---------------------------------------------------------------------------

describe("integrated metric calculation", () => {
  it("coverage and runway compose correctly from trailing expense", () => {
    // 3 months totalling 150_000 (50_000/month avg)
    const rows = [
      row({ id: "m3", date: "2026-03-10T00:00", amount: -50_000 }),
      row({ id: "m4", date: "2026-04-10T00:00", amount: -50_000 }),
      row({ id: "m5", date: "2026-05-10T00:00", amount: -50_000 }),
    ];
    const monthlyExp = trailingMonthlyExpense(rows, toPrimary, "2026-06-15", 3);
    expect(monthlyExp).toBeCloseTo(50_000);

    const annualExp = monthlyExp * 12; // 600_000
    // TTM dividends = 300_000 → coverage = 50%
    expect(coverageRatioPct(300_000, annualExp)).toBeCloseTo(50);
    // Liquid assets = 1_500_000 → runway = 30 months
    expect(runwayMonths(1_500_000, monthlyExp)).toBeCloseTo(30);
  });
});
