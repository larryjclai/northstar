# Plan 120: Route "today / current month" through the app timezone (UTC rollover sweep)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/domain/recurringDates.ts src/routes/DashboardRoute.tsx src/routes/settings/CategoriesSection.tsx src/routes/CashFlowRoute.tsx src/data/repositories.ts`
> Re-locate excerpts by grep on mismatch; STOP if the code shape differs.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Ledger dates are stamped with the user's timezone preference via
`nowAsDatetimeLocal(timezone)` / `todayInTimezone(timezone)`
(`src/domain/datetime.ts`), but several "what is today / this month" reads use
UTC (`new Date().toISOString()`). For a Taipei user (UTC+8), between 00:00 and
08:00 local the two disagree: on the 1st of a month before 08:00, the
Dashboard month KPI and the budget "已消費" column show **last month**, while
newly added transactions land in the new month. New recurring rules created in
that window seed their first run a day early.

## Current state

The canonical helper — `src/domain/datetime.ts:28` exports
`todayInTimezone(timezone: string): string` (returns `YYYY-MM-DD`). The
timezone preference comes from app settings; see how `AppShell.tsx` and
`QuickAdd.tsx` obtain and pass it (grep `todayInTimezone(` and
`nowAsDatetimeLocal(` for exemplars).

Sites to fix (verified present at the planned-at commit):

1. `src/routes/DashboardRoute.tsx:152`
   ```ts
   const monthKey = new Date().toISOString().slice(0, 7);
   ```
   Drives the month cash-flow KPI and budget card (`row.date.startsWith(monthKey)`).
2. `src/routes/settings/CategoriesSection.tsx:368`
   ```ts
   const currentMonth = new Date().toISOString().slice(0, 7);
   ```
3. `src/routes/CashFlowRoute.tsx:1692` (inside `UpcomingPayments`)
   ```ts
   const today = new Date().toISOString().slice(0, 10);
   const horizon = (() => { const d = new Date(); d.setDate(d.getDate() + 14); ...
   ```
4. `src/domain/recurringDates.ts:4` (inside `firstFutureRunDate`)
   ```ts
   const today = new Date().toISOString().slice(0, 10);
   ```
   Called from `src/data/repositories.ts` in `createRecurringRow` /
   `createRecurringInvestmentRow` (grep `firstFutureRunDate(`, two call sites
   around lines 5074 and 5092).

There are ~14 more `new Date().toISOString().slice(0, 10)` sites that only
seed **default form dates** (GoalEditorSheet, HoldingEditModal,
FIRECalculatorRoute, TransactionDetailPanel refund date, ExportSection
filename, etc.). These are cosmetic-severity; fix ONLY the four above in this
plan and list the rest in your report as observed-but-deferred.

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass (~831)     |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**: the four sites above; `src/domain/recurringDates.ts` signature;
its two callers in `src/data/repositories.ts`;
`src/domain/recurringDates` tests (check whether a test file exists — if not,
add `src/domain/recurringDates.test.ts`).

**Out of scope**: `src/domain/datetime.ts` itself; `dateScope.ts`; all
default-form-date sites; any behavior change other than which calendar day
counts as "today".

## Git workflow

- Branch: `fix/ai-timezone-today-sweep`
- Commit style: `fix(datetime): derive today/current-month from app timezone`
- Do NOT push or merge to `main`.

## Steps

### Step 1: `firstFutureRunDate` takes `today` as a parameter

Change the signature to
`firstFutureRunDate(value, frequency, dayOfMonth, today = new Date().toISOString().slice(0, 10))`
— an injected `today` with the old default keeps existing tests valid. Update
the two repository callers to pass `todayInTimezone(timezone)`; find how the
repository already knows the timezone (grep `timezone` within
`repositories.ts` — `nowAsDatetimeLocal` usage shows the pattern; if the
repository has no timezone access at those call sites, STOP and report the
plumbing gap rather than threading new constructor state).

Add/extend `src/domain/recurringDates.test.ts`: given `today = "2026-07-01"`
and a monthly rule seeded `2026-06-05` dayOfMonth 5, first future run is
`2026-07-05`; and the injected-today path is respected (pass a different
`today`, assert the boundary moves with it).

**Verify**: `npm test -- recurringDates` → pass; `npx tsc` → exit 0.

### Step 2: Fix the three route/settings sites

Each component already renders under settings-aware providers; obtain the
timezone the same way nearby code does (grep the same file for `timezone` —
DashboardRoute and CashFlowRoute both already have settings in scope). Replace:

- `monthKey` → `todayInTimezone(timezone).slice(0, 7)`
- `currentMonth` → same
- `UpcomingPayments`'s `today` → `todayInTimezone(timezone)`; compute
  `horizon` by date-string arithmetic from that value (the domain has
  date-string helpers — grep `addDays` / date math in `datetime.ts`; if none
  fits, construct via `new Date(today + "T12:00:00")` noon-anchored to avoid
  DST/rollover, then slice). If `UpcomingPayments` doesn't receive the
  timezone, pass it as a prop from the parent (it is rendered inside
  CashFlowRoute which has settings).

**Verify**: `npx tsc` → exit 0; `npm test` → all pass.

### Step 3: Full gates + deferred list

**Verify**: `npm run lint` → exit 0. In your report, list the remaining
`new Date().toISOString().slice` sites (command:
`grep -rn 'new Date().toISOString().slice' src --include='*.ts*' | grep -v test`)
so the index can record them as consciously deferred.

## Done criteria

- [ ] The four sites read via `todayInTimezone`; grep
      `new Date().toISOString().slice` no longer matches in
      DashboardRoute.tsx:152 area, CategoriesSection.tsx:368 area,
      CashFlowRoute UpcomingPayments, recurringDates.ts
- [ ] `npm test` all pass incl. new recurringDates tests
- [ ] `npx tsc` / `npm run lint` exit 0
- [ ] `plans/README.md` updated (status + deferred-sites note)

## STOP conditions

- The repository call sites cannot reach a timezone value without adding
  constructor plumbing — report the gap with the exact call chain.
- Any test depends on the UTC behavior (fails after the change for a reason
  other than an updated expectation).

## Maintenance notes

- The deferred default-form-date sites are safe to migrate opportunistically;
  they only affect the pre-filled date a user can edit.
- Reviewer: confirm no site now mixes `todayInTimezone` with a UTC month
  compare in the same expression.
