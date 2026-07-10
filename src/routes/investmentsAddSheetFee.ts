// Pure decision for the 投資交易 entry sheet's Taiwan fee auto-fill. Kept in a
// leaf module (no component / COSS / uiPreferences imports) so the logic is
// unit-testable without mounting the drawer — mirrors transactionsSummary.ts.

// Type-only import: fully erased at runtime, so pulling in the type never drags
// in InvestmentsAddSheet.tsx's component/localStorage module graph.
import type { TransactionPreset } from "./InvestmentsAddSheet";

/**
 * On drawer open, decide whether the fee field should start "touched" — i.e.
 * whether its current value is stored data that the TW fee auto-fill must not
 * overwrite.
 *
 * Edit mode (a preset carrying a fee) → touched: the record's fee is real data
 * the user imported / corrected, so auto-fill must leave it alone. A `0` fee is
 * a legitimate stored value (free trades), hence `!= null`, not truthiness.
 * Create mode (no preset) → untouched: a fresh TW buy/sell still auto-fills.
 */
export function feeStartsTouched(preset: TransactionPreset | null | undefined): boolean {
  return Boolean(preset && preset.draft.fee != null);
}
