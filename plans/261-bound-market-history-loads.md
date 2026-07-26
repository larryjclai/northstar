# Plan 261: Stop loading price history for tickers nothing renders

> **Executor instructions**: Follow this plan step by step. **Step 1 is a
> measurement step and its result decides whether the rest of the plan is worth
> doing** — read its STOP condition before starting. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9a5d5ecf..HEAD -- src/data/hooks.ts src/data/repositories.ts src/routes/InvestmentsAnalyticsTab.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/259-sqlite-indexes-and-synchronous-pragma.md` — DONE, merged. `daily_prices` is already indexed on `(ticker, date)` (`migrations.ts:169`).
- **Category**: perf
- **Planned at**: commit `79032d3b`; **reconciled to `9a5d5ecf`, 2026-07-25** — plan 268 restructured `initialize()` in `repositories.ts`, so every line number below was re-verified against the current file. The `listDailyPrices` implementation itself was **not** changed by 268.

## Why this matters

`useFinanceData()` loads fourteen tables in full at boot, and one of them has no
natural bound: `listDailyPrices()` is called with **no filter**, so every close
price for every ticker the app has ever fetched is read out of SQLite, serialized
to JSON, pushed across the Tauri IPC bridge and held in memory — on every launch,
forever. A ticker sold two years ago still costs its entire history every time
the app starts.

The date depth is genuinely needed: net-worth trend, TWR and return attribution
all walk the full series. The **ticker breadth is not**. Only prices for holdings
the user still has (plus the analytics benchmark) are ever rendered.

So this plan narrows the load along the axis that is safe — tickers — and leaves
the axis that carries meaning — dates — untouched.

### What this plan deliberately does NOT do, and why

**It does not put a date window on `daily_prices`.** A short default window would
be the obvious move, but the analytics engine explicitly walks from
`"1900-01-01"` (`InvestmentsAnalyticsTab.tsx:291`, `:441`, `:443`, and the `"All"`
period at `:171`), and truncating
depth would silently change TWR, the net-worth trend and return attribution.
Those are exactly the numbers `AGENTS.md` says must not silently change:

> **Correctness first for finance.** Calculations must be explainable and
> testable. … Don't silently change financial math.

**It does not touch `dailyFxRates` at all.** FX conversion is an *as-of-date*
lookup: `createFxConverter` (`src/domain/currency.ts:122`) builds a date index and
`convertCurrency` binary-searches for the latest rate **at or before** the
transaction's date. Converting a 2019 transaction therefore needs 2019 rates. Any
window on FX history would silently restate historical amounts across
TransactionsRoute, CategoryDetailRoute, MerchantDetailRoute, CashFlowRoute and
the FIRE card. FX history is also naturally small — a handful of currency pairs ×
days, versus tickers × days for prices. **Leave it eager and complete.**

## Current state

### The unbounded load (`src/data/hooks.ts:80-84`)

```ts
  const dailyPrices = useQuery({
    queryKey: keys.dailyPrices,
    queryFn: () => repository.data!.listDailyPrices(),
    enabled,
  });
```

`listDailyPrices()` **already supports a filter** — it is simply never passed one.
The SQLite override is now at **`src/data/repositories.ts:4578`** (was 4593 before
plan 268 restructured `initialize()` above it); the interface declaration is at
**line 427**, and the in-memory delegate at **line 2311**:

```ts
  override async listDailyPrices(filter?: { ticker?: string; since?: string }) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter?.ticker) {
      params.push(filter.ticker.toUpperCase());
      clauses.push(`ticker = $${params.length}`);
    }
    if (filter?.since) {
      params.push(filter.since.slice(0, 10));
      clauses.push(`date >= $${params.length}`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const rows = await this.db.select<…>(
      `select ticker, date, close, currency, source, updated_at from daily_prices ${where} order by ticker, date asc`,
      params,
    );
```

Note the filter takes a **single** `ticker`, not a list. This plan adds a
`tickers?: string[]` variant — see Step 2.

There is already an index for this shape:
`idx_daily_prices_ticker_date on daily_prices (ticker, date)`
(`src/data/migrations.ts:169`).

### Who actually consumes `dailyPrices` (verified at `79032d3b`)

Exactly four render surfaces:

| File | Use |
|---|---|
| `src/routes/DashboardRoute.tsx:208, 273` | `dailyPriceRows` feeds `buildDataHealthReport` (stale-price detection); pulled from `useFinanceData()` at line 139 |
| `src/routes/InvestmentsRoute.tsx:99,165,1181` | holding positions, day-change movers |
| `src/routes/InvestmentsAnalyticsTab.tsx` (many) | value series, TWR, attribution, benchmark |
| `src/routes/HoldingDetailRoute.tsx:28, 57` | the per-holding chart |

Plus the write side: `src/data/marketDataStore.ts:112-143` and
`src/features/market-data/useMarketRefresh.ts:310` (which invalidates
`queryKeys.dailyPrices`).

### The benchmark is the one non-held ticker that must survive

`InvestmentsAnalyticsTab.tsx:370` charts a benchmark series that is **not** a
holding:

```ts
    const bench = buildBenchmarkSeries(dailyPrices, benchmarkTicker, activeStart, end);
```

`benchmarkTicker` comes from the UI preferences store, defaulting to `0050.TW`
(`src/state/uiPreferences.ts:17,45-46,165` — `DEFAULT_BENCHMARK_TICKER`). It is a
**user preference in localStorage, not a DB row**, so the repository cannot infer
it. It must be passed in. This is the single easiest way to break this plan:
scope to held tickers only and the benchmark line silently disappears.

### Conventions to match

- Query keys live in the `keys` object at `src/data/hooks.ts:6-22` and are
  exported as `queryKeys` (line 207). A **parameterised** query needs its key to
  include the parameter, or React Query will serve a stale narrower result — see
  Step 3.
- `useMemo` with an explicit dependency array is used everywhere for derived
  arrays; unstable references cause Recharts remounts (`docs/performance-budget.md`
  rule **R4**). A newly-computed ticker list **must** be memoized.
- Long `//` comments citing the plan number for non-obvious decisions.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Analytics suite | `npx vitest run src/domain/portfolioAnalytics.test.ts src/domain/portfolioTwr.test.ts` | all pass |
| Market data suite | `npx vitest run src/data/marketDataStore.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/data/repositories.ts` — `listDailyPrices` filter (SQLite override at 4578,
  in-memory delegate at 2311), and its interface declaration at line 427
- `src/data/hooks.ts` — the `dailyPrices` query
- `src/routes/InvestmentsRoute.tsx`, `src/routes/DashboardRoute.tsx`,
  `src/routes/HoldingDetailRoute.tsx` — only where they read the query
- `src/data/repositories.investments.test.ts` (or a new
  `src/data/repositories.dailyPrices.test.ts`) — new tests

**Out of scope** (do NOT touch, even though they look related):
- `listDailyFxRates` and every FX consumer — see "What this plan deliberately
  does NOT do" above. **Leaving FX alone is a requirement of this plan, not an
  oversight.**
- `src/domain/portfolioAnalytics.ts` — the analytics engine takes a
  `DailyPrice[]` and must keep working on whatever it is given. No signature or
  math changes.
- The `"1900-01-01"` start dates in `InvestmentsAnalyticsTab.tsx` — those are
  deliberate full-history walks (plan 220).
- `src/data/marketDataStore.ts` write paths — narrowing reads must not narrow
  what gets *saved*.
- The other twelve queries in `useFinanceData()`.

## Git workflow

- Branch: `perf/ai-bound-daily-prices`
- Conventional commits, e.g. `perf(data): load daily prices only for held tickers`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Measure before changing anything

Find out whether this is worth doing. Add a **temporary** log (you will remove it
in Step 6) in `src/data/hooks.ts`'s `dailyPrices` query function that reports, on
a real database:

- total rows returned by `listDailyPrices()`
- distinct tickers in that result
- how many of those tickers correspond to a live `portfolio_assets` row
  (`deleted_at is null`)

Run the app (`npm run tauri dev`) against a real profile and record the three
numbers in your report.

**STOP condition for this step**: if the number of rows for **non-held** tickers
is under ~2,000, the saving is not worth the risk surface — stop and report the
measurement, recommending the plan be marked REJECTED in `plans/README.md` with
the numbers as the rationale. Do not proceed to Step 2 in that case.

**Verify**: three numbers recorded, and the ratio of held-to-total rows stated
explicitly in your report.

### Step 2: Teach `listDailyPrices` to take a ticker list

In `src/data/repositories.ts`, widen the filter on the interface
declaration (line 427) and the two implementations (the in-memory delegate at line 2311 and
the SQLite override at line 4578):

```ts
  listDailyPrices(filter?: { ticker?: string; tickers?: string[]; since?: string }): Promise<DailyPrice[]>;
```

In the SQLite override, add a clause for `tickers` alongside the existing
`ticker` clause:

```ts
    if (filter?.tickers) {
      // An empty list means "no tickers", NOT "all tickers" — return nothing
      // rather than silently falling back to a full scan (plan 261).
      if (filter.tickers.length === 0) return [];
      const upper = filter.tickers.map((t) => t.trim().toUpperCase()).filter(Boolean);
      if (upper.length === 0) return [];
      const placeholders = upper.map((_, i) => `$${params.length + i + 1}`).join(", ");
      params.push(...upper);
      clauses.push(`ticker in (${placeholders})`);
    }
```

The empty-list branch is load-bearing: `clauses.length ? … : ""` means an empty
clause list produces an unfiltered query, so returning early is what stops a
"user holds nothing" state from becoming a full table scan.

Mirror the same filtering in the in-memory `BrowserFinanceRepository`
implementation so the dual-repo harness stays honest.

**Verify**: `npx tsc --noEmit` → exit 0. `npm test` → all pass.

### Step 3: Pass the held tickers (plus benchmark) from the hook

In `src/data/hooks.ts`, the `dailyPrices` query must depend on the ticker set.
Because `assets` is itself a query, derive the list from its data and put it in
the query key:

```ts
  // Price history is loaded only for tickers something actually renders: live
  // holdings, plus the analytics benchmark (a UI preference, not a DB row, so it
  // has to be passed in). Date depth is deliberately NOT bounded — TWR, the
  // net-worth trend and attribution all walk the full series (plan 261).
  const priceTickers = useMemo(() => {
    const held = (assets.data ?? [])
      .filter((a) => !a.deletedAt)
      .map((a) => a.ticker.trim().toUpperCase())
      .filter(Boolean);
    return Array.from(new Set([...held, benchmarkTicker.trim().toUpperCase()])).sort();
  }, [assets.data, benchmarkTicker]);

  const dailyPrices = useQuery({
    queryKey: [...keys.dailyPrices, priceTickers.join(",")],
    queryFn: () => repository.data!.listDailyPrices({ tickers: priceTickers }),
    enabled: enabled && assets.isSuccess,
  });
```

Read `benchmarkTicker` from the UI-preferences store the same way other
components do — check `src/state/uiPreferences.ts:321` and copy an existing
consumer's selector pattern rather than inventing one.

Two things to get right:

1. **`enabled: enabled && assets.isSuccess`** — without it the query fires with
   an empty ticker list before assets load and caches an empty result.
2. **The query key must include the ticker list.** `useMarketRefresh.ts:310`
   invalidates `queryKeys.dailyPrices`; React Query treats that as a prefix, so
   the longer key is still invalidated correctly — verify this in Step 5 rather
   than assuming it.

**Verify**: `npx tsc --noEmit` → exit 0. `npm run lint` → exit 0.

### Step 4: Confirm no consumer needs a non-held ticker

Re-read the four consumers listed in "Current state" and confirm each only ever
looks up a ticker that is either held or the benchmark.

Pay particular attention to `DashboardRoute.tsx:272` —
`buildDataHealthReport` reports **stale prices**. Check `src/domain/dataHealth.ts`
(around line 149) for whether it iterates `dailyPrices` looking for tickers it
expects to be missing. If a health check depends on seeing prices for assets that
are tombstoned, that check will change behavior.

**Verify**: state in your report, per consumer, which tickers it can ask for and
why the scoped set covers them. If any consumer can ask for an arbitrary ticker,
that is a STOP condition.

### Step 5: Verify refresh and invalidation still work end to end

Run the app (`npm run tauri dev`) and check:

1. The 投資 route renders holdings with prices.
2. The 投資分析 tab renders both the portfolio series **and the benchmark line**.
3. 持股明細 (HoldingDetailRoute) renders its chart.
4. Triggering a market-data refresh updates prices — this exercises the
   `queryKeys.dailyPrices` invalidation from `useMarketRefresh.ts:310` against
   the new longer query key.
5. Adding a **new** holding causes its price history to appear (the ticker list
   changes → new query key → refetch).

**Verify**: all five confirmed, with the benchmark line explicitly checked. Item
4 and item 5 are the two that the query-key change can break.

### Step 6: Remove the Step 1 instrumentation and do a full pass

Delete the temporary logging.

**Verify**, in order, each exiting 0:
1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm test`
4. `npm run build`
5. `git diff | grep -i "console.log"` → no matches

## Test plan

New tests, modelled on the existing SQLite repository suites (read
`src/data/repositories.investments.test.ts` first and match its harness):

1. **`tickers` filters.** Save prices for three tickers, request two, assert only
   those two come back and all their dates are present (depth preserved).
2. **Empty `tickers` returns nothing.** Assert `listDailyPrices({ tickers: [] })`
   returns `[]` — explicitly **not** a full table scan. This is the regression
   test for the most dangerous mistake in Step 2.
3. **Case-insensitive.** `tickers: ["0050.tw"]` matches a row stored as `0050.TW`
   (the existing single-`ticker` branch upper-cases; the list branch must too).
4. **Dual-repo parity.** The in-memory and SQLite repositories return the same
   rows for the same filter. Follow whatever pattern
   `src/data/repositories.testHarness.ts` establishes for parity assertions.
5. **Existing analytics tests unchanged.**
   `npx vitest run src/domain/portfolioAnalytics.test.ts src/domain/portfolioTwr.test.ts`
   must pass with no edits — the engine's inputs and math are out of scope.

Verification: `npm test` → all pass, including the 4 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0, with the 4 new tests passing
- [ ] `npm run build` exits 0
- [ ] `grep -n "listDailyPrices()" src/data/hooks.ts` returns **no** match (the
      unfiltered call is gone)
- [ ] `git diff --name-only` contains **no** file matching `Fx|fx` and
      `grep -n "listDailyFxRates" src/data/hooks.ts` is byte-identical to before
- [ ] `git diff -- src/domain/portfolioAnalytics.ts` is empty
- [ ] Step 1's three measurements and Step 5's five manual checks are recorded in
      the report
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's measurement shows under ~2,000 rows for non-held tickers (see that
  step's STOP condition — the correct outcome is REJECTED with numbers).
- Any consumer in Step 4 can request a ticker that is neither held nor the
  benchmark.
- The benchmark series disappears from 投資分析 at any point. That is this plan's
  signature failure and it must be fixed, not accepted.
- Any test in `src/domain/portfolioAnalytics.test.ts` or
  `src/domain/portfolioTwr.test.ts` fails. Those encode the locked financial
  semantics from `AGENTS.md`; a failure means depth was truncated somewhere.
  **Do not edit those tests.**
- You conclude the plan would be simpler if FX history were bounded too. It
  would; it would also be wrong. Report the thought, do not act on it.
- `assets.isSuccess` gating turns out to cause a visible flash of empty charts on
  the 投資 route — report it rather than removing the gate.

## Maintenance notes

- **The invariant to protect in review**: `daily_prices` may be narrowed by
  *ticker*, never by *date*. Anyone adding a `since:` to the `useFinanceData`
  call is changing financial math.
- The benchmark ticker is a localStorage preference, so the repository can never
  derive the full ticker set on its own. If a second non-held ticker is ever
  charted (a comparison ticker, a watchlist), it must be added to `priceTickers`
  in `src/data/hooks.ts` or its history will not load.
- Rows for de-listed / no-longer-held tickers stay in the database — they are
  merely not loaded. Nothing here deletes data, so re-adding a holding restores
  its full history automatically. A pruning job is a **separate** decision and
  should not be bundled in.
- Deferred out of this plan, in order of remaining value:
  1. The other twelve eager loads in `useFinanceData()` — `ledger` is the next
     largest and has the same "load everything, filter in the client" shape.
  2. Route-level deferral: all four `dailyPrices` consumers include the landing
     route (Dashboard), which is why deferring the query out of the boot bundle
     was **not** worth it here — revisit if the data-health banner ever moves off
     the dashboard.
