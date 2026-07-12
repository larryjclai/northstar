# Plan 168: 記帳 (Cash Flow) toolbar redesign — single period control (B-2) + 篩選 popover with active-filter chips (B)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report — do not improvise. When done,
> update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat bdfa0c09..HEAD -- src/routes/CashFlowRoute.tsx src/components/DateScopeControl.tsx`
> If either changed since this plan was written, compare the "Current state"
> excerpts to the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (sibling to 169; both preserve the `dateScope` state)
- **Category**: direction (design implementation)
- **Planned at**: commit `bdfa0c09`, 2026-07-12
- **Source design**: claude.ai/design project `a2b50679-620a-465b-80c5-ef0ca5574bce`,
  file `記帳交易 Redesign.html` → `NSLgToolbarB` (variant B) + `NSLgDatePopover`
  (variant B-2) in `northstar-ledger-redesign.jsx`. The operator chose **B + B-2**.

## Why this matters

The Cash Flow header crowds four controls onto the title row: a period control,
an account filter, a category filter, and 記一筆. The redesign keeps only the
**high-frequency** period control and the **記一筆** action on the header, folds
the **low-frequency** account/category filters into a single 篩選 popover with a
count badge, and surfaces whatever filters are active as removable **chips** under
the tab bar (so "what am I filtering by" is glance-able and one-click-clearable).
The period control itself becomes one unit — a ‹ stepper › around a center
trigger that opens a popover holding the presets (本月 / YTD / 近12個月 / 自訂)
plus a month-grid picker (B-2), instead of today's presets-segmented-plus-inline-
picker sprawl.

**Layout/interaction only — do NOT change what gets filtered or how the date
range resolves.** Reuse the existing `dateScope` state, `resolveDateScope`, and
the `selectedAccount`/`selectedCategory` filter state untouched
(`AGENTS.md` invariant #1 is about finance math; this is the same discipline for
the filter semantics — the same rows must match).

## Current state

- `src/routes/CashFlowRoute.tsx` (2805 lines). The header/toolbar is
  **lines 906–926**:
  ```tsx
  <div className="flex items-end justify-between gap-4 mb-[22px] flex-wrap">
    <div>
      <div className="text-xs ns-field-label">{periodLabel}</div>
      <h1 …>記帳</h1>
    </div>
    <div className="flex gap-2 flex-wrap justify-end">
      <input ref={csvInputRef} … className="hidden" onChange={handleCsv} />
      <DateScopeControl value={dateScope} onChange={setDateScope} />
      <AccountFilter accounts={accountRows} value={selectedAccount} onChange={setSelectedAccount} … />
      <CategoryFilter categories={allCategories} value={selectedCategory} onChange={setSelectedCategory} />
      <Button … onClick={() => openCreate("expense")}><Plus …/>記一筆</Button>
    </div>
  </div>
  ```
  The tab bar (`交易 / 分類 / 商家 / 週期規則`) is at **lines 928–943**.
- Filter state (line 157–158): `selectedAccount` (default `accountParam ?? "all"`),
  `selectedCategory` (default `"all"`). The sentinel for "no filter" is the string
  `"all"` — filters apply only when `!== "all"` (see lines 718–719). The 篩選 count
  badge = `(selectedAccount !== "all" ? 1 : 0) + (selectedCategory !== "all" ? 1 : 0)`.
- `dateScope` state (line 154): `makeDefaultDateScope(timezone, "month")`;
  `dateRange = resolveDateScope(dateScope, timezone)` (line 209); `periodLabel`
  is derived from it. `DateScopeValue` (in `src/domain/dateScope.ts`) =
  `{ preset: "month"|"ytd"|"last12m"|"all"|"custom", month?, start?, end? }`.
- `DateScopeControl` (`src/components/DateScopeControl.tsx`, 70 lines) — the
  current period control. It renders a `SegmentedControl` of presets +, when the
  preset is `month`/`custom`, an inline `MonthPicker` / `DateRangePicker`. Read it
  in full before editing.
- `MonthPicker` (`src/components/ui/month-picker.tsx`) already has a **year
  stepper** (`year` state) + **month grid** (`grid-cols-3`) + a `onSelectDay`
  day mode. Reuse it inside the period popover for B-2 rather than rebuilding a
  month grid.
- Imports already present in `CashFlowRoute.tsx`: `AccountFilter` (line 29),
  `CategoryFilter` (line 31), `DateScopeControl` (line 28), `Plus` from phosphor.
  A popover primitive exists at `src/components/ui/popover` (used in
  `DashboardRoute.tsx` — `Popover`/`PopoverTrigger`/`PopoverContent`); reuse it.
  A funnel icon: import `Funnel` from `@phosphor-icons/react`.

### Design → app mapping

The design uses canvas-only classes (`.ns-btn`, `.ns-card`, `.ns-seg`,
`.ns-input`, `NSIcon`, `LgChip`, `LgSelectPill`). Map to the app's real
primitives, as the file already does: `.ns-card`→`<Card>`; `.ns-btn`/`.primary`→
`<Button variant="outline"|"default">`; `NSIcon name="filter"`→`<Funnel/>`;
`NSIcon name="calendar/chevLeft/chevRight/chevDown"`→phosphor
(`CalendarBlank`/`CaretLeft`/`CaretRight`/`CaretDown`); the period popover and
篩選 popover → the `ui/popover` primitive; active-filter chips → small `<Badge>`
or a styled span with an ✕ button. Follow the eyebrow/number idioms already in
this file. The count badge uses `var(--ns-accent)` bg.

## Commands you will need

| Purpose   | Command            | Expected            |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Full build| `npm run build`    | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0              |
| Preview   | `npm run dev` → 記帳 (load demo data) | toolbar renders |

## Scope

**In scope**:
- `src/routes/CashFlowRoute.tsx` — restructure the header (906–926), add the 篩選
  popover + active-filter chip row under the tabs; wire the period control.
- `src/components/DateScopeControl.tsx` — OR a new sibling component
  `src/components/LedgerDateControl.tsx` for the B-2 stepper+popover period
  control. Prefer a **new component** so the existing `DateScopeControl` (used by
  the Dashboard and Investments) stays unchanged (see Out of scope).
- `src/styles/globals.css` — only for a genuinely reused new `ns-*` class.

**Out of scope**:
- **Do NOT change `DateScopeControl`'s behavior for its other callers**
  (`DashboardRoute`, `InvestmentsRoute`, analytics). If you modify
  `DateScopeControl` in place, verify every caller still renders correctly; the
  safer path is a new `LedgerDateControl` used only by Cash Flow.
- The filter/query logic (lines 715–843) — the rows that match must not change.
- The bottom section (近期動態 list + 固定收支 right column) — that is **plan 169**.
- `RecurringRulesTab`, `CategoriesTab`, `MerchantsTab`, the entry drawer.

## Git workflow

- Branch: `feat/ai-cashflow-toolbar`
- Commit per step; conventional-commit style, e.g.
  `feat(cash-flow): fold account/category filters into a 篩選 popover with chips`.
- Do NOT push/PR unless asked.

## Steps

### Step 1: Build the combined period control `LedgerDateControl` (B-2)

Create `src/components/LedgerDateControl.tsx` exporting a control that takes the
same `{ value: DateScopeValue; onChange }` contract as `DateScopeControl`, and
renders (design `LgDateCtl` + `NSLgDatePopover`):

1. A single bordered pill, height 36, containing: a ‹ prev button, a center
   trigger button (calendar icon + the current period label + a ▾), a › next
   button, divided by 1px separators. The label = `本月 · 2026-07` style for the
   `month` preset (use `dateScope.month` or the resolved label), or the preset
   label (`YTD` / `近 12 個月` / `全部` / the custom range) otherwise.
2. **Prev/next stepper**: for `preset === "month"`, step `dateScope.month` by ∓1
   month. For other presets, either disable the steppers or step by the preset's
   natural unit (keep it simple — disabling on non-month presets is acceptable;
   note the choice). Do NOT change how the range resolves — only the month value.
3. The center trigger opens a `Popover` (`ui/popover`) anchored below it,
   containing (design `NSLgDatePopover`):
   - a presets row (`快速預設`) — a `SegmentedControl` over
     `["month","ytd","last12m","custom"]` labeled 本月 / YTD / 近12個月 / 自訂,
     setting `onChange({ ...value, preset })`.
   - when the active preset is NOT `custom`: reuse `MonthPicker` (its year stepper
     + month grid) so a click selects a specific month → `onChange({ preset:
     "month", month })` and closes the popover. Highlight the active month; you
     may disable future months (design shows them dimmed — optional).
   - when `custom`: render `DateRangePicker` (as `DateScopeControl` does) for the
     start/end range.
   Reuse `MonthPicker`/`DateRangePicker` imports from `DateScopeControl.tsx` as
   the pattern.

**Verify**: `npx tsc --noEmit` → 0. In `npm run dev`, the period control shows as
one ‹ 本月 · 2026-07 ▾ › unit; the ▾ opens a popover with presets + a month grid;
picking a month or preset updates the list below (same rows as before for the
same range).

### Step 2: Restructure the header — period control + 篩選 + 記一筆 only

In the header (906–926), replace the right cluster with exactly three controls
(design `NSLgToolbarB` header): `<LedgerDateControl value={dateScope}
onChange={setDateScope} />`, a **篩選** `Button` (Funnel icon + "篩選" + a count
badge when ≥1 filter is active), and the 記一筆 `Button`. Remove the inline
`<AccountFilter>` and `<CategoryFilter>` from the header (they move into the 篩選
popover, Step 3). Keep the hidden CSV `<input ref={csvInputRef}>`.

The count badge (design): a small rounded `var(--ns-accent)` pill with the active
count, shown only when `activeFilterCount > 0` where
`activeFilterCount = (selectedAccount !== "all" ? 1 : 0) + (selectedCategory !== "all" ? 1 : 0)`.

**Verify**: `npx tsc --noEmit` → 0. Header shows period control + 篩選 + 記一筆;
account/category dropdowns are gone from the header.

### Step 3: The 篩選 popover (account + category)

The 篩選 button opens a `Popover` containing the moved `AccountFilter` and
`CategoryFilter` (label each: 帳戶 / 分類), plus a footer with **清除全部**
(`setSelectedAccount("all"); setSelectedCategory("all")`) and **完成** (close the
popover). Keep the exact `AccountFilter`/`CategoryFilter` props they had in the
header (`accounts={accountRows}`, `categories={allCategories}`, the same value/
onChange). Nothing about filtering changes — only where the controls live.

**Verify**: opening 篩選, picking an account and a category, filters the list
exactly as the old header dropdowns did (same result). `npm run dev` cross-check.

### Step 4: Active-filter chips under the tab bar

Directly below the tab bar (after line 943, before the `overview` content),
render a chip row **only when `activeFilterCount > 0`** (design `NSLgToolbarB`
chip strip): one removable chip per active filter — `帳戶：<account name>` (✕ →
`setSelectedAccount("all")`) and `分類：<category>` (✕ → `setSelectedCategory("all")`)
— followed by a **清除全部** ghost button and a right-aligned `符合 N 筆` count
(use the already-computed filtered row count — reuse `displayRows.length` or the
overview's filtered count; find the variable that already reflects the active
filters). Resolve the account **name** from `accountRows`/`accountName(...)`, not
the id.

**Verify**: with a filter active, a chip appears; clicking its ✕ clears just that
filter and removes the chip; 清除全部 clears both. `npm run lint` → 0.

## Test plan

- This is presentational; the filtered rows are unchanged, so the gates are
  `npm run build` + `npm test`.
- If you extract a pure helper (e.g. `activeFilterChips(selectedAccount,
  selectedCategory, accountName)` returning the chip list), add a small co-located
  test modeled on `src/routes/transactionsSummary.test.ts` covering: no filters →
  empty; account only → one chip; both → two chips; count badge matches.
- Manual: compare against design artboards `lg-tb-b` and `lg-tb-b2` — one period
  unit + 篩選 (with badge) + 記一筆; funnel popover holds account/category; chips
  under the tabs; period popover shows presets + month grid.

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "<AccountFilter" src/routes/CashFlowRoute.tsx` → the account filter
      is inside the 篩選 popover, not the header row (verify by reading, not just
      count)
- [ ] Filtering by account/category yields the same rows as before (manual)
- [ ] `DateScopeControl`'s other callers (Dashboard/Investments) are unchanged, or
      still render correctly if you edited it (`git diff` review)
- [ ] Only in-scope files modified (`git status`)

## STOP conditions

- `CashFlowRoute.tsx` drifted so the cited line ranges/props don't match.
- Making the period popover work forces a change to `resolveDateScope` /
  `DateScopeValue` in `src/domain/dateScope.ts` (out of scope) — STOP; the preset
  set already covers 本月/YTD/近12個月/自訂 + month, so no domain change should be
  needed.
- Editing `DateScopeControl` in place breaks a Dashboard/Investments render you
  can't fix within this plan — switch to a new `LedgerDateControl` and report.
- The filtered row set changes vs. before (must be identical).

## Maintenance notes

- Account/category filters now live in one place (the 篩選 popover) + mirror as
  chips. If a new filter dimension is added, extend the popover + chip builder,
  not the header row.
- `LedgerDateControl` wraps the same `DateScopeValue` contract — keep it a thin
  presentation layer over `dateScope`; the resolution stays in
  `resolveDateScope`.
- Reviewer should check: identical filtered rows; the count badge/chip count/`符合
  N 筆` all agree; the period popover's month pick sets `preset:"month"` + `month`
  correctly; no regression for `DateScopeControl`'s other callers.
- Plan 169 (bottom section) reads the same `dateScope`/`dateRange` — it does not
  depend on this plan, but both should ultimately land together for a coherent
  page.
