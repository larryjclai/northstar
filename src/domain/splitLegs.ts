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

/** One 分帳 participant's portion: positive amount + 對象 + the 應收 account
 *  the pass-through posts to. */
export interface SplitShareInput {
  amount: number;
  /** 對象 display name — becomes the leg's `name`. */
  counterparty: string;
  /** 代墊/應收 counter account id. Required: a share IS a receivable;
   *  a treated (請客) portion is just part of the payer's own category legs. */
  counterAccountId: string;
}

export interface SplitShareDraft extends SplitSharedFields {
  amount: number;
  category: "";
  subcategory: "";
  groupId: string;
  legKind: "share";
  counterAccountId: string;
}

/**
 * N legs → N drafts sharing `groupId`, `legKind: "category"`, in input order,
 * plus (when `shares` is given) one `legKind: "share"` draft per 分帳
 * participant reusing the 代墊 `counterAccountId` pass-through. Throws (zh-TW)
 * on: fewer than 2 combined legs+shares, any non-positive/non-finite amount,
 * any empty category, share validation errors, or shares on a non-expense
 * entry.
 */
export function buildSplitLegs(
  shared: SplitSharedFields,
  legs: SplitLegInput[],
  groupId: string,
  shares: SplitShareInput[] = [],
): Array<SplitLegDraft | SplitShareDraft> {
  if (shares.length > 0 && shared.entryType !== "expense") throw new Error("分帳僅支援支出。");
  if (legs.length + shares.length < 2) throw new Error("拆分至少需要 2 筆明細。");
  if (shares.length > 0 && legs.length < 1) throw new Error("分帳需要至少 1 筆自己的類別明細。");

  const categoryDrafts: SplitLegDraft[] = legs.map((leg) => {
    if (!Number.isFinite(leg.amount) || leg.amount <= 0)
      throw new Error("拆分明細金額必須大於 0。");
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

  const shareDrafts: SplitShareDraft[] = shares.map((share) => {
    if (!Number.isFinite(share.amount) || share.amount <= 0)
      throw new Error("分帳明細金額必須大於 0。");
    if (!share.counterparty.trim()) throw new Error("分帳明細必須填寫對象。");
    if (!share.counterAccountId) throw new Error("分帳明細必須選擇應收帳戶。");
    return {
      accountId: shared.accountId,
      date: shared.date,
      name: share.counterparty,
      merchant: shared.merchant,
      currency: shared.currency,
      entryType: shared.entryType,
      settlementStatus: shared.settlementStatus,
      note: shared.note,
      postDate: shared.postDate ?? null,
      amount: -share.amount,
      category: "",
      subcategory: "",
      groupId,
      legKind: "share",
      counterAccountId: share.counterAccountId,
    };
  });

  return [...categoryDrafts, ...shareDrafts];
}
