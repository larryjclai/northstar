# Plan 064: Add a 「刪除持倉」button to the holding edit UI (wire up deleteManualHolding)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command. Touch only in-scope files. If a STOP condition occurs, stop and report.
> Commit in the worktree. SKIP plans/README.md. Audit claims against tool results.
> Reply with EXACTLY the report format at the end.
>
> **Drift check (run first)**:
> `git diff --stat a2684392..HEAD -- src/routes/InvestmentsRoute.tsx src/routes/HoldingEditModal.tsx src/data/repositories.ts`
> Compare the "Current state" excerpts against live code first.

## Status
- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (UI wiring of an existing, tested repo method)
- **Depends on**: plan 058/060 (merged) — manual-holding model + guard
- **Category**: feature (UX)
- **Planned at**: commit `a2684392`, 2026-06-23

## Why this matters
Operator-reported: an imported/manual holding can't be removed — there is NO delete
button in the holding edit UI. The repository method `deleteManualHolding(id)` exists
(and enforces a guard), but it was never wired to any button. The only current way to
delete a manual holding is the indirect 060 path (delete its opening lot in 交易紀錄),
which is undiscoverable. Add an explicit 「刪除持倉」button.

## Current state
- `src/data/repositories.ts` — `deleteManualHolding(id)` (browser ~line 989; SQLite
  override): tombstones the manual asset + its opening record; throws
  `"已有逐筆交易的持倉不能直接刪除。"` if the asset has live non-cashless records.
  (Already correct + tested — just call it.)
- **The 持倉 list edit modal lives INLINE in `src/routes/InvestmentsRoute.tsx`** (NOT
  `HoldingEditModal`): `editingAsset` state (line ~1004), `setEditingAsset(asset)` on
  the row 編輯 button (~1086), the modal JSX with `<h2>編輯持倉</h2>` (~1474), and
  existing mutations `updateHolding` / `updateClassification` / `createSnapshot` /
  `deleteSnapshot` (used around ~1107-1132). On save it calls e.g.
  `await updateHolding.mutateAsync({...}); setEditingAsset(null);`.
- `src/routes/HoldingEditModal.tsx` — a SEPARATE edit modal used by
  `HoldingDetailRoute`. Props `{ editingAsset: PortfolioAsset | null, onClose }`; same
  family of mutations (updateHolding etc.). Add the delete here too for consistency.
- Mutation pattern (both files): `const x = useRepositoryMutation((repo, arg) =>
  repo.method(arg), [invalidationKeys])`. Existing holding mutations invalidate roughly
  `["assets","investments","accounts", …]` — match the keys used by `updateHolding` in
  each file.
- Inline two-click confirm pattern (NO `window.confirm` — Tauri no-op): see
  `GeneralSection.tsx` / the price-snapshot delete in these files (`confirmDeleteId ===
  id ? <確認> : <刪除>`).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev (visual) | `npm run dev` | serves 127.0.0.1 |

## Scope
**In scope:**
- `src/routes/InvestmentsRoute.tsx` — add a `deleteHolding` mutation
  (`(repo, id) => repo.deleteManualHolding(id)`, invalidate like `updateHolding`) + a
  「刪除持倉」button in the inline edit modal, shown ONLY when
  `editingAsset.holdingSource === "manual"`. Two-click inline confirm; on success
  `setEditingAsset(null)`; on guard rejection show the error message (existing message
  surface in the modal, or a toast).
- `src/routes/HoldingEditModal.tsx` — the same delete button + mutation, gated on
  `editingAsset.holdingSource === "manual"`; on success call `onClose()`.

**Out of scope:**
- `deleteManualHolding` itself (already correct/tested) — just call it.
- Non-manual (transaction-source) holdings — they have no manual-delete (the button is
  hidden for them; they're removed by deleting their trades).
- The 交易紀錄 opening-lot path (plan 060, already shipped) — leave it.

## Git workflow
- Branch from current main: `git checkout -B advisor/064-delete-holding-button main`.
- Short imperative commit. Do NOT push/PR.

## Steps
### Step 1: InvestmentsRoute inline edit modal — delete button
Add the `deleteHolding` mutation. In the inline 編輯持倉 modal, for a manual holding,
add a 刪除持倉 button (visually a danger action, e.g. `var(--ns-neg)`) using the
two-click inline confirm. On confirm: `await deleteHolding.mutateAsync(editingAsset.id)`
then `setEditingAsset(null)`; wrap in try/catch and surface the guard error
(`"已有逐筆交易的持倉不能直接刪除。"`) to the user.
**Verify**: `npx tsc --noEmit` → 0.
### Step 2: HoldingEditModal — same delete button
Mirror the button + mutation in `HoldingEditModal.tsx` (manual-only; `onClose()` on
success; surface the guard error).
**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.
### Step 3: visual check
Run dev; open 投資 → 持倉 → 編輯 on a manual holding → 刪除持倉 → confirm → the row
disappears. On a holding WITH real trades, the guard error shows and nothing is removed.
(If no preview, code inspection + gates; say so.)
### Step 4: full verification
`npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0.

## Test plan
- UI wiring; primary verification is the existing `deleteManualHolding` tests in
  `repositories.investments.test.ts` (already cover tombstone + guard) staying green +
  visual/code inspection. Do NOT duplicate the repo-level delete tests.
- Existing suite stays green.

## Done criteria
- [ ] A manual holding can be deleted from the 持倉 list 編輯 (and from HoldingDetail's edit)
- [ ] The button is hidden for transaction-source holdings
- [ ] A holding with real trades shows the guard error and is NOT removed
- [ ] `npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0
- [ ] Only the 2 in-scope route files modified

## STOP conditions
- Cited code doesn't match (drift since `a2684392`).
- The inline modal turns out to actually render `<HoldingEditModal>` (not inline) — then
  put the button only there; report.
- Calling `deleteManualHolding` requires changing the repo method — it must not; stop.

## Maintenance notes
- Reviewer: confirm the button is manual-only and the guard error is surfaced (not
  swallowed). Both edit surfaces should behave the same.
- The two edit surfaces (InvestmentsRoute inline + HoldingEditModal) duplicate edit
  logic — a future refactor could unify them; out of scope here.
