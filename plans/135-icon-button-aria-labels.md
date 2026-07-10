# Plan 135: Give every icon-only button an accessible name (aria-label)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. If anything in the "STOP conditions" section occurs,
> stop and report. When done, update this plan's status row in
> `plans/README.md` — unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/routes src/components`
> The grep in Step 1 re-derives the site list, so drift is self-correcting;
> STOP only if the Button component API changed.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (attribute-only)
- **Depends on**: none
- **Category**: bug (a11y, WCAG 4.1.2)
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

~28 icon-only buttons (close, delete, edit, add, refresh) render a Phosphor
SVG with no text and no `aria-label`/`title` — screen readers announce them
as a bare "button". Core actions are unusable non-visually. The fix is
mechanical; the value is real for a finance app people navigate daily.

## Current state

Verified count at planning:

```
grep -rn 'size="icon' src/routes src/components --include="*.tsx" | grep -v "aria-label" | grep -v "title=" | wc -l   →  28
```

Example (`src/components/CategoryManagementDrawer.tsx:111,187,188`):

```tsx
<Button variant="ghost" size="icon-sm" onClick={onClose}><X size={18} /></Button>
<Button variant="ghost" size="icon-sm" onClick={...}><Plus size={14} /></Button>
<Button variant="ghost" size="icon-sm" onClick={...}><PencilSimple size={14} /></Button>
```

Known files with sites: CategoryManagementDrawer, TransactionDetailPanel,
QuickAdd, settings/{CategoriesSection,MerchantsSection,FxSection,
ConnectSection}, RecurringRulesTab, InvestmentImportWizard,
ManualPriceImportWizard, CategoriesTab. Re-derive the authoritative list with
the grep above.

UI language is zh-TW. Standard labels: 關閉 (X), 新增 (Plus), 編輯
(PencilSimple), 刪除 (Trash), 確認 (Check), 取消 (X in edit contexts —
distinguish by handler name), 重新整理 (refresh icons), 複製 (Copy). Derive
the right verb from the onClick handler and surrounding context — a wrong
label is worse than none; when genuinely ambiguous, read the handler.

Note: UI copy normally lives in `src/locales/copy.csv` (round-tripped via
`npm run copy:export/import`) — but that workflow applies to i18next-keyed
strings. These routes hardcode zh-TW literals today (the app's dominant
pattern), so hardcoded zh-TW `aria-label` literals are consistent here. Do
NOT wire i18next into files that don't already use it.

## Commands

`npx tsc` (exit 0), `npm test` (all pass), `npm run lint` (exit 0).

## Scope

**In scope**: adding `aria-label="…"` to icon-only `<Button size="icon*">`
elements found by the grep, across `src/routes/**` and `src/components/**`.
Also icon-only buttons NOT using the COSS Button that the grep misses: run a
second pass `grep -rn "<button" src/routes src/components --include="*.tsx" | grep -v "aria-label"` and label any whose children are icon-only (inspect
each hit; skip text-bearing buttons).

**Out of scope**: any DOM/layout/handler change; the shared Button component
itself; buttons with visible text; Toast/EmptyState.

## Git workflow

Branch `fix/ai-icon-button-labels`; commit
`fix(a11y): aria-labels for icon-only buttons`. No push/merge.

## Steps

1. Generate the site list (both greps), save it into the report.
2. Add labels file-by-file; commit in 2–3 batches.
   **Verify after each batch**: `npx tsc` → exit 0.
3. Final sweep: the Step 1 grep → **0 remaining hits** (icon-size buttons
   without aria-label/title).
   **Verify**: `npm test`, `npm run lint` green.

## Test plan

No new unit tests (attribute-only). The done-criteria grep is the machine
check.

## Done criteria

- [ ] `grep -rn 'size="icon' src/routes src/components --include="*.tsx" | grep -v "aria-label" | grep -v "title="` → 0 lines
- [ ] Raw `<button>` icon-only pass done and listed in report
- [ ] Labels are action-accurate zh-TW (spot-check 5 in review)
- [ ] Gates green; `plans/README.md` updated

## STOP conditions

- A button's action is genuinely undeterminable from its handler — list it
  in the report unlabeled rather than guessing.

## Maintenance notes

- Follow-up idea (not in scope): an eslint rule or a Button prop making the
  label required for icon sizes.
- Reviewer: check 取消/關閉 distinctions in the two-step delete-confirm rows
  (the app's inline confirm pattern) — the X there usually means 取消.
