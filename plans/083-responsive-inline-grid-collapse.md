# Plan 083: Collapse the few non-responsive inline grids at 390px (077 Phase 1–2, scoped to real gaps)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. Touch only
> the files listed as in scope.
>
> **Base**: this plan builds on the stacked branch `feat/ai-local-notifications`
> (which already contains plans 079/080/081/082). If you are NOT on a branch
> descended from that, STOP — your `globals.css` base is wrong (079 modified it).
> Confirm: `grep -n "data-native-glass .ns-sidebar { padding-top" src/styles/globals.css`
> should match (proves 079's globals.css is present).

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW — additive CSS classes + swapping 3 inline `gridTemplateColumns` for
  `className`; no logic, no data flow, no other layout touched
- **Depends on**: 079 (shares `src/styles/globals.css`)
- **Category**: direction (responsive polish)
- **Planned at**: stacked on `feat/ai-local-notifications`, 2026-06-27

## Why this matters

Northstar's UI is already broadly responsive: wide data tables are gated with
`hidden sm:contents` and paired with mobile card lists, the dashboard rows use
`repeat(auto-fit, minmax(min(360px,100%),1fr))` content-driven collapse, and
`.ns-dash-activity-grid` already collapses to one column at `max-width: 900px`. A
**small number of inline grids** were missed: because an inline `style` cannot carry a
media query, these stay multi-column at 390px and squish their content (charts shrink
to ~150px; four money cards cram into a phone width). This plan fixes exactly those
spots by moving each inline grid into a named class with a `@media (max-width: 640px)`
single-column (or 2-column) collapse — the convention this repo already documents in
`globals.css` ("Inline styles can't carry media queries, so the Overview rows use
these classes"). This completes the responsive story without touching the routes that
are already handled.

## Current state

The repo's existing convention to mirror (`src/styles/globals.css`, ~line 614):
```css
/* Inline styles can't carry media queries, so the Overview rows use these classes.
   They collapse to a single column on narrow windows so cards never overflow. */
.ns-dash-row2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); gap: 16px; ... }
```
And the existing media-query collapse pattern (`globals.css`, ~line 1293):
```css
@media (max-width: 900px) {
  .ns-dash-activity-grid { grid-template-columns: 1fr; }
}
```

The three inline grids that do NOT collapse:

1. **`src/routes/InvestmentsAnalyticsTab.tsx:924`** — a two-column band (sector
   distribution + currency exposure), heavy chart/list content in each column:
   ```tsx
   <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 48, alignItems: "start" }}>
   ```
   At 390px each column is ~150px — charts squish. Must stack.

2. **`src/routes/CategoriesRoute.tsx:222`** — four summary cards across:
   ```tsx
   <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
   ```
   At 390px each card is ~80px — money values overflow/wrap. Should be 2×2 on mobile.

3. **`src/routes/CategoriesRoute.tsx:455`** — a 12-month strip:
   ```tsx
   <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6 }}>
   ```
   At 390px each cell is ~26px. This MAY be an intentionally dense mini-strip.
   **Verify before changing** (see Step 3 — conditional).

### Conventions to follow

- Add the new classes in `globals.css` near the other `.ns-dash-*` grid classes
  (after the `@media (max-width: 900px)` block around line 1300 is fine), each with a
  `@media (max-width: 640px)` collapse. Name them descriptively
  (`.ns-an-feature-split`, `.ns-cat-summary-grid`).
- Replace the inline `gridTemplateColumns` with `className="<new-class>"`. Keep any
  OTHER inline style properties that aren't grid-template-columns (e.g. `gap`,
  `marginBottom`, `alignItems`) — fold them into the class instead, so the inline
  `style` for that div can be removed entirely (or kept only for non-grid props).
- Do NOT change any data, props, or component structure — only the layout container's
  column definition.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Build | `npm run build` | exit 0 |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Tests | `npm test` | all pass (no new failures) |

> A fresh worktree has no node_modules — run `npm install` first.

## Scope

**In scope**:
- `src/styles/globals.css` — two (possibly three) new grid classes + their `@media (max-width: 640px)` collapse
- `src/routes/InvestmentsAnalyticsTab.tsx` — swap the line-924 inline grid for the class
- `src/routes/CategoriesRoute.tsx` — swap the line-222 (and conditionally line-455) inline grid for the class

**Out of scope** (do NOT touch):
- Any route that already gates tables with `hidden sm:contents` / `sm:hidden`
  (MerchantsTab, CategoriesTab, RecurringRulesTab, InvestmentsRoute, CashFlowRoute,
  InvestmentsAddSheet) — already responsive
- `.ns-dash-*` classes — already collapse correctly
- Any chart internals, data, or component logic
- The dozens of other inline grids that are small fixed-pixel layouts fitting within
  390px (e.g. `84px 1fr 132px`) — they don't overflow; leave them

## Git workflow

- Branch: `feat/ai-responsive-grid-collapse` (off the stacked base)
- Conventional commits, e.g. `fix(ui): collapse analytics/category inline grids on mobile`
- Commit when done. Do NOT push.

## Steps

### Step 1: Analytics feature-band split → collapsing class

In `globals.css`, add:
```css
/* Analytics allocation/currency band: two heavy columns side-by-side on desktop,
   stacked on phones so the charts don't squish. */
.ns-an-feature-split {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 48px;
  align-items: start;
}
@media (max-width: 640px) {
  .ns-an-feature-split { grid-template-columns: 1fr; gap: 24px; }
}
```
In `InvestmentsAnalyticsTab.tsx:924`, replace the inline grid div with:
```tsx
<div className="ns-an-feature-split">
```
(removing the now-redundant inline `style` grid/gap/alignItems).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Category summary cards → 2×2 on mobile

In `globals.css`, add:
```css
/* Category summary cards: 4 across on desktop, 2×2 on phones so money values fit. */
.ns-cat-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
@media (max-width: 640px) {
  .ns-cat-summary-grid { grid-template-columns: repeat(2, 1fr); }
}
```
In `CategoriesRoute.tsx:222`, replace the inline grid div with
`<div className="ns-cat-summary-grid">` (removing the inline grid/gap/marginBottom).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3 (CONDITIONAL): 12-month strip

Read `CategoriesRoute.tsx` around line 455 and the cells it renders. Decide:
- **If** each cell holds only a tiny bar/number (a dense sparkline-style strip meant to
  show all 12 months at a glance) → **leave it unchanged** and note that in your report.
  A 12-wide strip at 390px (~26px/cell) is acceptable for a glanceable mini-chart.
- **If** each cell holds text/money that clearly overflows at ~26px → extract to
  `.ns-cat-month-strip` and add `@media (max-width: 640px) { overflow-x: auto; }`
  (horizontal scroll) rather than collapsing (12 months shouldn't stack to 12 rows).

Do NOT force a change here if the strip is glanceable-by-design. Report your decision.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Full verification

**Verify**:
- `npm run build` → exit 0 (Vite build succeeds with the CSS changes)
- `npm run lint` → exit 0 (0 errors)
- `npm test` → all pass (no new failures)

## Test plan

No unit tests — this is pure presentational CSS. Verification is the build/lint/tsc
gates plus visual confirmation at 390px, which is done by the **reviewer** (not the
headless executor). In your report, list each grid you changed and the class name, so
the reviewer can spot-check each at a 390px viewport.

## Done criteria (ALL must hold)

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] `npm test` exits 0 (no new failures)
- [ ] `grep -n "ns-an-feature-split" src/styles/globals.css src/routes/InvestmentsAnalyticsTab.tsx` shows the class defined AND used
- [ ] `grep -n "ns-cat-summary-grid" src/styles/globals.css src/routes/CategoriesRoute.tsx` shows the class defined AND used
- [ ] Each new class has a `@media (max-width: 640px)` rule
- [ ] No inline `gridTemplateColumns` remains at the three cited sites (or, for line 455,
  a documented decision to leave it)
- [ ] No files outside the in-scope list modified
- [ ] Visual at 390px — **manual-verify-pending** (reviewer confirms on a dev server)

## STOP conditions

Stop and report back if:

- The base is not the stacked branch (the 079 `globals.css` grep doesn't match).
- Any cited line's inline grid doesn't match the "Current state" excerpt (drift).
- Removing the inline `style` would drop a non-grid property that has no home in the new
  class — report rather than guessing where it goes.
- A change appears to require touching chart internals or component logic.

## Maintenance notes

- **This completes the known RWD gaps.** An audit found the rest of the app already
  responsive (tables `hidden sm:contents` + mobile card lists; `.ns-dash-*` auto-fit
  collapse; `.ns-dash-activity-grid` collapses at 900px). Future new routes should
  follow the same convention: never put a multi-column grid in an inline `style` —
  use a `globals.css` class with a `@media (max-width: 640px)` collapse.
- **Reviewer**: confirm at 390px that the analytics band stacks and the category cards
  go 2×2; confirm desktop (≥1024px) is visually unchanged.
