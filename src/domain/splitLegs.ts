import type { LedgerTransaction } from "./types";

/**
 * 多類別拆分 (MOZE-style split) leg builder.
 *
 * One purchase = N sibling ledger rows sharing a `groupId`, each leg carrying
 * its own category + amount and `legKind: "category"` (which tells user splits
 * apart from system fee/transfer legs that also share a `groupId`).
 *
 * The split's total is DERIVED — it is always the sum of the legs. The builder
 * deliberately takes no separate total to reconcile against, so the invariant
 * `total = Σ legs` holds by construction (MOZE-style: the UI displays the
 * computed sum, the user edits legs).
 *
 * Sign convention (mirrors assertLedgerInvariants): callers pass every leg
 * amount as a POSITIVE number; the builder applies the ledger sign itself —
 * `expense` legs become negative, `income` legs stay positive.
 */

/** One leg of a split: positive amount + its own category/subcategory. */
export interface SplitLegInput {
  amount: number;
  category: string;
  subcategory: string;
}

/** Fields shared by every leg of one split (the LedgerDraft shared subset). */
export interface SplitSharedFields {
  accountId: string;
  date: string;
  name: string;
  merchant: string;
  currency: string;
  entryType: "expense" | "income";
  settlementStatus: LedgerTransaction["settlementStatus"];
  note: string;
  postDate?: string | null;
}

/**
 * A fully-shaped split leg. Structurally assignable to the data layer's
 * `LedgerDraft` (domain must not import from data), with the split-specific
 * fields pinned: a shared `groupId` and `legKind: "category"`.
 */
export interface SplitLegDraft extends SplitSharedFields {
  amount: number;
  category: string;
  subcategory: string;
  groupId: string;
  legKind: "category";
}

/**
 * N legs → N drafts sharing `groupId`, `legKind: "category"`, in input order.
 * Throws (zh-TW) on: fewer than 2 legs, any non-positive/non-finite leg
 * amount, any empty category.
 */
export function buildSplitLegs(
  shared: SplitSharedFields,
  legs: SplitLegInput[],
  groupId: string,
): SplitLegDraft[] {
  if (legs.length < 2) throw new Error("拆分至少需要 2 筆明細。");
  return legs.map((leg) => {
    if (!Number.isFinite(leg.amount) || leg.amount <= 0) throw new Error("拆分明細金額必須大於 0。");
    if (!leg.category.trim()) throw new Error("拆分明細必須選擇類別。");
    return {
      accountId: shared.accountId,
      date: shared.date,
      name: shared.name,
      merchant: shared.merchant,
      currency: shared.currency,
      entryType: shared.entryType,
      settlementStatus: shared.settlementStatus,
      note: shared.note,
      postDate: shared.postDate ?? null,
      amount: shared.entryType === "expense" ? -leg.amount : leg.amount,
      category: leg.category,
      subcategory: leg.subcategory,
      groupId,
      legKind: "category",
    };
  });
}
