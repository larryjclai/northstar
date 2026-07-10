import { describe, expect, it } from "vitest";
import { feeStartsTouched } from "./investmentsAddSheetFee";
import type { TransactionPreset } from "./InvestmentsAddSheet";

/**
 * Regression coverage for the TW fee auto-fill clobbering an edited record's
 * stored fee. The drawer resets its "fee touched" flag on every open; the
 * auto-fill effect then fires (its deps all change as the preset loads) and
 * overwrites the stored fee with a formula estimate. `feeStartsTouched` is the
 * guard: in edit mode it returns true so the flag starts "touched" and
 * auto-fill leaves the value alone; in create mode it returns false so a fresh
 * TW buy/sell still auto-fills.
 */

function presetWith(fee: number | null): TransactionPreset {
  return {
    id: "rec-1",
    draft: {
      ticker: "2330.TW",
      name: "台積電",
      currency: "TWD",
      linkedAccountId: "acc-1",
      date: "2026-05-01T09:00",
      action: "buy",
      price: 100,
      quantity: 1000,
      // A null fee models a malformed preset; the real type is `number`.
      fee: fee as number,
      note: "",
      assetType: null,
      sector: null,
      industry: null,
    },
  };
}

describe("feeStartsTouched", () => {
  it("is true when editing a record with a positive stored fee (auto-fill must not clobber it)", () => {
    expect(feeStartsTouched(presetWith(88888))).toBe(true);
  });

  it("treats a stored fee of 0 (free trade) as real data, not an empty slot", () => {
    expect(feeStartsTouched(presetWith(0))).toBe(true);
  });

  it("is false in create mode — no preset — so a fresh TW buy/sell still auto-fills", () => {
    expect(feeStartsTouched(undefined)).toBe(false);
    expect(feeStartsTouched(null)).toBe(false);
  });

  it("is false when a preset somehow carries no fee (falls back to auto-fill)", () => {
    expect(feeStartsTouched(presetWith(null))).toBe(false);
  });
});
