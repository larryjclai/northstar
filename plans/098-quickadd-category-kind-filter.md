# Plan 098: Honor category 收入/支出 kind in the Quick Add (快速記帳) picker

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b33bf55e..HEAD -- src/components/QuickAdd.tsx src/domain/categoryKind.ts src/domain/categoryKind.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UX)
- **Planned at**: commit `b33bf55e`, 2026-07-02

## Why this matters

Plan 056 let users tag each category as 收入-only, 支出-only, or both, and the
cash-flow entry drawer filters its picker accordingly. But **Quick Add (快速記帳,
⌘N) — the primary, most-used entry flow — ignores the tag entirely** and always
shows every category. The user tagged their categories and reported "改了沒有
用，在記帳的時候還是沒有好好改善" — from their point of view the feature is
broken, because the flow where it matters most doesn't apply it.

## Current state

### Where the filtering already works (the pattern to match)

`src/routes/CashFlowRoute.tsx:194-204`:

```ts
const allCategories = appSettings?.categories.length ? appSettings.categories : [];
// The entry drawer only offers categories matching the active 收入/支出 type
// (plan 056). ar/ap/transfer are neither income- nor expense-specific, so they
// keep the full list. ...
const categories =
  drawerType === "income" || drawerType === "expense"
    ? filterCategoriesByType(allCategories, drawerType)
    : allCategories;
```

### The domain helper

`src/domain/categoryKind.ts` (entire file is ~33 lines):

```ts
export type CategoryPickerType = "income" | "expense";

export function categoryMatchesType(category: CategoryGroup, type: CategoryPickerType): boolean {
  const kind = category.kind;
  if (kind === undefined || kind === "both") return true;
  return kind === type;
}

export function filterCategoriesByType<T extends CategoryGroup>(
  categories: T[],
  type: CategoryPickerType,
): T[] {
  const filtered = categories.filter((category) => categoryMatchesType(category, type));
  return filtered.length > 0 ? filtered : categories;
}
```

It is exported through the domain barrel (`src/domain/index.ts`) — CashFlowRoute
imports it from `"../domain"`.

### The gap: Quick Add

`src/components/QuickAdd.tsx`:

- Line 16: the confirm state carries the entry type:
  `type LedgerConfirm = { kind: "ledger"; entryType: "expense" | "income"; ... category: string; subcategory: string; ... }`
- Line 47: `const categoryGroups = settings.data?.categories ?? [];` — unfiltered.
- Lines 261-287: the category chip picker maps over **`categoryGroups`**:

  ```tsx
  <Field label="分類">
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {categoryGroups.map((category) => {
        const active = confirm.category === category.name;
        ...
  ```

- Lines 288-313: the subcategory chips look up
  `categoryGroups.find((c) => c.name === confirm.category)?.children ?? []`.

The picker renders only when `confirm.kind === "ledger"` (the investment
confirm has no category field), and `confirm.entryType` is always
`"expense" | "income"` — so the filter type is always available.

One subtlety: the NL parser can pre-fill `confirm.category` with a category
whose kind doesn't match the parsed entry type (e.g. a lexicon correction
mapped to an income-tagged category on an expense). If the chips were filtered
naively, the active selection would become invisible and un-deselectable.

### Conventions

- Domain logic is pure functions in `src/domain/*.ts` with colocated
  `*.test.ts` (vitest). `categoryKind.test.ts` exists — extend it.
- UI copy lives in `copy.csv` / locale JSON — this plan adds **no new strings**,
  so that pipeline is untouched.

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Tests     | `npm test`                                     | exit 0              |
| One file  | `npx vitest run src/domain/categoryKind.test.ts` | all pass          |
| Typecheck + build | `npm run build`                        | exit 0              |
| Lint      | `npm run lint`                                 | exit 0              |

## Scope

**In scope**:
- `src/domain/categoryKind.ts` (add one helper)
- `src/domain/categoryKind.test.ts` (tests)
- `src/domain/index.ts` (export the helper if the barrel lists exports explicitly)
- `src/components/QuickAdd.tsx` (use the helper in the picker)

**Out of scope**:
- `src/routes/CashFlowRoute.tsx` — already correct; leave it.
- `src/routes/RecurringRulesTab.tsx` — its 分類 field is a free-text input
  (line 460-467), a separate design gap; recorded in `plans/README.md`, not
  part of this plan.
- `src/domain/nlParser.ts` / lexicon — the parser may keep guessing from the
  full category list; do not thread entry-type awareness into parsing.
- `CategoryManagementDrawer.tsx` / settings UI for tagging kinds — already shipped.

## Git workflow

- Branch: `fix/ai-quickadd-category-kind` (`fix/ai-<name>` per `.agentrules`).
- Conventional commits, e.g. `fix(quick-add): filter category chips by 收入/支出 kind`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a selection-preserving helper to the domain

In `src/domain/categoryKind.ts`, add:

```ts
/**
 * Picker options for a specific entry type, guaranteeing the currently-selected
 * category stays visible even when its kind doesn't match (e.g. an NL-parser
 * guess or stale saved data) — otherwise the active chip would disappear and
 * the user couldn't deselect it. Order of the underlying list is preserved.
 */
export function categoryPickerOptions<T extends CategoryGroup>(
  categories: T[],
  type: CategoryPickerType,
  selectedName: string,
): T[] {
  const filtered = filterCategoriesByType(categories, type);
  if (!selectedName || filtered.some((category) => category.name === selectedName)) return filtered;
  const selected = categories.find((category) => category.name === selectedName);
  return selected ? [...filtered, selected] : filtered;
}
```

Export it wherever `filterCategoriesByType` is exported (check
`src/domain/index.ts` — if it re-exports `./categoryKind` wholesale, nothing to
do).

**Verify**: `npm run build` → exit 0.

### Step 2: Tests for the helper

In `src/domain/categoryKind.test.ts`, following the existing test style, add
cases:

1. Expense type: income-tagged categories are excluded; `both`/untagged kept.
2. Selected category with mismatched kind is appended (visible exactly once).
3. Empty selection behaves identically to `filterCategoriesByType`.
4. Fallback: when no category matches the type, the full list is returned
   (delegated behavior — assert it still holds through the new helper).

**Verify**: `npx vitest run src/domain/categoryKind.test.ts` → all pass.

### Step 3: Wire it into Quick Add

In `src/components/QuickAdd.tsx`, inside the ledger-confirm render path (the
picker only exists when `confirm.kind === "ledger"`), derive:

```ts
const pickerCategories = categoryPickerOptions(categoryGroups, confirm.entryType, confirm.category);
```

and replace both usages:
- the chip map at line 265: `categoryGroups.map(...)` → `pickerCategories.map(...)`
- the subcategory lookup at line 289:
  `categoryGroups.find((c) => c.name === confirm.category)` →
  `pickerCategories.find(...)` (equivalent since selection is guaranteed present,
  but keeps a single source).

Place the derivation where `confirm` is narrowed to the ledger variant (mind
TypeScript narrowing — `confirm.entryType` only exists on `LedgerConfirm`).
Import from `"../domain"` like the rest of the file's domain imports.

**Verify**: `npm run build && npm run lint` → both exit 0.

### Step 4: Behavior check in the browser

`npm run dev`, open Quick Add (⌘N or the sidebar button):

1. Type an expense (e.g. `午餐 120`) → confirm step shows only 支出/both
   categories.
2. Type an income (e.g. `薪水 50000`) → only 收入/both categories.
3. If you can produce a parse that pre-selects a mismatched category, confirm
   the selected chip is still visible and deselectable.

**Verify**: observations 1-2 hold (3 is best-effort).

## Test plan

Covered in Step 2 — four new unit cases in
`src/domain/categoryKind.test.ts`, modeled on the file's existing tests.
Verification: `npm test` → exit 0 including new cases.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0; new `categoryPickerOptions` cases exist and pass
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "categoryGroups.map" src/components/QuickAdd.tsx` returns no matches (picker now uses the filtered list)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The picker excerpt (QuickAdd.tsx:261-313) doesn't match the live code.
- `confirm.entryType` turns out to be optional/absent in some ledger-confirm
  state (would break the assumption the filter type always exists).
- Filtering makes the picker render empty in any state you can reproduce — the
  domain helper's fallback should prevent this; if it doesn't, the bug is in
  the helper usage, not something to patch in the component.

## Maintenance notes

- Any NEW category picker added later (e.g. if RecurringRulesTab's free-text
  分類 becomes a picker) should go through `categoryPickerOptions` /
  `filterCategoriesByType` — grep for `settings.data?.categories` when reviewing.
- The selection-preservation rule means a mismatched chip can appear alongside
  filtered ones; that is intentional (deselectability beats strictness).
