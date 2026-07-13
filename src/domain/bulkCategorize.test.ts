import { describe, expect, it } from "vitest";
import { buildCategorySuggestions } from "./bulkCategorize";
import { buildMerchantCategoryMap } from "./merchantCategory";
import { buildUserLexicon } from "./userLexicon";
import type { AppSettings, LedgerTransaction } from "./types";

const settings: AppSettings = {
  primaryCurrency: "TWD",
  categories: [
    { name: "餐飲", children: ["飲料", "外食"] },
    { name: "交通", children: ["停車", "捷運"] },
    { name: "運動", children: ["健身"] },
  ],
  merchants: [],
  exchangeRates: [],
};

function makeLedger(overrides: Partial<LedgerTransaction> & { id: string }): LedgerTransaction {
  return {
    accountId: "a1",
    counterAccountId: null,
    date: "2026-01-01",
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
    deletedAt: null,
    updatedAt: "2026-01-01",
    createdAt: "2026-01-01",
    revision: 1,
    spaceId: "s1",
    ...overrides,
  };
}

// Categorized history the self-learning stack learns from: 健身工廠 → 運動/健身.
const history: LedgerTransaction[] = [
  makeLedger({ id: "h1", merchant: "健身工廠", category: "運動", subcategory: "健身" }),
  makeLedger({ id: "h2", merchant: "健身工廠", category: "運動", subcategory: "健身" }),
];

const lexicon = buildUserLexicon([], history, settings);
const merchantMap = buildMerchantCategoryMap(history);

describe("buildCategorySuggestions", () => {
  it("suggests a high-confidence category for a learned merchant (merchant-rule)", () => {
    const rows = [makeLedger({ id: "u1", merchant: "健身工廠" })];
    const out = buildCategorySuggestions(rows, lexicon, merchantMap);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      transactionId: "u1",
      merchantText: "健身工廠",
      category: "運動",
      subcategory: "健身",
      suggested: "運動 / 健身",
      source: "merchant-rule",
      confidence: "high",
    });
  });

  it("falls back to the lexicon (high) when no merchant-rule map is available", () => {
    const rows = [makeLedger({ id: "u1", merchant: "健身工廠" })];
    const out = buildCategorySuggestions(rows, lexicon, new Map());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      category: "運動",
      subcategory: "健身",
      source: "lexicon",
      confidence: "high",
    });
  });

  it("gives a medium-confidence suggestion for a cold-start seed keyword", () => {
    // 停車 is a seed keyword (交通/停車) with no learned history → medium.
    const rows = [makeLedger({ id: "u6", merchant: "停車" })];
    const out = buildCategorySuggestions(rows, lexicon, new Map());
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      category: "交通",
      subcategory: "停車",
      source: "keyword",
      confidence: "medium",
    });
  });

  it("excludes transactions that already have a category", () => {
    const rows = [makeLedger({ id: "u2", merchant: "健身工廠", category: "餐飲" })];
    expect(buildCategorySuggestions(rows, lexicon, merchantMap)).toEqual([]);
  });

  it("excludes transfers", () => {
    const rows = [makeLedger({ id: "u3", merchant: "健身工廠", entryType: "transfer" })];
    expect(buildCategorySuggestions(rows, lexicon, merchantMap)).toEqual([]);
  });

  it("excludes 代墊 pass-through legs (counterAccountId set)", () => {
    const rows = [makeLedger({ id: "u7", merchant: "健身工廠", counterAccountId: "a2" })];
    expect(buildCategorySuggestions(rows, lexicon, merchantMap)).toEqual([]);
  });

  it("excludes investment-linked legs", () => {
    const rows = [makeLedger({ id: "u4", merchant: "健身工廠", linkedInvestmentRecordId: "inv1" })];
    expect(buildCategorySuggestions(rows, lexicon, merchantMap)).toEqual([]);
  });

  it("excludes deleted rows", () => {
    const rows = [makeLedger({ id: "u8", merchant: "健身工廠", deletedAt: "2026-02-01" })];
    expect(buildCategorySuggestions(rows, lexicon, merchantMap)).toEqual([]);
  });

  it("suggests nothing for an unknown merchant below the confidence floor", () => {
    const rows = [makeLedger({ id: "u5", merchant: "某不存在商家ZZZ" })];
    expect(buildCategorySuggestions(rows, lexicon, merchantMap)).toEqual([]);
  });

  it("orders newest-first and is stable for identical input", () => {
    const rows = [
      makeLedger({ id: "old", merchant: "停車", date: "2026-01-01" }),
      makeLedger({ id: "new", merchant: "健身工廠", date: "2026-03-01" }),
    ];
    const out = buildCategorySuggestions(rows, lexicon, merchantMap);
    expect(out.map((s) => s.transactionId)).toEqual(["new", "old"]);
    // Deterministic: running again on the same input yields the same order.
    const again = buildCategorySuggestions(rows, lexicon, merchantMap);
    expect(again).toEqual(out);
  });
});
