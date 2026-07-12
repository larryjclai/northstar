# Plan 172: Index-Nudge design spike — decide how「長期贏不了大盤就加入大盤」becomes a product surface (roadmap 6.6)

> **Executor instructions**: This is a **design spike, not a build plan**. The
> deliverable is a decision document + a small tested detection prototype in
> `src/domain/` behind no UI. Follow the steps; if anything in "STOP
> conditions" occurs, stop and report. When done, update the status row in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ac63576..HEAD -- src/domain/portfolioAnalytics.ts src/routes/InvestmentsAnalyticsTab.tsx docs/`
> On drift, compare the "Current state" excerpts against live code before
> proceeding; on a mismatch, treat as STOP.

## Status

- **Priority**: P2
- **Effort**: M (spike; the build that follows is a separate plan)
- **Risk**: LOW (no user-facing change ships from this plan)
- **Depends on**: none
- **Category**: direction (last unbuilt Phase-6 item)
- **Planned at**: commit `4ac63576`, 2026-07-12

## Why this matters

ROADMAP.md Phase 6.6 is the only Phase-6 item with no code behind it. The
founding intent says「長期贏不了大盤就加入大盤」— but the product only *shows*
Portfolio-vs-Benchmark data; it never surfaces the decision. The roadmap
records two candidate shapes and explicitly ends with「待你決定：主動判斷版
（有感、稍有立場）vs 輕量視覺版（中性）」. This spike produces the material for
that decision: honest detection semantics, a tested prototype of the detection
math, and a recommendation — so the operator can choose and a build plan can
follow without re-investigating.

**The correctness constraint that makes this a spike and not a build:** the
analytics tab's return/alpha numbers are a **fixed-basket approximation** (the
UI itself discloses this — see excerpt below). Telling a user "you underperformed
the market by Y%" based on an approximation that ignores their actual
buy/sell timing could be *wrong about the one thing the feature exists to say*.
Northstar's #1 invariant is "correctness first for finance" (AGENTS.md). The
spike's core job is deciding which return series is honest enough to power a
nudge.

## Current state

- `src/routes/InvestmentsAnalyticsTab.tsx:611` — the honesty disclaimer on all
  analytics numbers:

  ```tsx
  <MetricHelp text="所有報酬、Alpha 與風險指標（波動、Sharpe、Sortino、最大回撤）皆以「目前持股數 × 歷史收盤價」回看計算，屬固定權重近似。若你在期間內買賣過該標的，實際時間加權報酬可能與此不同。" />
  ```

- `src/routes/InvestmentsAnalyticsTab.tsx:747-756` — the existing passive
  vs-benchmark card: `投資組合 vs ${benchmarkTicker}`, `perf.alpha` (超額報酬),
  `BenchmarkPicker`, default benchmark `0050.TW` with auto price backfill via
  `onEnsureBenchmark`.
- `src/domain/portfolioAnalytics.ts` — the analytics engine:
  `buildPortfolioTwr` (line ~837), `buildBenchmarkSeries`,
  `rollingVolatilityPct` (line 248). Read the module header and
  `buildPortfolioTwr`'s doc comment to determine whether that TWR is
  transaction-aware (true time-weighted with flows) or also fixed-basket — this
  is Question Q1 below and MUST be answered from the code, not assumed.
- `src/domain/portfolioMetrics.ts` / `portfolioCalculator.ts` — hold XIRR and
  moving-average cost; XIRR (資金加權) IS transaction-aware and is reported in
  the UI side by side with TWR (locked semantics — see `docs/product-spec.md`
  and the finance-semantics section of AGENTS.md; do not change any of it).
- Prior art for a spike deliverable in this repo: `docs/motion-ga-spike.md`
  (plan 161) — decision doc + throwaway PoC branch, PoC explicitly not merged.
  `plans/142-*.md` / `143-*.md` are older decision-spike plans if you want a
  second format reference.
- Data constraint: only daily `close` per `DailyPrice` — no OHLC. Detection
  windows must be built from daily closes.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0, 0 errors    |

## Scope

**In scope**:
- `docs/index-nudge-spike.md` (create — the decision document)
- `src/domain/indexNudge.ts` + `src/domain/indexNudge.test.ts` (create — pure
  detection prototype, exported but consumed by no UI)

**Out of scope** (do NOT touch):
- Any UI file — nothing ships to users from this spike.
- `portfolioAnalytics.ts`, `portfolioMetrics.ts`, `portfolioCalculator.ts` —
  read-only inputs; the locked return semantics must not change.
- Auto-trading / order placement of any kind — the roadmap is explicit:
  纯資訊、不自動下單.

## Git workflow

- Branch: `feat/ai-index-nudge-spike`
- Conventional commits, e.g. `docs(spike): index-nudge detection semantics + PoC`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1: Answer the honesty question (Q1)

Read `buildPortfolioTwr` and its tests. Determine and document: is any
available portfolio-level return series transaction-aware over an arbitrary
window (true TWR with flows), or are all window-series fixed-basket? Record the
answer with `file:line` evidence in the spike doc. This decides what the nudge
may honestly claim:
- If a transaction-aware series exists → the nudge can compare it to the
  benchmark over rolling windows.
- If only fixed-basket exists → the nudge must either (a) use XIRR vs
  benchmark-XIRR-equivalent (money-weighted, needs a same-cash-flows-into-
  benchmark counterfactual — document the cost of building that), or (b) carry
  the same 固定權重近似 disclaimer, weakening the claim. Document both.

**Verify**: the spike doc's Q1 section cites ≥ 2 `file:line` references.

### Step 2: Prototype the detection rule

In `src/domain/indexNudge.ts`, implement a pure function (shape below, adjust
to what Q1 allows):

```ts
export interface IndexNudgeInput {
  /** Rolling-window portfolio returns, oldest first (windows defined in the doc). */
  portfolioReturns: number[];
  benchmarkReturns: number[]; // same windows
  minWindows: number;         // sample-size gate, e.g. 8 rolling quarters
}
export interface IndexNudgeVerdict {
  triggered: boolean;
  consecutiveLagging: number;
  cumulativeGapPct: number | null;
  reason: "insufficient-data" | "leading" | "lagging-not-persistent" | "persistent-lag";
}
export function evaluateIndexNudge(input: IndexNudgeInput): IndexNudgeVerdict;
```

Detection semantics to prototype (and record as Decision B in the doc):
triggered when the portfolio lags the benchmark in ≥ N consecutive rolling
windows AND the cumulative gap exceeds a floor (so noise-level lag never
triggers). Pick concrete starting values (e.g. N = 8 rolling quarters over ≥ 2
years, gap ≥ 5pp cumulative), justify them in one paragraph each, and mark
them as tunable. The roadmap's gating requirement is binding: 領先或樣本不足時
不出現.

**Verify**: `npm test` → new `indexNudge.test.ts` passes (cases in Test plan).

### Step 3: Write the decision document

`docs/index-nudge-spike.md`, modeled on `docs/motion-ga-spike.md`, containing:

1. **Q1 answer** (Step 1) with evidence.
2. **Decision A — variant**: 主動判斷版 (banner/callout in 分析 tab when
   `triggered`, with attribution pointing at the lag source, dismissible +
   "don't show again" setting) vs 輕量視覺版 (rephrase the existing benchmark
   card's cumulative gap in plain language, no proactive prompt) vs **variant C
   (new since roadmap)**: expose「我 vs 0050 累積差距」as a selectable
   北極星指標 option — the hero-metric framework in
   `src/domain/northstarMetrics.ts` + `uiPreferences.northstarMetric` shipped
   after the roadmap was written and makes this variant nearly free. Give each
   variant: cost (S/M/L), honesty ceiling (from Q1), and annoyance risk.
3. **Decision B — detection semantics** with the prototype's parameters.
4. **A recommendation** (one variant, one sentence why).
5. **Open questions for the operator** (e.g. copy tone; where the dismiss
   preference lives — `uiPreferences` like `longViewMode` is the precedent).
6. **Build-plan sketch**: files the chosen variant would touch, so the next
   `/improve plan` invocation can specify it quickly.

**Verify**: doc exists; every claim about existing code carries a `file:line`.

## Test plan

`src/domain/indexNudge.test.ts` (model after `src/domain/northstarMetrics.test.ts`):
- insufficient data → `reason: "insufficient-data"`, not triggered.
- portfolio leading → `"leading"`, not triggered.
- lagging in some windows but not persistently → `"lagging-not-persistent"`.
- persistent lag + gap over floor → triggered with correct
  `consecutiveLagging` and `cumulativeGapPct`.
- boundary: exactly N windows / exactly at the gap floor (document the chosen
  inclusive/exclusive rule in the function's doc comment).

## Done criteria

- [ ] `docs/index-nudge-spike.md` exists with sections Q1 / Decision A /
      Decision B / Recommendation / Open questions / Build sketch
- [ ] `src/domain/indexNudge.ts` + tests exist; `npm test` all pass
- [ ] `grep -rn "indexNudge" src/routes/ src/components/` → no matches (no UI wired)
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` 0 errors
- [ ] `plans/README.md` status row updated

## STOP conditions

- `buildPortfolioTwr` turns out to be neither documented nor testable enough to
  answer Q1 from code — report what's ambiguous rather than guessing.
- The prototype seems to need changes to `portfolioAnalytics.ts` exports —
  compute from copies of its outputs instead; if impossible, stop and report.
- Anything requires inventing price data (OHLC, intraday) — the no-OHLC
  constraint is hard.

## Maintenance notes

- The operator decision (variant A/B/C) gates the build plan; nothing else
  should build on `indexNudge.ts` until that decision lands.
- If variant C is chosen, the build must register the metric in the same
  option list `DashboardRoute.tsx` builds for `northstarMetric` (see
  `allMetrics` around line 377-612) — note for the future plan author.
