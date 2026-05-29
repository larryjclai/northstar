import type { LedgerTransaction } from "./types";

const DELIM = "\u0000";

/**
 * For each merchant, the (category, subcategory) pair it's most often tagged
 * with across expense history — used to auto-fill the category when a merchant
 * is selected. Income rows and merchant-less rows are ignored.
 */
export function buildMerchantCategoryMap(
  rows: LedgerTransaction[],
): Map<string, { category: string; subcategory: string }> {
  const counts = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const merchant = row.merchant?.trim();
    if (!merchant || row.entryType !== "expense" || !row.category) continue;
    const key = `${row.category}${DELIM}${row.subcategory ?? ""}`;
    const perMerchant = counts.get(merchant) ?? new Map<string, number>();
    perMerchant.set(key, (perMerchant.get(key) ?? 0) + 1);
    counts.set(merchant, perMerchant);
  }
  const result = new Map<string, { category: string; subcategory: string }>();
  for (const [merchant, perMerchant] of counts) {
    let best = "";
    let bestCount = 0;
    for (const [key, count] of perMerchant) {
      if (count > bestCount) {
        best = key;
        bestCount = count;
      }
    }
    const [category, subcategory] = best.split(DELIM);
    result.set(merchant, { category, subcategory: subcategory ?? "" });
  }
  return result;
}
