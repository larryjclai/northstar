/**
 * Pure helper for the 記帳 (Cash Flow) 篩選 popover's active-filter chip row
 * (plan 168). Single source of truth so the chip list, the popover's count
 * badge, and any other "how many filters are active" reads always agree —
 * the count is just `activeFilterChips(...).length`.
 */
export interface FilterChipDescriptor {
  key: "account" | "category";
  label: string;
}

export function activeFilterChips(params: {
  selectedAccount: string;
  selectedCategory: string;
  accountName: (id: string) => string;
}): FilterChipDescriptor[] {
  const chips: FilterChipDescriptor[] = [];
  if (params.selectedAccount !== "all") {
    chips.push({ key: "account", label: `帳戶：${params.accountName(params.selectedAccount)}` });
  }
  if (params.selectedCategory !== "all") {
    chips.push({ key: "category", label: `分類：${params.selectedCategory}` });
  }
  return chips;
}
