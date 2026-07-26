import { describe, expect, it } from "vitest";
import { activeFilterChips } from "./activeFilterChips";

const accountName = (id: string) => (id === "acc1" ? "兆豐銀行" : id);

describe("activeFilterChips", () => {
  it("returns no chips when both filters are 'all'", () => {
    expect(
      activeFilterChips({ selectedAccount: "all", selectedCategory: "all", accountName }),
    ).toEqual([]);
  });

  it("returns one chip when only the account filter is active", () => {
    const chips = activeFilterChips({
      selectedAccount: "acc1",
      selectedCategory: "all",
      accountName,
    });
    expect(chips).toEqual([{ key: "account", label: "帳戶：兆豐銀行" }]);
  });

  it("returns one chip when only the category filter is active", () => {
    const chips = activeFilterChips({
      selectedAccount: "all",
      selectedCategory: "餐飲",
      accountName,
    });
    expect(chips).toEqual([{ key: "category", label: "分類：餐飲" }]);
  });

  it("returns two chips when both filters are active, in account-then-category order", () => {
    const chips = activeFilterChips({
      selectedAccount: "acc1",
      selectedCategory: "餐飲",
      accountName,
    });
    expect(chips).toEqual([
      { key: "account", label: "帳戶：兆豐銀行" },
      { key: "category", label: "分類：餐飲" },
    ]);
  });

  it("chip count matches the active-filter count used for the badge", () => {
    const both = activeFilterChips({
      selectedAccount: "acc1",
      selectedCategory: "餐飲",
      accountName,
    });
    expect(both.length).toBe(2);
    const none = activeFilterChips({
      selectedAccount: "all",
      selectedCategory: "all",
      accountName,
    });
    expect(none.length).toBe(0);
  });
});
