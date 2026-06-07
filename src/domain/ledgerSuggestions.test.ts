import { describe, expect, it } from "vitest";
import { buildLedgerSuggestions } from "./ledgerSuggestions";
import type { LedgerTransaction } from "./types";

function row(id: string, merchant: string, accountId: string, category = "餐飲"): LedgerTransaction {
  return {
    id, spaceId: "space", revision: 1, createdAt: "", updatedAt: "", deletedAt: null,
    accountId, counterAccountId: null, date: "2026-06-01", name: merchant, amount: -100, currency: "TWD",
    originalAmount: null, originalCurrency: null, category, subcategory: "", merchant,
    entryType: "expense", settlementStatus: "settled", note: "", linkedInvestmentRecordId: null,
    groupId: null, isReviewed: true, receiptAttachmentId: null, recurringRuleId: null,
  };
}

describe("ledger suggestions", () => {
  it("ranks merchants and accounts from matching expense history", () => {
    const suggestions = buildLedgerSuggestions([
      row("1", "星巴克", "flygo"),
      row("2", "星巴克", "flygo"),
      row("3", "早餐店", "cash"),
      row("4", "書店", "cash", "購物"),
    ], { category: "餐飲" });
    expect(suggestions.merchants).toEqual(["星巴克", "早餐店"]);
    expect(suggestions.accountIds).toEqual(["flygo", "cash"]);
  });
});
