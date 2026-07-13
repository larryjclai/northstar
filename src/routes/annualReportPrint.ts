// Pure helpers for the annual-report print/export path (plan 173).
// Kept side-effect-free so they're unit-testable without a DOM: the route
// itself only wires these into the button state + print-only header, then
// calls window.print().

export interface AnnualPrintButtonState {
  /** When true the 列印/匯出 button is inert. */
  disabled: boolean;
  /** Tooltip explaining the current state (always populated). */
  title: string;
}

/**
 * Decide whether the annual report can be printed, and what to say if not.
 *
 * The privacy mask (隱私遮罩) blurs every amount on screen; a printed report
 * of blurred numbers is useless and misleading, so printing is blocked while
 * the mask is on. We also block when there's nothing to print.
 *
 * The mask check takes precedence: if the user has the mask on AND has no
 * rows, the actionable message is still "turn the mask off first".
 */
export function annualPrintButtonState(input: {
  privacyMode: boolean;
  hasRows: boolean;
}): AnnualPrintButtonState {
  if (input.privacyMode) {
    return { disabled: true, title: "請先關閉隱私遮罩再列印" };
  }
  if (!input.hasRows) {
    return { disabled: true, title: "尚無資料可列印" };
  }
  return { disabled: false, title: "列印或另存為 PDF" };
}

export interface AnnualPrintHeaderMeta {
  /** e.g. "2019–2024"; null when there are no years. */
  rangeLabel: string | null;
  /** e.g. "產生於 2026-07-13". */
  generatedLabel: string;
}

/**
 * Build the text for the print-only report header (app name lives in the JSX;
 * this fills the dynamic year-range + generated-date line).
 *
 * `years` is the list of year keys shown in the report, in any order — we take
 * the min/max ourselves so callers don't have to pre-sort. `today` is the
 * YYYY-MM-DD string from `todayInTimezone`.
 */
export function buildAnnualPrintHeaderMeta(
  years: readonly string[],
  today: string,
): AnnualPrintHeaderMeta {
  const generatedLabel = `產生於 ${today}`;
  if (years.length === 0) {
    return { rangeLabel: null, generatedLabel };
  }
  const sorted = [...years].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const rangeLabel = first === last ? first : `${first}–${last}`;
  return { rangeLabel, generatedLabel };
}
