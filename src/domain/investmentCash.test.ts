import { describe, expect, it } from "vitest";
import { calculateInvestmentAccountQuantity, calculateInvestmentCashDelta } from "./investmentCash";
import type { InvestmentRecord } from "./types";

const baseRecord: InvestmentRecord = {
  id: "record_base",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  assetId: "asset_test",
  linkedAccountId: "acct_test",
  date: "2026-01-01",
  action: "buy",
  price: 100,
  quantity: 10,
  fee: 0,
  note: "",
  isReviewed: false,
  linkedLedgerTransactionId: null,
  cashless: false,
};

describe("investment cash helpers", () => {
  it("calculates account cash movement for each investment action", () => {
    expect(calculateInvestmentCashDelta({ action: "buy", price: 100, quantity: 2, fee: 5 })).toBe(-205);
    expect(calculateInvestmentCashDelta({ action: "sell", price: 120, quantity: 2, fee: 3 })).toBe(237);
    expect(calculateInvestmentCashDelta({ action: "cashDividend", price: 1.5, quantity: 10, fee: 1 })).toBe(14);
    expect(calculateInvestmentCashDelta({ action: "cashDividend", price: 1500, quantity: 0, fee: 10 })).toBe(1490);
    expect(calculateInvestmentCashDelta({ action: "capitalReduction", price: 2, quantity: 10, fee: 9 })).toBe(20);
    expect(calculateInvestmentCashDelta({ action: "stockDividend", price: 0, quantity: 1, fee: 0 })).toBe(0);
    expect(calculateInvestmentCashDelta({ action: "stockSplit", price: 0, quantity: 2, fee: 0 })).toBe(0);
  });

  it("buy net cash includes fee (應收付金額)", () => {
    expect(calculateInvestmentCashDelta({ action: "buy", price: 5065, quantity: 2, fee: 8 })).toBe(-10138);
  });

  it("computes available inventory for the selected asset and account", () => {
    const records: InvestmentRecord[] = [
      baseRecord,
      { ...baseRecord, id: "sell", action: "sell", date: "2026-01-02", quantity: 3 },
      { ...baseRecord, id: "other_account", linkedAccountId: "acct_other", quantity: 99 },
      { ...baseRecord, id: "other_asset", assetId: "asset_other", quantity: 99 },
    ];

    expect(calculateInvestmentAccountQuantity(records, "asset_test", "acct_test")).toBe(7);
    expect(calculateInvestmentAccountQuantity(records, "asset_test", "acct_test", "sell")).toBe(10);
  });
});
