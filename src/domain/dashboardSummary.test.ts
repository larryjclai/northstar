import { describe, expect, it } from "vitest";
import { buildTopHoldingSummaries, calculateAvailableCash, calculateLiabilities } from "./dashboardSummary";
import type { Account, PortfolioAsset } from "./types";

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

