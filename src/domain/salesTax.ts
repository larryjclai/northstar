// 營業稅 (sales tax) math — plan 190 §3 "Tax model", Model A.
//
// A single ledger row carries the 含稅 total (`amount`). This module derives
// the 未稅額 (tax-exclusive) and 稅額 (tax) split from that total, using the
// standard 內含稅額 (tax-inclusive) formula: the total already contains the
// tax, so `tax = total × rate / (1 + rate)`, not `total × rate`.
//
// Worked example (docs/ledger-books-plan.md §3): 開立含稅總額 105,000 的發票
// (5% 營業稅) → 銷項稅額 = round(105,000 × 5 / 105) = 5,000；
// 未稅額 = 105,000 − 5,000 = 100,000.

export interface SalesTaxSplit {
  /** 未稅額 — the tax-exclusive portion of `taxInclusiveTotal`. */
  taxExclusive: number;
  /** 稅額 — the tax portion of `taxInclusiveTotal`. */
  tax: number;
}

/**
 * Split a tax-inclusive total into its tax-exclusive amount and tax amount.
 * `rate` defaults to 5% (統一發票 standard rate) and is user-editable per
 * invoice for rounding disputes (docs/ledger-books-plan.md §3).
 */
export function computeSalesTax(taxInclusiveTotal: number, rate = 0.05): SalesTaxSplit {
  const tax = Math.round((taxInclusiveTotal * rate) / (1 + rate));
  const taxExclusive = taxInclusiveTotal - tax;
  return { taxExclusive, tax };
}
