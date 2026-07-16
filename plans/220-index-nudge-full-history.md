# Plan 220: Index Nudge evaluates full history — fires regardless of the viewed period

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do NOT update `plans/README.md` — the reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 55c636ac..HEAD -- src/routes/InvestmentsAnalyticsTab.tsx src/domain/indexNudge.ts`
> On any in-scope change since `55c636ac`, compare the "Current state"
> excerpts against live code; mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: MED (finance-adjacent display logic — the honesty contract must survive)
- **Depends on**: none
- **Category**: direction (plan 179 follow-up)
- **Planned at**: commit `55c636ac`, 2026-07-17

## Why this matters

Plan 179 shipped the Index Nudge (roadmap 6.6, operator-decided variant A): a
banner on the 投資 analytics tab when the portfolio's TWR lags the benchmark for
≥8 consecutive rolling quarters by ≥5pp cumulative. But it evaluates over the
**selected analytics period**, so it can only ever fire when the user happens to
view 5Y/All (shorter ranges can't contain 8 rolling quarters). A user who always
looks at 1M/YTD never sees it — the nudge's entire audience. This plan evaluates
the nudge over an always-full-history series so the verdict is
period-independent, while the on-screen Alpha card keeps showing the selected
period. The A/B/C variant decision is CLOSED (operator chose A, 2026-07-13) —
do not revisit parameters (8 windows / 5pp / 91d are operator-locked).

## Current state

- `src/routes/InvestmentsAnalyticsTab.tsx:331-333` — TWR over the SELECTED period:

  ```tsx
  const twrResult = useMemo(() => {
    return buildPortfolioTwr({ positions, records, dailyPrices, toPrimary, start: activeStart, end });
  }, [positions, records, dailyPrices, toPrimary, activeStart, end]);
  ```

- `:369-425` — the `perf` memo builds `nudgeInput` from `twrResult` + benchmark:
  aligns TWR to benchmark on shared dates, geometrically rebases BOTH to the
  first common date. The alignment core (inside the `twrBranch` IIFE):

  ```tsx
  const benchByDate = new Map(bench.map((p) => [p.date, p.value]));
  const alignedTwr = twrResult.series.filter((p) => benchByDate.has(p.date));
  if (alignedTwr.length < 2) return null; // no usable date overlap → fixed-basket fallback
  const twrBase = 1 + alignedTwr[0].pct / 100;
  const benchBase = benchByDate.get(alignedTwr[0].date)!;
  if (twrBase <= 0 || benchBase <= 0) return null; // degenerate base → fallback
  const portCum = alignedTwr.map((p) => ({ date: p.date, pct: ((1 + p.pct / 100) / twrBase - 1) * 100 }));
  const benchCum = alignedTwr.map((p) => ({ date: p.date, pct: (benchByDate.get(p.date)! / benchBase - 1) * 100 }));
  ```

- `:451-460` — the verdict + gating:

  ```tsx
  const nudgeVerdict = useMemo(() => {
    if (perf.basis !== "twr" || !perf.nudgeInput) return null;
    const { portfolioReturns, benchmarkReturns } = buildIndexNudgeWindows(perf.nudgeInput);
    return evaluateIndexNudge({ portfolioReturns, benchmarkReturns, minWindows: 8 });
  }, [perf]);
  ...
  const showNudge =
    perf.basis === "twr" && nudgeVerdict?.triggered === true && !indexNudgeMuted && !nudgeDismissed;
  ```

- `:849-856` — the banner copy; its 口徑 line reads
  `口徑：時間加權報酬（TWR）× 滾動季視窗。純屬資訊提示，非投資建議。`

- Full-history convention already in this file — `:290-292`:

  ```tsx
  const fullSeriesResult = useMemo(() => {
    return buildPortfolioValueSeries({ positions, dailyPrices, manualSnapshots, toPrimary, start: "1900-01-01", end });
  }, [positions, dailyPrices, manualSnapshots, toPrimary, end]);
  ```

  `"1900-01-01"` is the repo's "from the beginning" start sentinel. Match it.

- `src/domain/indexNudge.ts` (240 lines) — pure domain module with its own tests
  (`indexNudge.test.ts`, 11 tests): `buildIndexNudgeWindows` (:147),
  `evaluateIndexNudge` (:202), `NudgeWindowSeries` (:89). Honesty contract
  (comment at InvestmentsAnalyticsTab:446-450): the nudge must only ever
  evaluate on TWR-basis numbers, never the fixed-basket approximation.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 762 warnings |
| Tests     | `npm test`         | 1318 + new pass     |
| One suite | `npx vitest run src/domain/indexNudge.test.ts` | all pass |

## Scope

**In scope**:
- `src/domain/indexNudge.ts` (add one pure helper)
- `src/domain/indexNudge.test.ts` (new tests)
- `src/routes/InvestmentsAnalyticsTab.tsx`

**Out of scope**:
- `buildPortfolioTwr` / `buildBenchmarkSeries` in `portfolioAnalytics.ts` — reuse, never modify.
- Nudge parameters (8 windows, 5pp, 91d) and copy tone — operator-locked.
- The Alpha card / perf chart — they keep showing the SELECTED period on
  whatever basis they resolve today.
- `uiPreferences` mute persistence.

## Git workflow

- Branch: `feat/ai-nudge-full-history` off `main`. Conventional commits. No push/merge.

## Steps

### Step 1: Extract the alignment into the domain

In `src/domain/indexNudge.ts`, add a pure exported helper (place near
`buildIndexNudgeWindows`, matching the module's doc-comment style):

```ts
export interface AlignedCumSeries {
  portfolioCum: Array<{ date: string; pct: number }>;
  benchmarkCum: Array<{ date: string; pct: number }>;
}

/**
 * Align a cumulative-return TWR series (pct, e.g. from buildPortfolioTwr —
 * NEVER re-cumulated) with a benchmark price series on shared dates, and
 * geometrically rebase BOTH to the first common date. Returns null when
 * fewer than 2 dates overlap or a base is degenerate (≤ 0) — the caller
 * must treat null as "no verdict", never fall back to another basis.
 */
export function alignTwrWithBenchmark(
  twrSeries: Array<{ date: string; pct: number }>,
  bench: Array<{ date: string; value: number }>,
): AlignedCumSeries | null { ... }
```

Body = the exact alignment core quoted in "Current state" (transplanted, not
rewritten — same filter, same base guards, same rebase math).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Test the helper

In `src/domain/indexNudge.test.ts`, model after the existing tests in that file.
Cases: (1) happy path — overlapping dates rebase both series to 0% at the first
common date; (2) fewer than 2 overlapping dates → null; (3) degenerate base
(TWR pct = −100 → base 0) → null; (4) non-overlapping leading benchmark dates
are dropped (alignment keeps only shared dates).

**Verify**: `npx vitest run src/domain/indexNudge.test.ts` → all pass (11 + 4 new).

### Step 3: Repoint the route's perf memo to the helper

In `InvestmentsAnalyticsTab.tsx`'s `perf` memo, replace the inlined alignment
core with a call to `alignTwrWithBenchmark(twrResult.series, bench)`; on null,
return null from `twrBranch` exactly as the current inline guards do. The
resulting `data`/`portFinal`/`benchFinal`/`alpha`/`nudgeInput` construction is
unchanged (build them from the helper's `portfolioCum`/`benchmarkCum`).
Byte-identical rendering expected.

**Verify**: `npx tsc --noEmit` → 0; `npm test` → all pass.

### Step 4: Add the full-history nudge evaluation

Replace the `nudgeVerdict` memo (:451-455) with a full-history one:

```tsx
// Index nudge (plan 179 → 220): evaluated over FULL history ("1900-01-01"
// start, matching fullSeriesResult) so the verdict is independent of the
// selected analytics period. Honesty contract unchanged: TWR-only — when
// full-history TWR or benchmark alignment is unavailable, there is NO
// verdict (never the fixed-basket approximation).
const nudgeVerdict = useMemo(() => {
  const twrFull = buildPortfolioTwr({ positions, records, dailyPrices, toPrimary, start: "1900-01-01", end });
  if (twrFull.twrPct == null || twrFull.series.length < 2) return null;
  const benchFull = buildBenchmarkSeries(dailyPrices, benchmarkTicker, "1900-01-01", end);
  if (benchFull.length < 2) return null;
  const aligned = alignTwrWithBenchmark(twrFull.series, benchFull);
  if (!aligned) return null;
  const { portfolioReturns, benchmarkReturns } = buildIndexNudgeWindows(aligned);
  return evaluateIndexNudge({ portfolioReturns, benchmarkReturns, minWindows: 8 });
}, [positions, records, dailyPrices, toPrimary, end, benchmarkTicker]);
```

Update the gate — the nudge no longer depends on the VIEW's basis:

```tsx
const showNudge = nudgeVerdict?.triggered === true && !indexNudgeMuted && !nudgeDismissed;
```

Update the banner's 口徑 line (:853-855) to disclose the basis delta from the
on-screen chart: `口徑：全歷史時間加權報酬（TWR）× 滾動季視窗，不隨上方期間選擇變動。純屬資訊提示，非投資建議。`

Also update the honesty-contract comment block (:445-450) to describe the new
wiring (full-history, view-independent).

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors / 762 warnings; `npm test` → all pass.

## Test plan

Step 2's four helper tests. No route-level test — the route memo is thin glue
over tested domain functions (`buildPortfolioTwr`, `buildIndexNudgeWindows`,
`evaluateIndexNudge` all have suites); jsdom can't meaningfully exercise the
banner. Reviewer feel-check: with demo data on 投資 → 分析, switch periods
1M → All — the banner's presence must NOT change with the period (demo data may
or may not trigger it; the invariant is stability across period switches).

## Done criteria

- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors / 762 warnings; `npm test` all pass with 4 new indexNudge tests
- [ ] `grep -n "perf.basis" src/routes/InvestmentsAnalyticsTab.tsx` shows `showNudge` no longer references it
- [ ] `grep -n "1900-01-01" src/routes/InvestmentsAnalyticsTab.tsx` → 2 matches (fullSeriesResult + nudge memo)
- [ ] The alignment code exists once, in `src/domain/indexNudge.ts` (grep `benchByDate` in the route → empty)
- [ ] No files outside scope modified

## STOP conditions

- `buildPortfolioTwr`'s signature rejects `"1900-01-01"` or behaves differently
  from `activeStart` usage (e.g. requires records within range) — report, don't
  work around.
- Step 3's refactor changes any rendered number in the existing tests.
- The perf memo's structure at :369-425 doesn't match the excerpt (drift).

## Maintenance notes

- The nudge now costs one extra full-history TWR computation per data change —
  same order as `fullSeriesResult` (precedent). If analytics ever gets slow,
  memoization boundaries here are the first place to look.
- If the operator later wants the mute to expire (e.g. re-nudge after a year),
  that's a `uiPreferences` change, out of scope here.
- Deferred deliberately: showing the nudge on the Dashboard (it stays
  analytics-only, per plan 179's variant-A decision).
