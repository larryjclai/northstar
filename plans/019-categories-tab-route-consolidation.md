# Plan 019: Resolve the CategoriesTab vs CategoriesRoute duplication (design-first)

> **Executor instructions**: This plan has a **decision gate**. Do Steps 1–2
> (analysis, no code change) and then STOP at the gate to get an operator
> decision before writing any view-collapsing code. Do not improvise a merge.
> When done with whatever scope is approved, update this plan's status row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b0fda83d..HEAD -- src/routes/CategoriesTab.tsx src/routes/CategoriesRoute.tsx src/routes/router.tsx src/routes/CashFlowRoute.tsx src/routes/DashboardRoute.tsx`
> If any file changed since this plan was written, read it and re-confirm the
> "Current state" facts before proceeding.

## Status

- **Priority**: P2
- **Effort**: M (mostly analysis + one approved refactor)
- **Risk**: MED (touches finance-display semantics if done wrong)
- **Depends on**: none
- **Category**: tech-debt (duplication) / docs (decision)
- **Planned at**: commit `b0fda83d`, 2026-06-16

## Why this matters

There are two category views and they can drift apart in numbers and behavior:

- `src/routes/CategoriesTab.tsx` — rendered as the 「分類」tab **inside**
  `CashFlowRoute` (`CashFlowRoute.tsx:1181`). Props-driven (no own fetch). A
  **period-spend breakdown**: 3 summary cards (最大支出 / 交易最多 / 未分類),
  donut + legend, and a table whose rows are **Links to category detail**
  (`/cash-flow/categories/$categoryName`). Includes an 「其他」(uncategorized) row.
- `src/routes/CategoriesRoute.tsx` — the standalone route
  `/cash-flow/categories` (wired in `router.tsx:69-70`). A **budget-management**
  page: own `useFinanceData()` fetch, `DateScopeControl`, 4 budget-oriented
  summary cards (已消費 / 預算合計 / 預算使用率 / 超支分類), a donut with
  **click-to-filter**, a table with **budget / usage bars / 超支** columns, and a
  `CategoryManagementDrawer`.

**The standalone route is NOT an orphan** — `DashboardRoute.tsx:550` (「查看分類 →」)
and `:708` (「管理分類 →」) both link to it. So neither can simply be deleted.

The real risk is subtle: the two compute category spend **differently**, so the
same category can show different totals depending on which view the user opens:

- `CategoriesTab` (`:18`, `:27`) sums `Math.abs(toPrimary(row) ?? 0)` over
  expense rows that are `settlementStatus === "settled"` and not internal
  transfers.
- `CategoriesRoute` (`:43-47`) sums **signed** `convertCurrency(-row.amount, …)`
  (so refunds net out) over expense rows that are not internal transfers, with
  **no `settled` filter**, using `dailyFxRates` as the FX source.

This is a **finance-semantics inconsistency hiding behind a UI duplication**, and
finance calc semantics are locked (see `docs/.../project_finance_semantics`), so
the fix must be a deliberate decision, not an accidental merge.

## Current state

- `src/routes/CategoriesTab.tsx` (261 lines) — full file is the period-breakdown
  view described above; rows navigate to detail.
- `src/routes/CategoriesRoute.tsx` (338 lines) — full file is the budget view;
  rows filter in-page; has the management drawer + loading/error guard.
- `src/routes/CashFlowRoute.tsx:1181` — `<CategoriesTab … />` inside the tab body.
- `src/routes/router.tsx:69-70` — `/cash-flow/categories` → `CategoriesRoute`.
- `src/routes/DashboardRoute.tsx:550,708` — links into `/cash-flow/categories`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass |

## Scope

**In scope** (analysis always; code only for the approved option):
- `plans/019-categories-tab-route-consolidation.md` (append the decision in Step 2)
- Then, depending on the approved option: a new shared helper (e.g.
  `src/domain/categorySpend.ts`) and/or the two route files above.

**Out of scope**:
- Changing the *meaning* of either computation without an explicit operator
  decision recorded in Step 2. If a shared helper is adopted, both call sites
  must agree on ONE documented definition — that agreement is the decision.
- Deleting `CategoriesRoute` (it has live entry points).

## Steps

### Step 1: Produce a difference table (no code change)
Read both files in full and write, in this plan's "Decision" section below, a
short table of every meaningful difference: summary cards, spend computation
(settled filter? refunds netting? FX source?), donut interaction (filter vs
navigate), table columns (budget vs merchant), data source (prop vs own fetch),
and side features (drawer, DateScopeControl).

**Verify**: the table exists in this file and names the **spend-computation
divergence** explicitly.

### Step 2: STOP — get the operator's consolidation decision
Present the difference table and ask the operator to choose ONE:

- **Option A (recommended): keep two views, unify the numbers only.** Extract a
  single `categoryPeriodSpend(...)` helper into `src/domain/` with ONE documented
  definition (which is decided here — likely: settled-only, signed so refunds net,
  `dailyFxRates` FX source — but the operator confirms). Both views call it. The
  tab stays a drill-down breakdown; the route stays the budget manager. Lowest
  risk; removes the silent number mismatch.
- **Option B: route reuses the tab component.** Refactor `CategoriesTab` into a
  presentational component that both `CashFlowRoute` and a thinned
  `CategoriesRoute` render, with the budget columns/drawer passed in as optional
  props. Larger diff; risk of regressing the budget UI.
- **Option C: deliberately keep both as-is**, but add a one-line code comment in
  each file pointing at the other and stating they intentionally differ. Cheapest;
  accepts the divergence.

Record the chosen option and rationale here, then implement only that option.

**Verify**: a decision line is written in this file. Do not proceed to code
without it.

### Step 3: Implement the approved option
Follow the approved option. For **A**: create the helper, write a unit test for it
(see Test plan), switch both call sites, confirm the on-screen totals are now
identical for the same period. For **B**: extract the component, prove both entry
points still render and the budget drawer still saves. For **C**: add the comments.

**Verify**: `npx tsc --noEmit` → 0; `npm run build` → 0; `npm run test` passes.

### Step 4: Regression-check both entry points
**Verify** (manual, `npm run dev`):
- The 「分類」tab inside Cash Flow still renders and its rows still navigate to
  category detail.
- `/cash-flow/categories` (via Dashboard 「查看分類」) still renders, the donut
  still filters, and 「管理分類」still opens the drawer and saves.

## Test plan

- For Option A: add `src/domain/categorySpend.test.ts` covering: a settled
  expense is counted; a refund nets against spend; an unsettled row is
  excluded/included per the decided definition; an internal transfer is excluded;
  a missing FX pair is handled. Model the test structure after an existing domain
  test (find one with `ls src/domain/*.test.ts`).
- For Option B/C: no new unit test required; existing suite must stay green.

## Done criteria

ALL must hold for the approved option:
- [ ] Step 2 decision recorded in this file
- [ ] `npx tsc --noEmit` exits 0; `npm run build` exits 0; `npm run test` passes
- [ ] (Option A) the same category shows the **same total** in the tab and the
      route for an identical date range
- [ ] Both entry points (tab + `/cash-flow/categories`) still work (Step 4)
- [ ] No files outside the approved scope modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:
- The operator decision in Step 2 is not available — do not pick an option for
  them; the choice changes finance-display semantics.
- Implementing Option A reveals the two definitions can't be reconciled without a
  visible number change somewhere — report the specific delta and which view changes.
- Either entry point's data source shape differs from "Current state".

## Maintenance notes

- After this lands, any new category-spend surface must call the shared helper
  (Option A) rather than re-implementing the aggregation — that is the whole point.
- Reviewer: the thing to scrutinize is whether totals shown to the user changed.
  A consolidation that silently alters a displayed number violates the locked
  finance-semantics rule and must be called out in the PR description.

## Decision (2026-06-17 — operator chose Option A)

**Option A: keep two views, unify the numbers via one shared helper.** The
unified definition is **the app's existing canonical category-spend aggregation**
— `CashFlowRoute.allCategorySpend` (`src/routes/CashFlowRoute.tsx:713-737`), which
also backs the 分類支出 bar card and (in spirit) `MerchantsTab`. Verified
during planning:

- `toPrimary` in `CashFlowRoute` (`:181-183`) is
  `convertCurrency(amount, row.currency, primary, settings, { dailyRates: fxHistory, asOfDate: row.date })`
  — i.e. the **same historical per-row asOf FX** `CategoriesRoute` already uses, so
  FX is consistent (no FX regression for either view).
- `isNeutralLedgerRow(row)` = `entryType === "transfer" || counterAccountId != null`
  (`src/domain/ledgerTrust.ts:22`). For expense rows this is **equivalent** to the
  `!counterAccountId` both views already apply — no numeric change, just the house
  helper.
- `convertCurrency` is linear, so `-toPrimary(amount)` ≡ `convertCurrency(-amount)`.

### The one definition (what the shared helper computes)

A ledger row contributes to category spend iff:
`isWithinDateScope(row.date, dateRange) && row.entryType === "expense" &&
row.settlementStatus === "settled" && !isNeutralLedgerRow(row)`.
Per-row spend is `-(toPrimary(row) ?? 0)` (signed, so **refunds net**; a row whose
FX conversion is null contributes 0 and is recorded as a missing-FX pair).

### What this changes on screen (call out in the PR)

- **CategoriesTab**: was `Math.abs(toPrimary(row))` → becomes signed `-(toPrimary)`.
  Effect: **refunds now reduce** a category's spend instead of inflating it.
  Aligns the tab with the 分類支出 bar card on the very same page.
- **CategoriesRoute**: gains the `settlementStatus === "settled"` filter (it had
  none). Effect: **unsettled / pending expenses are excluded** from 已消費 /
  預算使用率 / 超支. Aligns the budget page with the locked cash-basis convention.

Both are deliberate corrections toward the canonical cash-basis house definition,
not accidental drift. No other view changes.

### Helper to create — `src/domain/categorySpend.ts`

```ts
import { isWithinDateScope, type ResolvedDateScope } from "./dateScope";
import { isNeutralLedgerRow } from "./ledgerTrust";
import type { LedgerTransaction } from "./types";
// Re-export from the barrel: add `export * from "./categorySpend";` to src/domain/index.ts

export interface CategorySpendRow { name: string; amount: number; count: number; }
export interface CategoryPeriodSpend {
  categories: CategorySpendRow[];               // sorted desc by amount
  uncategorized: { amount: number; count: number };
  total: number;                                // sum of categories + uncategorized
  missingFxPairs: string[];                     // e.g. ["USD/TWD"], deduped
}

/**
 * Canonical period category-spend aggregation (cash-basis, settled-only,
 * excludes neutral/transfer rows, refunds net). `toPrimary` converts a row's
 * stored `amount` to the primary currency (asOf-aware) or returns null on
 * missing FX. Mirrors CashFlowRoute.allCategorySpend.
 */
export function categoryPeriodSpend(
  rows: LedgerTransaction[],
  dateRange: ResolvedDateScope,
  primaryCurrency: string,
  toPrimary: (row: LedgerTransaction) => number | null,
): CategoryPeriodSpend { /* per the definition above */ }
```

Both call sites pass an amount-converter; the helper applies the `-` sign and the
filters internally:
- **CategoriesTab**: pass its existing `toPrimary` prop directly. After calling the
  helper for amounts/counts, keep its own small pass for `topMerchant` and decorate
  with color/icon from `appSettings`; use `uncategorized` for the 其他 row and
  `total` for the header.
- **CategoriesRoute**: pass
  `(row) => convertCurrency(row.amount, row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date })`.
  Replace `categoryStats` (amounts/counts come from the helper; decorate with
  budget/color/emoji), `totalExpense` (= helper `total`), and `missingFxPairs`
  (= helper `missingFxPairs`). Leave `selectedCategory` filtering, the donut, and
  the `CategoryManagementDrawer` untouched.