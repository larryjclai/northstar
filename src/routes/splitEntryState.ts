// Pure editing-state helpers for the EntryDrawer's MOZE-style 多類別拆分 mode
// (plan 182). The drawer keeps `SplitLegDraftState[] | null` in React state —
// null = plain single-category form, an array = split mode. These helpers are
// the only place that mutates/derives that array, so the rules (min 2 legs,
// derived total = Σ leg amounts, exit-to-plain at 1 leg) are unit-testable
// without rendering the route.

import { evaluateAmountExpression } from "../domain";
import type { SplitLegInput, SplitShareInput } from "../domain/splitLegs";

/** One leg row as edited: amount is the raw input string (may be blank). */
export interface SplitLegDraftState {
  amount: string;
  category: string;
  subcategory: string;
}

export function makeEmptySplitLeg(): SplitLegDraftState {
  return { amount: "", category: "", subcategory: "" };
}

/**
 * Entering split mode from the plain form: leg 1 carries the form's current
 * category/subcategory/amount, leg 2 starts blank (the「+」tap's new row).
 * A non-numeric / non-positive current amount seeds leg 1 blank rather than
 * carrying garbage into the leg input.
 */
export function enterSplitMode(current: {
  category: string;
  subcategory: string;
  amountExpression: string;
}): SplitLegDraftState[] {
  const parsed = parseSplitLegAmount(current.amountExpression);
  return [
    {
      amount: parsed !== null ? String(parsed) : "",
      category: current.category,
      subcategory: current.subcategory,
    },
    makeEmptySplitLeg(),
  ];
}

export function addSplitLeg(legs: SplitLegDraftState[]): SplitLegDraftState[] {
  return [...legs, makeEmptySplitLeg()];
}

export function updateSplitLeg(
  legs: SplitLegDraftState[],
  index: number,
  patch: Partial<SplitLegDraftState>,
): SplitLegDraftState[] {
  return legs.map((leg, i) => (i === index ? { ...leg, ...patch } : leg));
}

export function removeSplitLeg(legs: SplitLegDraftState[], index: number): SplitLegDraftState[] {
  return legs.filter((_, i) => i !== index);
}

/**
 * Removing down to 1 (or 0) legs exits split mode back to the plain form —
 * UNLESS there are 分帳 shares present: 1 category leg + ≥1 share is a valid
 * 分帳 (the foundation's combined-≥2 rule counts legs + shares together).
 */
export function shouldExitSplitMode(
  legs: SplitLegDraftState[],
  shares: SplitShareDraftState[],
): boolean {
  return legs.length <= 1 && shares.length === 0;
}

/**
 * Parse one leg's raw amount input → positive number rounded to 2 decimals
 * (the ledger's amount precision), or null when blank/invalid/non-positive.
 * Supports the same arithmetic expressions as the main amount field
 * (e.g. "90+45").
 */
export function parseSplitLegAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let value: number;
  try {
    value = evaluateAmountExpression(trimmed);
  } catch {
    return null;
  }
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

/** Derived total = Σ parseable leg amounts; blank/invalid legs contribute 0. */
export function derivedSplitTotal(legs: SplitLegDraftState[]): number {
  const sum = legs.reduce((total, leg) => total + (parseSplitLegAmount(leg.amount) ?? 0), 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Validation for save-gating. Returns the first zh-TW error (mirroring
 * domain/splitLegs `buildSplitLegs`'s messages so the pre-save gate and the
 * builder can never disagree on copy), or null when the legs are saveable.
 */
export function splitLegsError(legs: SplitLegDraftState[]): string | null {
  if (legs.length < 2) return "拆分至少需要 2 筆明細。";
  for (const leg of legs) {
    if (parseSplitLegAmount(leg.amount) === null) return "拆分明細金額必須大於 0。";
    if (!leg.category.trim()) return "拆分明細必須選擇類別。";
  }
  return null;
}

/** Editing-state legs → the repository's positive-amount SplitLegInput list. */
export function toSplitLegInputs(legs: SplitLegDraftState[]): SplitLegInput[] {
  return legs.map((leg) => ({
    amount: parseSplitLegAmount(leg.amount) ?? 0,
    category: leg.category.trim(),
    subcategory: leg.subcategory.trim(),
  }));
}

/* ─────────── 分帳 (plan 222): per-participant share drafts ─────────── */

/** One 分帳 participant row as edited: amount is the raw input string (may
 *  be blank); counterAccountId is the 應收 account the share pass-through
 *  posts to (blank until picked). */
export interface SplitShareDraftState {
  amount: string;
  counterparty: string;
  counterAccountId: string;
}

export function makeEmptyShareDraft(): SplitShareDraftState {
  return { amount: "", counterparty: "", counterAccountId: "" };
}

export function addShareDraft(shares: SplitShareDraftState[]): SplitShareDraftState[] {
  return [...shares, makeEmptyShareDraft()];
}

export function updateShareDraft(
  shares: SplitShareDraftState[],
  index: number,
  patch: Partial<SplitShareDraftState>,
): SplitShareDraftState[] {
  return shares.map((share, i) => (i === index ? { ...share, ...patch } : share));
}

export function removeShareDraft(
  shares: SplitShareDraftState[],
  index: number,
): SplitShareDraftState[] {
  return shares.filter((_, i) => i !== index);
}

/** Derived total = Σ parseable share amounts; blank/invalid shares contribute 0. */
export function derivedShareTotal(shares: SplitShareDraftState[]): number {
  const sum = shares.reduce((total, share) => total + (parseSplitLegAmount(share.amount) ?? 0), 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Validation for save-gating, per share row. Mirrors domain/splitLegs
 * `buildSplitLegs`'s share messages verbatim so the pre-save gate and the
 * builder can never disagree on copy.
 */
export function shareDraftsError(shares: SplitShareDraftState[]): string | null {
  for (const share of shares) {
    if (parseSplitLegAmount(share.amount) === null) return "分帳明細金額必須大於 0。";
    if (!share.counterparty.trim()) return "分帳明細必須填寫對象。";
    if (!share.counterAccountId) return "分帳明細必須選擇應收帳戶。";
  }
  return null;
}

/** Editing-state shares → the repository's positive-amount SplitShareInput list. */
export function toShareInputs(shares: SplitShareDraftState[]): SplitShareInput[] {
  return shares.map((share) => ({
    amount: parseSplitLegAmount(share.amount) ?? 0,
    counterparty: share.counterparty.trim(),
    counterAccountId: share.counterAccountId,
  }));
}

/**
 * Combined save-gating check for the drawer (legs + shares together).
 * `splitLegsError` alone can't be reused here: its own `legs.length < 2`
 * check has no notion of shares, so it wrongly rejects a valid 1-category-leg
 * + 1-share 分帳 (the foundation's combined-≥2 rule counts legs and shares
 * together — see domain/splitLegs `buildSplitLegs`). This mirrors the
 * builder's checks in the same order (combined count, then "needs ≥1 own
 * leg" when shares exist, then per-leg fields, then per-share fields) so the
 * UI gate and the builder's thrown errors can never disagree. When
 * `shares` is empty this returns byte-identical results to
 * `splitLegsError(legs)` alone.
 */
export function combinedSplitError(
  legs: SplitLegDraftState[],
  shares: SplitShareDraftState[],
): string | null {
  if (legs.length + shares.length < 2) return "拆分至少需要 2 筆明細。";
  if (shares.length > 0 && legs.length < 1) return "分帳需要至少 1 筆自己的類別明細。";
  for (const leg of legs) {
    if (parseSplitLegAmount(leg.amount) === null) return "拆分明細金額必須大於 0。";
    if (!leg.category.trim()) return "拆分明細必須選擇類別。";
  }
  return shareDraftsError(shares);
}
