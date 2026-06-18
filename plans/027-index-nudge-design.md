# Plan 027: "Join the index" nudge — design + decision gate

> **Executor instructions**: This is a **design/spike plan with a decision gate**
> (ROADMAP 6.6). Do Step 1 (the decision), STOP for the operator to choose
> active-vs-lightweight, then build only the chosen option. Do not improvise a
> recommendation engine. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4cc86eab..HEAD -- src/domain/portfolioAnalytics.ts src/routes/InvestmentsAnalyticsTab.tsx src/routes/DashboardRoute.tsx`

## Status
- **Priority**: P3 (signature philosophy, but carries a product-stance decision)
- **Effort**: S (lightweight) – M (active detection)
- **Risk**: MED (a wrong/aggressive "you're losing to the index" message erodes trust)
- **Depends on**: none (benchmark data already exists)
- **Category**: direction (feature)
- **Planned at**: commit `4cc86eab`, 2026-06-18

## Why this matters
The 初衷 makes a claim: 「長期贏不了大盤就加入大盤」. The app already *shows* the
data (Portfolio vs Benchmark + Alpha) but never turns it into the **decision** the
initiative is about (`ROADMAP.md` 6.6). The opportunity is to surface sustained
underperformance honestly — informational, never auto-trading, always dismissible.
The risk is tone: a finance app that nags "you're losing" loses trust, so the
**stance is a deliberate choice**, not an executor default.

## Current state (verified at 4cc86eab)
- **Benchmark comparison already exists**: `DashboardRoute.tsx` `PortfolioStrip`
  renders 投資組合 / benchmark / 超額報酬(alpha) for a period; `InvestmentsAnalyticsTab.tsx`
  has the in-depth Portfolio-vs-Benchmark + Alpha (default benchmark `0050.TW`,
  `DEFAULT_BENCHMARK_TICKER` in `src/state/uiPreferences.ts`).
- **Analytics primitives**: `src/domain/portfolioAnalytics.ts` —
  `annualizedReturn` (line 122), `cumulativeReturnPct` (90), `dailyReturns` (80),
  `toCumulativeReturnSeries` (103), `rollingVolatilityPct` (247),
  `buildReturnAttribution` (503), `buildPortfolioValueSeries` (435). These give you
  rolling/cumulative portfolio return; benchmark series is fetched for `0050.TW`.
- **Attribution** (`buildReturnAttribution`) can name *which* holdings drove the
  lag — useful for an honest "where the lag came from" explanation.

## Decision (2026-06-18 — operator chose **Option L, lightweight/neutral**)
No detection, no advice, no dismiss-flag. Concrete Option-L scope:
1. **`InvestmentsAnalyticsTab.tsx`** — add a plain-language cumulative-gap caption near the
   existing benchmark/alpha display (the `alpha = portFinal − benchFinal` at ~`:322`):
   `alpha < 0` → 「期間累積落後 {benchmark} {|alpha|}%」; `alpha > 0` → 「期間累積領先 {benchmark} {alpha}%」;
   null/insufficient → render nothing. **Reuse the existing `alpha` — no new calc.**
2. **`DashboardRoute.tsx`** — add a `benchmarkGap` entry to the 024 `METRIC_REGISTRY` (~`:284`)
   whose value is the already-computed `stripData.alpha` (label e.g.「vs {benchmark} 累積差距」,
   display signed %, null → 「—」), so users can pin it as their north-star metric.
Out of scope (this is NOT Option A): any sustained-lag detection, `indexNudge.ts`, the dismissible
note, or a uiPreferences dismiss flag.

---
## Step 1 — DECISION GATE (RESOLVED above — Option L)
The original options, for the record:

- **Option L (lightweight, neutral)** — no recommendation, just make the *existing*
  benchmark data clearer: add a plain-language 「累積落後/領先 X%」line to the
  benchmark card, and/or expose "我 vs 0050 累積差距" as a north-star metric option
  (plan 024 registry). No detection, no advice. Effort **S**. Lowest trust risk.
- **Option A (active, has a stance)** — detect **sustained** underperformance
  (e.g. rolling N-period TWR consistently < benchmark AND alpha significantly
  negative over a long window) and show a non-preachy, dismissible note in
  Investments analytics: 「你近 X 年的主動選股落後大盤 Y%，考慮指數化？」, using
  `buildReturnAttribution` to point at the lag's source. Pure information, no
  order placement, default-dismissible, never shown when leading or sample is
  insufficient. Effort **M**.

Record the choice + rationale in this file's "Decision" section, then build only it.
**Verify**: a decision line exists. Do not write detection logic before the choice.

## Design notes for whichever is chosen
- **Thresholds (Option A)** must be conservative and explainable: define the window
  (e.g. ≥3y of data), the underperformance test (rolling TWR < benchmark for a
  sustained fraction of windows) and the alpha-significance bar as named constants
  with comments; gate behind `MIN_ANALYTICS_DAYS`-style sufficiency (analytics
  already has such gating — reuse the pattern). When data is insufficient or the
  portfolio leads, show nothing.
- **Tone/UX**: informational card, dismissible, preference-persisted "don't show
  again" (mirror `uiPreferences` flags like `showTradeMarkers`). zh-TW, calm copy,
  no red-alarm styling.
- **Never** auto-trade, never link to a broker order — explicitly out of scope.
- Put any new detection in a tested domain helper (`src/domain/indexNudge.ts`),
  not inline, so the thresholds are unit-tested with synthetic lead/lag series.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass |

## Scope
**In scope (depends on the chosen option)**:
- Option L: `src/routes/DashboardRoute.tsx` and/or `InvestmentsAnalyticsTab.tsx` (a clearer cumulative-gap line); optionally the plan-024 metric registry.
- Option A: `src/domain/indexNudge.ts` (+ test) for the detection; `InvestmentsAnalyticsTab.tsx` for the dismissible note; `src/state/uiPreferences.ts` for the dismiss flag.

**Out of scope**: any order placement / broker integration; changing how returns/alpha are computed (consume `portfolioAnalytics`); showing the nudge on insufficient data or when leading.

## Steps (after the decision)
1. Decision recorded (Step 1).
2. **Option A only**: `indexNudge.ts` — `detectSustainedLag({ portfolioSeries, benchmarkSeries, ... }) → { lagging: boolean; trailingPct: number | null; windowYears: number }` with conservative named thresholds. Unit-test with synthetic leading / lagging / insufficient series. **Verify**: `npm run test -- indexNudge` pass.
3. Build the chosen UI (dismissible note for A; clearer gap line for L). **Verify**: tsc 0; build 0.
4. Full gates + `npm run dev`: (A) a lagging demo portfolio shows the note, leading/short ones don't, dismiss persists; (L) the cumulative gap reads clearly.

## Done criteria (ALL)
- [ ] Step 1 decision recorded in this file
- [ ] Chosen option built; (A) detection is a tested helper with conservative gated thresholds
- [ ] Nudge never appears on insufficient data or when leading (A); nothing auto-trades
- [ ] `npx tsc --noEmit` 0; `npm run build` 0; `npm run lint` 0 errors; `npm run test` pass
- [ ] `portfolioAnalytics.ts` internals unchanged (`git diff`)
- [ ] `plans/README.md` row updated

## STOP conditions
- No operator decision yet — do not build (Step 1 gate).
- Detection would require changing return/alpha math — report (consume, don't alter).
- You can't make the threshold produce "no nudge" for leading/short samples in tests — report (a false-positive nag is worse than no feature).

## Maintenance notes
- Pairs with plan 024 (the cumulative-gap metric is a natural north-star option).
- Reviewer: scrutinize the thresholds and the "show nothing" paths; the failure mode that matters is a confident-but-wrong "you're losing to the index."
