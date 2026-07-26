import { describe, expect, it } from "vitest";
import { buildSplitLegs, type SplitSharedFields, type SplitShareInput } from "./splitLegs";

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
    const legs = buildSplitLegs(
      shared,
      [
        { amount: 300, category: "餐飲", subcategory: "菜錢" },
        { amount: 120, category: "居住", subcategory: "日用品" },
      ],
      "group_test",
    );

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
    const legs = buildSplitLegs(
      { ...shared, entryType: "income" },
      [
        { amount: 500, category: "收入", subcategory: "薪資" },
        { amount: 200, category: "收入", subcategory: "獎金" },
        { amount: 50, category: "收入", subcategory: "退款" },
      ],
      "group_income",
    );

    expect(legs.map((leg) => leg.amount)).toEqual([500, 200, 50]);
    expect(legs.map((leg) => leg.subcategory)).toEqual(["薪資", "獎金", "退款"]);
  });

  it("derived total is the leg sum (no separate total input)", () => {
    const legs = buildSplitLegs(
      shared,
      [
        { amount: 300, category: "餐飲", subcategory: "" },
        { amount: 120.5, category: "交通", subcategory: "" },
      ],
      "group_sum",
    );
    expect(legs.reduce((sum, leg) => sum + leg.amount, 0)).toBeCloseTo(-420.5);
  });

  it("throws on fewer than 2 legs", () => {
    expect(() =>
      buildSplitLegs(shared, [{ amount: 100, category: "餐飲", subcategory: "" }], "g"),
    ).toThrow("拆分至少需要 2 筆明細。");
    expect(() => buildSplitLegs(shared, [], "g")).toThrow("拆分至少需要 2 筆明細。");
  });

  it("throws on a zero, negative, or non-finite leg amount", () => {
    const other = { amount: 100, category: "餐飲", subcategory: "" };
    expect(() =>
      buildSplitLegs(shared, [other, { amount: 0, category: "交通", subcategory: "" }], "g"),
    ).toThrow("拆分明細金額必須大於 0。");
    expect(() =>
      buildSplitLegs(shared, [other, { amount: -5, category: "交通", subcategory: "" }], "g"),
    ).toThrow("拆分明細金額必須大於 0。");
    expect(() =>
      buildSplitLegs(
        shared,
        [other, { amount: Number.NaN, category: "交通", subcategory: "" }],
        "g",
      ),
    ).toThrow("拆分明細金額必須大於 0。");
  });

  it("throws on an empty or whitespace-only category", () => {
    const other = { amount: 100, category: "餐飲", subcategory: "" };
    expect(() =>
      buildSplitLegs(shared, [other, { amount: 50, category: "", subcategory: "" }], "g"),
    ).toThrow("拆分明細必須選擇類別。");
    expect(() =>
      buildSplitLegs(shared, [other, { amount: 50, category: "  ", subcategory: "" }], "g"),
    ).toThrow("拆分明細必須選擇類別。");
  });

  it("no-shares call is byte-identical to today (regression)", () => {
    const legs = buildSplitLegs(
      shared,
      [
        { amount: 300, category: "餐飲", subcategory: "菜錢" },
        { amount: 120, category: "居住", subcategory: "日用品" },
      ],
      "group_test",
    );
    expect(legs).toEqual([
      {
        accountId: "acct_cash",
        date: "2026-07-01",
        name: "全聯採買",
        merchant: "全聯",
        currency: "TWD",
        entryType: "expense",
        settlementStatus: "settled",
        note: "週末補貨",
        postDate: null,
        amount: -300,
        category: "餐飲",
        subcategory: "菜錢",
        groupId: "group_test",
        legKind: "category",
      },
      {
        accountId: "acct_cash",
        date: "2026-07-01",
        name: "全聯採買",
        merchant: "全聯",
        currency: "TWD",
        entryType: "expense",
        settlementStatus: "settled",
        note: "週末補貨",
        postDate: null,
        amount: -120,
        category: "居住",
        subcategory: "日用品",
        groupId: "group_test",
        legKind: "category",
      },
    ]);
  });

  describe("分帳 shares", () => {
    const share: SplitShareInput = {
      amount: 600,
      counterparty: "小明",
      counterAccountId: "acct_ar",
    };

    it("mixed split: 1 category leg + 1 share → two drafts, share reuses 代墊 shape", () => {
      const legsArg = [{ amount: 400, category: "餐飲", subcategory: "晚餐" }];
      const drafts = buildSplitLegs(shared, legsArg, "group_mix", [share]);

      expect(drafts).toHaveLength(2);
      const [categoryDraft, shareDraft] = drafts;
      expect(categoryDraft.legKind).toBe("category");
      expect(categoryDraft.amount).toBe(-400);

      expect(shareDraft.legKind).toBe("share");
      expect(shareDraft.amount).toBe(-600);
      expect(shareDraft.name).toBe("小明");
      expect(shareDraft.category).toBe("");
      expect(shareDraft.subcategory).toBe("");
      expect(shareDraft.groupId).toBe("group_mix");
      expect((shareDraft as { counterAccountId: string }).counterAccountId).toBe("acct_ar");
    });

    it("throws when shares are combined with income", () => {
      expect(() =>
        buildSplitLegs(
          { ...shared, entryType: "income" },
          [{ amount: 400, category: "薪資", subcategory: "" }],
          "g",
          [share],
        ),
      ).toThrow("分帳僅支援支出。");
    });

    it("throws with zero category legs and 2 shares", () => {
      expect(() =>
        buildSplitLegs(shared, [], "g", [
          share,
          { amount: 100, counterparty: "小華", counterAccountId: "acct_ar" },
        ]),
      ).toThrow("分帳需要至少 1 筆自己的類別明細。");
    });

    it("1 category leg + 1 share passes the combined ≥2 rule (canonical 分帳 case)", () => {
      const drafts = buildSplitLegs(
        shared,
        [{ amount: 400, category: "餐飲", subcategory: "" }],
        "g",
        [share],
      );
      expect(drafts).toHaveLength(2);
    });

    it("throws on empty counterparty, empty counterAccountId, or non-positive share amount", () => {
      const legsArg = [{ amount: 400, category: "餐飲", subcategory: "" }];
      expect(() => buildSplitLegs(shared, legsArg, "g", [{ ...share, counterparty: "" }])).toThrow(
        "分帳明細必須填寫對象。",
      );
      expect(() =>
        buildSplitLegs(shared, legsArg, "g", [{ ...share, counterparty: "   " }]),
      ).toThrow("分帳明細必須填寫對象。");
      expect(() =>
        buildSplitLegs(shared, legsArg, "g", [{ ...share, counterAccountId: "" }]),
      ).toThrow("分帳明細必須選擇應收帳戶。");
      expect(() => buildSplitLegs(shared, legsArg, "g", [{ ...share, amount: 0 }])).toThrow(
        "分帳明細金額必須大於 0。",
      );
      expect(() => buildSplitLegs(shared, legsArg, "g", [{ ...share, amount: -5 }])).toThrow(
        "分帳明細金額必須大於 0。",
      );
      expect(() =>
        buildSplitLegs(shared, legsArg, "g", [{ ...share, amount: Number.NaN }]),
      ).toThrow("分帳明細金額必須大於 0。");
    });
  });
});
