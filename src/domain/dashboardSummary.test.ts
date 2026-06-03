import { describe, expect, it } from "vitest";
import { buildOutstandingSettlements, buildTopHoldingSummaries, calculateAvailableCash, calculateLiabilities } from "./dashboardSummary";
import type { Account, LedgerTransaction, PortfolioAsset } from "./types";

function ledgerRow(overrides: Partial<LedgerTransaction>): LedgerTransaction {
  return {
    id: "tx", spaceId: "s", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
    accountId: "a", date: "2026-05-01T00:00", name: "", amount: 0, currency: "TWD",
    originalAmount: null, originalCurrency: null, category: "", subcategory: "", merchant: "",
    entryType: "expense", settlementStatus: "settled", note: "", linkedInvestmentRecordId: null,
    groupId: null, isReviewed: false, receiptAttachmentId: null, recurringRuleId: null,
    ...overrides,
  };
}

describe("buildOutstandingSettlements", () => {
  const identity = (n: number) => n;
  it("totals unsettled AR/AP and ignores settled rows", () => {
    const r = buildOutstandingSettlements([
      ledgerRow({ id: "ar1", settlementStatus: "receivable", entryType: "income", amount: 500, date: "2026-05-03T00:00" }),
      ledgerRow({ id: "ar2", settlementStatus: "receivable", entryType: "income", amount: 200, date: "2026-05-01T00:00" }),
      ledgerRow({ id: "ap1", settlementStatus: "payable", entryType: "expense", amount: -300, date: "2026-05-02T00:00" }),
      ledgerRow({ id: "s1", settlementStatus: "settled", amount: -100 }),
      ledgerRow({ id: "del", settlementStatus: "receivable", amount: 999, deletedAt: "2026-05-01" }),
    ], identity);
    expect(r.receivableTotal).toBe(700);
    expect(r.payableTotal).toBe(300);
    expect(r.receivableCount).toBe(2);
    expect(r.payableCount).toBe(1);
    // oldest first
    expect(r.items[0].id).toBe("ar2");
  });
});

const baseAccount: Account = {
  id: "acct_cash",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  name: "Cash",
  currency: "TWD",
  openingBalance: 0,
  balance: 100,
  type: "cash",
  creditLimit: null,
  creditLimitGroup: "",
  isSharedToHousehold: false,
  loanStartDate: null,
  annualInterestRate: null,
  loanTerm: null,
  iconName: null,
  color: null,
  statementDay: null,
  paymentDueDay: null,
  creditPaymentPaidUntil: null,
};

function asset(id: string, ticker: string, quantity: number, averageCost: number): PortfolioAsset {
  return {
    id,
    spaceId: "space_test",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ticker,
    name: ticker,
    nameZh: null,
    nameEn: null,
    currency: "TWD",
    totalQuantity: quantity,
    averageCost,
    holdingSource: "manual",
    acquisitionDate: null,
    assetType: null,
    sector: null,
    industry: null,
    accountId: "acct_cash",
    baseQuantity: null,
  };
}

describe("dashboard summary helpers", () => {
  it("separates available cash from liabilities", () => {
    const accounts: Account[] = [
      baseAccount,
      { ...baseAccount, id: "acct_investment", balance: 50, type: "investment" },
      { ...baseAccount, id: "acct_loan", balance: -500, type: "loan" },
      { ...baseAccount, id: "acct_credit", balance: -80, type: "credit" },
    ];

    expect(calculateAvailableCash(accounts, (amount) => amount)).toBe(150);
    expect(calculateLiabilities(accounts, (amount) => amount)).toBe(580);
  });

  it("returns the top five holdings with daily quote movement", () => {
    const assets = [
      asset("a1", "AAA", 1, 1),
      asset("a2", "BBB", 2, 1),
      asset("a3", "CCC", 3, 1),
      asset("a4", "DDD", 4, 1),
      asset("a5", "EEE", 5, 1),
      asset("a6", "FFF", 6, 1),
    ];
    const rows = buildTopHoldingSummaries(
      assets,
      assets.map((item, index) => ({
        symbol: item.ticker,
        currency: "TWD",
        price: index + 1,
        change: 0.5,
        changePercent: 1.25,
      })),
      (amount) => amount,
      5,
    );

    expect(rows).toHaveLength(5);
    expect(rows[0].asset.ticker).toBe("FFF");
    expect(rows[0].marketValue).toBe(36);
    expect(rows[0].dayChange).toBe(3);
    expect(rows[0].dayChangePercent).toBe(1.25);
    expect(rows.some((row) => row.asset.ticker === "AAA")).toBe(false);
  });
});

