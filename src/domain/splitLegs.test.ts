import { describe, expect, it } from "vitest";
import { buildSplitLegs, type SplitSharedFields } from "./splitLegs";

const shared: SplitSharedFields = {
  accountId: "acct_cash",
  date: "2026-07-01",
  name: "全聯採買",
  merchant: "全聯",
  currency: "TWD",
  entryType: "expense",
  settlementStatus: "settled",
  note: "週末補貨",
};

describe("buildSplitLegs", () => {
  it("builds 2 expense legs sharing groupId/legKind with negative signed amounts", () => {
    const legs = buildSplitLegs(shared, [
      { amount: 300, category: "餐飲", subcategory: "菜錢" },
      { amount: 120, category: "居住", subcategory: "日用品" },
    ], "group_test");

    expect(legs).toHaveLength(2);
    expect(legs.map((leg) => leg.amount)).toEqual([-300, -120]);
    expect(legs.every((leg) => leg.groupId === "group_test")).toBe(true);
    expect(legs.every((leg) => leg.legKind === "category")).toBe(true);
    // Shared fields copied onto every leg.
    for (const leg of legs) {
      expect(leg.accountId).toBe("acct_cash");
      expect(leg.date).toBe("2026-07-01");
      expect(leg.name).toBe("全聯採買");
      expect(leg.merchant).toBe("全聯");
      expect(leg.currency).toBe("TWD");
      expect(leg.entryType).toBe("expense");
      expect(leg.settlementStatus).toBe("settled");
      expect(leg.note).toBe("週末補貨");
      expect(leg.postDate).toBeNull();
    }
  });

  it("keeps income legs positive and preserves input order across 3 legs", () => {
    const legs = buildSplitLegs({ ...shared, entryType: "income" }, [
      { amount: 500, category: "收入", subcategory: "薪資" },
      { amount: 200, category: "收入", subcategory: "獎金" },
      { amount: 50, category: "收入", subcategory: "退款" },
    ], "group_income");

    expect(legs.map((leg) => leg.amount)).toEqual([500, 200, 50]);
    expect(legs.map((leg) => leg.subcategory)).toEqual(["薪資", "獎金", "退款"]);
  });

  it("derived total is the leg sum (no separate total input)", () => {
    const legs = buildSplitLegs(shared, [
      { amount: 300, category: "餐飲", subcategory: "" },
      { amount: 120.5, category: "交通", subcategory: "" },
    ], "group_sum");
    expect(legs.reduce((sum, leg) => sum + leg.amount, 0)).toBeCloseTo(-420.5);
  });

  it("throws on fewer than 2 legs", () => {
    expect(() => buildSplitLegs(shared, [{ amount: 100, category: "餐飲", subcategory: "" }], "g"))
      .toThrow("拆分至少需要 2 筆明細。");
    expect(() => buildSplitLegs(shared, [], "g")).toThrow("拆分至少需要 2 筆明細。");
  });

  it("throws on a zero, negative, or non-finite leg amount", () => {
    const other = { amount: 100, category: "餐飲", subcategory: "" };
    expect(() => buildSplitLegs(shared, [other, { amount: 0, category: "交通", subcategory: "" }], "g"))
      .toThrow("拆分明細金額必須大於 0。");
    expect(() => buildSplitLegs(shared, [other, { amount: -5, category: "交通", subcategory: "" }], "g"))
      .toThrow("拆分明細金額必須大於 0。");
    expect(() => buildSplitLegs(shared, [other, { amount: Number.NaN, category: "交通", subcategory: "" }], "g"))
      .toThrow("拆分明細金額必須大於 0。");
  });

  it("throws on an empty or whitespace-only category", () => {
    const other = { amount: 100, category: "餐飲", subcategory: "" };
    expect(() => buildSplitLegs(shared, [other, { amount: 50, category: "", subcategory: "" }], "g"))
      .toThrow("拆分明細必須選擇類別。");
    expect(() => buildSplitLegs(shared, [other, { amount: 50, category: "  ", subcategory: "" }], "g"))
      .toThrow("拆分明細必須選擇類別。");
  });
});
