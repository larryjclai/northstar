# Plan 018: Cap the CashFlow category-spend bar list to Top-N + an expandable remainder

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. The
> codebase must stay buildable between steps. If anything in "STOP conditions"
> occurs, stop and report — do not improvise. When done, update this plan's
> status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b0fda83d..HEAD -- src/routes/CashFlowRoute.tsx src/routes/MerchantsTab.tsx`
> If either file changed since this plan was written, read it and compare against
> the "Current state" excerpts before proceeding; on a structural mismatch treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / tech-debt (information density)
- **Planned at**: commit `b0fda83d`, 2026-06-16

## Why this matters

The CashFlow "分類支出" card renders **every** spending category as a bar with no
cap (`allCategorySpend.map(...)`), so a user with many categories gets an
unbounded list that buries the few that matter. The sibling "Top 5 支出商家" card
(`MerchantsTab.tsx`) already solved exactly this by showing the top 5 and folding
the rest into 「其他」. Aligning the category list with that convention reduces
cognitive load and makes the two cash-flow views feel consistent. This is a
presentation change only — no calculation, totals, or filter semantics change.

## Current state

`src/routes/CashFlowRoute.tsx` — the 「分類支出」card (around lines 1033–1075)
maps the full `allCategorySpend` array. Each row is **clickable to toggle a
category filter** (`setSelectedCategory`), and that behavior must be preserved:

```tsx
{/* Category Bar List */}
{allCategorySpend.length > 0 ? (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {allCategorySpend.map((r) => {
      const pct = totalCategorySpend > 0 ? (r.amount / totalCategorySpend) * 100 : 0;
      const isActive = selectedCategory === "all" || selectedCategory === r.name;
      const displayPct = pct < 1 ? "<1" : pct.toFixed(1);
      return (
        <div
          key={r.name}
          onClick={() => setSelectedCategory(prev => prev === r.name ? "all" : r.name)}
          style={{ cursor: "pointer", opacity: isActive ? 1 : 0.45, transition: "opacity 0.15s ease" }}
        >
          {/* …name + icon + pct + amount + a 6px bar… */}
        </div>
      );
    })}
  </div>
) : ( /* empty state */ )}
```

`allCategorySpend` is an array sorted descending by `amount` (each item:
`{ name, icon, amount }`). `totalCategorySpend` is the sum used for the percent.

**The exemplar to mirror** — `src/routes/MerchantsTab.tsx:43-47` shows the
established "Top-N + 其他" convention (referred to in code as B22):

```tsx
// Top-5 spend merchants for the pie, with the remainder folded into 其他 (B22).
const top5Pie = useMemo(() => {
  const top = allMerchantSpend.slice(0, 5).map((m, i) => ({ name: m.name, value: m.amount, color: defaultColors[i % defaultColors.length] }));
  const rest = allMerchantSpend.slice(5).reduce((s, m) => s + m.amount, 0);
  return rest > 0 ? [...top, { name: "其他", value: rest, color: "var(--ns-border)" }] : top;
}, [allMerchantSpend]);
```

**Convention notes** (from `DESIGN.md` / observed code): the file is zh-TW-first
(use Chinese for any new visible label); ghost/xs buttons use the COSS `Button`
(already imported in this file — see the 「清除篩選」button right above this card);
the bar list already uses `var(--ns-bg-hover)` for the track.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors (≈700 warnings pre-exist) |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass |
| Visual | `npm run dev` + browser | see Step 3 |

## Scope

**In scope** (only file to modify):
- `src/routes/CashFlowRoute.tsx`

**Out of scope** (do NOT touch):
- `src/routes/MerchantsTab.tsx` — read it as the pattern reference only.
- The data computation of `allCategorySpend` / `totalCategorySpend` — do not change
  sorting, filtering, or totals. This plan only changes how many rows render.
- The category **filter** semantics (`selectedCategory`) — keep every visible
  category row clickable exactly as today.
- `CategoriesTab` / `CategoriesRoute` — handled by plan 019.

## Git workflow

- Branch: `advisor/018-cashflow-category-top-n`
- One commit; conventional commit, e.g.
  `feat(cashflow): cap category bar list to top-N with expandable remainder`.
- Do NOT push or open a PR unless the operator asks.

## Steps

### Step 1: Add a local "show all categories" state
Near the other `useState` hooks in the `CashFlowRoute` component (where
`selectedCategory` is declared), add:
```tsx
const [showAllCategories, setShowAllCategories] = useState(false);
```
Define a constant for the cap at the top of the component body (or alongside the
card):
```tsx
const CATEGORY_BAR_LIMIT = 8;
```
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Slice the rendered list and add a toggle row
Replace `allCategorySpend.map(...)` with a sliced view. Render the first
`CATEGORY_BAR_LIMIT` rows unchanged (same clickable filter behavior). When there
are more, render a single muted toggle **below** the bars (not a category — must
not call `setSelectedCategory`):

```tsx
{(showAllCategories ? allCategorySpend : allCategorySpend.slice(0, CATEGORY_BAR_LIMIT)).map((r) => {
  /* …unchanged row JSX, including the onClick filter toggle… */
})}
{allCategorySpend.length > CATEGORY_BAR_LIMIT && (
  <button
    type="button"
    onClick={() => setShowAllCategories((v) => !v)}
    className="muted text-xs"
    style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "2px 0", color: "var(--ns-accent)", fontFamily: "var(--ns-font-mono)" }}
  >
    {showAllCategories ? "▲ 收合" : `▼ 顯示其餘 ${allCategorySpend.length - CATEGORY_BAR_LIMIT} 類`}
  </button>
)}
```
Keep the existing empty-state branch (`allCategorySpend.length > 0 ? … : …`)
exactly as-is.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → exit 0.

### Step 3: Visual confirm
Run `npm run dev`, open the Cash Flow page with seeded/demo data that has more
than 8 spending categories in the selected period.
**Verify**:
- Only the top 8 category bars show by default, followed by a 「▼ 顯示其餘 N 類」 link.
- Clicking it expands to the full list and the link becomes 「▲ 收合」.
- Clicking an individual category bar still toggles the dim/active filter
  (unchanged behavior) and the 「清除篩選」button still appears.
- Light + dark theme both render the toggle legibly.

## Test plan

- This is UI-only; no new unit test is required. The existing suite must stay
  green (`npm run test`).
- If `CashFlowRoute` has an existing render test, no change is expected there.

## Done criteria

ALL must hold:
- [ ] `grep -n "CATEGORY_BAR_LIMIT\|showAllCategories" src/routes/CashFlowRoute.tsx` → matches present
- [ ] `npx tsc --noEmit` exits 0; `npm run build` exits 0; `npm run lint` 0 errors; `npm run test` passes
- [ ] `allCategorySpend` / `totalCategorySpend` computation unchanged (`git diff` shows only the render block + the two new lines)
- [ ] No files outside `src/routes/CashFlowRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:
- The 「分類支出」card's structure differs from the "Current state" excerpt
  (file drifted).
- `allCategorySpend` turns out **not** to be pre-sorted descending by amount
  (then "Top-N" would be meaningless — report so the sort can be added upstream
  deliberately, which is out of this plan's scope).
- `npm run build` fails twice after a reasonable fix attempt.

## Maintenance notes

- If a future change makes the category rows draggable/reorderable, the
  `slice(0, LIMIT)` must move to operate on the display order, not raw data.
- Reviewer: confirm the toggle button does NOT call `setSelectedCategory` (it is
  not a category) and that the per-row filter behavior is byte-for-byte unchanged.
- The cap value (8) is a judgment call; centralizing it as `CATEGORY_BAR_LIMIT`
  makes it a one-line tune later.
