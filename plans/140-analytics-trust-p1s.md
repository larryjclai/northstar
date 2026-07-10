# Plan 140: Execute the ux-chart-audit P1s — loading/error states, methodology caveat, risk-jargon legibility

> **Executor instructions**: Follow this plan step by step. FIRST read
> `docs/ux-chart-audit.md` in this repo — it is the source audit and contains
> per-chart detail this plan summarizes. Run every verification command. On a
> STOP condition, stop and report. Update this plan's status row in
> `plans/README.md` when done — unless a reviewer told you they maintain the
> index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/routes/InvestmentsAnalyticsTab.tsx src/routes/router.tsx src/data/hooks.ts docs/ux-chart-audit.md`
> Re-locate by grep; STOP on shape mismatch.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (additive UI states; the error boundary touches routing)
- **Depends on**: none
- **Category**: direction (trust-completeness of analytics)
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

The operator's open question 「分析的圖表和功能是不是真的有用」 was answered by
a dedicated audit (`docs/ux-chart-audit.md`, 2026-06-16): the charts are
complementary — none should be cut — but three P1 trust gaps remain
unaddressed (verified still present):

1. **No loading/error states app-wide**: data routes render empty/zero states
   while queries are in flight, and a failed query fails silently — for a
   finance app, a transient DB error looks like "your money is gone".
   `src/routes/router.tsx` defines no `errorComponent`/error boundary
   (verified: `RouteError.tsx` exists as a component but check whether any
   route uses it — grep `RouteError` / `errorComponent` in router.tsx).
2. **The fixed-basket approximation caveat is missing**:
   `docs/dashboard-analytics-plan.md` §1 mandates disclosing that
   benchmark/TWR comparisons use a fixed-weight approximation; the audit
   found no such caveat in `InvestmentsAnalyticsTab.tsx` (~:499/:571/:762
   regions — re-locate by reading the audit doc's table).
3. **Risk-metric jargon behind 13px hover icons**: Sharpe/Sortino/MDD helper
   text exists (the `help` prop on KpiCard, verified at
   `InvestmentsAnalyticsTab.tsx:843-865`) but is hover-only — unusable on
   touch (iOS build!) and invisible to scanners.

PRODUCT.md principle #3: "Financial calculations must be explainable and
testable." These are the explainability half.

## Current state

- Query layer: `src/data/hooks.ts` `useFinanceData()` returns named query
  objects; each has `.isLoading`/`.isError` (React Query) — currently mostly
  unread by routes (grep `isError` in src/routes → verify near-zero usage).
- `src/components/RouteError.tsx` — read it; likely built for this purpose.
- `src/components/EmptyState.tsx`, `StatusText.tsx`, `Toast.tsx` — existing
  state-display vocabulary. `Spinner` exists in `src/components/coss/`.
- KpiCard `help` prop + `MetricHelp` (grep in InvestmentsAnalyticsTab).
- DESIGN.md §12.6 (empty states) + §12.8 (styling priority) govern visuals.
- The audit doc's 建議實作順序 wave 1–2 = exactly this plan's steps.

## Commands

`npx tsc` (exit 0), `npm test` (all pass), `npm run lint` (exit 0).

## Scope

**In scope**:
- `src/routes/router.tsx` — a route-level `errorComponent` (TanStack Router's
  option) wiring `RouteError` (or a small wrapper) for all lazy routes
- A shared tri-state helper: small `QueryBoundary`-style component OR a
  per-route pattern (pick the LIGHTEST approach that fits the file style —
  see Step 2) applied to the two highest-value routes:
  `InvestmentsAnalyticsTab` (via its parent InvestmentsRoute's queries) and
  `DashboardRoute`
- `InvestmentsAnalyticsTab.tsx` — the fixed-basket caveat line + making each
  KpiCard's `help` text tappable/expandable (see Step 4)
- Tests for the new shared component

**Out of scope**:
- Skeleton screens on every route (audit wave 3+; the shared component makes
  later adoption cheap — record as follow-up).
- Any calculation change; MIN_ANALYTICS_DAYS gating; chart layout.
- The audit's P2/P3 items.

## Git workflow

Branch `feat/ai-analytics-trust-p1`; conventional commits per step.
No push/merge.

## Steps

1. **Router error boundary**: add `defaultErrorComponent` (TanStack Router
   API — check the installed version's option name via
   `node_modules/@tanstack/react-router` types or existing usage) rendering
   `RouteError` with the error + a 重試 action (router `.invalidate()` or
   location reload). **Verify**: `npx tsc`; temporarily throw in a route
   loader in dev to see it render (revert), or unit-test the component
   mapping if feasible.
2. **Tri-state on Dashboard + Analytics**: for the queries each route reads,
   render (a) a centered `Spinner` block while `isLoading` (first load only —
   with plan 124's `staleTime: Infinity` this is once per session), (b) a
   compact error strip (`StatusText` tone=error + 重試 button calling
   `query.refetch()`) when `isError`, instead of silently rendering zeros.
   Implementation choice: a ~30-line `QueryGate` component in
   `src/components/` taking `queries: UseQueryResult[]` and children —
   matches the repo's small-component style. zh-TW copy: 「載入中…」「資料載
   入失敗」「重試」.
   **Verify**: `npm test`; unit-test QueryGate's three states with fake
   query objects.
3. **Fixed-basket caveat**: one muted caption line under the
   benchmark/TWR comparison header in InvestmentsAnalyticsTab —
   「基準比較採固定權重近似（期初持股比重），非逐日再平衡」 (adjust wording
   to the audit doc's recommendation if it specifies one; keep ≤1 line,
   `.muted` class, follow the existing XIRR annotation pattern from plan 103
   — grep 「年化自」 for that exemplar).
   **Verify**: visible in dev; `npm run lint` green (no toLocaleString etc.).
4. **Tappable metric help**: convert the hover-only help to
   click/tap-toggleable — read `MetricHelp`'s current implementation; if it
   renders a tooltip on hover, add onClick toggle + `aria-expanded` +
   `role="button"`/tabIndex so keyboard and touch reach it. Keep the visual
   design; this is an interaction fix, not a redesign.
   **Verify**: `npm test`; keyboard: Tab reaches the icon, Enter toggles.

## Done criteria

- [ ] Router renders RouteError on a thrown route error (dev-verified)
- [ ] Dashboard + Analytics show loading and error states (no silent zeros)
- [ ] Caveat line present near benchmark comparison
- [ ] Metric help reachable by tap + keyboard
- [ ] Gates green; `plans/README.md` updated (note wave-3 follow-up: adopt
      QueryGate on remaining routes)

## STOP conditions

- TanStack Router's version lacks a global error-component option — report
  the per-route alternative cost.
- `useFinanceData` consumers destructure `.data` so deep that gating needs
  restructuring beyond ~20 lines per route.
- MetricHelp is a Base UI primitive whose interaction can't change without
  the quarantined ui/ layer.

## Maintenance notes

- Once QueryGate exists, every new route should mount inside it — one line in
  DESIGN.md §12 or AGENTS.md gotchas would cement it (suggest in report).
- Reviewer: check the error strip doesn't flash during background refetches
  (`isError` only, never `isFetching`).
