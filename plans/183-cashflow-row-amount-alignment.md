# Plan 183: 記帳交易列表金額置右對齊 — hover 操作鈕改為 overlay，金額貼齊右緣

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bb051f59..HEAD -- src/routes/CashFlowRoute.tsx src/styles/globals.css`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UI polish — operator-reported)
- **Planned at**: commit `bb051f59`, 2026-07-13

## Why this matters

Operator report (with screenshot): in 記帳 → 近期動態, the transaction
amounts do not share a right edge — expense rows' amounts sit ~30px left of
investment/transfer rows' amounts, and both sit far from the card's right
edge. Root cause: each row renders a trailing `ns-cf-actions` flex child
(hover-revealed icon buttons) that stays **in flow at opacity 0**, and the
button count varies by row type — transfers get 2 buttons, normal rows 3,
receivable/payable rows 4 — so the amount column's right edge shifts per row.
A second (latent) defect: on touch devices, where hover never fires, the
invisible buttons still occupy space and are **tappable at opacity 0** — an
invisible delete button is an accidental-destruction hazard.

Fix: absolutely position the action cluster over the row's right side, shown
only on hover/focus (Gmail-style), and hide it entirely on touch devices
(the row tap already opens `TransactionDetailPanel`, which has 編輯/複製/刪除/
結清). Amounts then sit flush right and align across all row variants.

## Current state

- `src/routes/CashFlowRoute.tsx` — the only file using `ns-cf-row` /
  `ns-cf-actions` (verified by grep across `src/`). The local (non-exported)
  `LedgerRow` component starts at line 1951 and has three render branches:
  - **split-group branch** (~line 1996–2024): actions = 編輯拆分 + 複製 + 刪除 (3 buttons)
  - **collapsed-transfer branch** (~line 2054–2082): actions = 複製 + 刪除 (2 buttons)
  - **generic branch** (~line 2098–2138): actions = up to 結清 + 編輯 + 複製 + 刪除 (2–4 buttons)

  Each branch's row wrapper looks like (generic branch, line 2099–2103):

  ```tsx
  <div
    className="ns-cf-row flex items-center gap-3 cursor-pointer"
    onClick={onEdit}
    style={{ padding: "9px 20px", borderBottom: "1px solid var(--ns-border)" }}
  >
  ```

  and each ends with the actions cluster (line 2128):

  ```tsx
  <div className="ns-cf-actions flex gap-1" onClick={e => e.stopPropagation()}>
  ```

- `src/styles/globals.css:1843-1845` — the current hover reveal:

  ```css
  .ns-cf-actions { opacity: 0; transition: opacity 0.12s; }
  .ns-cf-row:hover .ns-cf-actions,
  .ns-cf-row:focus-within .ns-cf-actions { opacity: 1; }
  ```

- The day-group header renders the daily Net at the row's right
  (`CashFlowRoute.tsx:1152-1166`) with padding
  `indented ? "10px 20px" : "14px 22px"` — 2px off from the rows' 20px, so
  even after the fix the Net figure wouldn't share the rows' right edge.

- Repo CSS conventions: hover-only styles are gated with
  `@media (hover: hover)` and touch affordances with `@media (hover: none)` —
  see `src/styles/globals.css:671-688` for the existing exemplar. Buttons are
  COSS `Button` with `size="icon-sm"` (= `size-8 sm:size-7`, i.e. 28px on
  desktop — `src/components/coss/button.tsx:22`).

- `TransactionDetailPanel` (`src/components/TransactionDetailPanel.tsx`)
  opens on row click (`onEdit` → `setDetailRow`) and provides
  編輯/複製/刪除/結清 — so hiding the hover cluster on touch loses no
  capability.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npx tsc --noEmit`   | exit 0              |
| Tests     | `npm test`           | all pass (~1146)    |
| Lint      | `npm run lint`       | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/styles/globals.css` (the `.ns-cf-actions` block and one new `.ns-cf-row` rule)
- `src/routes/CashFlowRoute.tsx` (only the day-header padding literal, Step 3)

**Out of scope** (do NOT touch, even though they look related):
- The JSX structure of `LedgerRow`'s three branches — the fix is CSS-only;
  do not reorder or wrap the amount/actions elements.
- `TransactionDetailPanel.tsx` — already provides the touch path.
- The holdings table in `InvestmentsRoute.tsx` — that is plan 184.
- Any Tailwind class changes on the buttons themselves.

## Git workflow

- Branch: `fix/ai-cashflow-amount-alignment`
- Conventional commits (repo style, e.g. `fix(cashflow): align row amounts right — overlay hover actions`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the action cluster an absolute overlay (desktop hover only)

In `src/styles/globals.css`, replace the block at lines 1843–1845 with:

```css
/* Row actions overlay the row's right side on hover/focus (Gmail-style) so
   the amount column keeps one right edge regardless of button count. On
   touch (no hover) the cluster is removed entirely — the row tap opens
   TransactionDetailPanel which carries the same actions. */
.ns-cf-row { position: relative; }
.ns-cf-actions {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  padding: 2px;
  background: var(--ns-bg-elev);
  border: 1px solid var(--ns-border);
  border-radius: var(--ns-r-sm);
}
@media (hover: hover) {
  .ns-cf-row:hover .ns-cf-actions,
  .ns-cf-row:focus-within .ns-cf-actions { opacity: 1; pointer-events: auto; }
}
@media (hover: none) {
  .ns-cf-actions { display: none; }
}
```

Notes:
- `pointer-events: none` while hidden removes the invisible-tap-target hazard.
- `:focus-within` stays so keyboard users tabbing into the buttons reveal
  them (the buttons remain in the DOM and tab order on hover-capable devices).
- If a small shadow token exists (`grep -n "\-\-ns-shadow-" src/styles/*.css`),
  you may add the smallest one to the overlay; if only `--ns-shadow-xl`
  exists, use border-only as written.

**Verify**: `grep -n "ns-cf-actions" src/styles/globals.css` → shows the new
block; `npx tsc --noEmit` → exit 0.

### Step 2: Confirm no layout residue in the row flex

The actions div is the last flex child in each of the three `LedgerRow`
branches; absolute positioning removes it from flow, so the preceding
`text-right` amount div becomes the last in-flow child and sits flush right.
No JSX change is required. Confirm by grep that all three branches still
render `className="ns-cf-actions ..."` unchanged:

**Verify**: `grep -c "ns-cf-actions" src/routes/CashFlowRoute.tsx` → `3`.

### Step 3: Align the day-header Net figure to the same right edge

In `src/routes/CashFlowRoute.tsx` line ~1155, change the day-header padding
so its right inset matches the rows' 20px:

```tsx
padding: indented ? "10px 20px" : "14px 20px",
```

(only the `22px` → `20px` in the non-indented literal changes).

**Verify**: `grep -n '"14px 20px"' src/routes/CashFlowRoute.tsx` → 1 match.

### Step 4: Full gate

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0;
`npm test` → all pass.

## Test plan

CSS-only behavior isn't unit-testable in this repo's vitest/jsdom setup
(no layout engine); the existing suite guards against regressions in the
route's logic. No new tests. The operator will do the visual pass:
hover a row → actions appear over the right side; amounts of expense /
transfer / receivable rows share one right edge; on a touch device the
actions never appear but the detail panel still offers them.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `.ns-cf-actions` in `globals.css` contains `position: absolute` and a `@media (hover: none)` `display: none` rule
- [ ] `.ns-cf-row` has `position: relative`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `ns-cf-row` / `ns-cf-actions` appear in any file other than
  `CashFlowRoute.tsx` and `globals.css` (usage has spread since planning).
- The `.ns-cf-actions` block in `globals.css` no longer matches the excerpt
  (someone already restyled it).
- You find a row variant whose actions are NOT the last flex child (the
  overlay would cover unexpected content).

## Maintenance notes

- Any future action button added to `LedgerRow` now floats in the overlay —
  no realignment needed, but more than ~4 buttons will start covering the
  amount on narrow desktop widths; consider a menu at that point.
- Reviewer should scrutinize: dark/light themes (overlay uses `--ns-bg-elev`
  over rows that hover-highlight), and that the split-expansion leg rows
  (`ns-split-leg-line`) were not affected.
- Deferred: the月-collapsed header (`ns-cf-month-header`) right padding was
  not audited against the new edge; if the operator reports misalignment
  there, it's a one-line padding tweak.
