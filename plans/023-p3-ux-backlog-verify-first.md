# Plan 023: P3 UX backlog (verify-first, pick items independently)

> **Executor instructions**: This is a **backlog** of small, independent P3
> items, not one linear task. Each item below is self-contained. **Before
> implementing any item, do its "Verify current state" check** — the source audit
> (`docs/ux-chart-audit.md`, commit `8b2302d1`) is older than the current tree and
> several of its findings have already been silently fixed. If an item is already
> done, mark it DONE in this file and skip it. Pick items one at a time, each on
> its own commit. Run the shared verification gates after each. Update this plan's
> status row in `plans/README.md` when you finish a batch.
>
> **Drift check (run first)**:
> `git diff --stat b0fda83d..HEAD -- src/routes/` — if the touched route for an
> item changed, re-read it before relying on any line hint below (line numbers are
> approximate leads, not facts).

## Status

- **Priority**: P3
- **Effort**: M total (each item S)
- **Risk**: LOW (except items flagged "design-gate")
- **Depends on**: none
- **Category**: dx (polish / actionability)
- **Planned at**: commit `b0fda83d`, 2026-06-16

## Why this matters

These are the lower-leverage "缺失功能清單" items from the UX audit. Individually
small; together they remove rough edges (silent empty states, undiscoverable
trends, static estimates that imply false precision). None are urgent, which is
why they are batched at P3. Two of them (KPI hierarchy, FIRE sensitivity) involve
product judgment and are gated on an operator decision rather than improvised.

## Shared commands & gates (run after each item)

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass |

zh-TW-first for all visible copy. Match each file's existing token usage
(`var(--ns-*)`). Do not touch finance calculations unless an item says so.

## Items

### A. Distinguish Dashboard 「淨值變化%」 vs 「投組報酬%」 labels
- **Why**: two percentages on the dashboard mean different things (net-worth
  change includes cash + liabilities; portfolio return is holdings-only) but read
  as interchangeable.
- **Verify current state**: in `src/routes/DashboardRoute.tsx`, locate the
  net-worth change percentage (on the net-worth card) and the portfolio/strip
  return percentage (the "PortfolioStrip"/top-movers area). **Audit line numbers
  (572 / 951) are stale — find the elements by content** (`grep -n "%" ` plus the
  surrounding label). If both already carry distinguishing labels, mark DONE.
- **Do**: add a short clarifying label/caption to each so they're not confusable
  (e.g.「淨值（含現金與負債）」vs「投組報酬（僅持股）」). Copy-only.
- **Scope**: `src/routes/DashboardRoute.tsx`.

### B. Goal progress 「超前 / 落後」 status
- **Why**: goals show only a percent; no sense of whether you're ahead or behind
  the pace needed to hit the target date.
- **Verify current state**: read `src/routes/GoalsRoute.tsx`. If a pace/ahead-
  behind indicator already exists, mark DONE.
- **Do**: if goals have a target amount + target date, compute expected progress
  by now (linear pace) and show a 「超前 X%」/「落後 X%」chip. If goals lack a target
  date in the data model, STOP and report (model change is out of scope).
- **Scope**: `src/routes/GoalsRoute.tsx`.

### C. FX rate change direction / sparkline
- **Why**: FX rates render as bare numbers with no up/down direction.
- **Verify current state**: find where exchange rates are displayed (search
  `grep -rn "exchangeRates\|匯率" src/routes src/components`). If a direction
  indicator already exists, mark DONE.
- **Do**: add a small ▲/▼ + delta (or a tiny sparkline if recent history is
  available in `dailyFxRates`). Display-only.
- **Scope**: the FX display component/route found above.

### D. HoldingDetail empty messages (no open position / no trades)
- **Why**: when a holding has no open position or no trades, the relevant section
  renders nothing (silent) instead of an explanatory empty state.
- **Verify current state**: read `src/routes/HoldingDetailRoute.tsx`. Note it has
  a pre-existing top-level "not found" return and (from plan 017) a
  loading/error guard — do not disturb those. Check the position/trades sections
  for silent `null` renders.
- **Do**: render a muted 「目前無未平倉部位」/「尚無交易紀錄」line where those sections
  currently render nothing. Follow the `EmptyState` tone used elsewhere.
- **Scope**: `src/routes/HoldingDetailRoute.tsx`.

### E. Sortable columns on category / merchant tables
- **Why**: detail tables use a fixed sort and can't be reordered.
- **Verify current state**: read `src/routes/CategoriesRoute.tsx` /
  `src/routes/MerchantsTab.tsx` / `src/routes/CategoriesTab.tsx`. The repo has
  `@tanstack/react-table` (in `package.json`) — check whether these tables already
  use it.
- **Do**: add click-to-sort on the amount/count columns (toggle asc/desc) for the
  desktop table. Keep it minimal — local `useState` sort key is fine; do not pull
  in new deps.
- **Scope**: the table route(s) chosen. Coordinate with plan 018/019/020 if those
  touch the same files (do this item after they land).

### F. Detail-page CSV / image export
- **Why**: the audit reported export buttons disabled (標「尚未」) on detail pages.
- **Verify current state**: search `grep -rn "disabled\|尚未\|匯出\|downloadCsv\|exportAccountsCsv" src/routes`.
  **Accounts already has working CSV export** (`AccountsRoute.tsx` uses
  `downloadCsv` + `exportAccountsCsv`) — reuse that helper. Identify which detail
  pages still have a disabled export button.
- **Do**: wire CSV export on those pages using the existing `downloadCsv` helper
  and a per-page row→CSV mapper (model after `exportAccountsCsv`). Skip image
  export unless trivially supported.
- **Scope**: the detail route(s) with a disabled button; reuse existing export lib.

### G. (design-gate) KPI card visual hierarchy
- **Why**: income/expense/savings KPI cards are visually equal-weight; no primary.
- **Gate**: this is a visual-design judgment. **STOP and ask the operator** which
  metric should be primary and how (size? accent? order?) before changing layout.
  Do not restyle on your own initiative.

### H. (design-gate) FIRE sensitivity recompute on slider; retirement income in curve
- **Why**: the FIRE page's sensitivity figures appear static (don't recompute with
  the sliders), and retirement-income inputs don't visibly affect the projection
  curve — both imply interactivity that isn't there.
- **Verify current state**: read `src/routes/FIRECalculatorRoute.tsx` (the income
  inputs are around the 349–435 region per the audit; re-locate). Determine
  whether the sensitivity block already recomputes from current slider state.
- **Gate**: changing the projection math / sensitivity model touches finance
  semantics (locked). **STOP and confirm the intended model with the operator**
  before altering any calculation. A display-only fix (e.g. recomputing an
  already-defined formula live) may proceed; a new model definition may not.
- **Scope**: `src/routes/FIRECalculatorRoute.tsx` (display) — calc changes gated.

## Done criteria (per item)

- [ ] "Verify current state" performed; item confirmed not-already-done
- [ ] `npx tsc --noEmit` / `npm run build` / `npm run lint` / `npm run test` all clean
- [ ] Only the named file(s) for that item modified (`git status`)
- [ ] No finance calculation changed for display-only items
- [ ] This file's per-item status updated; `plans/README.md` row updated when a
      batch is finished

## STOP conditions

- Any item marked "design-gate" (G, H) without an operator decision.
- An item needs a data-model change (e.g. goals lack a target date for item B).
- An item turns out already implemented — mark DONE and move on, don't redo it.

## Maintenance notes

- Items E and F overlap file-wise with plans 018–020; sequence after those to
  avoid conflicts.
- This backlog is deliberately loose: treat each item as its own tiny PR.
