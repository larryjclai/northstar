# Plan 258: Delete the dead `nudgeInput` field (and its now-orphaned `CumPoint` type) from `InvestmentsAnalyticsTab`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat b22c566e..HEAD -- src/routes/InvestmentsAnalyticsTab.tsx
> ```
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b22c566e`, 2026-07-25

## Why this matters

Plan 220 repointed the index nudge to evaluate over **full history**
(`"1900-01-01"`), so `nudgeVerdict` now builds its own aligned series from
scratch. The `nudgeInput` field on the `perf` memo — which existed to hand the
period-scoped cumulative series to the nudge — stopped being read at that
moment. Plan 220's own review note recorded it: *"Residual: `perf.nudgeInput`
now unconsumed (harmless; remove when the perf memo is next touched)."*

It is genuinely dead: **4 references, all writes, zero reads.** Verified
2026-07-25 at `b22c566e`:

```
src/routes/InvestmentsAnalyticsTab.tsx:380   nudgeInput: { portfolioCum: CumPoint[]; benchmarkCum: CumPoint[] } | null;   (type decl)
src/routes/InvestmentsAnalyticsTab.tsx:402   nudgeInput: { portfolioCum: portCum, benchmarkCum: benchCum },              (write)
src/routes/InvestmentsAnalyticsTab.tsx:415   nudgeInput: null,                                                           (write)
src/routes/InvestmentsAnalyticsTab.tsx:436   nudgeInput: null,                                                           (write)
```

`grep -rn "\.nudgeInput" src` returns nothing — every other `perf.*` field
(`perf.basis`, `perf.data`, `perf.alpha`, `perf.portFinal`, `perf.benchFinal`,
`perf.hasBenchmark`) has read sites; this one does not.

Removing it also orphans a type alias: `CumPoint` (line 371) is referenced
**only** by the `nudgeInput` type annotation on line 380. Both must go together
or the file is left with an unused local type.

This is dead-code removal in a **finance-critical file**, so the bar is: the
rendered numbers must not move. Every retained expression stays byte-identical.

## Current state

`src/routes/InvestmentsAnalyticsTab.tsx` — the analytics tab. The `perf` memo
(roughly lines 368–438) returns one of three branch shapes: TWR-with-benchmark,
TWR-without-benchmark, and the fixed-basket fallback. All three carry
`nudgeInput`.

Excerpt — line 371 (the type alias that becomes orphaned) and the return-type
annotation containing line 380:

```tsx
    const bench = buildBenchmarkSeries(dailyPrices, benchmarkTicker, activeStart, end);
    type CumPoint = { date: string; pct: number };
    const twrBranch = (():
      | {
          data: Array<{ date: string; port: number; bench: number | null }>;
          portFinal: number | null;
          benchFinal: number | null;
          alpha: number | null;
          hasBenchmark: boolean;
          basis: "twr";
          nudgeInput: { portfolioCum: CumPoint[]; benchmarkCum: CumPoint[] } | null;
        }
      | null => {
```

Excerpt — the TWR-with-benchmark return (line 402 is the last property).
**`portCum` / `benchCum` must stay**: they feed `data`, `portFinal` and
`benchFinal` on the lines above:

```tsx
        const { portfolioCum: portCum, benchmarkCum: benchCum } = aligned;
        const data = portCum.map((p, i) => ({ date: p.date, port: p.pct, bench: benchCum[i].pct as number | null }));
        const portFinal = portCum[portCum.length - 1].pct;
        const benchFinal = benchCum[benchCum.length - 1].pct;
        return {
          data,
          portFinal,
          benchFinal,
          alpha: portFinal - benchFinal,
          hasBenchmark: true,
          basis: "twr",
          nudgeInput: { portfolioCum: portCum, benchmarkCum: benchCum },
        };
```

Excerpt — the TWR-without-benchmark return (line 415):

```tsx
      const data = twrResult.series.map((p) => ({ date: p.date, port: p.pct, bench: null as number | null }));
      return {
        data,
        portFinal: twrResult.series[twrResult.series.length - 1].pct,
        benchFinal: null,
        alpha: null,
        hasBenchmark: false,
        basis: "twr",
        nudgeInput: null,
      };
```

Excerpt — the fixed-basket fallback return (line 436):

```tsx
    return {
      data,
      portFinal,
      benchFinal,
      alpha,
      hasBenchmark: benchCum.length >= 2,
      basis: "fixed" as const,
      nudgeInput: null,
    };
  }, [twrResult, core.series, dailyPrices, benchmarkTicker, activeStart, end]);
```

Excerpt — the LIVE nudge, immediately below. It builds its own series and does
**not** touch `perf`. Do not modify any of this:

```tsx
  // Index nudge (plan 179 → 220): evaluated over FULL history ("1900-01-01"
  // start, matching fullSeriesResult) so the verdict is independent of the
  // selected analytics period. …
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

### Convention

Quoted from `AGENTS.md` (you have not read it):

> **Correctness first for finance.** Calculations must be explainable and
> testable. […] Don't silently change financial math.

→ This is a pure deletion of an unread field. **No arithmetic expression may be
added, removed, or reordered.** `portCum`, `benchCum`, `data`, `portFinal`,
`benchFinal`, `alpha` and the memo's dependency array all stay exactly as they
are.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Full test suite | `npm test` | exit 0, all pass (1496 today) |
| Lint | `npm run lint` | exit 0, 0 errors |

Do **not** run `npm run build` (its `prebuild` step injects private assets) and
do **not** run `npm run test:e2e`.

## Scope

**In scope** (the only file you may modify):

- `src/routes/InvestmentsAnalyticsTab.tsx`

**Out of scope** (do NOT touch):

- The `nudgeVerdict` memo and everything downstream of it (`nudgeDismissed`,
  `indexNudgeMuted`, `showNudge`, the nudge UI). That is the live feature; this
  plan removes only the orphaned *input* field, not the nudge.
- `src/domain/indexNudge*` / `buildIndexNudgeWindows` / `evaluateIndexNudge` —
  untouched.
- Any other `perf.*` field. They all have readers.
- `src/domain/ledgerTrust.ts` and `incompleteSplitGroupIds` — a separate,
  already-closed matter. Do not touch it.

## Git workflow

- Branch: `fix/ai-dead-nudge-input`, created off `main`.
- One conventional commit, e.g.
  `refactor(analytics): drop the dead nudgeInput field and orphaned CumPoint type`.
- Do **not** push and do **not** open a PR.

## Steps

### Step 1: Delete the four `nudgeInput` references and the `CumPoint` alias

In `src/routes/InvestmentsAnalyticsTab.tsx`, delete exactly these five things
and nothing else:

1. The line `    type CumPoint = { date: string; pct: number };` (line 371) —
   orphaned once step 2 lands.
2. The line
   `          nudgeInput: { portfolioCum: CumPoint[]; benchmarkCum: CumPoint[] } | null;`
   from the `twrBranch` return-type annotation (line 380).
3. `          nudgeInput: { portfolioCum: portCum, benchmarkCum: benchCum },` (line 402).
4. `        nudgeInput: null,` in the TWR-without-benchmark return (line 415).
5. `      nudgeInput: null,` in the fixed-basket fallback return (line 436).

Leave the surrounding properties, the trailing commas on the remaining
properties, and the memo dependency array untouched.

**Verify**:
```bash
grep -c "nudgeInput\|CumPoint" src/routes/InvestmentsAnalyticsTab.tsx
```
→ `0`

```bash
npx tsc --noEmit
```
→ exit 0. (If TypeScript now complains that `portCum` or `benchCum` is unused,
STOP — that means you deleted more than the `nudgeInput` property; those two
still feed `data`/`portFinal`/`benchFinal`.)

### Step 2: Confirm nothing else moved

```bash
git diff --stat
```
→ exactly one file, `src/routes/InvestmentsAnalyticsTab.tsx`, with **5
deletions and 0 insertions**.

```bash
git diff
```
→ every hunk is a pure deletion of one of the five lines listed in Step 1. If
any hunk adds a line or changes an expression, STOP.

**Verify**:
```bash
npm test && npm run lint
```
→ tests all pass (1496 today, unchanged — this plan adds no tests), lint exits
0 with 0 errors.

## Test plan

**No new tests.** This removes a field that has no readers and no behavior;
there is nothing new to assert, and a test that asserts "the field is absent"
would test the compiler rather than the product.

The regression safety net is the existing suite plus the typechecker: if any
consumer of `perf` existed, `npx tsc --noEmit` fails immediately. The analytics
math is covered by `src/domain/portfolioAnalytics.test.ts`, which must stay
green and unchanged.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "nudgeInput\|CumPoint" src/routes/InvestmentsAnalyticsTab.tsx` → `0`
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0, 1496 tests pass (count unchanged)
- [ ] `npm run lint` exits 0 with 0 errors
- [ ] `git diff --stat` shows exactly 1 file, `5 deletions(-)`, 0 insertions
- [ ] `grep -n "nudgeVerdict" src/routes/InvestmentsAnalyticsTab.tsx` still returns matches (the live nudge survives)
- [ ] Work is on branch `fix/ai-dead-nudge-input` (`git branch --show-current`)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `InvestmentsAnalyticsTab.tsx` changed since `b22c566e`
  and the excerpts above no longer match.
- `grep -rn "\.nudgeInput" src` returns **any** read site. The whole premise is
  that there are none; if one exists, this is not dead code.
- After deletion, TypeScript reports `portCum`, `benchCum`, or any other
  identifier as unused. You removed too much.
- The test count changes from 1496, or any test in
  `src/domain/portfolioAnalytics.test.ts` fails. A pure field deletion cannot
  move analytics numbers — if it did, something else was wrong.
- `git diff --stat` shows anything other than 5 deletions / 0 insertions.

## Maintenance notes

- The lesson worth keeping: plan 220 repointed the nudge to full history but
  left its old period-scoped input plumbing behind. When a computation is
  repointed to a new data source, grep the old source's feeders for orphans in
  the same change.
- `CumPoint` was a *local* type alias inside the memo, which is why no lint rule
  caught it — `@typescript-eslint/no-unused-vars` does not flag unused local
  type aliases under this repo's config. Don't expect the linter to find the
  next one of these.
- Nothing downstream depends on this; there is no follow-up.
