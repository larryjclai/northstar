import { describe, expect, it } from "vitest";
import type { CategoryGroup } from "./types";
import { categoryMatchesType, categoryPickerOptions, filterCategoriesByType } from "./categoryKind";

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

describe("categoryPickerOptions", () => {
  const list = [
    cat("薪資", "income"),
    cat("交通", "expense"),
    cat("雜項", "both"),
    cat("餐飲"), // untagged
  ];

  it("excludes mismatched-kind categories while keeping both/untagged", () => {
    expect(categoryPickerOptions(list, "expense", "").map((c) => c.name)).toEqual([
      "交通",
      "雜項",
      "餐飲",
    ]);
  });

  it("appends the selected category exactly once when its kind doesn't match", () => {
    // "薪資" is income-only but selected while entry type is expense (e.g. an
    // NL-parser guess or stale saved data) — it must remain visible so the
    // user can deselect it, and must not be duplicated.
    const result = categoryPickerOptions(list, "expense", "薪資").map((c) => c.name);
    expect(result).toEqual(["交通", "雜項", "餐飲", "薪資"]);
    expect(result.filter((name) => name === "薪資")).toHaveLength(1);
  });

  it("empty selection behaves identically to filterCategoriesByType", () => {
    expect(categoryPickerOptions(list, "income", "")).toEqual(filterCategoriesByType(list, "income"));
    expect(categoryPickerOptions(list, "expense", "")).toEqual(filterCategoriesByType(list, "expense"));
  });

  it("still falls back to the full list when no category matches the type", () => {
    const onlyExpense = [cat("交通", "expense"), cat("餐飲", "expense")];
    expect(categoryPickerOptions(onlyExpense, "income", "")).toEqual(onlyExpense);
    // Selection already present in the fallback list — not duplicated.
    expect(categoryPickerOptions(onlyExpense, "income", "交通")).toEqual(onlyExpense);
  });
});
