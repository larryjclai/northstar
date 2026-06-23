import type { CategoryGroup } from "./types";

/**
 * The entry types the category picker filters for. Mirrors the income/expense
 * split in the cash-flow entry drawer; receivable/payable/transfer keep the full
 * list (they are not income- or expense-specific).
 */
export type CategoryPickerType = "income" | "expense";

/**
 * Whether a category should appear for the given entry type. A category with an
 * absent or `"both"` kind shows for both 收入 and 支出 (the historical default, so
 * old saved data behaves exactly as before). `"income"`/`"expense"` restrict it.
 */
export function categoryMatchesType(category: CategoryGroup, type: CategoryPickerType): boolean {
  const kind = category.kind;
  if (kind === undefined || kind === "both") return true;
  return kind === type;
}

/**
 * Filter a category list down to those shown for the active 收入/支出 type. If the
 * filter would leave NO categories (e.g. the user has not tagged any income
 * category yet) we fall back to the full list so the picker is never empty.
 */
export function filterCategoriesByType<T extends CategoryGroup>(
  categories: T[],
  type: CategoryPickerType,
): T[] {
  const filtered = categories.filter((category) => categoryMatchesType(category, type));
  return filtered.length > 0 ? filtered : categories;
}
