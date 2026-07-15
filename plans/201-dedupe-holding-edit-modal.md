# Plan 201: Delete the duplicated 編輯持倉 modal in InvestmentsRoute; use the shared HoldingEditModal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 36d25f50..HEAD -- src/routes/InvestmentsRoute.tsx src/routes/HoldingEditModal.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED (deletes ~200 lines of live state + JSX; behavior change is intended — see below)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `36d25f50`, 2026-07-15
- **Source**: `$impeccable critique` of `src/routes` (2026-07-15, 22/40) — P0 #2. Snapshot: `.impeccable/critique/2026-07-15T08-28-57Z__src-routes.md`

## Why this matters

**This is a bug, not a refactor.** The 編輯持倉 dialog exists twice:

- `src/routes/HoldingEditModal.tsx` — a real component, used by `HoldingDetailRoute.tsx:690`.
- `src/routes/InvestmentsRoute.tsx:1715-1850` — an inline copy, rendered from the holdings list.

They started identical. **They have already diverged.** The B16 price-record feature (auto/manual toggle, read-only Yahoo daily quotes, pagination) shipped into `HoldingEditModal` and never reached the copy:

| | `HoldingEditModal.tsx` (持倉詳情 entry) | `InvestmentsRoute` copy (投資 list entry) |
|---|---|---|
| B16 auto/manual price mode | present (`priceMode`, `hasYahoo`, `yahooPrices`, `SegmentedControl`) | **absent** |
| Yahoo daily quotes, read-only + paginated | present | **absent** |
| Section heading | 「價格紀錄」 | 「價格快照紀錄」 |

Verified by grep at `36d25f50`: `priceMode|hasYahoo|yahooPrices` → **16 matches** in `HoldingEditModal.tsx`, **0** in `InvestmentsRoute.tsx`.

So the same 編輯持倉 button gives users **different capabilities depending on which page they opened it from**. A user who edits a manual holding from the investments list cannot see the Yahoo price history that the exact same dialog shows them from the holding detail page. Nobody decided that; it is drift.

Deleting the copy fixes that divergence permanently and removes the mechanism that produced it. The design critique identified this duplication as the *generator* of the wider button/icon inconsistency in this app: two copies of a dialog cannot stay consistent, and every fix to one silently leaves the other behind.

## Current state

### The component to keep — `src/routes/HoldingEditModal.tsx`

Its public interface (lines 14-22) is exactly what the call site needs — it manages **all** of its own state internally (`editForm`, `message`, `confirmDelete`, snapshot fields, all five mutations) via `useFinanceData()` / `useRepositoryMutation`:

```tsx
export function HoldingEditModal({
  editingAsset,
  onClose,
  accounts,
}: {
  editingAsset: PortfolioAsset | null;
  onClose: () => void;
  accounts: Account[];
}) {
```

It returns `null` when `!editingAsset || !editForm` (line 105), so the call site does **not** need its own conditional wrapper.

The existing call site to model after — `src/routes/HoldingDetailRoute.tsx:690`:

```tsx
        <HoldingEditModal
```

Read that call site in full before writing yours; match it.

### The copy to delete — `src/routes/InvestmentsRoute.tsx`

The JSX block starts at line 1715 and runs to the close of the `ModalShell`. Its header is byte-identical to `HoldingEditModal.tsx:170-180`:

```tsx
1715	      {editingAsset && editForm ? (
1716	        <ModalShell
1717	          variant="center"
1718	          title="編輯持倉"
1719	          onClose={() => setEditingAsset(null)}
1720	          panelClassName="w-full max-w-2xl rounded-lg border shadow-xl"
1721	          panelStyle={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
1722	        >
1723	          {(dismiss) => (<>
1724	            <header className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "var(--ns-border)" }}>
1725	              <h2 className="text-lg font-semibold">編輯持倉</h2>
1726	              <button
1727	                type="button"
1728	                onClick={dismiss}
1729	                className="grid size-8 place-items-center rounded-md outline-none transition hover:opacity-70"
1730	                aria-label="關閉"
1731	              >
1732	                <X size={18} />
1733	              </button>
1734	            </header>
```

### The supporting state that becomes dead once the copy is gone

All verified present at `36d25f50`. **`editingAsset` / `setEditingAsset` STAY** — they are the trigger, and they become the prop you pass. Everything else in this list is exclusively serving the copy:

| Line | Symbol | Disposition |
|---|---|---|
| 1119 | `const [editingAsset, setEditingAsset]` | **KEEP** — trigger + prop |
| 1120 | `const [editForm, setEditForm]` | delete |
| 1121 | `const [message, setMessage]` | delete — **but verify** (see Step 2) |
| 1122 | `const [snapshotDate, setSnapshotDate]` | delete |
| 1123 | `const [snapshotPrice, setSnapshotPrice]` | delete |
| 1124 | `const [snapshotNote, setSnapshotNote]` | delete |
| 1125 | `const [snapshotMessage, setSnapshotMessage]` | delete |
| 1219 | `const updateHolding = useRepositoryMutation(` | delete |
| 1223 | `const updateClassification = useRepositoryMutation(` | delete |
| 1229 | `const createSnapshot = useRepositoryMutation(` | delete |
| 1234 | `const deleteSnapshot = useRepositoryMutation(` | delete |
| 1238 | `const deleteHolding = useRepositoryMutation(` | delete |
| 1242 | `const [confirmDelete, setConfirmDelete]` | delete |
| 1244 | `async function submitDelete()` | delete |
| 1300 | `async function submitSnapshot()` | delete |
| 1315 | `async function submitEdit()` | delete |
| 1279 | `setEditingAsset(asset)` (the open handler) | **KEEP** |

`message` / `setMessage` is the one to check rather than assume: it is a generic name and may be read by non-modal code elsewhere in this 2260-line file. Step 2 verifies before deleting.

### Conventions to match

- `AGENTS.md` 樣式撰寫優先序: (1) COSS components; (2) `ns-*` / Tailwind utilities; (3) inline `style={{}}` **only for dynamic values**.
- Conventional commits — example from `git log`: `fix(investments): 總額 shows net cash flow incl. fee/tax`
- This repo's tests: `npm test` → 121 files / 1252 tests at `36d25f50`.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Install   | `npm install`      | exit 0 (fresh worktree has no node_modules) |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests     | `npm test`         | 121 files / 1252 tests pass |
| Lint      | `npm run lint`     | exit 0, **0 errors** (762 warnings are pre-existing) |
| Build     | `npm run build`    | exit 0 |
| Dev app   | `npm run dev`      | Vite dev server |

**Record your baseline before changing anything.**

If `npm install` rewrites `package-lock.json` (it is stale — stuck at alpha.60 while `package.json` says alpha.62), revert it: `git checkout -- package-lock.json`. Known pre-existing issue, fixed separately. Do not commit it.

## Scope

**In scope**:
- `src/routes/InvestmentsRoute.tsx` — delete the copy + its dead state, render `<HoldingEditModal>`

**Out of scope** (do NOT touch):
- `src/routes/HoldingEditModal.tsx` — **do not modify the component to accommodate the new call site.** It already works at `HoldingDetailRoute.tsx:690`; if the new call site needs the component changed, that is a STOP condition, not a licence to edit it.
- `src/routes/HoldingDetailRoute.tsx` — the existing call site stays exactly as-is.
- The raw close button and the hand-rolled delete buttons **inside** `HoldingEditModal.tsx` (lines 172-179, 196-224). They are real findings (six-close-button P0; `variant="destructive"` unused P1) but they belong to **plans 202 and 204**. Fixing them here would mean this plan's diff no longer proves the two dialogs became one. Leave them ugly; this plan is about deletion.
- Any other modal, route, or button.

## Git workflow

- Branch: `fix/ai-dedupe-holding-edit-modal` off the current `main`.
- Before branching, run `git status`. If there is uncommitted work you did not create, **STOP and report** — do not stash it (per `.agentrules`).
- Commit message: `fix(investments): 投資列表的編輯持倉改用共用 HoldingEditModal（補回 B16 價格檢視）`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the divergence still exists

This plan's justification is that the two copies differ. Verify before deleting:

```bash
grep -c "priceMode\|hasYahoo\|yahooPrices" src/routes/HoldingEditModal.tsx   # expect 16
grep -c "priceMode\|hasYahoo\|yahooPrices" src/routes/InvestmentsRoute.tsx   # expect 0
```

**If `InvestmentsRoute.tsx` returns non-zero**, someone has back-ported B16 into the copy since this plan was written — STOP and report; the deletion is still probably right but the behavior-change analysis below is stale.

**Verify**: both counts as above.

### Step 2: Verify `message` is exclusive to the modal before deleting it

```bash
grep -n "message\b\|setMessage" src/routes/InvestmentsRoute.tsx
```

Every hit must fall inside either the modal JSX block (from line 1715 to the `ModalShell` close) or the handlers listed in the dead-state table (`submitDelete` 1244, `submitSnapshot` 1300, `submitEdit` 1315).

**If any `message` / `setMessage` reference lives outside those regions, KEEP the state and report it** — do not delete it, and do not refactor the unrelated consumer.

**Verify**: state in your report which regions the hits fell in.

### Step 3: Replace the copy with the shared component

**3a.** Read `src/routes/HoldingDetailRoute.tsx:685-700` in full — that is the exemplar call site. Match its shape.

**3b.** Delete the entire JSX block from line 1715 (`{editingAsset && editForm ? (`) through the closing of that `ModalShell` ternary, and replace it with:

```tsx
      <HoldingEditModal
        editingAsset={editingAsset}
        onClose={() => setEditingAsset(null)}
        accounts={accounts}
      />
```

No conditional wrapper — `HoldingEditModal` returns `null` internally when `editingAsset` is null (line 105).

Confirm `accounts` is the correct variable name in this scope; if the route names it differently, use the route's name. If no equivalent is in scope, STOP.

**3c.** Add the import, matching the file's existing import style:

```tsx
import { HoldingEditModal } from "./HoldingEditModal";
```

**3d.** Delete every symbol marked "delete" in the dead-state table (Step 2's finding governs `message`).

**3e.** Remove now-unused imports. `npm run lint` and `tsc` will tell you which. Candidates: `ModalShell`, `HoldingForm`, `StatusText`, `X`, `Field`, `TextInput`, `DatePicker`, `SegmentedControl`, `formatPrice`, `PortfolioAssetDraft`, `ManualPriceSnapshotDraft`, `ActionButton`. **Only remove ones that are genuinely unused elsewhere in this 2260-line file** — several are near-certainly used by other sections. Let the compiler decide; do not delete on suspicion.

**Verify**: `npx tsc --noEmit` → exit 0.
**Verify**: `grep -c "ModalShell" src/routes/InvestmentsRoute.tsx` → 0 if you removed the import, or a count matching genuinely remaining uses. State which in your report.
**Verify**: `grep -n "editForm\|confirmDelete\|submitSnapshot\|snapshotPrice" src/routes/InvestmentsRoute.tsx` → no matches.

### Step 4: Gates

**Verify**: `npx tsc --noEmit` → exit 0.
**Verify**: `npm run lint` → exit 0, **0 errors**. Warning count may DROP (dead code removed); that is fine. It must not rise.
**Verify**: `npm test` → 121 files / 1252 tests, matching baseline.
**Verify**: `npm run build` → exit 0.
**Verify**: `git status --short` → only `src/routes/InvestmentsRoute.tsx`.
**Verify**: `git diff --stat` → expect roughly **−200 lines net**. If the deletion is under ~120 lines you probably missed the dead state; if anything was *added* beyond the ~6-line call site + 1 import, report what and why.

### Step 5: Confirm the behavior change is the intended one

This plan **intentionally changes behavior**: editing a manual holding from the investments list will now show the B16 price-record UI (auto/manual toggle + Yahoo quotes) that only the detail-page entry had.

Run `npm run dev`, open 投資, and edit a **manual** holding (one with `holdingSource === "manual"`). Confirm:
1. The dialog opens and the form is populated.
2. 價格紀錄 appears (not 價格快照紀錄) — and if that ticker has Yahoo data, the 自動 (Yahoo)/手動 toggle appears.
3. 刪除持倉 → 確認刪除 still works and closes the dialog.
4. Editing a **non-manual** (transaction-based) holding still shows classification-only (`classificationOnly` prop).

**If you cannot load demo data or reach a manual holding, say so plainly and report which of 1–4 you could not check.** Do not claim verification you did not perform.

## Test plan

**No new automated test**, and be explicit about it:

- Neither dialog has an existing test to extend — `grep -rn "HoldingEditModal" src/**/*.test.*` returns nothing at `36d25f50`. Verify this yourself; if a test now exists, it must still pass and you should say so.
- The change is a JSX substitution plus dead-code deletion. Its correctness is proved by the compiler (unused-symbol errors) and by the existing suite staying green.
- Writing a mount test for `HoldingEditModal` would need `useFinanceData` (DB-backed) and `useRepositoryMutation` mocking — real work, and it belongs to a test-coverage plan, not this one.

The gate is: `npm test` stays at **exactly** the baseline count. Record before and after.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "HoldingEditModal" src/routes/InvestmentsRoute.tsx` → 2 (import + call site)
- [ ] `grep -n "editForm\|confirmDelete\|submitSnapshot\|submitEdit\|snapshotPrice\|snapshotNote" src/routes/InvestmentsRoute.tsx` → no matches
- [ ] `grep -n "setEditingAsset" src/routes/InvestmentsRoute.tsx` → still present (trigger kept)
- [ ] `git diff --stat 36d25f50..HEAD -- src/routes/HoldingEditModal.tsx src/routes/HoldingDetailRoute.tsx` → **empty** (out-of-scope files untouched)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0 with 0 errors
- [ ] `npm test` exits 0 at baseline count (1252)
- [ ] `npm run build` exits 0
- [ ] `git status` shows only `src/routes/InvestmentsRoute.tsx` modified
- [ ] Net diff is approximately −200 lines
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 shows the copy already has B16 (the divergence was fixed by hand) — the analysis is stale.
- Step 2 shows `message` is consumed outside the modal's regions.
- `HoldingEditModal`'s props at `HoldingEditModal.tsx:14-22` don't match the excerpt, or `accounts` (or an equivalent) isn't in scope at the `InvestmentsRoute` call site.
- Making the shared component work at the new call site appears to require **editing `HoldingEditModal.tsx`**. It is out of scope. Report what it needs instead.
- Deleting the dead state breaks something you didn't expect — e.g. `updateClassification` turns out to be shared with a bulk-classification action elsewhere in the route. Report; do not partially delete.
- `npm test` was already failing before your change (baseline is 1252 passing).
- Step 5 shows the shared dialog behaves *worse* at the new entry point than the copy did (e.g. a manual holding can no longer be deleted). That inverts the plan's premise — report immediately.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **The two entry points now share one dialog.** Any future change to 編輯持倉 lands in one file and reaches both. That is the whole point — do not re-inline it "just for this one page."
- **This plan deliberately left `HoldingEditModal`'s internals ugly**: a raw `<button>` close (line 172-179) that bypasses the COSS Button 44pt `pointer-coarse` hit-area expansion, and three hand-rolled delete buttons with `text-white` + `background: var(--ns-neg)` inline (violating DESIGN.md §7 tokens-only). Those are **plan 202** (ModalCloseButton) and **plan 204** (destructive variant). They are now cheaper because there is one copy instead of two — which is why this plan goes first.
- A reviewer should scrutinize: that `HoldingEditModal.tsx` is genuinely untouched (the tempting "while I'm here" fix), and that the dead-state deletion didn't take a live symbol with it. The compiler catches most of this; `updateClassification` is the one worth a human look.
- Deferred out of this plan: tests for `HoldingEditModal`; the 「價格快照紀錄」 vs 「價格紀錄」 copy question is resolved by deletion (the shared component's 「價格紀錄」 wins) — no copy.csv round-trip needed since the losing string disappears.
