import { describe, expect, it } from "vitest";
import { classifyLedgerGroup } from "./groupClassifier";
import type { LedgerTransaction } from "./types";

const base: LedgerTransaction = {
  id: "ledger_base",
  spaceId: "space_test",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  accountId: "acct_test",
  date: "2026-01-01T10:00",
  name: "咖啡",
  amount: -100,
  currency: "TWD",
  category: "餐飲",
  subcategory: "點心",
  merchant: "咖啡店",
  entryType: "expense",
  settlementStatus: "settled",
  note: "",
  linkedInvestmentRecordId: null,
  groupId: null,
  isReviewed: true,
  receiptAttachmentId: null,
  recurringRuleId: null,
  originalAmount: null,
  originalCurrency: null,
};

describe("ledger group classifier", () => {
  it("classifies a single row as singleton", () => {
    expect(classifyLedgerGroup([base])).toBe("singleton");
  });

  it("classifies sibling rows in one account as split", () => {
    const rows: LedgerTransaction[] = [
      { ...base, id: "a", groupId: "g", amount: -100, category: "餐飲" },
      { ...base, id: "b", groupId: "g", amount: -50, category: "交通" },
    ];
    expect(classifyLedgerGroup(rows)).toBe("split");
  });

  it("classifies two signed rows across accounts as transfer", () => {
    const rows: LedgerTransaction[] = [
      { ...base, id: "a", groupId: "g", accountId: "source", amount: -100 },
      { ...base, id: "b", groupId: "g", accountId: "dest", amount: 100 },
    ];
    expect(classifyLedgerGroup(rows)).toBe("transfer");
  });

  it("classifies a transfer with a source-side fee leg as transfer", () => {
    const rows: LedgerTransaction[] = [
      { ...base, id: "a", groupId: "g", accountId: "source", amount: -100, entryType: "transfer" },
      { ...base, id: "b", groupId: "g", accountId: "dest", amount: 100, entryType: "transfer" },
      { ...base, id: "fee", groupId: "g", accountId: "source", amount: -15, category: "手續費", entryType: "expense" },
    ];
    expect(classifyLedgerGroup(rows)).toBe("transfer");
  });
});
