# Advanced budgets — rollover + annual view (Plan 039)

Status: design note (Phase 0 gate resolved). Records the chosen options for the
rollover (carry unspent forward) + annual budget view feature.

## Guiding rules

- **Opt-in / off by default.** Rollover is a per-category flag that is OFF unless the
  user turns it on. When OFF, behavior is identical to today: each month's available
  budget is the single `monthlyBudget` number, no carry. Existing saved data loads
  unchanged (the new fields are optional, per the `field?: T` convention used for
  `CategoryGroup.color?`, `Account.bankBrandDomain?`, etc.).
- **All spend flows through `categoryPeriodSpend`.** There is NO second spend
  computation. The rollover math consumes a per-month spend series that is built by
  calling the existing, unit-tested `categoryPeriodSpend()` helper once per month
  (settled-only, expense-only, refund-netting, neutral rows excluded). The carry is
  therefore **derived** — recomputed from history every render, not stored — so it
  self-heals when past transactions are edited.

## Decision A — rollover model: Derived opt-in rolling balance

- Add `rollover?: boolean` to `CategoryGroup` (optional-field convention).
- When ON for a category, the available budget for month *M* is:

  ```
  available[M] = monthlyBudget + (available[M-1] − spend[M-1])
  carry[M]     = available[M] − spend[M]            (can be negative on overspend)
  ```

  accumulated forward from a start month. It is derived from the monthly budget plus
  historical spend (via `categoryPeriodSpend`). **No new table, no new sync entity** —
  the boolean rides existing whole-object settings sync.
- OFF (default): `available[M] = monthlyBudget`, `carry` always 0.

## Decision B — start + reset: accumulate from first data, no auto-reset

- Accumulation starts at the first month that has ledger data; there is **no automatic
  reset**.
- A 「清除結轉」 (clear carry-over) action lets the user restart accumulation. It is
  implemented by storing an optional `rolloverStart?: string` (YYYY-MM) on
  `CategoryGroup`: the action sets it to the current month, so accumulation restarts
  from there. Absent/empty `rolloverStart` → accumulate from the first month with data.
  Optional-field convention applies.

## Decision C — annual view: annual budget = monthly × 12

- The annual budget is **not** a separately-editable field. Annual budget =
  `monthlyBudget × 12` (adjusted for rollover where ON, since the available figure
  already folds in carry).
- The annual view is a 12-month grid per category: budget vs actual per month, plus an
  annual total (sum of the 12 months' spend) and the annual budget (monthly × 12).

## Domain helper

`src/domain/budgetRollover.ts` is a pure function (no React / no I/O). Given
`{ monthlyBudget, rollover, monthlySpend: number[] /* oldest→newest */, startIndex }`
it returns `Array<{ month?, budget, spend, available, carry }>`. The caller in
`CategoriesRoute` builds `monthlySpend` from `categoryPeriodSpend` over each month in
range and feeds it in. Tests live in `src/domain/budgetRollover.test.ts`.
