# Plan 028: Goal target date + 超前/落後 pace indicator (was 023-B)

> **Executor instructions**: This adds an optional field to the **synced**
> `FinancialGoal` model, then a pace indicator. Follow the established
> extension-column pattern exactly (see "Current state"). Build the data layer
> first and confirm it round-trips before touching UI. Run every verification
> command. Honor STOP conditions (sync/migration are the risk). When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4cc86eab..HEAD -- src/domain/types.ts src/data/repositories.ts src/features/goals/GoalEditorSheet.tsx src/routes/GoalsRoute.tsx`
> If any changed, re-confirm the "Current state" excerpts before proceeding.

## Status
- **Priority**: P3 (deferred from the 023 backlog; needs a data-model change)
- **Effort**: M
- **Risk**: MED (touches the synced `FinancialGoal` model + SQLite migration)
- **Depends on**: none
- **Category**: direction (feature) / data-model
- **Planned at**: commit `4cc86eab`, 2026-06-18

## Why this matters
Custom savings goals (旅遊 / 買車…) show only a percent and an estimated
"years to reach", but no sense of whether you're **ahead or behind the pace**
needed to hit a deadline — because goals have **no target date** today
(`FinancialGoal` has `targetAmount` but no deadline). This was deferred from the
023 UX backlog precisely because it needs a data-model change. Adding an optional
`targetDate` unlocks a 「超前 X% / 落後 X%」indicator that makes a goal actionable.

## Current state (verified at 4cc86eab)

**Model** — `src/domain/types.ts`: `interface FinancialGoal extends SyncFields`
has `targetAmount: number | null` and `startDate: string` but **no** `targetDate`.
It is a **synced** type (extends `SyncFields`).

**Persistence** — `src/data/repositories.ts`:
- Goals live in a SQLite table `financial_goals` (`src/data/migrations.ts:174`).
- New columns are added **idempotently** via `ensureSqliteColumn(...)` — see the
  block at lines 1924-1938, e.g. `await this.ensureSqliteColumn("financial_goals", "income_items", "text");`.
  The comment there (1924-1926) states readers coalesce missing values to defaults.
- Write mapping: `goalFieldsFromDraft(input)` (used in `upsertFinancialGoal`, lines
  1344 & 1361) builds the goal record from a draft.
- Read mapping (SQLite): the goal SELECT at ~lines 3022-3031 aliases columns
  (`target_amount as targetAmount, start_date as startDate, … income_items as incomeItems … from financial_goals`),
  a row type (~3006-3017), and an object build (~3039-3041, e.g.
  `targetAmount: row.targetAmount ?? null`, `incomeItems: parseJsonArray(...)`).
- There is also a SQLite **INSERT/UPDATE** for `financial_goals` (mirror how
  `income_items` / `start_date` are written there — find it near the goal upsert).
- `FinancialGoalDraft` interface (~line 179) lists draft fields incl.
  `targetAmount`, `startDate`, `incomeItems?`.

**Sync** — goals sync through the same generic record/outbox mechanism as the
existing extension columns (`income_items`, `display_mode`, `account_share_map`
are already synced with no per-column sync code). So a new column rides along the
same way — **but you must confirm** goal rows enter the sync outbox generically
(mirror `income_items` exactly; if `income_items` required special sync code, so
does `target_date`).

**Editor** — `src/features/goals/GoalEditorSheet.tsx`: the create/edit sheet for
**custom** goals only (FIRE goals use the FIRE calculator). It has
`targetAmount` state (lines 39/49) and a 「目標金額」`NumberField` (~160-161); the
save payload (~99-107) sets `kind: "custom"`, `targetAmount`, `startDate`.

**Goal display** — `src/routes/GoalsRoute.tsx`: `stats` (~98-99) computes
`progress = currentValue / target * 100` and `years`; the progress line (~213)
shows `{progress}% · 預估 N 年後達成`. Custom goals are `kind !== "fire"`.

**Conventions**: domain calc changes ship with a unit test; zh-TW; DS tokens.
SyncFields + optional/nullable fields keep old backups loading.

## Design decisions (settled)
1. `targetDate: string | null` (ISO `YYYY-MM-DD`), **optional/nullable** — old goals
   and FIRE goals have `null` and behave exactly as today.
2. Pace applies to **custom goals with both a `targetDate` and `targetAmount`**.
   FIRE goals are unaffected (they keep their projection-based "years to FI").
3. **Pace math** (linear, explainable): given `startDate`, `targetDate`, and
   `progressPct` (actual), expected progress now = `clamp((now − startDate) / (targetDate − startDate), 0, 1) × 100`.
   `delta = actualProgress − expectedProgress`. Status: `delta ≥ +2pp` → 超前;
   `delta ≤ −2pp` → 落後; else 約略符合 (on track). Past the targetDate: if not
   100%, show 落後 (overdue). Null when targetDate is absent.
4. Display: a small chip next to the existing progress line on `GoalsRoute`
   (超前 in `--ns-pos`, 落後 in `--ns-neg`, on-track muted). Don't replace the
   existing % / 預估 line — augment it.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors (~700 warnings ok) |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass incl. new test |

## Scope
**In scope**:
- `src/domain/types.ts` (add `targetDate: string | null` to `FinancialGoal`; add to `FinancialGoalDraft`)
- `src/data/repositories.ts` (ensureSqliteColumn + read/write/draft mapping for `target_date`)
- `src/domain/goalPace.ts` (create — pace math) + `src/domain/goalPace.test.ts` (create)
- `src/features/goals/GoalEditorSheet.tsx` (a 目標日期 date input for custom goals)
- `src/routes/GoalsRoute.tsx` (render the 超前/落後 chip)

**Out of scope**:
- FIRE goals / the FIRE calculator (unaffected — they don't get a target date here).
- Any change to how `progress` / `currentValue` / `target` are computed (consume them).
- The sync protocol itself (only add the column the way existing columns are added).

## Steps

### Step 1: Model + draft
Add `targetDate: string | null` to `FinancialGoal` (after `startDate`) and to
`FinancialGoalDraft` in `repositories.ts` (optional there if the draft uses
optionals). **Verify**: `npx tsc --noEmit` shows the expected errors only at the
read/write sites you'll fix next (or 0 if defaults cover them).

### Step 2: Persistence (follow the income_items precedent exactly)
- Add `await this.ensureSqliteColumn("financial_goals", "target_date", "text");`
  in the block at ~1936 (next to `income_items`).
- Write: add `target_date` to `goalFieldsFromDraft` and the goal INSERT/UPDATE SQL,
  mirroring `start_date` / `income_items`.
- Read: add `target_date as targetDate` to the goal SELECT (~3024), the row type
  (~3006-3017), and the object build `targetDate: row.targetDate ?? null` (~3039).
**Verify**: `npx tsc --noEmit` → 0. Then a round-trip check (Step 5 visual) — a
saved targetDate reloads.

### Step 3: Pace domain helper (test-first)
Create `src/domain/goalPace.ts`:
```ts
export type GoalPaceStatus = "ahead" | "behind" | "onTrack" | "none";
export interface GoalPace { status: GoalPaceStatus; expectedPct: number | null; deltaPp: number | null; }
export function goalPace(opts: { startDate: string; targetDate: string | null; actualPct: number; now?: string }): GoalPace
```
Implement Design decision #3. Create `goalPace.test.ts` (model after an existing
domain test, e.g. `src/domain/fireGoal.test.ts`): on-track (actual≈expected),
ahead, behind, no targetDate → `none`, overdue+incomplete → behind, dates equal →
guard against divide-by-zero. **Verify**: `npm run test -- goalPace` → pass.

### Step 4: Editor + display
- `GoalEditorSheet.tsx`: add `targetDate` state (default `goal?.targetDate ?? ""`),
  a 「目標日期（選填）」date input near 目標金額, and include `targetDate: targetDate || null`
  in the save payload. A native date input or the repo's existing date control is fine.
- `GoalsRoute.tsx`: for custom goals, compute `goalPace({ startDate, targetDate, actualPct: stats.progress })`
  and render a chip beside the progress line (超前/落後/on-track per #4). Render nothing when status is `none`.
**Verify**: `npx tsc --noEmit` → 0; `npm run build` → 0.

### Step 5: Full verification + round-trip
`npm run test` (all pass incl. goalPace), `npm run lint` (0 errors), `npm run build` (0).
`npm run dev`: create a custom goal with a target amount + a future target date →
a 超前/落後 chip appears and is correct; set the date in the past with <100% → 落後;
**reload the app** → the target date persisted (proves the DB column round-trips);
a goal with no target date shows no chip (unchanged behavior); FIRE goal unaffected.

## Test plan
- `src/domain/goalPace.test.ts` — the cases in Step 3 (this is the correctness core).
- Manual round-trip (Step 5) is the migration/sync proof; no DB unit test required.
- Existing suite stays green.

## Done criteria (ALL)
- [ ] `FinancialGoal.targetDate` exists; old goals (null) behave unchanged
- [ ] `grep -n "target_date" src/data/repositories.ts` → ensureSqliteColumn + read + write present (≥3)
- [ ] `src/domain/goalPace.ts` + `.test.ts` exist; tests pass
- [ ] Custom goal with a target date shows a correct 超前/落後 chip; persists across reload
- [ ] `npx tsc --noEmit` 0; `npm run build` 0; `npm run lint` 0 errors; `npm run test` pass
- [ ] No change to FIRE goal behavior / `progress` computation (`git diff`)
- [ ] `plans/README.md` row updated

## STOP conditions
- The goal read/write mapping or `goalFieldsFromDraft` differs from "Current state" — report.
- `income_items` (the precedent column) turns out to require **per-column sync code**
  you must replicate for `target_date` and it's non-obvious — STOP and report (don't
  guess at the sync protocol).
- A migration/ALTER would run non-idempotently (must use `ensureSqliteColumn`, never a bare ALTER).
- `npm run build` fails twice after a reasonable fix.

## Maintenance notes
- This `targetDate` is the field plan 023-B (now this plan) needed; a future
  "goal funded-by date forecast" can reuse it.
- Reviewer: the risk is the **synced data-model change** — verify (a) `ensureSqliteColumn`
  is used (idempotent), (b) old goals load with `targetDate=null`, (c) the value
  round-trips through save→reload, and (d) it syncs like `income_items`.
- Follow-on: a deadline could feed a north-star "on-track for goal X" metric (plan 024).
