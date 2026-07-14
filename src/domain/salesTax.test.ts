import { describe, expect, it } from "vitest";
import { computeSalesTax } from "./salesTax";

describe("computeSalesTax", () => {
  it("splits the worked example from docs/ledger-books-plan.md §3: 105,000 → {100,000, 5,000}", () => {
    expect(computeSalesTax(105_000)).toEqual({ taxExclusive: 100_000, tax: 5_000 });
  });

  it("rounds a non-exact split to the nearest dollar (100 → tax 5, exclusive 95)", () => {
    // 100 × 5 / 105 = 4.7619... → rounds to 5.
    expect(computeSalesTax(100)).toEqual({ taxExclusive: 95, tax: 5 });
  });

  it("honors a rate override (10%): 110 → {100, 10}", () => {
    expect(computeSalesTax(110, 0.1)).toEqual({ taxExclusive: 100, tax: 10 });
  });

  it("taxExclusive + tax always reconstructs the original total", () => {
    const { taxExclusive, tax } = computeSalesTax(105_000);
    expect(taxExclusive + tax).toBe(105_000);
  });
});
