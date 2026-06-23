import { describe, expect, it } from "vitest";
import type { CategoryGroup } from "./types";
import { categoryMatchesType, filterCategoriesByType } from "./categoryKind";

function cat(name: string, kind?: CategoryGroup["kind"]): CategoryGroup {
  return { name, children: [], ...(kind ? { kind } : {}) };
}

describe("categoryMatchesType", () => {
  it("untagged categories show for both income and expense", () => {
    const untagged = cat("餐飲");
    expect(categoryMatchesType(untagged, "income")).toBe(true);
    expect(categoryMatchesType(untagged, "expense")).toBe(true);
  });

  it('"both" shows for income and expense', () => {
    const both = cat("雜項", "both");
    expect(categoryMatchesType(both, "income")).toBe(true);
    expect(categoryMatchesType(both, "expense")).toBe(true);
  });

  it('"income" shows only for income', () => {
    const income = cat("薪資", "income");
    expect(categoryMatchesType(income, "income")).toBe(true);
    expect(categoryMatchesType(income, "expense")).toBe(false);
  });

  it('"expense" shows only for expense', () => {
    const expense = cat("交通", "expense");
    expect(categoryMatchesType(expense, "expense")).toBe(true);
    expect(categoryMatchesType(expense, "income")).toBe(false);
  });
});

describe("filterCategoriesByType", () => {
  const list = [
    cat("薪資", "income"),
    cat("交通", "expense"),
    cat("雜項", "both"),
    cat("餐飲"), // untagged
  ];

  it("income returns income + both + untagged", () => {
    expect(filterCategoriesByType(list, "income").map((c) => c.name)).toEqual([
      "薪資",
      "雜項",
      "餐飲",
    ]);
  });

  it("expense returns expense + both + untagged", () => {
    expect(filterCategoriesByType(list, "expense").map((c) => c.name)).toEqual([
      "交通",
      "雜項",
      "餐飲",
    ]);
  });

  it("falls back to the full list when no category matches", () => {
    const onlyExpense = [cat("交通", "expense"), cat("餐飲", "expense")];
    // No income-eligible category → fall back to full list, not empty.
    expect(filterCategoriesByType(onlyExpense, "income")).toEqual(onlyExpense);
  });
});
