# Plan 056: Separate income vs expense categories via a `kind` tag on each category

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update this
> plan's row in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/domain/types.ts src/routes/CashFlowRoute.tsx src/routes/settings/CategoriesSection.tsx`
> If these changed since this plan was written, compare the "Current state"
> excerpts against live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the shared category model + the entry form; must stay
  backward-compatible with existing saved data and not change spend aggregation)
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Operator-reported: 收入的分類和支出的分類希望可以分開，收入有自己的分類可以選.
Today `AppSettings.categories` is a **single shared list** used for both 收入 and
支出 in the entry drawer, so when you pick 收入 you still see expense categories
(餐飲/交通/居住…) — there's no income-specific set.

**Operator decision (asked & answered):** *"幫分類標記類型"* — tag each category
with a kind (income / expense / both) rather than maintaining two fully separate
lists. The entry drawer then shows only the categories matching the active
收入/支出 type. This is a minimal, backward-compatible model change (an optional
field; absent ⇒ behaves as today).

## Current state

`src/domain/types.ts` — the category model (line ~315):

```ts
export interface CategoryGroup {
  name: string;
  children: string[];
  budget?: number | null;
  color?: string;
  iconName?: string;
  rollover?: boolean;        // plan 039
  // … rollover-start-month field …
}
export interface AppSettings {
  primaryCurrency: CurrencyCode;
  categories: CategoryGroup[];   // ← shared income+expense list
  merchants: string[];
  exchangeRates: ExchangeRate[];
  tradingFees?: import("./tradingFees").TradingFeeConfig;
}
```

`src/routes/CashFlowRoute.tsx` — the entry form derives its category options from
the shared list, regardless of the active type (`drawerType` is
`expense | income | ar | ap | transfer`):

```ts
const categories = appSettings?.categories.length ? appSettings.categories : [];   // ~line 194
const categoryNames = categories.map((category) => category.name);                 // ~line 195
const subcategories = categories.find((c) => c.name === ledgerForm.category)?.children ?? [];
```

These `categories` are passed into `<EntryDrawer categories={…} />` and rendered
as the 分類 chips (the screenshot shows income reusing expense chips).

`src/routes/settings/CategoriesSection.tsx` — where categories are managed (add /
edit name, children, color, icon, budget, rollover). This is where the new
kind tag is set.

### Conventions to follow

- **Backward compatibility**: new fields on saved models are **optional** so old
  data loads unchanged (see `rollover?`, `budget?`, `bankBrandDomain?`). An absent
  `kind` must behave exactly as today (category shows for both income and expense).
- **Do not change spend/finance aggregation.** Category spend already nets by
  transaction sign (plans 018/019's `categoryPeriodSpend`); the `kind` tag is a
  **UI filter for the picker only**. Aggregation/analysis must be untouched.
- `AppSettings` is synced; an optional field rides along fine (manual snapshots /
  settings already sync). No migration table change needed (it's a JSON blob
  field on settings).
- zh-TW copy; the settings UI uses the existing CategoriesSection patterns.

## Decision (already made — implement this)

Add `kind?: "income" | "expense" | "both"` to `CategoryGroup`. Semantics:
- absent or `"both"` → category appears for **both** 收入 and 支出 (today's
  behavior; safe default for all existing categories).
- `"income"` → appears only when entry type is 收入.
- `"expense"` → appears only when entry type is 支出.

The entry drawer filters the category list by the active type. The 收入 (income)
category already in the default seed (`categories` includes a 收入 group) can be
tagged `"income"`; everything else defaults to `"both"`/expense as the operator
sets them in Settings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev server (visual) | `npm run dev` | serves on 127.0.0.1 |

## Scope

**In scope:**
- `src/domain/types.ts` — add optional `kind?: "income" | "expense" | "both"` to
  `CategoryGroup`.
- `src/routes/CashFlowRoute.tsx` — filter the categories passed to `EntryDrawer`
  by the active `drawerType` (income vs expense; treat absent/`both` as visible
  for both; ar/ap/transfer keep current behavior).
- `src/routes/settings/CategoriesSection.tsx` — a control to set each category's
  kind (income / expense / both).

**Out of scope (do NOT touch):**
- Category spend/analysis aggregation (`categorySpend.ts`/`categoryPeriodSpend`,
  CategoriesRoute/CategoriesTab budgets) — the tag is a picker filter only.
- The `children` (subcategory) structure — unchanged.
- Quick Add NLP category resolution — out of scope (note as a follow-up: NLP could
  later respect kind when classifying income vs expense).
- Sync internals — an optional settings field needs no special handling.

## Git workflow

- Branch from current main: `git checkout -B advisor/056-income-categories main`.
- Commit the model + filter together; the settings UI can be a second commit.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 1: model field
Add `kind?: "income" | "expense" | "both"` to `CategoryGroup` in `types.ts`.

**Verify**: `npx tsc --noEmit` → exit 0 (no exhaustive switch should break; it's
optional).

### Step 2: filter the entry-drawer categories by type
In `CashFlowRoute.tsx`, before passing `categories` to `EntryDrawer`, filter by
the active `drawerType`: for `income` keep categories with `kind === "income"` or
`kind === "both"` or `kind` absent; for `expense` keep `"expense"`/`"both"`/absent;
leave ar/ap/transfer as today. If the filtered list is empty for a type (e.g. no
income-tagged categories yet), fall back to the full list so the user is never
stuck with zero options. Keep the subcategory derivation consistent with the
filtered selection.

**Verify**: `npx tsc --noEmit` → exit 0; visually, switching 收入/支出 in the
drawer changes the visible category chips.

### Step 3: settings UI to set kind
In `CategoriesSection.tsx`, add a per-category kind selector (收入 / 支出 / 兩者)
that writes `kind` on save, following the section's existing edit patterns
(color/icon/budget). Default new/untagged categories to `"both"` (or `"expense"`,
matching the section's primary use) — but never silently flip existing categories'
visible behavior (absent must keep showing for both).

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → 0 errors.

### Step 4: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0.

## Test plan

- If you add a pure helper that filters categories by entry type, unit-test it:
  income type returns income+both+untagged; expense returns expense+both+untagged;
  empty-after-filter falls back to the full list.
- Existing tests must stay green (aggregation untouched).
- Visual: open the entry drawer, toggle 收入/支出, confirm the chips change; set a
  kind in Settings and confirm it takes effect.

## Done criteria

ALL must hold:

- [ ] `CategoryGroup.kind?` exists (optional); old saved settings load unchanged
      and untagged categories still show for both income and expense
- [ ] The entry drawer shows income-only vs expense-only categories per the active
      type, with a safe fallback when a type has no tagged categories
- [ ] Settings can set a category's kind (收入/支出/兩者)
- [ ] Category spend/analysis output is unchanged (no aggregation file modified)
- [ ] `npx tsc --noEmit` exits 0; `npm test` all pass; `npm run lint` 0 errors;
      `npm run build` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `8f2e90bd`).
- Adding `kind` forces changes in the aggregation/analysis layer (it must not —
  the tag is a picker filter only); if it ripples there, stop and report.
- You cannot set `kind` in `CategoriesSection` without restructuring its save
  flow significantly — report; we may scope the settings UI to a follow-up and
  ship the model + filter first.

## Maintenance notes

- For the reviewer: the load-bearing safety property is **absent `kind` ⇒
  unchanged behavior** (shows for both) and **aggregation untouched**. Scrutinize
  the fallback when a type has no tagged categories.
- Deferred follow-up: Quick Add NLP could use `kind` to disambiguate income vs
  expense classification; the category-detail/budget pages could group by kind.
