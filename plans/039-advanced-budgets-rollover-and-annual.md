# Plan 039: Advanced budgets — rollover (carry unspent forward) + annual view

> **Executor instructions**: This is a **design-first plan with a decision
> gate**. Phase 0 produces a design note and requires operator sign-off on the
> rollover semantics before any code. Do NOT skip to implementation until the
> gate is resolved. Follow steps in order; run every verification command. If a
> "STOP condition" occurs, stop and report. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 13f6a723..HEAD -- src/domain/types.ts src/domain/categorySpend.ts src/routes/CategoriesRoute.tsx src/routes/settings/CategoriesSection.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (new persisted budget state + per-period math)
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `13f6a723`, 2026-06-20

## Why this matters

`ROADMAP.md` 規劃中 lists *"進階預算 — 預算 rollover（沒花完滾入下月）、年度預算視圖"*.
Today a category budget is a single per-period number with no memory: any unspent
amount simply vanishes when the month rolls over, and there is no annual view.
For envelope-style budgeters (the audience this feature serves) rollover is the
core mechanic — "I underspent groceries in May, so June has more headroom" — and
its absence makes the budget feel punitive and inaccurate. An annual view answers
"am I on track for the year," which the monthly view can't.

This builds directly on a feature users already touch, so the leverage is the
remembered carry-over, not new scaffolding.

## Current state

Files and roles:

- `src/domain/types.ts:312-318` — the budget lives on `CategoryGroup`:
  ```ts
  export interface CategoryGroup {
    name: string;
    children: string[];
    budget?: number | null;   // a single number; period is implicitly "monthly"
    color?: string;
    iconName?: string;
  }
  ```
  There is **no** per-month budget state and **no** rollover field anywhere.
- `src/domain/categorySpend.ts` — `categoryPeriodSpend()` is the shared,
  unit-tested helper (added in plan 019) that computes settled spend for a
  category over a period (refund-netting, excludes neutral ledger rows). This is
  the canonical "how much did this category spend" function — reuse it; do not
  recompute spend a second way.
- `src/routes/CategoriesRoute.tsx` — the budget manager. Computes per-category
  `amount` vs `budget`, `預算使用率`, `超支`, `totalBudget`, `overSpentCats`
  (lines ~71, 107, 110, 259-305). Today it shows one period at a time.
- `src/routes/settings/CategoriesSection.tsx` — where a category's `budget` is
  created/edited (a plain `ns-input`, lines ~151, 199).

### Conventions to follow

- Finance math is explainable + tested (`AGENTS.md` #1). Rollover changes what a
  displayed "remaining" number means, so the carry math must be a pure,
  unit-tested domain helper (put it next to `categorySpend.ts`), not inline JSX
  arithmetic.
- Optional fields use the `field?: T` convention so old saved data loads cleanly
  (see `CategoryGroup.color?`, `Account.bankBrandDomain?`).
- UI copy goes through i18n / `copy.csv` (don't hand-edit zh-TW strings straight
  into TSX — see `AGENTS.md` gotchas). New labels: add keys, run the catalog
  round-trip, or follow how `CategoriesRoute` already pulls strings.
- Period spend comes from `categoryPeriodSpend()` — reuse it for every month in
  the rollover accumulation.

## Decision gate (Phase 0 — REQUIRED before any code)

Write `docs/advanced-budgets-plan.md` and get operator sign-off. The rollover
mechanic has genuine product choices the executor must not invent:

**Decision A — rollover model.**
- **(Recommended) Per-category opt-in rolling balance.** Add `rollover?: boolean`
  to `CategoryGroup`. When on, the available budget for month *M* =
  `budget + (available[M-1] − spend[M-1])`, accumulated from a start month.
  Unspent carries forward; overspend carries a negative forward (debt). Simple,
  matches YNAB/envelope mental model, no per-month stored rows (it's derived from
  the monthly `budget` + historical spend via `categoryPeriodSpend`).
- (Alternative) Stored per-month budget overrides (a `monthly_budgets` table).
  More flexible (different budget each month) but a schema + sync entity; heavier.
  Only choose this if the operator wants per-month editable budgets, not just
  rollover.

**Decision B — rollover start + reset.**
- From when does accumulation begin (first month with data? a configurable start
  month?), and does the carried balance ever reset (e.g. annually)? Recommend:
  accumulate from the first month the app has ledger data; no automatic reset,
  but expose a "clear carry-over" action. State this explicitly.

**Decision C — annual view shape.**
- Recommend a 12-month grid per category (budget vs actual per month + an annual
  total and annual budget = `budget × 12` adjusted for rollover), reachable from
  `CategoriesRoute`. Confirm whether the annual budget is `monthlyBudget × 12` or
  separately editable.

**Gate**: STOP after writing the note; present A/B/C to the operator; record
their choices at the top of the note before Phase 1.

## Commands you will need

| Purpose   | Command                                          | Expected on success |
|-----------|--------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                               | exit 0              |
| Tests     | `npm test`                                        | all pass            |
| Test one  | `npx vitest run src/domain/categorySpend.test.ts` | all pass           |
| Lint      | `npm run lint`                                     | exit 0 (0 errors)   |

## Scope

**Phase 1 (after the gate) — In scope:**
- `src/domain/types.ts` — the minimal field(s) chosen in Decision A
  (`rollover?: boolean`, or the new table's types).
- A new domain helper file, e.g. `src/domain/budgetRollover.ts` +
  `src/domain/budgetRollover.test.ts` — pure functions: given a category's
  monthly budget, rollover flag, and a per-month spend series (built from
  `categoryPeriodSpend`), return each month's available budget and carry.
- `src/routes/CategoriesRoute.tsx` — show carried balance + the annual view.
- `src/routes/settings/CategoriesSection.tsx` — the rollover opt-in toggle.

**Out of scope (do NOT touch):**
- `categoryPeriodSpend()` itself — it already computes spend correctly; only
  call it. Changing it would ripple into CashFlow/CategoriesTab (locked
  semantics — see plan 019).
- The donut/drawer/selectedCategory interactions in CategoriesRoute beyond
  adding the carry display + annual view.
- Net-worth, FIRE, investment math.
- Sync internals (a new `rollover?` field rides existing whole-object sync; if
  Decision A picks the table option, sync wiring for the new entity becomes part
  of the design note and is its own risk — flag it).

## Git workflow

- Branch from current main: `git checkout -B advisor/039-advanced-budgets main`.
- Commit the design note separately from Phase 1 code; then commit the pure
  domain helper + tests before the UI (so the math lands green independently).
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 0 (gate): design note + operator decision
Write `docs/advanced-budgets-plan.md` (Decisions A/B/C). **STOP for sign-off.**

### Step 1: the rollover field
Add the chosen field(s) to `types.ts` using the optional-field convention.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: pure rollover math + tests
Create `src/domain/budgetRollover.ts`: a pure function that takes
`{ monthlyBudget, rollover, monthlySpend: number[] /* oldest→newest */,
startIndex }` and returns `Array<{ month, budget, spend, available, carry }>`.
No I/O, no React. Write `budgetRollover.test.ts` first (model after
`categorySpend.test.ts`).
**Verify**: `npx vitest run src/domain/budgetRollover.test.ts` → all pass.

### Step 3: wire the carry into CategoriesRoute
Feed per-month spend (from `categoryPeriodSpend` over each month in range) into
the helper; render the carried balance alongside the existing usage/超支 display.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: annual view
Add the 12-month grid (Decision C). Reuse existing card/row DS classes
(`ns-surface`, `ns-row`); pull labels via i18n.
**Verify**: `npx tsc --noEmit` → exit 0; visually confirm in `npm run dev`.

### Step 5: rollover opt-in toggle in settings
Add the toggle in `CategoriesSection.tsx` next to the budget input.
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0 errors.

## Test plan

`src/domain/budgetRollover.test.ts` (the load-bearing tests):
- rollover **off**: each month's available = monthlyBudget, carry always 0.
- rollover **on**, underspend: month 2 available = budget + (budget − spend₁).
- rollover **on**, overspend: negative carry reduces next month's available.
- multi-month accumulation (3+ months) compounds correctly.
- `startIndex` excludes months before the start from accumulation.
- annual total = sum of 12 months' spend; annual budget per Decision C.

Verification: `npx vitest run src/domain/budgetRollover.test.ts` → all pass.

## Done criteria

ALL must hold:

- [ ] `docs/advanced-budgets-plan.md` records the operator's chosen A/B/C options
- [ ] `src/domain/budgetRollover.ts` is pure (no React/I/O imports) and its tests pass
- [ ] CategoriesRoute shows a carried balance when rollover is on; the annual
      view renders
- [ ] Rollover is opt-in per category (off by default → existing behavior
      unchanged for users who don't enable it)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] No files outside the Phase-1 in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The operator has not signed off on Decisions A/B/C.
- The code at cited lines doesn't match the excerpts (drift since `13f6a723`).
- You find that computing per-month spend for the rollover requires changing
  `categoryPeriodSpend()` — stop and report (it must be call-only).
- Decision A selected the stored-table option and the sync wiring for the new
  entity isn't fully specified in the design note — stop; that's a schema+sync
  change that needs its own gate.

## Maintenance notes

- For the reviewer: confirm rollover is **off by default** so existing users see
  no behavior change, and that all spend numbers still flow through
  `categoryPeriodSpend` (no second spend computation).
- The carry is *derived* (recommended model A) — it's recomputed from history,
  not stored — so it self-heals if past transactions are edited. If the operator
  later picks stored per-month budgets, note that edits to history won't
  retroactively change locked months.
- Interacts with: the CashFlow 儲蓄率 hero and CategoriesTab both read category
  spend; they are unaffected because this plan only *adds* a derived carry layer
  on top of the same `categoryPeriodSpend` source.
