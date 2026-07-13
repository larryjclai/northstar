# Plan 179: Index Nudge variant A + repoint all vs-benchmark surfaces to TWR (operator decision on plan 172)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat f8473bef..HEAD -- src/domain/indexNudge.ts src/routes/InvestmentsAnalyticsTab.tsx src/routes/DashboardRoute.tsx src/state/uiPreferences.ts src/domain/portfolioAnalytics.ts`
> On drift, compare the "Current state" excerpts against live code; on a
> mismatch, treat as STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (changes which return series two user-facing vs-benchmark
  numbers use; 口徑 changes must be labelled — 執行原則 #3 in ROADMAP.md)
- **Depends on**: plan 172 (spike, DONE — `docs/index-nudge-spike.md` is the
  design record this plan implements)
- **Category**: direction (roadmap 6.6 build)
- **Planned at**: commit `f8473bef`, 2026-07-13

## Why this matters

The operator decided (2026-07-13, on plan 172's options): **variant A — the
proactive nudge — plus repointing the existing vs-benchmark surfaces to TWR**
so the app has ONE honest 口徑 for "me vs the market". Today both existing
surfaces use the fixed-basket approximation (today's share counts × historical
closes), which the app's own disclaimer admits can differ from real
time-weighted performance once the user has traded. A true transaction-aware
TWR already exists (`buildPortfolioTwr`) with a chartable `series` — it is
computed in the analytics tab but never compared to the benchmark. This plan
(1) repoints the analytics Alpha card and the Dashboard 北極星「vs 0050 累積
差距」metric to TWR, and (2) ships the nudge banner driven by the already-
tested `evaluateIndexNudge` detection rule.

Copy tone decision (spike open question): **suggestive（建議式）**, e.g.
「考慮把新資金投入 {benchmark}?」— never blunt/命令式. Parameters: defaults
`minWindows = 8` rolling quarters, `gapFloorPct = 5` (already
`DEFAULT_GAP_FLOOR_PCT` in `indexNudge.ts`) — hardcode, do NOT add settings UI.

## Current state (all verified at `f8473bef`)

- `src/domain/indexNudge.ts` — `evaluateIndexNudge(input)` detection rule,
  merged from the spike, 11 tests, consumed by no UI. Its header documents the
  honesty contract: portfolio-side returns MUST be TWR-derived.
- `src/domain/portfolioAnalytics.ts:817-826` — the TWR result shape:

  ```ts
  export interface PortfolioTwr {
    twrPct: number | null;
    /** Cumulative TWR index as a return % per date, for charting / benchmark overlay. */
    series: Array<{ date: string; pct: number }>;
    observations: number;
    excludedTickers: string[];
  }
  ```

  **This file is read-only for this plan** — consume its exports, change nothing.
- `src/routes/InvestmentsAnalyticsTab.tsx`:
  - `:330-332` — `twrResult = buildPortfolioTwr({ positions, records, dailyPrices, toPrimary, start: activeStart, end })` already computed.
  - `:363-375` — the `perf` memo builds the vs-benchmark data from
    `core.series` (fixed-basket) via `toCumulativeReturnSeries` + `alignByDate`,
    producing `perf.alpha` and the chart `data`. **This is the repoint site**:

    ```tsx
    const perf = useMemo(() => {
      const series = core.series;
      const bench = buildBenchmarkSeries(dailyPrices, benchmarkTicker, activeStart, end);
      const aligned = bench.length >= 2 ? alignByDate(series, bench) : { a: series, b: [] as typeof bench };
      const portCum = toCumulativeReturnSeries(aligned.a);
      ...
      const alpha = portFinal != null && benchFinal != null ? portFinal - benchFinal : null;
    ```

    NOTE: `twrResult.series` entries are ALREADY cumulative-return percentages
    (`{date, pct}`), while `core.series` are values that get converted via
    `toCumulativeReturnSeries`. The repoint must align TWR pct-points with the
    benchmark's cumulative pct series by date — do not run
    `toCumulativeReturnSeries` on something that is already a return series.
  - `:747-756` — the vs-benchmark card labels + `超額報酬` (`perf.alpha`);
    `:806-810` — the plain-language 落後/領先 line.
  - The `MetricHelp` disclaimer (grep `固定權重近似`) currently claims ALL
    returns/Alpha/risk metrics are fixed-basket. After the repoint that is no
    longer true for Alpha — **the text must be split**: Alpha/vs-benchmark
    becomes「時間加權(TWR)口徑」, risk metrics (波動/Sharpe/Sortino/回撤)
    remain fixed-basket with the old wording.
- `src/routes/DashboardRoute.tsx:574-612` — `stripData` memo computes the
  北極星 `benchmarkGap` alpha from `buildPortfolioValueSeries` (fixed-basket).
  The second repoint site. Verify what data the component already has in
  scope: it uses `analyticsPositions`, `dailyPriceRows`, `manualSnapshotRows`,
  `toPrimary`; `buildPortfolioTwr` additionally needs **investment `records`**
  — check whether the component (or its `useFinanceData()` call) already has
  them (grep `investments` / `records` in the file). If they are genuinely not
  reachable without new data plumbing, see STOP #2.
- `src/state/uiPreferences.ts` — the add-a-preference pattern, exemplar
  `longViewMode` at lines 58 (type), 121, 150 (default), 214 (parse), 287
  (persist), 312, 397 (setter). Mirror it for the nudge mute pref.
- `docs/index-nudge-spike.md` — the design record; its "Build-plan sketch (If
  A)" section is the blueprint this plan follows. Read it before starting.
- Convention: inline zh-TW copy in these route files (match surrounding
  strings); COSS `Card`/`Button`; `ns-*` classes; number colors via
  `var(--ns-accent)` / `var(--ns-loss)` as the alpha row already does.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Install   | `npm install`      | exit 0 (fresh worktree — run FIRST) |
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0, 0 errors    |

## Scope

**In scope**:
- `src/domain/indexNudge.ts` + `src/domain/indexNudge.test.ts` (add the window
  builder + its tests; do NOT change `evaluateIndexNudge` semantics)
- `src/routes/InvestmentsAnalyticsTab.tsx` (repoint `perf`, split the
  disclaimer, add the nudge banner)
- `src/routes/DashboardRoute.tsx` (repoint `benchmarkGap`)
- `src/state/uiPreferences.ts` (one new boolean pref + setter)

**Out of scope** (do NOT touch):
- `src/domain/portfolioAnalytics.ts`, `portfolioMetrics.ts`,
  `portfolioCalculator.ts` — locked finance math, read-only.
- The TWR standalone KPI, XIRR, risk metrics (波動/Sharpe/Sortino/回撤/滾動)
  — they keep their current series and wording (except the disclaimer split).
- Any auto-trading/order surface — the nudge is 純資訊.
- Settings UI for nudge parameters — hardcoded defaults per the operator.

## Git workflow

- Branch: `feat/ai-index-nudge-build`
- Conventional commits, e.g. `feat(analytics): repoint alpha to TWR`,
  `feat(analytics): index-nudge banner (roadmap 6.6)`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1: Rolling-window builder in `indexNudge.ts`

Add a pure function:

```ts
export interface NudgeWindowSeries { date: string; pct: number }
/** Slice two aligned cumulative-return series into rolling-quarter window returns. */
export function buildIndexNudgeWindows(opts: {
  portfolioCum: NudgeWindowSeries[];  // e.g. buildPortfolioTwr().series
  benchmarkCum: NudgeWindowSeries[];  // benchmark cumulative-return series
  windowDays?: number;                // default 91 (rolling quarter)
}): { portfolioReturns: number[]; benchmarkReturns: number[] }
```

Semantics: align the two series by date (only dates present in both); step the
window boundary every `windowDays` calendar days from the aligned start; each
window's return converts the cumulative index difference into a per-window
return: `r = (1 + cumEnd/100) / (1 + cumStart/100) − 1`, expressed in %. Drop
a trailing partial window shorter than half `windowDays`. Return empty arrays
when fewer than 2 aligned points. Document every rule in the doc comment.

**Verify**: `npm test` → new window-builder tests pass (see Test plan);
`evaluateIndexNudge`'s existing 11 tests untouched and green.

### Step 2: Repoint the analytics `perf` memo to TWR

In `InvestmentsAnalyticsTab.tsx:363-375`: when `twrResult.twrPct != null` and
`twrResult.series.length >= 2`, use `twrResult.series` as the portfolio side
(it is already cumulative %; align by date with the benchmark cumulative
series). When TWR is unavailable (insufficient observations), **fall back to
the current fixed-basket path unchanged**. Expose which 口徑 was used, e.g.
`perf.basis: "twr" | "fixed"`.

Label the 口徑 in the UI (執行原則 #3): the vs-benchmark card's help/labels
say「時間加權報酬(TWR)」when `basis === "twr"`, and keep the current 固定權重
近似 wording when falling back. Split the umbrella `MetricHelp` disclaimer so
risk metrics keep the fixed-basket wording while Alpha references TWR.

**Verify**: `npx tsc --noEmit` → 0; `npm test` → all pass.

### Step 3: Repoint the Dashboard `benchmarkGap`

In `DashboardRoute.tsx:574-612`: compute the portfolio side with
`buildPortfolioTwr` over the same `start`/`end` (records permitting — see
Current state), aligned against `buildBenchmarkSeries`'s cumulative return;
same fallback rule (TWR unavailable → current fixed-basket calc). Update the
metric's `sub` line to state the 口徑 actually used. The metric key
`benchmarkGap` and registry mechanics must not change (northstar prefs point
at it).

**Verify**: `npx tsc --noEmit` → 0.

### Step 4: The nudge banner (variant A)

In `InvestmentsAnalyticsTab.tsx`, directly above the vs-benchmark card:
- Compute `buildIndexNudgeWindows` from the Step-2 TWR series + benchmark
  series, then `evaluateIndexNudge({ ..., minWindows: 8 })`.
- Render a dismissible callout ONLY when `verdict.triggered` **and**
  `perf.basis === "twr"` (never nudge off the approximation) **and** the mute
  pref is off. Copy (suggestive tone):
  「你近 {consecutiveLagging} 季的報酬落後 {benchmarkTicker},累積約
  {cumulativeGapPct}%。長期贏不了大盤就加入大盤——考慮把新資金投入
  {benchmarkTicker}?」 plus a muted one-liner stating the 口徑
  (時間加權報酬、滾動季視窗) and two actions:「知道了」(dismiss for this
  session — component state) and「不再顯示」(persists).
- Add `indexNudgeMuted: boolean` to `uiPreferences` following the
  `longViewMode` pattern (all six sites listed in Current state) with a
  `toggleIndexNudgeMuted`-style setter;「不再顯示」sets it.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors;
`grep -n "indexNudgeMuted" src/state/uiPreferences.ts` → ≥ 5 sites.

## Test plan

Extend `src/domain/indexNudge.test.ts` (same file, new `describe`):
- window builder: two aligned series over ~3 quarters → expected number of
  windows and correct per-window returns (hand-computed fixture).
- misaligned dates: only intersecting dates used.
- fewer than 2 aligned points → empty arrays.
- trailing partial window (< half windowDays) dropped.
- round-trip: windows fed into `evaluateIndexNudge` trigger on a constructed
  persistent-lag fixture and do NOT trigger on a leading fixture.

No route-render tests (repo convention: pure helpers only). All existing
tests must stay green — especially `indexNudge.test.ts`'s original 11 and the
analytics-adjacent suites.

## Done criteria

- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` all pass with ≥ 5 new window-builder tests
- [ ] `grep -n "twrResult.series\|basis" src/routes/InvestmentsAnalyticsTab.tsx` shows the perf repoint with a fixed-basket fallback branch
- [ ] `grep -n "buildPortfolioTwr" src/routes/DashboardRoute.tsx` ≥ 1 (or the STOP was reported)
- [ ] `grep -rn "evaluateIndexNudge" src/routes/` → exactly one consumer (the analytics tab)
- [ ] The 固定權重近似 disclaimer no longer claims Alpha is fixed-basket (read the MetricHelp text)
- [ ] `git diff --stat` shows no changes to `src/domain/portfolioAnalytics.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

- `twrResult.series` turns out NOT to be date-alignable with
  `buildBenchmarkSeries` output (different date domains that `alignByDate`
  can't reconcile) — report with examples instead of inventing an
  interpolation.
- `DashboardRoute` cannot reach investment `records` without adding new data
  plumbing beyond a field already returned by `useFinanceData()` — ship Steps
  1/2/4 (analytics side), leave the Dashboard metric on fixed-basket, and
  report; do not build new data-loading paths.
- Any existing test asserts the OLD alpha value in a way that contradicts the
  repoint — list the assertions and stop; changing recorded financial
  expectations needs review, not improvisation.
- The banner seems to need data the analytics tab doesn't already compute.

## Maintenance notes

- The nudge inherits `buildPortfolioTwr`'s v1 scope: fully-exited positions
  are excluded — the banner measures the holdings you still own vs the market.
  If TWR's scope is widened later, the nudge copy should be revisited.
- Reviewer should scrutinize: the cumulative-vs-value series confusion (Step 2
  note), the TWR-unavailable fallback path, and that the banner can never
  render from fixed-basket numbers.
- Deferred: variant-B plain-language rephrase of the card (covered implicitly
  by the 口徑 label), nudge attribution drill-down (spike mentions
  `buildReturnAttribution` — v2), per-space mute.
