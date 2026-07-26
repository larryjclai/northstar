// Invoice numbering — plan 190 §3, "Invoice numbering (operator-confirmed)".
// Pure module, no UI: plan 191 wires this into the 開發票 flow.
//
// Two presets:
// - `TW_UNIFORM`: 統一發票 — 2-letter 字軌 + 8-digit sequence (e.g. "AB12345678").
//   `nextInvoiceNumber` auto-increments the numeric part only; it never rolls
//   the letter track — when the numeric part would overflow 8 digits, it
//   returns an "overflow" result so the caller (191) can prompt the operator
//   for a new 字軌 instead of silently wrapping or guessing one.
// - `FREE_TEXT`: no validation, no auto-increment — the operator types
//   whatever their own numbering scheme produces.

export type InvoiceNumberPreset = "TW_UNIFORM" | "FREE_TEXT";

const TW_UNIFORM_PATTERN = /^[A-Z]{2}\d{8}$/;
const TW_UNIFORM_MAX_NUMERIC = 99_999_999;

export interface InvoiceNumberPresetDef {
  validate: (value: string) => boolean;
}

/** Preset registry: look up validation behavior by preset id. */
export const INVOICE_NUMBER_PRESETS: Record<InvoiceNumberPreset, InvoiceNumberPresetDef> = {
  TW_UNIFORM: {
    validate: (value: string) => TW_UNIFORM_PATTERN.test(value),
  },
  FREE_TEXT: {
    validate: () => true,
  },
};

/** Validate `value` against the given preset's format rule. */
export function validateInvoiceNumber(value: string, preset: InvoiceNumberPreset): boolean {
  return INVOICE_NUMBER_PRESETS[preset].validate(value);
}

export type NextInvoiceNumberResult =
  { ok: true; value: string } | { ok: false; value: null; error: "invalid_format" | "overflow" };

/**
 * Compute the next invoice number after `prev`.
 *
 * - `FREE_TEXT`: no auto-increment — returns `prev` unchanged so callers can
 *   treat this uniformly with the TW_UNIFORM branch (a no-op suggestion; the
 *   operator free-types the real value).
 * - `TW_UNIFORM`: increments the 8-digit numeric part only, preserving the
 *   2-letter prefix. Fails with `"invalid_format"` if `prev` doesn't match
 *   the preset's shape, or `"overflow"` if incrementing would exceed 8 digits
 *   (99,999,999) — the letter track is never auto-rolled.
 */
export function nextInvoiceNumber(
  prev: string,
  preset: InvoiceNumberPreset,
): NextInvoiceNumberResult {
  if (preset === "FREE_TEXT") return { ok: true, value: prev };

  if (!validateInvoiceNumber(prev, preset))
    return { ok: false, value: null, error: "invalid_format" };

  const prefix = prev.slice(0, 2);
  const numeric = Number(prev.slice(2));
  const nextNumeric = numeric + 1;
  if (nextNumeric > TW_UNIFORM_MAX_NUMERIC) return { ok: false, value: null, error: "overflow" };

  return { ok: true, value: `${prefix}${String(nextNumeric).padStart(8, "0")}` };
}
