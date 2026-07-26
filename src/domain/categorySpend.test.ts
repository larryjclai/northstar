import { describe, expect, it } from "vitest";
import { categoryPeriodSpend } from "./categorySpend";
import type { LedgerTransaction } from "./types";
import type { ResolvedDateScope } from "./dateScope";

function row(overrides: Partial<LedgerTransaction>): LedgerTransaction {
  return {
    id: "tx",
    spaceId: "s",
    revision: 1,
    createdAt: "",
    updatedAt: "",
    deletedAt: null,
    accountId: "a",
    counterAccountId: null,
    date: "2026-05-15T00:00",
    name: "",
    amount: -100,
    currency: "TWD",
    originalAmount: null,
    originalCurrency: null,
    category: "Food",
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
    ...overrides,
  };
}

const dateRange: ResolvedDateScope = {
  preset: "month",
  start: "2026-05-01",
  end: "2026-05-31",
  label: "2026 / 05",
};

/** Simple identity toPrimary: passes amount through for TWD, returns null for USD. */
function toPrimary(r: LedgerTransaction): number | null {
  if (r.currency === "USD") return null;
  return r.amount;
}

describe("categoryPeriodSpend", () => {
  it("counts a settled expense in its category", () => {
    const result = categoryPeriodSpend(
      [row({ amount: -200, category: "Food" })],
      dateRange,
      "TWD",
      toPrimary,
    );
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]).toMatchObject({ name: "Food", amount: 200, count: 1 });
    expect(result.total).toBe(200);
    expect(result.missingFxPairs).toHaveLength(0);
  });

  it("refund (positive-amount expense) nets down the category spend", () => {
    const result = categoryPeriodSpend(
      [
        row({ id: "tx1", amount: -300, category: "Food" }),
        // refund row: positive amount expense
        row({ id: "tx2", amount: 100, category: "Food", refundOfLedgerId: "tx1" }),
      ],
      dateRange,
      "TWD",
      toPrimary,
    );
    // spend = -(-300) + -(100) = 300 - 100 = 200
    expect(result.categories[0]).toMatchObject({ name: "Food", amount: 200, count: 2 });
    expect(result.total).toBe(200);
  });

  it("excludes unsettled rows (receivable / payable)", () => {
    const result = categoryPeriodSpend(
      [
        row({ id: "settled", amount: -500, category: "Transport" }),
        row({
          id: "pending1",
          amount: -200,
          category: "Transport",
          settlementStatus: "receivable",
        }),
        row({ id: "pending2", amount: -100, category: "Transport", settlementStatus: "payable" }),
      ],
      dateRange,
      "TWD",
      toPrimary,
    );
    expect(result.categories[0]).toMatchObject({ name: "Transport", amount: 500, count: 1 });
    expect(result.total).toBe(500);
  });

  it("excludes transfer rows (entryType === 'transfer')", () => {
    const result = categoryPeriodSpend(
      [
        row({ id: "expense", amount: -400, category: "Food" }),
        row({ id: "transfer", amount: -400, category: "Food", entryType: "transfer" }),
      ],
      dateRange,
      "TWD",
      toPrimary,
    );
    expect(result.categories[0]).toMatchObject({ name: "Food", amount: 400, count: 1 });
  });

  it("excludes rows with counterAccountId set (neutral ledger rows)", () => {
    const result = categoryPeriodSpend(
      [
        row({ id: "normal", amount: -300, category: "Bills" }),
        row({ id: "counter", amount: -300, category: "Bills", counterAccountId: "other-account" }),
      ],
      dateRange,
      "TWD",
      toPrimary,
    );
    expect(result.categories[0]).toMatchObject({ name: "Bills", amount: 300, count: 1 });
  });

  it("excludes rows outside the date scope", () => {
    const result = categoryPeriodSpend(
      [
        row({ id: "in", date: "2026-05-10T00:00", amount: -100, category: "Food" }),
        row({ id: "before", date: "2026-04-30T00:00", amount: -100, category: "Food" }),
        row({ id: "after", date: "2026-06-01T00:00", amount: -100, category: "Food" }),
      ],
      dateRange,
      "TWD",
      toPrimary,
    );
    expect(result.categories[0]).toMatchObject({ name: "Food", amount: 100, count: 1 });
    expect(result.total).toBe(100);
  });

  it("rows with missing FX contribute 0 and appear in missingFxPairs", () => {
    const result = categoryPeriodSpend(
      [
        row({ id: "twd", amount: -100, currency: "TWD", category: "Food" }),
        row({ id: "usd", amount: -50, currency: "USD", category: "Food" }),
      ],
      dateRange,
      "TWD",
      toPrimary,
    );
    // USD toPrimary returns null → contributes 0 to spend
    expect(result.categories[0]).toMatchObject({ name: "Food", amount: 100, count: 2 });
    expect(result.missingFxPairs).toEqual(["USD/TWD"]);
  });

  it("missingFxPairs are deduped across multiple rows", () => {
    const result = categoryPeriodSpend(
      [
        row({ id: "u1", amount: -50, currency: "USD", category: "Food" }),
        row({ id: "u2", amount: -30, currency: "USD", category: "Transport" }),
      ],
      dateRange,
      "TWD",
      toPrimary,
    );
    expect(result.missingFxPairs).toEqual(["USD/TWD"]);
    expect(result.missingFxPairs).toHaveLength(1);
  });

  it("rows without a category go into uncategorized bucket", () => {
    const result = categoryPeriodSpend(
      [
        row({ id: "cat", amount: -200, category: "Food" }),
        row({ id: "nocat", amount: -150, category: "" }),
      ],
      dateRange,
      "TWD",
      toPrimary,
    );
    expect(result.categories).toHaveLength(1);
    expect(result.uncategorized).toMatchObject({ amount: 150, count: 1 });
    expect(result.total).toBe(350);
  });

  it("categories are returned sorted descending by amount", () => {
    const result = categoryPeriodSpend(
      [
        row({ id: "t1", amount: -50, category: "Small" }),
        row({ id: "t2", amount: -300, category: "Large" }),
        row({ id: "t3", amount: -150, category: "Medium" }),
      ],
      dateRange,
      "TWD",
      toPrimary,
    );
    expect(result.categories.map((c) => c.name)).toEqual(["Large", "Medium", "Small"]);
  });

  it("returns empty result for no qualifying rows", () => {
    const result = categoryPeriodSpend([], dateRange, "TWD", toPrimary);
    expect(result.categories).toHaveLength(0);
    expect(result.uncategorized).toMatchObject({ amount: 0, count: 0 });
    expect(result.total).toBe(0);
    expect(result.missingFxPairs).toHaveLength(0);
  });
});
