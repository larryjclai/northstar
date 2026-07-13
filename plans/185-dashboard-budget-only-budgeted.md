# Plan 185: 總覽預算進度只顯示有設定預算的分類

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bb051f59..HEAD -- src/routes/DashboardRoute.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (product behavior — operator decision)
- **Planned at**: commit `bb051f59`, 2026-07-13

## Why this matters

Operator decision: 總覽的「預算進度」卡目前把**沒有設定預算**的分類也列進來
（顯示「無上限」加一條固定 50% 的假進度條），佔掉 5 個名額卻傳達不了任何
預算資訊 —「呈現上沒意義」。卡片應只列有設定預算的分類；分類支出的完整
排行已有 記帳 → 分類 分頁負責。

## Current state

- `src/routes/DashboardRoute.tsx` — the only file in scope.

- **budgetCats memo** (line 508–526): builds per-category spend for the
  current month, then:

  ```tsx
  // Surface categories that have a budget or some spend; sort by usage.
  return cats
    .filter((c) => c.budget || c.spent > 0)
    .sort((a, b) => (b.spent / (b.budget || b.spent || 1)) - (a.spent / (a.budget || a.spent || 1)))
    .slice(0, 5);
  ```

  `c.budget` is `number | null` (from `appSettings.categories[].budget`).
  The `|| c.spent > 0` arm is what admits budget-less categories.

- **Card render** (line 1191–1225). The per-row render (line 1199–1214) has
  a dead-branch-to-be:

  ```tsx
  const pct = c.budget ? Math.min(c.spent / c.budget, 1) : 0;
  const over = c.budget ? c.spent > c.budget : false;
  ...
  <div style={{ width: `${(c.budget ? pct : 0.5) * 100}%`, ... }} />
  ...
  {c.budget ? <span className={"num " + (over ? "neg" : "muted")}>{(pct * 100).toFixed(0)}%</span> : <span className="dim">無上限</span>}
  ```

  The `0.5` fake bar and the `無上限` span exist only for budget-less rows.

- **Empty state** (line 1195–1196): `本月尚無支出或預算資料。` — after the
  filter change this state means "no budgets configured", so the copy must
  point at where to set budgets. The card header already has a
  `管理分類 →` action linking to `/cash-flow/categories` (line 1194).

- **Downstream consumers of `budgetCats`** (all in this file — verified):
  `totalBudget` (527), `overBudget` (528), the metric-tile `budgetSub`
  (847–851, 871), the over-budget callout (961–965), and the card itself.
  All keep working with a budgeted-only list; `budgetSub`'s
  `topBudgetCat.budget` guard becomes always-true but stays harmless.

- Copy convention note: AGENTS.md says UI copy is round-tripped via
  `copy.csv` — that applies to catalogued surfaces (i18n keys). These
  dashboard strings are hardcoded zh-TW literals in the TSX (see the
  excerpts), so edit them in place, matching the existing style.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npx tsc --noEmit`   | exit 0              |
| Tests     | `npm test`           | all pass (~1146)    |
| Lint      | `npm run lint`       | exit 0              |

## Scope

**In scope** (the only file you should modify):
- `src/routes/DashboardRoute.tsx` — the `budgetCats` memo, the budget card's
  row render + empty state, and (only if trivially entailed) the `budgetSub`
  guard simplification.

**Out of scope** (do NOT touch, even though they look related):
- 記帳 → 分類 (`CategoriesTab.tsx`) — spend-without-budget belongs there and
  must keep showing all categories.
- `appSettings.categories` schema, budget editing UI, and any `domain/` code.
- The other dashboard cards and `cardVisible` plumbing.

## Git workflow

- Branch: `fix/ai-dashboard-budget-budgeted-only`
- Conventional commits, e.g. `fix(dashboard): budget card lists only budgeted categories`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Filter to budgeted categories

In the `budgetCats` memo, change the filter + sort to:

```tsx
// Only categories with a configured budget — spend-only categories carry no
// budget signal here (full spend ranking lives in 記帳 → 分類).
return cats
  .filter((c): c is typeof c & { budget: number } => c.budget !== null && c.budget > 0)
  .sort((a, b) => b.spent / b.budget - a.spent / a.budget)
  .slice(0, 5);
```

(If the type-predicate form fights the inferred element type, a plain
`.filter((c) => (c.budget ?? 0) > 0)` with the existing sort's `|| 1`
fallbacks kept is acceptable — correctness over elegance.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Remove the now-dead 無上限 branches in the row render

In the card's row render:
- `const pct = Math.min(c.spent / (c.budget || 1), 1);` (or keep the ternary
  if you kept nullable budget in Step 1 — but the `0.5` fake width must go:
  `width: `${pct * 100}%``).
- Replace the `{c.budget ? <span…% </span> : <span className="dim">無上限</span>}`
  conditional with the percent span only.

**Verify**: `grep -n "無上限" src/routes/DashboardRoute.tsx` → 0 matches;
`grep -n "0.5" src/routes/DashboardRoute.tsx` → no match inside the budget
card's bar width expression.

### Step 3: Empty-state copy for "no budgets configured"

Change line ~1196 to:

```tsx
<div className="muted text-body">尚未設定分類預算 — 到「管理分類」為分類設定每月預算後，這裡會顯示進度。</div>
```

**Verify**: `grep -n "尚未設定分類預算" src/routes/DashboardRoute.tsx` → 1 match.

### Step 4: Full gate

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0;
`npm test` → all pass.

## Test plan

The memo is inline in the route component (no exported pure function), and
the repo's route-level tests don't cover this card; extraction-for-testing
is deliberately out of scope for an S fix. Existing suite must stay green.
Operator visual pass: a category with spend but no budget (e.g. 交通)
disappears from the card; with zero budgets configured the new empty-state
copy shows; 總預算 footer unchanged for budgeted categories.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -n "無上限" src/routes/DashboardRoute.tsx` → no matches
- [ ] Budget card filter admits only `budget > 0` categories
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `budgetCats` excerpt no longer matches the live code.
- You find another consumer of `budgetCats` outside the five listed in
  "Current state" (semantics may have grown since planning).
- Removing the 無上限 branch breaks a test — that would mean the branch is
  covered somewhere this plan didn't foresee; report which test.

## Maintenance notes

- Plan 039 (advanced budgets: rollover/annual) touches the same memo if it
  ever executes — whoever builds it should re-derive the filter from that
  plan's semantics, not blindly keep this one.
- Reviewer should scrutinize: the metric tile (`budgetSub`) and over-budget
  callout still render sensibly when only 1–2 categories have budgets.
- Deferred: an "add budgets" call-to-action chip inside the card (beyond the
  copy + existing 管理分類 link) — only if the operator asks.
