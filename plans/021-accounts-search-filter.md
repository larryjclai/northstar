# Plan 021: Add account-list search + type filter to AccountsRoute

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update this
> plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b0fda83d..HEAD -- src/routes/AccountsRoute.tsx`
> If the file changed since this plan was written, read it and compare against the
> "Current state" excerpts before proceeding; on a structural mismatch STOP.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx (usability with many accounts)
- **Planned at**: commit `b0fda83d`, 2026-06-16

## Why this matters

The Accounts page renders every account grouped by type with no way to search or
filter. With many accounts (the exact case this view is for) finding one means
scrolling through every group. Adding a name search box and a type filter makes
the list navigable. **Note:** the audit also flagged a 「−0」empty-state bug here —
that is **already fixed** in the current code (the balance cards are gated on
`rows.length > 0` and the sign check is `c.value !== 0`), so this plan covers
**only** the missing search/filter.

## Current state

`src/routes/AccountsRoute.tsx`:

- `rows` is the full account array (an `Account[]`). `groups` is derived from it
  (`:130-138`):
```tsx
const groups = useMemo(() => {
  return GROUP_ORDER.map((g) => {
    const groupRows = rows
      .filter((a) => g.types.includes(a.type))
      .sort((a, b) => (a.customGroup || "未分組").localeCompare(b.customGroup || "未分組") || a.name.localeCompare(b.name));
    const total = groupRows.reduce((s, a) => s + toBase(a.balance, a.currency), 0);
    return { ...g, rows: groupRows, total };
  }).filter((g) => g.rows.length > 0);
}, [rows, appSettings]);
```
- The balance-sheet cards (`:276-294`), currency split (`:297-309`), and `totals`
  (`:143-150`) are all computed from the **full `rows`** — these must keep
  reflecting *all* accounts, not the filtered subset.
- The account groups render at `:312-322` (`rows.length === 0 ? <empty> : groups.map(...)`).
- Account types: `GROUP_ORDER` is an array of `{ key, label, types }`. A per-type
  human label map `accountTypeLabels[a.type]` is already used at `:380`.
- The repo already has a select primitive — `AppSelect` is imported at `:9`
  (`import { AppSelect } from "../components/AppSelect"`) and used elsewhere in
  this file (`:620`, `:634`) with a `searchPlaceholder` prop. There is also a
  plain `ns-input` class used for text inputs in `CashFlowRoute.tsx:1118`.

**Convention notes**: zh-TW-first; the page header (`:262-272`) already has a
right-side button cluster (重新計算 / 匯出 / 新增帳戶) — the search + filter row
belongs **below** the balance/currency summary and **above** the groups, so it
filters the list without disturbing the balance sheet.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass |
| Visual | `npm run dev` + browser | Step 4 |

## Scope

**In scope**: `src/routes/AccountsRoute.tsx` only.

**Out of scope**:
- `totals`, `currencyBreakdown`, and the balance-sheet cards — they must continue
  to reflect ALL accounts (do not filter them).
- The account create/edit drawer and its own `AppSelect`s (`:620`, `:634`).
- The 「−0」empty state — already fixed; do not re-touch.

## Steps

### Step 1: Add filter state
Near the other `useState` hooks in `AccountsRoute`, add:
```tsx
const [accountQuery, setAccountQuery] = useState("");
const [typeFilter, setTypeFilter] = useState<string>("all"); // "all" | a GROUP_ORDER key
```
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Derive a filtered view for the list only
Add a `visibleGroups` memo that applies the query + type filter on top of the
existing `groups` (so balance totals stay on full `rows`):
```tsx
const visibleGroups = useMemo(() => {
  const q = accountQuery.trim().toLowerCase();
  return groups
    .filter((g) => typeFilter === "all" || g.key === typeFilter)
    .map((g) => ({ ...g, rows: q ? g.rows.filter((a) => a.name.toLowerCase().includes(q)) : g.rows }))
    .filter((g) => g.rows.length > 0);
}, [groups, accountQuery, typeFilter]);
```
Then change the **list render** (only) at `:322` from `groups.map(...)` to
`visibleGroups.map(...)`. Leave the `rows.length === 0` outer guard as-is.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Render the search + filter row
Insert, between the currency-split block (ends ~`:309`) and the groups block
(starts ~`:312`), a controlled search input + a type `AppSelect`. Use the
existing `ns-input` class for the text box (as in `CashFlowRoute.tsx:1118`) and
`AppSelect` for the type dropdown, with an 「全部類型」option plus one per
`GROUP_ORDER` entry (`value: g.key`, `label: g.label`). Only render this row when
there is more than a handful of accounts (e.g. `rows.length > 5`) so small users
don't see needless chrome. Add an empty-result hint: if `rows.length > 0` but
`visibleGroups.length === 0`, show a muted 「找不到符合的帳戶」line instead of the list.
**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → exit 0.

### Step 4: Visual confirm
Run `npm run dev`, open Accounts with demo/seeded data (or add several accounts).
**Verify**:
- Typing in the search box filters the visible accounts by name (case-insensitive);
  the balance-sheet cards and currency split do **not** change.
- The type dropdown narrows to one group; 「全部類型」restores all.
- A non-matching query shows 「找不到符合的帳戶」, not a blank page.
- Light + dark theme both legible.

## Test plan

- UI filtering; no new unit test strictly required. Existing suite stays green
  (`npm run test`).
- Optional: if a pure filter helper is extracted, add a small unit test for it.

## Done criteria

ALL must hold:
- [ ] `grep -n "accountQuery\|typeFilter\|visibleGroups" src/routes/AccountsRoute.tsx` → matches present
- [ ] `npx tsc --noEmit` exits 0; `npm run build` exits 0; `npm run lint` 0 errors; `npm run test` passes
- [ ] `totals` / `currencyBreakdown` still computed from full `rows` (`git diff` shows they are untouched)
- [ ] No files outside `src/routes/AccountsRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:
- `GROUP_ORDER` items don't have a `key`/`label`/`types` shape as assumed — report
  the actual shape.
- `AppSelect`'s props differ from its other use sites in this file (check `:620`).
- `npm run build` fails twice after a reasonable fix attempt.

## Maintenance notes

- If account search later needs to match more than name (e.g. bank/brand), extend
  the `q` predicate in `visibleGroups` only — keep totals on full `rows`.
- Reviewer: confirm the balance sheet reflects all accounts regardless of the
  active filter (a common bug is to filter `rows` globally).
