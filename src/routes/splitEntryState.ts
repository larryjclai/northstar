// Pure editing-state helpers for the EntryDrawer's MOZE-style 多類別拆分 mode
// (plan 182). The drawer keeps `SplitLegDraftState[] | null` in React state —
// null = plain single-category form, an array = split mode. These helpers are
// the only place that mutates/derives that array, so the rules (min 2 legs,
// derived total = Σ leg amounts, exit-to-plain at 1 leg) are unit-testable
// without rendering the route.

import { evaluateAmountExpression } from "../domain";
import type { SplitLegInput } from "../domain/splitLegs";

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

/** Removing down to 1 leg exits split mode back to the plain form. */
export function shouldExitSplitMode(legs: SplitLegDraftState[]): boolean {
  return legs.length < 2;
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
