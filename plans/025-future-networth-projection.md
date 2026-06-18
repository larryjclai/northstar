# Plan 025: Dashboard future-net-worth (compounding) projection

> **Executor instructions**: Design-forward feature plan (ROADMAP 6.4). Reuse the
> existing projection engine — do NOT write a new financial model. Follow the
> Design decisions as settled. Run every verification command. When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4cc86eab..HEAD -- src/domain/retirementProjection.ts src/routes/FIRECalculatorRoute.tsx src/routes/DashboardRoute.tsx`
> If any changed, re-confirm the "Current state" excerpts before proceeding.

## Status
- **Priority**: P3 (follow-on to the 底氣 cluster; makes compounding tangible)
- **Effort**: M
- **Risk**: MED (projection figures must match the FIRE engine's口徑)
- **Depends on**: none (but conceptually pairs with plan 024)
- **Category**: direction (feature)
- **Planned at**: commit `4cc86eab`, 2026-06-18

## Why this matters
The 初衷 notes compounding only becomes real once you've felt it; for everyone
else it's abstract (`ROADMAP.md` 6.4). A Dashboard-level **future net-worth curve**
(10/20/30-year, with pessimistic/neutral/optimistic bands) driven by the user's
current savings rate + a return assumption makes the payoff of saving visible —
without making them open the FIRE calculator. It must share the FIRE engine so the
numbers are consistent everywhere (執行原則 #3).

## Current state (verified at 4cc86eab)
- **Engine**: `src/domain/retirementProjection.ts` — `projectRetirement(input: ProjectionInput): RetirementProjection` (line 93). `RetirementProjection.series` is a year-by-year `ProjectionYear[]` (line 39-40) with `endBalance` per year. `ProjectionInput` (line 70) takes current value, contributions, return rate(s), inflation, ages, etc.
- **Scenario fan-out**: `src/routes/FIRECalculatorRoute.tsx` calls `projectRetirementScenarios({ goal, currentValue })` (line ~102) and reshapes `scenarios.{neutral,pessimistic,optimistic}.projection.series` into a recharts series with `balance` / `bearBalance` / `bullBalance` per point (lines ~107-127). This is the exact pattern to reuse for a net-worth (not retirement-age-bounded) projection.
- **Inputs on the Dashboard**: net worth = `buildNetWorthBreakdown(...).netWorth`; savings rate / monthly net are computed in `DashboardRoute.tsx:216-227` (`monthIncome`/`monthExpense`/`monthNet`). A return assumption is not on the Dashboard — default to a constant (e.g. 7%) with an adjustable control, mirroring the FIRE CAGR slider default (`FIRECalculatorRoute.tsx:45` `useState(7.2)`).
- Charts use `recharts` (`Area`/`ResponsiveContainer`) — see the FIRE projection chart and `DashboardRoute`'s existing net-worth trend chart for the house chart style/tokens.

## Design decisions (settled)
1. **Reuse `projectRetirement` / the scenarios pattern** — do NOT author new math. Feed it: `currentValue = netWorth`, annual contribution = `monthNet × 12` (or trailing-3-month avg net × 12 — prefer the trailing average for stability, consistent with plan 024), neutral return = an adjustable assumption (default 7%), bands = neutral ±2.5% (matching FIRE's `bearCagr = cagr − 2.5` / `bullCagr = cagr + 2.5`, `FIRECalculatorRoute.tsx:121-122`).
2. **Horizon**: project 30 years; show 10/20/30 markers. Net-worth projection (not age-bounded retirement) — set `planThroughAge`/horizon so the series spans 30 years from now.
3. **A Dashboard card, not a calculator** — read-only curve + scenario band + a single return-assumption control + the 3 horizon values (10/20/30yr neutral). Keep it visually distinct from the FIRE page (which is the interactive planner). Respectable empty state when there's no net worth / no income history yet.
4. **Nominal by default**, with a note; do not add an inflation toggle in v1 (FIRE page owns that).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass |

## Scope
**In scope**:
- `src/routes/DashboardRoute.tsx` (new projection card) — OR a small new component `src/components/NetWorthProjectionCard.tsx` imported by Dashboard (prefer the component for testability; wire it as a `dashboardHiddenCards`-aware card).
- If a thin adapter helper is needed: `src/domain/netWorthProjection.ts` (+ test) that maps Dashboard inputs → `ProjectionInput` and returns the 10/20/30yr figures. Keep all actual math inside `projectRetirement`.

**Out of scope**:
- `src/domain/retirementProjection.ts` internals (reuse only).
- The FIRE calculator route (do not change it).
- Inflation modeling / Monte Carlo (follow-on).

## Steps
1. **Adapter** (if used): create `netWorthProjection.ts` mapping `{ netWorth, annualContribution, returnPct }` → `ProjectionInput`, calling `projectRetirement` for neutral/±2.5% bands, returning `{ series, at10, at20, at30 }`. Unit-test it (assert the 3 horizon values are monotonic for positive contribution+return; assert bands order bear ≤ neutral ≤ bull). **Verify**: `npm run test -- netWorthProjection` pass.
2. **Card**: render an area chart (neutral line + bear/bull band) using the FIRE chart's recharts pattern + DS tokens; a return-assumption control (slider or stepper, default 7%); the 10/20/30yr neutral figures as captions. Empty state when `netWorth <= 0` or no income history. **Verify**: `npx tsc --noEmit` 0; `npm run build` 0.
3. **Wire into Dashboard** as a toggleable card (respect `dashboardHiddenCards`/`cardVisible`). **Verify**: appears on Dashboard; hideable via 編輯版面.
4. Full gates + `npm run dev` visual: curve renders, changing the return assumption re-projects live, numbers agree with the FIRE engine口徑 for the same inputs.

## Test plan
- `netWorthProjection.test.ts`: horizon values, band ordering, zero/negative contribution edge cases. Model after an existing domain test.
- Manual: cross-check one scenario against the FIRE page with matching inputs (same currentValue/contribution/return → same endBalance).

## Done criteria (ALL)
- [ ] Dashboard shows a future-net-worth projection card (curve + bands + 10/20/30yr)
- [ ] Math comes from `projectRetirement` (no new model); adapter (if any) is tested
- [ ] Changing the return assumption re-projects; card is hideable
- [ ] `npx tsc --noEmit` 0; `npm run build` 0; `npm run lint` 0 errors; `npm run test` pass
- [ ] `retirementProjection.ts` internals unchanged (`git diff`)
- [ ] `plans/README.md` row updated

## STOP conditions
- `projectRetirement`/`ProjectionInput`/`RetirementProjection.series` differ from "Current state" — report.
- The projection can't reuse the engine without changing its internals — report (do not fork the math).
- Numbers diverge from the FIRE page for identical inputs — report the delta (a口徑 mismatch is a trust bug).

## Maintenance notes
- Pairs with plan 024: "30yr projected net worth" or "years to a milestone" could become a north-star metric option.
- Reviewer: confirm the contribution basis (trailing net × 12) and that bands are engine-derived, not hand-rolled.
- Follow-ons: inflation/real toggle, milestone markers, Monte-Carlo bands.
