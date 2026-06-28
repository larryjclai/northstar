import { describe, expect, it } from "vitest";
import { buildMonthlySummaryInput, type MonthlySummaryAggregates } from "./monthlySummary";

const baseAggregates: MonthlySummaryAggregates = {
  month: "2026-06",
  income: 85000,
  expense: 62000,
  savingsRatePct: 27.1,
  netWorthChange: 23000,
  currency: "TWD",
  categorySpend: new Map([
    ["飲食", 18000],
    ["交通", 8500],
    ["居住", 22000],
    ["娛樂", 6000],
    ["醫療", 3500],
  ]),
};

describe("buildMonthlySummaryInput", () => {
  // ── Privacy ────────────────────────────────────────────────────────────

  it("output JSON contains ONLY declared safe fields — no transaction/merchant/account/ticker keys", () => {
    const input = buildMonthlySummaryInput(baseAggregates);
    const json = JSON.stringify(input);

    // Must NOT contain any of these privacy-sensitive keys.
    const forbidden = [
      "transaction",
      "merchant",
      "account",
      "ticker",
      "accountId",
      "accountName",
      "counterparty",
      "payee",
      "vendor",
      "store",
    ];
    for (const key of forbidden) {
      expect(json.toLowerCase()).not.toContain(`"${key}"`);
    }
  });

  it("topCategories is capped to 3 entries", () => {
    const input = buildMonthlySummaryInput(baseAggregates);
    expect(input.topCategories.length).toBeLessThanOrEqual(3);
  });

  it("topCategories contains only name + amount, no other fields", () => {
    const input = buildMonthlySummaryInput(baseAggregates);
    for (const cat of input.topCategories) {
      const keys = Object.keys(cat);
      expect(keys).toEqual(["name", "amount"]);
    }
  });

  // ── Shape / mapping ────────────────────────────────────────────────────

  it("maps income/expense/savingsRatePct/netWorthChange/currency correctly", () => {
    const input = buildMonthlySummaryInput(baseAggregates);
    expect(input.month).toBe("2026-06");
    expect(input.income).toBe(85000);
    expect(input.expense).toBe(62000);
    expect(input.savingsRatePct).toBe(27.1);
    expect(input.netWorthChange).toBe(23000);
    expect(input.currency).toBe("TWD");
  });

  it("topCategories are sorted by amount descending", () => {
    const input = buildMonthlySummaryInput(baseAggregates);
    // With 5 categories, the top 3 by spend are: 居住 22000, 飲食 18000, 交通 8500
    expect(input.topCategories).toEqual([
      { name: "居住", amount: 22000 },
      { name: "飲食", amount: 18000 },
      { name: "交通", amount: 8500 },
    ]);
  });

  it("handles empty categorySpend gracefully", () => {
    const input = buildMonthlySummaryInput({
      ...baseAggregates,
      categorySpend: new Map(),
    });
    expect(input.topCategories).toEqual([]);
  });

  it("filters out categories with zero spend", () => {
    const input = buildMonthlySummaryInput({
      ...baseAggregates,
      categorySpend: new Map([
        ["飲食", 5000],
        ["交通", 0],
        ["居住", 3000],
      ]),
    });
    expect(input.topCategories).toEqual([
      { name: "飲食", amount: 5000 },
      { name: "居住", amount: 3000 },
    ]);
  });

  it("handles fewer than 3 categories without error", () => {
    const input = buildMonthlySummaryInput({
      ...baseAggregates,
      categorySpend: new Map([["飲食", 12000]]),
    });
    expect(input.topCategories).toHaveLength(1);
    expect(input.topCategories[0]).toEqual({ name: "飲食", amount: 12000 });
  });
});
