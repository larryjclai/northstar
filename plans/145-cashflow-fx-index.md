# Plan 145: Use the daily-rate index in CashFlowRoute's per-row FX conversion (plan-123 follow-up)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. SKIP updating `plans/README.md` — your reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 1c64e00d..HEAD -- src/routes/CashFlowRoute.tsx src/domain/currency.ts`
> This plan is written against main `1c64e00d`. If your worktree base is older,
> advance it first (see the dispatch preamble). On a content mismatch with the
> excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 123 (MERGED — `buildDailyRateIndex` exists in currency.ts)
- **Category**: perf
- **Planned at**: commit `1c64e00d`, 2026-07-09

## Why this matters

Plan 123 indexed the daily-FX lookup inside `createFxConverter`, but
`CashFlowRoute` builds its own row-level `toPrimary` with a raw
`convertCurrency(..., { dailyRates })` call — which still linear-scans the
entire daily-FX array per row. `toPrimary` is called across ~8 memoized
aggregates over up to ~10k ledger rows, so with years of FX history this is
the same O(rows × fxRows) hot path 123 fixed everywhere else. Switching these
calls to the prebuilt `dailyRateIndex` (proven bit-identical by 123's tests)
removes the last linear scan on the CashFlow page.

## Current state

`src/domain/currency.ts` (from plan 123) exports:
- `buildDailyRateIndex(rates: DailyFxRate[]): DailyRateIndex`
- `convertCurrency(amount, from, to, settings, options)` where `options` accepts
  `{ dailyRates?, dailyRateIndex?, asOfDate? }` — when `dailyRateIndex` +
  `asOfDate` are present it binary-searches (bit-identical to the `dailyRates`
  linear path).

`src/routes/CashFlowRoute.tsx`:
- line 47: `import { convertCurrency, formatCompactNumber } from "../domain/currency";`
- line 180: `const fxHistory = dailyFxRates.data ?? [];`
- lines 182-183 — the per-row converter (LINEAR):
  ```tsx
  const toPrimary = useCallback((row: LedgerTransaction, amount = row.amount) =>
    convertCurrency(amount, row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date }),
  ```
  (read the full `useCallback` incl. its dependency array on the next lines.)
- line ~860 — a second linear daily call (a currency-scoped converter passed
  to a child):
  ```tsx
  (amount, currency) => convertCurrency(amount, currency, primaryCurrency, appSettings, { dailyRates: fxHistory }) ?? amount,
  ```

Other `convertCurrency` calls in this file (lines ~491, ~1888) pass NO
`dailyRates`/`asOfDate` (settings-rate only) — LEAVE THEM; they don't touch the
daily path.

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass (843)      |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**: `src/routes/CashFlowRoute.tsx` ONLY.

**Out of scope**:
- `src/domain/currency.ts` — the index/convert API is done (plan 123); do not
  touch it.
- The two settings-only `convertCurrency` calls (~491, ~1888).
- Any change to conversion RESULTS — bit-identical is mandatory (123's tests
  already prove the index path equals the linear path).
- The aggregate `useMemo`s themselves (123 already memoized them) — you only
  change what `toPrimary` passes into `convertCurrency`.

## Git workflow

- Branch: `perf/ai-cashflow-fx-index`
- Commit: `perf(cash-flow): index per-row FX lookup (reuses plan 123's buildDailyRateIndex)`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Build the index once

Add a memoized index near `fxHistory` (line 180):

```tsx
const fxHistory = dailyFxRates.data ?? [];
const fxIndex = useMemo(() => buildDailyRateIndex(fxHistory), [fxHistory]);
```

Add `buildDailyRateIndex` to the existing currency import on line 47.
`useMemo` is already imported (line 22).

### Step 2: Point the two daily calls at the index

- Line 183: change `{ dailyRates: fxHistory, asOfDate: row.date }` →
  `{ dailyRateIndex: fxIndex, asOfDate: row.date }`. Update the `useCallback`
  dependency array: replace the `fxHistory` dep with `fxIndex` (keep the
  others — `primaryCurrency`, `appSettings`).
- Line ~860: change `{ dailyRates: fxHistory }` → `{ dailyRateIndex: fxIndex }`.
  IMPORTANT: this call has NO `asOfDate`. Check `convertCurrency`'s branching
  (currency.ts ~line 53): the indexed branch requires BOTH `asOfDate` AND
  `dailyRateIndex`. Without `asOfDate`, the indexed branch is skipped and it
  falls straight to settings rates — which is the SAME behavior as the current
  `{ dailyRates: fxHistory }` call (the linear branch also requires `asOfDate`,
  currency.ts ~line 59, so today it ALSO skips daily and uses settings rates).
  So this call's result is unchanged either way. If, on reading, the line-860
  call turns out to genuinely need daily resolution (i.e. it DOES pass an
  asOfDate you didn't see), STOP and report — do not guess.

**Verify**: `npx tsc` → exit 0.

### Step 3: Gates

**Verify**: `npm test` → 843 pass; `npm run lint` → exit 0.

## Test plan

No new unit test needed — plan 123's `currency.fxIndex.test.ts` already proves
`dailyRateIndex` and `dailyRates` produce identical `convertCurrency` results
(including inverse pairs and tie-breaks). This plan only swaps which of those
two equivalent inputs CashFlowRoute passes. Confirm the existing suite stays at
843.

## Done criteria

- [ ] `grep -n "dailyRates: fxHistory" src/routes/CashFlowRoute.tsx` → 0 hits
      (both daily calls now pass `dailyRateIndex: fxIndex`)
- [ ] `fxIndex` built once via `useMemo(() => buildDailyRateIndex(fxHistory), [fxHistory])`
- [ ] `npx tsc`, `npm test` (843), `npm run lint` all green
- [ ] Only `src/routes/CashFlowRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The line-860 call actually passes an `asOfDate` (then switching to the index
  changes daily resolution — still bit-identical per 123, but confirm and note
  it) OR its shape differs from the excerpt.
- The `toPrimary` `useCallback` dependency array can't be updated cleanly
  (react-hooks/exhaustive-deps error) — resolve by fixing deps, not disabling.
- Any test count deviates from 843 or a test fails.

## Maintenance notes

- If a future plan removes the settings-rate fallback or adds `asOfDate` to the
  line-860 call, re-confirm bit-identity against 123's test approach.
- Reviewer: confirm `fxIndex` is memoized on `fxHistory` only (a fresh index
  per render would defeat the point), and that no `dailyRates:` daily call
  remains in the file.
