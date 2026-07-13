// Suggest-and-confirm bulk categorization.
//
// Pure logic that turns the user's *uncategorized* ledger rows into ranked
// category suggestions, reusing the exact same self-learning stack QuickAdd
// consumes (the history-derived merchant→category map + the UserLexicon). The
// UI lists these for review; nothing is ever written without an explicit
// confirm. See `src/routes/BulkCategorizeCard.tsx`.
//
// Correctness guards (the whole point of this module):
//   1. Only rows with an empty/missing category are considered.
//   2. Transfers and 代墊 pass-through legs (isNeutralLedgerRow) are excluded —
//      they must never carry a spending category.
//   3. Investment-linked legs (linkedInvestmentRecordId) are excluded.
//   4. Deleted rows are excluded.
//   5. Confidence floor: a row with no learned/seeded match yields NO
//      suggestion. Better to suggest nothing than to guess wrongly.

import type { LedgerTransaction } from "./types";
import { isNeutralLedgerRow } from "./ledgerTrust";
import { lookupCategory, type UserLexicon } from "./userLexicon";

export interface CategorySuggestion {
  transactionId: string;
  /** The merchant/name token the suggestion was matched on. */
  merchantText: string;
  /** Stored format — parent category. Written verbatim to the row. */
  category: string;
  /** Stored format — optional child category. Written verbatim to the row. */
  subcategory: string;
  /** Human-readable label: "分類" or "分類 / 子分類". */
  suggested: string;
  source: "lexicon" | "merchant-rule" | "keyword";
  confidence: "high" | "medium";
}

interface ResolvedHit {
  merchantText: string;
  category: string;
  subcategory: string;
  source: CategorySuggestion["source"];
  confidence: CategorySuggestion["confidence"];
}

/**
 * Resolve a single category hit for one row, mirroring QuickAdd's
 * `resolveCategory` priority so bulk suggestions rank identically:
 *   1. history-derived merchant→category map  → "merchant-rule", high
 *   2. lexicon lookup on the merchant token    → "lexicon"/"keyword"
 *   3. lexicon lookup per whitespace name token → "lexicon"/"keyword"
 *
 * Confidence: a lexicon entry learned from history (count ≥ 1, incl. user
 * corrections) is `high`; a cold-start seed keyword (count === 0) is `medium`.
 * Returns null when nothing matches (the confidence floor).
 */
function resolveHit(
  row: LedgerTransaction,
  lexicon: UserLexicon,
  merchantCategory: Map<string, { category: string; subcategory: string }>,
): ResolvedHit | null {
  const merchant = row.merchant?.trim() ?? "";

  // 1. History-derived merchant→category map (built from real expense rows).
  if (merchant) {
    const mapped = merchantCategory.get(merchant);
    if (mapped && mapped.category) {
      return {
        merchantText: merchant,
        category: mapped.category,
        subcategory: mapped.subcategory ?? "",
        source: "merchant-rule",
        confidence: "high",
      };
    }
  }

  // 2. Lexicon lookup on the full merchant token.
  if (merchant) {
    const hit = lookupCategory(merchant, lexicon);
    if (hit && hit.category) {
      return {
        merchantText: merchant,
        category: hit.category,
        subcategory: hit.subcategory ?? "",
        source: hit.count >= 1 ? "lexicon" : "keyword",
        confidence: hit.count >= 1 ? "high" : "medium",
      };
    }
  }

  // 3. Lexicon lookup per name token (≥2 chars), first hit wins.
  const name = row.name?.trim() ?? "";
  if (name) {
    for (const token of name.split(/[\s　]+/)) {
      if (token.length < 2) continue;
      const hit = lookupCategory(token, lexicon);
      if (hit && hit.category) {
        return {
          merchantText: token,
          category: hit.category,
          subcategory: hit.subcategory ?? "",
          source: hit.count >= 1 ? "lexicon" : "keyword",
          confidence: hit.count >= 1 ? "high" : "medium",
        };
      }
    }
  }

  return null;
}

/**
 * Uncategorized ledger transactions → ranked category suggestions. Pure.
 *
 * Output is deterministic: newest transaction first, ties broken by id, so the
 * same input always yields the same order.
 */
export function buildCategorySuggestions(
  transactions: LedgerTransaction[],
  lexicon: UserLexicon,
  merchantCategory: Map<string, { category: string; subcategory: string }>,
): CategorySuggestion[] {
  const suggestions: CategorySuggestion[] = [];

  for (const row of transactions) {
    // Guard 4 — deleted rows.
    if (row.deletedAt !== null) continue;
    // Guard 1 — only uncategorized rows (v1 never re-categorizes).
    if (row.category && row.category.trim()) continue;
    // Guard 2 — transfers and 代墊 pass-through legs.
    if (isNeutralLedgerRow(row)) continue;
    // Guard 3 — investment-linked legs.
    if (row.linkedInvestmentRecordId != null) continue;

    const hit = resolveHit(row, lexicon, merchantCategory);
    // Guard 5 — confidence floor: no match → no suggestion.
    if (!hit) continue;

    suggestions.push({
      transactionId: row.id,
      merchantText: hit.merchantText,
      category: hit.category,
      subcategory: hit.subcategory,
      suggested: hit.subcategory ? `${hit.category} / ${hit.subcategory}` : hit.category,
      source: hit.source,
      confidence: hit.confidence,
    });
  }

  // Deterministic order: date desc, then id asc for stable ties.
  const byId = new Map(transactions.map((row) => [row.id, row]));
  suggestions.sort((a, b) => {
    const da = byId.get(a.transactionId)?.date ?? "";
    const db = byId.get(b.transactionId)?.date ?? "";
    if (da !== db) return da < db ? 1 : -1; // desc
    return a.transactionId < b.transactionId ? -1 : a.transactionId > b.transactionId ? 1 : 0;
  });

  return suggestions;
}
