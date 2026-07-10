# Plan 123: Memoize the FX converter per render tree and index daily-rate lookups

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/domain/currency.ts src/routes/InvestmentsRoute.tsx src/routes/DashboardRoute.tsx src/routes/AnnualReportRoute.tsx src/routes/TransactionsRoute.tsx src/routes/CashFlowRoute.tsx`
> Re-locate excerpts by grep; STOP on content mismatch.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (compatible with plan 121 — coordinate if both run:
  121 adds `toPrimaryOrNull` to the same factory)
- **Category**: perf
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Two compounding problems make FX conversion the app's hidden hot loop:

1. `createFxConverter(...)` is called **directly in component bodies** (not
   `useMemo`) in 5 routes, so `toPrimary` gets a new identity every render.
   Every expensive `useMemo` in `InvestmentsAnalyticsTab` lists `toPrimary`
   as a dependency → the entire analytics engine (value series, TWR,
   attribution, heat map, calendar) recomputes on ANY unrelated state change.
2. `pickDailyRate` linear-scans the **entire** daily-FX array per conversion.
   Analytics calls `toPrimary` per position per grid date → with years of
   daily rates this is O(gridDates × positions × fxRows).

Also included: `CashFlowRoute` computes 5 period aggregates in the render body
(full filter+reduce over up to ~10k rows, with `toPrimary` per row) on every
keystroke of the search box.

## Current state

`src/domain/currency.ts:38`:

```ts
function pickDailyRate(rates: DailyFxRate[], from: string, to: string, asOfDate: string): number | null {
  let best: DailyFxRate | null = null;
  for (const row of rates) {
    if (row.from !== from || row.to !== to) continue;
    if (row.date > asOfDate) continue;
    if (!best || row.date > best.date) best = row;
  }
  return best ? best.rate : null;
}
```

Un-memoized factory calls in component bodies (verified):

- `src/routes/InvestmentsRoute.tsx:99`
- `src/routes/DashboardRoute.tsx:182` and `:1536` (second one inside a child
  component `NetWorth...`/section — read its actual containing function)
- `src/routes/AnnualReportRoute.tsx:29`
- `src/routes/TransactionsRoute.tsx:97`

`src/routes/CashFlowRoute.tsx:724-739` — `periodIncome`, `periodExpense`,
`periodNet`, `periodTransferCount`, `missingFx` computed at top level (not in
`useMemo`), each a full pass over `scopedRows` with `toPrimary(row)` per row,
directly below a `useMemo` for the search-filtered rows.

Analytics memo dependencies: `src/routes/InvestmentsAnalyticsTab.tsx` — grep
`toPrimary` in its dependency arrays (`:248-250`, `:290-293`, `:317-319`,
`:355-363`, `:410-412`, `:415-416`).

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass (~831)     |
| Targeted  | `npm test -- currency` | pass (note: currency tests may live under `domain` — find with `ls src/domain/*currency*`; if none exists, create `src/domain/currency.fxIndex.test.ts`) |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**:
- `src/domain/currency.ts` — index inside `createFxConverter` (and
  `convertCurrency`'s daily-rate path)
- The 5 route call sites → wrap in `useMemo`
- `src/routes/CashFlowRoute.tsx` — wrap the 5 period aggregates in one `useMemo`
- New unit tests for the indexed lookup

**Out of scope**:
- Any change to conversion RESULTS — this is pure performance; every output
  must be bit-identical.
- `InvestmentsAnalyticsTab`'s memo structure (it's correct once `toPrimary`
  is stable).
- React Query configuration (that's plan 124).

## Git workflow

- Branch: `fix/ai-fx-converter-perf`
- Commits: `perf(fx): index daily-rate lookup by pair` then
  `perf(routes): memoize createFxConverter and cash-flow period aggregates`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Index the daily rates

Inside `createFxConverter`, build once:

```ts
  const ratesByPair = new Map<string, DailyFxRate[]>();
  for (const row of rates) {
    const key = `${row.from}→${row.to}`;
    const list = ratesByPair.get(key);
    if (list) list.push(row); else ratesByPair.set(key, [row]);
  }
  for (const list of ratesByPair.values()) list.sort((a, b) => (a.date < b.date ? -1 : 1));
```

Then route the converter's daily-rate resolution through a binary search for
"latest date ≤ asOf" on the pair's sorted list. IMPORTANT: `convertCurrency`
is also exported and called directly elsewhere with a raw array — keep
`pickDailyRate` working for that path. Cleanest shape: `convertCurrency`
accepts an optional prebuilt index in its options
(`{ dailyRates, dailyRateIndex?, asOfDate }`), and `createFxConverter` passes
the index. Check `convertCurrency`'s current option handling (~line 19-35)
including the inverse-rate fallback (it tries `to→from` inverted) — the
indexed path must preserve inverse-pair lookup identically.

Unit tests (new file or existing currency tests): same result as the linear
scan for (a) exact-date hit, (b) between dates → earlier picked, (c) before
all dates → null, (d) inverse pair fallback, (e) empty rates. Property-style:
generate ~50 random rates, compare indexed vs `pickDailyRate` outputs on ~20
queries.

**Verify**: `npm test` → all pass (the equality tests prove no behavior
change); `npx tsc` → exit 0.

### Step 2: Memoize the factory at the 5 call sites

At each site, e.g. InvestmentsRoute:

```tsx
  const { primaryCurrency, toPrimary } = useMemo(
    () => createFxConverter(appSettings, fxHistory),
    [appSettings, fxHistory],
  );
```

Use each site's actual variable names (TransactionsRoute uses
`settings.data` / `dailyFxRates.data ?? []` — dep on those exact expressions'
stable sources; for `?? []` create the array inside the memo, never in the dep).
DashboardRoute has TWO sites (`:182` top level, `:1536` in a nested component)
— fix both; the nested one receives its inputs as props, memoize on those.

**Verify**: `npx tsc` → exit 0; `npm run lint` → exit 0 (react-hooks
exhaustive-deps is active — resolve warnings by fixing deps, not disabling).

### Step 3: Memoize CashFlowRoute period aggregates

Wrap the five computations (`periodIncome` → `missingFx`) in ONE `useMemo`
returning an object, keyed on `[scopedRows, toPrimary, primaryCurrency]`
(NOT `searchQuery`). Preserve the exact reduce logic byte-for-byte, including
the signed-expense comment. Note `toPrimary(row)` here takes a row object —
this file has a row-level wrapper; find it (grep `toPrimary` in the file) and
keep using it; if the wrapper is also recreated per render, memoize it in the
same step.

**Verify**: `npm test` → all pass; `npx tsc` → exit 0.

### Step 4: Full gates

**Verify**: `npm run lint` → exit 0; `npm test` → all pass.

## Done criteria

- [ ] `createFxConverter` has no per-call full-array scan (binary search on a
      per-pair index); equality tests pass
- [ ] `grep -n "createFxConverter(" src/routes/*.tsx src/routes/settings/*.tsx`
      shows every call wrapped in `useMemo`
- [ ] CashFlow period aggregates live in one `useMemo` without `searchQuery`
      in deps
- [ ] `npm test`, `npx tsc`, `npm run lint` all green
- [ ] `plans/README.md` updated

## STOP conditions

- `convertCurrency`'s option shape doesn't accommodate an optional index
  without changing >3 external call sites.
- Any equality test disagrees between indexed and linear lookup — that means
  the index semantics are wrong; do not ship.
- The CashFlow row-level `toPrimary` wrapper hides logic beyond currency
  conversion (e.g. originalAmount preference) — memoize it but do NOT alter it.

## Maintenance notes

- If plan 121 (adds `toPrimaryOrNull`) lands first, extend the memo
  destructuring; the factories compose trivially.
- Reviewer: watch for `useMemo` deps on freshly-created `?? []` arrays (would
  defeat the memo).
- Follow-up candidate (not in scope): `InvestmentsAnalyticsTab`'s own derived
  arrays could take the converter object instead of `toPrimary` to reduce dep
  churn further.
