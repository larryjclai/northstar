import { describe, expect, it } from "vitest";
import { feeStartsTouched, type TransactionPreset } from "./InvestmentsAddSheet";
import type { InvestmentDraft } from "../data/repositories";

/**
 * Regression coverage for the TW fee auto-fill clobbering an edited record's
 * stored fee. The drawer resets `feeTouchedRef` on every open; the auto-fill
 * effect then fires (its deps all change as the preset loads) and overwrites
 * the stored fee with a formula estimate. `feeStartsTouched` is the guard: in
 * edit mode it returns `true` so the ref starts "touched" and auto-fill leaves
 * the value alone; in create mode it returns `false` so a fresh TW buy/sell
 * still auto-fills.
 *
 * A full component mount is impractical here: the drawer pulls in COSS
 * components that import via the `@/…` alias, which the vitest config does not
 * resolve (aliases live only in vite.config, out of scope for this change). So
 * we test the extracted pure decision directly.
 */

const buyDraft = (fee: number): InvestmentDraft => ({
  ticker: "2330.TW",
  name: "台積電",
  currency: "TWD",
  linkedAccountId: "acc-1",
  date: "2026-05-01T09:00",
  action: "buy",
  price: 100,
  quantity: 1000,
  fee,
  note: "",
  assetType: null,
  sector: null,
  industry: null,
});

const presetWith = (fee: number): TransactionPreset => ({ id: "rec-1", draft: buyDraft(fee) });

describe("feeStartsTouched", () => {
  it("is true when editing a record with a stored fee (auto-fill must not clobber it)", () => {
    expect(feeStartsTouched(presetWith(88888))).toBe(true);
  });

  it("treats a stored fee of 0 (free trade) as real data, not an empty slot", () => {
    expect(feeStartsTouched(presetWith(0))).toBe(true);
  });

  it("is false in create mode (no preset) so a fresh TW buy/sell still auto-fills", () => {
    expect(feeStartsTouched(undefined)).toBe(false);
  });

  it("is false when a preset somehow carries no fee (falls back to auto-fill)", () => {
    // Defensive: an ill-formed preset with fee nulled out should not lock the
    // field; auto-fill remains available.
    const preset = { id: "rec-2", draft: { ...buyDraft(0), fee: null as unknown as number } };
    expect(feeStartsTouched(preset)).toBe(false);
  });
});
