# Plan 182: 多類別拆分 UI — MOZE-style multi-category entry in EntryDrawer + collapsed/expandable list rows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat <planned-at SHA>..HEAD -- src/routes/CashFlowRoute.tsx src/routes/cashFlowGrouping.ts src/styles/globals.css`
> Plus: plan 181 MUST be DONE and merged (check `plans/README.md` and
> `grep -n "createSplit" src/data/repositories.ts` → interface + implementations
> exist). If 181 is not merged, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (edits the busiest route file; must not regress plain entry,
  fee-leg, transfer, or installment flows)
- **Depends on**: plans/181-split-legs-foundation.md (createSplit/updateSplit/buildSplitLegs)
- **Category**: direction (roadmap 規劃中「多類別」, spike phases P4–P5)
- **Planned at**: commit `232b90df`, 2026-07-13 — re-run
  `git rev-parse --short HEAD` and treat the post-181 merge commit as the real
  baseline for the drift check.

## Why this matters

The operator chose the exact UX (2026-07-13, with MOZE screenshots as the
reference):

- **Entry**: in the add-entry form, the category area gains a「+」— tapping it
  adds another category, EACH selected category carries its own amount, and
  the form's total becomes the DERIVED sum of leg amounts (MOZE shows
  「多類別 $180」when Test $90 + 餐點 $90). No "allocate a fixed total"
  flow — the total is computed, so the sum invariant holds by construction.
- **List**: a split shows as ONE collapsed row (merchant + total +「拆分 N 筆」
  badge) that expands to its per-category legs — same presentation idea the
  transfer pair already uses.
- **Edit**: opening an existing split re-enters the same multi-category form.
- 分帳 (counterparty) is phase 2 — out of scope.

## Current state (verified at `232b90df`; re-verify after the 181 merge)

- `src/routes/CashFlowRoute.tsx:2052` — `function EntryDrawer({...})`: the
  add/edit form. Read the whole component before editing. Key regions:
  - Category chips: `:2527` (`categories.map`) and `:2555`
    (`subcategories.map`) — parent chips then child chips; category +
    subcategory are stored as TWO separate fields (`category`, `subcategory`)
    on the draft.
  - The amount field and sign composition by entryType — find where the draft
    `amount` is built on save and match its sign convention.
  - Save path: `useRepositoryMutation` wrappers near the top of the file
    (`createLedgerTransaction` / `updateLedgerTransaction` — grep them).
- `src/routes/CashFlowRoute.tsx:2864-2880` — the transfer-collapse precedent:

  ```tsx
  /** A transfer's two legs (same groupId) collapse into one display row so the
   ... */
  if (row.entryType === "transfer" && row.groupId) {
    if (seen.has(row.groupId)) continue;
  ```

  Splits need the same collapse keyed on `legKind === "category"` groups.
- `src/routes/cashFlowGrouping.ts` — `groupByDay` / `groupByMonth` (generic
  over rows). Decide whether the split-collapse happens BEFORE grouping (a
  synthetic display row, like transfers do) or inside the render — follow
  whichever the transfer path does and stay consistent with it.
- From plan 181 (merged before this runs): `createSplit(shared, legs)`,
  `updateSplit(groupId, shared, legs)`, `buildSplitLegs`, `legKind` on
  `LedgerTransaction`, `classifyLedgerGroup` returning `"split"`.
- Design references the executor should read: `docs/split-legs-plan.md`
  (approved model) and the MOZE-style spec above. Styling: COSS components,
  `ns-*` classes, inline styles only for dynamic values; zh-TW copy inline
  matching the file; amounts in `var(--ns-font-mono)` like sibling rows.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Install   | `npm install`      | exit 0 (fresh worktree — run FIRST) |
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0, 0 errors    |

## Scope

**In scope**:
- `src/routes/CashFlowRoute.tsx` (EntryDrawer + list rendering)
- `src/routes/cashFlowGrouping.ts` ONLY if the collapse must live there (prefer
  the route, matching transfers)
- `src/routes/splitEntryState.ts` + test (create — pure helpers for the
  leg-row editing state: add/remove/edit leg, derived total; keeps the
  route-file diff small and testable)
- `src/styles/globals.css` only if a genuinely new `ns-*` class is needed

**Out of scope** (do NOT touch):
- `src/data/repositories.ts`, `src/domain/splitLegs.ts` — 181's frozen surface.
- QuickAdd (`⌘N`) — split entry via natural language is a separate future item.
- Transfer/installment/fee-leg display logic — reuse patterns, don't modify them.
- 分帳 / counterparty UI.
- Budgets/analytics — they already count legs independently.

## Git workflow

- Branch: `feat/ai-split-legs-entry-ui`
- Conventional commits, e.g. `feat(cash-flow): MOZE-style multi-category split entry`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1: Pure leg-editing state helpers

`src/routes/splitEntryState.ts`: a small reducer-style module —
`{ legs: Array<{ amount: string; category: string; subcategory: string }> }`
with add/remove/update operations and `derivedTotal(legs)` (parse amounts,
ignore blanks, round per repo convention). Unit-test it (model after
`src/routes/holdingDetailToday.ts` + test — the extracted-route-helper
precedent).

**Verify**: `npm test` → new test passes.

### Step 2: EntryDrawer — MOZE-style multi-category

In the category-chips region (`:2527`): add a「+ 分類」affordance visible when
a category is already selected and entryType is expense or income (NOT
transfer). Tapping it switches the draft into split mode:

- Each leg renders as a row: category/subcategory chips (reuse the existing
  chip-picker markup) + its own amount input + remove (×). Minimum 2 legs in
  split mode; removing down to 1 exits split mode back to the plain form.
- The main amount field becomes a read-only derived total labelled
  「多類別 · 共 $X」(sum of leg amounts) while split mode is on.
- Save: split mode calls `createSplit` (new) or `updateSplit(groupId, ...)`
  (editing an existing split); plain mode is byte-identical to today's path.
  Disable save while any leg has no category or a non-positive amount, with
  the existing field-error affordance the form uses.
- Editing: when the drawer opens for a row whose group classifies as `"split"`
  with `legKind === "category"` legs, hydrate split mode from ALL legs of the
  group (shared fields from the first leg). A fee-leg pair (legKind null) must
  NOT open as a split — it keeps today's behavior.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.

### Step 3: List — collapse + expand

Mirror the transfer collapse (`:2864`): rows whose group has
`legKind === "category"` legs collapse into one display row — merchant/name,
derived total, category cell shows「拆分 N 筆」as a badge. Clicking/tapping the
row toggles an inline expansion listing each leg (category → amount, mono
font, muted), styled like the mockup approved by the operator (indent +
left border). Row actions (edit/delete) operate on the group: edit opens the
Step-2 split form; delete uses the existing cascade (confirm copy should say
整組刪除).

**Verify**: `npx tsc --noEmit` → 0; `npm test` → all pass (cashFlowGrouping
tests untouched unless you moved the collapse there — then extended).

### Step 4: Guard the other consumers visually

Manually verify by reading code (state findings in the report): the 收支
totals and category chart in CashFlowRoute sum RAW rows (legs), not display
rows — so a split contributes per-leg category spend and the correct total;
the「拆分 N 筆」display row must NOT be double-counted anywhere that sums
display rows instead of raw rows. If any aggregation in the route sums the
collapsed display list, fix it to sum raw rows.

**Verify**: `npm test` → all pass; report the aggregation audit result.

## Test plan

- `splitEntryState.test.ts`: add/remove/update legs; derived total with
  blanks/invalid amounts; exit-split-mode-at-1-leg rule.
- Extend `cashFlowGrouping.test.ts` ONLY if the collapse moved there.
- jsdom render tests for EntryDrawer are not repo convention — the safety net
  is 181's repository tests + the pure state helpers + typecheck. List the
  manual flows you could not exercise (add split / edit split / delete group /
  expand row) for the reviewer's live pass.

## Done criteria

- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` all pass with the new state-helper tests
- [ ] `grep -n "createSplit\|updateSplit" src/routes/CashFlowRoute.tsx` → both wired
- [ ] `grep -n "拆分" src/routes/CashFlowRoute.tsx` → entry affordance + list badge exist
- [ ] Plain (non-split) entry path diff-minimal: saving a single-category
      expense still calls `createLedgerTransaction` (grep confirms the call remains)
- [ ] Fee-leg pairs do not open as splits (code-read check; state it in the report)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 181 is not merged, or its `createSplit`/`updateSplit` signatures differ
  from this plan's assumptions.
- The EntryDrawer's draft state turns out to be shaped so that per-leg amounts
  can't coexist with the existing amount field without restructuring the whole
  form — report the structure instead of a rewrite.
- The list virtualization / grouping pipeline makes group-collapse infeasible
  without touching `cashFlowGrouping.ts`'s generic contract — report before
  changing its exported types.
- Any aggregation double-counts or drops legs and the fix would touch
  `src/domain/` — report; domain totals are 181/consumer territory.

## Maintenance notes

- 分帳 phase 2 will add a counterparty picker per leg + optional AR/AP spawn —
  the leg-row UI should tolerate an extra field later (keep the row layout a
  flex-wrap, not a rigid grid).
- QuickAdd split parsing (「家樂福 1280 傢俱800 食物480」?) is deliberately
  future work.
- Reviewer live pass (jsdom can't cover): add a 2-leg and 3-leg split, edit
  legs, delete the group, expand/collapse in the list, and confirm 收支 totals
  and category chart match the legs.
