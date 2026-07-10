# Plan 146: Thread the app timezone into the recurring-rule seed date (finishes plan 120's deferred piece)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. SKIP updating `plans/README.md` — your reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat ae0c9ce1..HEAD -- src/domain/recurringDates.ts src/data/repositories.ts src/domain/types.ts`
> Written against main `ae0c9ce1`. If your worktree base is older, advance it
> (see dispatch preamble). Re-locate call sites by grep; STOP on a real
> excerpt mismatch.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 120 (MERGED — `firstFutureRunDate` now accepts an injectable `today`)
- **Category**: bug
- **Planned at**: commit `ae0c9ce1`, 2026-07-09

## Why this matters

Plan 120 fixed the UTC "today/this-month" bugs everywhere it could reach the
app timezone, and made `firstFutureRunDate(value, freq, dayOfMonth, today?)`
inject-able — BUT it STOPPED at the two repository call sites because the data
layer (`repositories.ts`) has no access to the timezone (it lives only in the
`useUiPreferences` zustand store). So a recurring rule created between 00:00
and 08:00 Taipei time can still seed its first run one calendar day early. The
clean fix is to compute `today` where the timezone IS available — the route
that creates the rule — and pass it down through the draft, using 120's
already-added parameter.

## Current state

- `src/domain/recurringDates.ts` (post-120):
  ```ts
  export function firstFutureRunDate(
    value: string,
    frequency: RecurringFrequency,
    dayOfMonth: number,
    today: string = new Date().toISOString().slice(0, 10),
  ): string { ... }
  ```
- `src/data/repositories.ts` — the two callers (grep `firstFutureRunDate(`;
  ~lines 5105 and 5123) still call it WITHOUT a `today` arg (so they use the
  UTC default):
  ```ts
  nextRunDate: firstFutureRunDate(input.nextRunDate, frequency, input.dayOfMonth),
  ```
  inside `createRecurringRow(input: RecurringDraft)` and
  `createRecurringInvestmentRow(input: RecurringInvestmentDraft)`.
- The draft types: grep `RecurringDraft` and `RecurringInvestmentDraft` in
  `src/domain/types.ts` (or wherever they're declared — grep to confirm).
- The route/UI call sites that BUILD those drafts and call
  `createRecurringTransaction` / `createRecurringInvestment` — grep
  `createRecurringTransaction(` and `createRecurringInvestment(` across
  `src/routes` and `src/components`. Those components have the timezone via
  `useUiPreferences((s) => s.timezone)` (see how `CategoriesSection` /
  `DashboardRoute` obtained it in plan 120), or already import
  `todayInTimezone`.
- Helper: `todayInTimezone(timezone)` from `src/domain/datetime.ts` (exported
  via `../domain`).

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass (852)      |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**:
- The `RecurringDraft` + `RecurringInvestmentDraft` type declarations (add ONE
  optional field, e.g. `seedToday?: string`)
- `src/data/repositories.ts` — the two `firstFutureRunDate(...)` callers pass
  `input.seedToday` (falls back to the UTC default when undefined, preserving
  current behavior for any caller that doesn't set it — e.g. demoData/seed)
- The route/component call sites that create recurring rules/investments —
  set `seedToday: todayInTimezone(timezone)` on the draft
- Tests: extend `src/domain/recurringDates.test.ts` only if a new pure-logic
  case is warranted (the injectable path is already covered by 120); the
  wiring itself is validated by tsc + the existing suite

**Out of scope**:
- `firstFutureRunDate`'s signature (120 already made it injectable — do not
  change it)
- `src/domain/datetime.ts`
- The `nextRecurringDate` advance logic
- Importing the UI store into the data layer (the whole point is to AVOID
  that — the value arrives via the draft)
- demoData/seed call sites — leave them on the UTC default (deterministic
  fixtures); only real user-facing create flows set `seedToday`

## Git workflow

- Branch: `fix/ai-recurring-seed-timezone`
- Commit: `fix(recurring): seed first run from the app timezone, not UTC`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Add the optional draft field

Add `seedToday?: string` to `RecurringDraft` and `RecurringInvestmentDraft`
(a `YYYY-MM-DD` string; comment it as "app-timezone 'today' for seeding the
first run; omitted → UTC fallback"). `npx tsc` → still green (optional field).

### Step 2: Pass it through in the repository

In `createRecurringRow` and `createRecurringInvestmentRow`, change the calls to
`firstFutureRunDate(input.nextRunDate, frequency, input.dayOfMonth, input.seedToday)`.
When `seedToday` is undefined the function's own default applies — behavior
unchanged for existing callers.
**Verify**: `npx tsc` → exit 0; `npm test` → all pass (852; nothing sets the
field yet, so no behavior change).

### Step 3: Set `seedToday` at the real create sites

At each route/component that builds a recurring draft and calls
`createRecurringTransaction` / `createRecurringInvestment` (grep to find them —
expect `RecurringRulesTab` and `RecurringInvestmentsTab`, maybe QuickAdd),
obtain `timezone` the way plan 120 did (`useUiPreferences((s) => s.timezone)`)
and add `seedToday: todayInTimezone(timezone)` to the draft object. Import
`todayInTimezone` from `../domain` where needed.
**Verify**: `npx tsc` → exit 0.

### Step 4: Gates

**Verify**: `npm test` → 852 pass; `npm run lint` → exit 0.

## Test plan

The seeding logic itself is already unit-tested (plan 120's
`recurringDates.test.ts` covers the injected-`today` boundary). This plan is
wiring; tsc + the existing suite are the gate. If you want one belt-and-braces
test, assert that a draft carrying `seedToday` produces the timezone-derived
first run — but only if it can be done against the existing repository test
harness without new scaffolding; otherwise skip and say so.

## Done criteria

- [ ] `RecurringDraft`/`RecurringInvestmentDraft` have an optional `seedToday`
- [ ] Both `firstFutureRunDate` callers pass `input.seedToday`
- [ ] `grep -n "seedToday: todayInTimezone" src/routes src/components` shows the
      real create flows set it
- [ ] `npx tsc`, `npm test` (852), `npm run lint` all green
- [ ] No UI-store import added to `src/data/`
- [ ] `plans/README.md` status row updated

## STOP conditions

- The draft is built somewhere without timezone access AND not under a
  component that can call `useUiPreferences` — report the exact call site.
- Setting `seedToday` breaks a demoData/seed fixture's determinism (it should
  NOT — leave those unset) — if a fixture path flows through the same builder,
  report rather than forcing a value.

## Maintenance notes

- This closes plan 120's one deferred item; after it lands, no recurring path
  seeds from UTC.
- Reviewer: confirm demoData/seed still use the UTC default (deterministic
  fixtures) and only user create flows set `seedToday`.
