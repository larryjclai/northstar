import { describe, expect, it } from "vitest";
import { buildMerchantCategoryMap } from "../domain/merchantCategory";
import type { LedgerTransaction } from "../domain";

const base: LedgerTransaction = {
  id: "x",
  spaceId: "s",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  accountId: "a",
  date: "2026-01-01T10:00",
  name: "",
  amount: -100,
  currency: "TWD",
  category: "餐飲",
  subcategory: "外食",
  merchant: "全家",
  entryType: "expense",
  settlementStatus: "settled",
  note: "",
  linkedInvestmentRecordId: null,
  groupId: null,
  isReviewed: false,
  receiptAttachmentId: null,
  recurringRuleId: null,
};

describe("buildMerchantCategoryMap", () => {
  it("maps a merchant to its most-frequent category/subcategory", () => {
    const rows: LedgerTransaction[] = [
      { ...base, id: "1", merchant: "全家", category: "餐飲", subcategory: "外食" },
      { ...base, id: "2", merchant: "全家", category: "餐飲", subcategory: "外食" },
      { ...base, id: "3", merchant: "全家", category: "生活", subcategory: "日用品" },
    ];
    const map = buildMerchantCategoryMap(rows);
    expect(map.get("全家")).toEqual({ category: "餐飲", subcategory: "外食" });
  });

  it("ignores income rows and merchant-less rows", () => {
    const rows: LedgerTransaction[] = [
      { ...base, id: "1", merchant: "公司", category: "薪資", entryType: "income" },
      { ...base, id: "2", merchant: "", category: "餐飲" },
    ];
    const map = buildMerchantCategoryMap(rows);
    expect(map.has("公司")).toBe(false);
    expect(map.size).toBe(0);
  });

  it("preserves category names that contain spaces", () => {
    const rows: LedgerTransaction[] = [
      { ...base, id: "1", merchant: "Whole Foods", category: "Food Court", subcategory: "Lunch Set" },
    ];
    const map = buildMerchantCategoryMap(rows);
    expect(map.get("Whole Foods")).toEqual({ category: "Food Court", subcategory: "Lunch Set" });
  });
});
