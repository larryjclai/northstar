# Plan 271: Measure the daily-prices startup cost, then pick a fix — spike, not a build

> **Executor instructions**: **This is a measurement and design spike. Its
> deliverable is a written recommendation, not a code change.** Do not implement
> a fix. Steps 1–3 measure; Step 4 evaluates a shortlist against those numbers;
> Step 5 writes the recommendation and stops. If you find yourself editing
> anything under `src/`, you have gone beyond this plan's scope.
>
> **Drift check (run first)**:
> `git diff --stat 4473222a..HEAD -- src/data/hooks.ts src/domain/portfolioAnalytics.ts src/routes/DashboardRoute.tsx`

## Status

- **Priority**: P2
- **Effort**: M (measurement + design; no production code)
- **Risk**: LOW (a spike changes nothing)
- **Depends on**: none
- **Supersedes**: nothing. **Successor to `plans/261-bound-market-history-loads.md`**, which was
  REJECTED by measurement — see below.
- **Category**: perf / spike
- **Planned at**: commit `4473222a`, 2026-07-25

## Why this is a spike and not a fix

`useFinanceData()` loads the entire `daily_prices` table on every launch, with no
filter. Measured on the operator's real profile at `4473222a`:

```
select count(*), count(distinct ticker) from daily_prices;   →  124158 | 114
```

**124,158 rows**, ~1,089 per ticker (≈4.3 years of daily closes each), serialized
to JSON and pushed across the Tauri IPC bridge before the first paint.

That is a large number. But **four plausible fixes have already been ruled out**,
three of them by evidence gathered while writing this plan. Writing a fifth fix
plan on an unverified assumption would repeat a mistake this batch has already
made several times — so this plan measures first.

### Dead end 1 — narrow by ticker *(measured, rejected)*

Plan 261's approach. The operator measured it:

```
select count(*) from daily_prices
 where upper(ticker) not in (select upper(ticker) from portfolio_assets where deleted_at is null);
                                                             →  250
```

**250 rows out of 124,158 — 0.2%.** The premise ("history for sold-off tickers
accumulates forever") is false on real data: 99.8% of rows belong to currently-held
tickers. Plan 261 was REJECTED on these numbers.

### Dead end 2 — narrow by date

The analytics engine walks from `"1900-01-01"` (`InvestmentsAnalyticsTab.tsx:171,
291, 441, 443`). `AGENTS.md`: *"Correctness first for finance… Don't silently
change financial math."* Truncating depth silently restates TWR, the net-worth
trend and return attribution. **Not available at any price.**

### Dead end 3 — push the computation into SQL

This was the operator's initial preference, and reading the code killed it.
`priceBasket()` (`src/domain/portfolioAnalytics.ts:510-600`) is not a sum — it
implements decided financial semantics:

- a **value-weighted 70% coverage threshold** (`COVERAGE_THRESHOLD = 0.7`) that
  picks the earliest start date at which positions covering 70% of basket value
  all have prices;
- **fixed-basket** construction — positions that start later are *excluded and
  reported*, not truncated, so the basket stays contamination-free;
- a **price-source preference** (real ticker history over manual snapshots, by
  ticker not by `isManual`);
- **carry-forward** of the last close before the window start.

Re-expressing that in SQL is a rewrite of locked financial math. Per `AGENTS.md`
and the recorded decisions, that is exactly what must not happen casually.
**Rejected — the cost is not worth the correctness risk, and the risk is severe.**

### Dead end 4 — defer `dailyPrices` out of the boot bundle

Also plausible, also wrong. `DashboardRoute` — the landing route — reads
`dailyPriceRows` in **eight** places, not just the data-health banner:

```
208  const dailyPriceRows = dailyPrices.data ?? [];
273    buildDataHealthReport({ … dailyPrices: dailyPriceRows … })
297  const dailyPriceLookup = useMemo(() => buildDailyPriceLookup(dailyPriceRows), …)
477/479  net-worth computation inputs
656/665  value series + buildBenchmarkSeries
692/702  second series + benchmark
737  (further chart input)
```

The dashboard charts at first paint. Deferring the query just moves the stall
into the route the user lands on.

### What is left, and why it needs numbers first

Only narrower options remain, and **none of them can be chosen without knowing
where the time actually goes**. Nobody has measured whether 124k rows is 50 ms or
2 s, or whether the cost is SQLite, IPC serialization, JSON parsing, or the JS
grouping in `priceBasket`. Each points at a different fix, and some point at
"leave it alone".

## Current state

### The unfiltered load (`src/data/hooks.ts:80-84`)

```ts
  const dailyPrices = useQuery({
    queryKey: keys.dailyPrices,
    queryFn: () => repository.data!.listDailyPrices(),
    enabled,
  });
```

### The row shape (`src/domain/types.ts:504-511`)

```ts
export interface DailyPrice {
  ticker: string;
  date: string;
  close: number;
  currency: string;
  source: string;
  updatedAt: string;
}
```

`currency` **is** consumed (`portfolioAnalytics.ts:795, 916`;
`dataHealth.ts:164-165`). Whether `source` and `updatedAt` are read by any
consumer is **an open question this spike must answer** — if they are not, the
wire payload carries two dead string columns per row across 124k rows.

### `saveDailyPrices` is an upsert, not append-only (`repositories.ts:4611`)

It normalises and writes rows that may already exist — a re-fetch can correct a
historical close. **This matters**: any "cache what we already have, load only
new dates" design must handle corrections to past rows, not just appends. Do not
assume append-only.

### One consumer needs only an aggregate (`src/domain/dataHealth.ts:306`)

```ts
  const tickersWithPriceHistory = new Set(dailyPrices.map((p) => p.ticker.toUpperCase()));
```

The data-health check wants **the set of tickers**, not 124k rows. That is one
consumer that could be served by a `select distinct ticker` — worth noting in the
shortlist.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 129 files / 1505 pass |
| Dev app | `npm run tauri dev` | app launches |

## Scope

**In scope**:
- `docs/daily-prices-startup-spike.md` — **the only file this plan creates.**
- Temporary instrumentation, which **must be removed** before finishing.

**Out of scope**:
- **Any production change whatsoever.** No fix. No `src/` edit that survives.
- `src/domain/portfolioAnalytics.ts` — do not touch, do not "tidy", do not
  re-express in SQL. Its semantics are decided and locked.
- Any date-window or ticker-narrowing experiment. Both are already rejected above.

## Git workflow

- Branch: `spike/ai-daily-prices-cost`
- Commit: `docs(perf): spike — where the daily-prices startup cost actually goes`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Instrument the load path

Add **temporary** timing around the three stages, in `src/data/hooks.ts`'s
`dailyPrices` query function and around `priceBasket`:

1. **Fetch** — wall time of `repository.listDailyPrices()` end to end.
2. **Size** — `JSON.stringify(rows).length` of the result, in bytes.
3. **Shape** — row count and distinct ticker count as seen by JS.
4. **Compute** — wall time of the first `buildPortfolioValueSeries` call on the
   dashboard.

Run `npm run tauri dev` against the real profile and record all four.

**Verify**: four numbers recorded. If the fetch is under ~150 ms, say so plainly
— that is a legitimate finding and it likely ends this line of work.

### Step 2: Separate SQLite time from IPC time

The fetch number from Step 1 conflates three things: SQLite executing the query,
the Rust plugin serializing to JSON, and JS parsing it.

Get a floor for the SQLite half by timing the same query directly:

```bash
sqlite3 ~/Library/Application\ Support/app.northstar.finance/northstar.db \
  ".timer on" \
  "select ticker, date, close, currency, source, updated_at from daily_prices order by ticker, date asc;" > /dev/null
```

**Ask the operator to run this if the path is not readable in your session** — a
previous executor was blocked by the permission classifier on exactly this file,
and working around that block with a different tool is not acceptable. Report it
as an operator action rather than circumventing it.

**Verify**: SQLite-only time recorded, and the IPC+parse remainder derived as
`Step 1 fetch − SQLite time`.

### Step 3: Answer the dead-column question

Determine whether `DailyPrice.source` and `DailyPrice.updatedAt` are read by any
consumer:

```bash
grep -rn "\.source\b" src/ --include=*.ts --include=*.tsx | grep -v "\.test\."
grep -rn "\.updatedAt\b" src/ | grep -iE "price|daily" | grep -v "\.test\."
```

Beware false positives: `priceBasket` has a local variable named `source`, and
several unrelated types have `updatedAt`. Confirm each hit by reading it.

If both are unread by every consumer, estimate the saving: re-run Step 1's size
measurement with those two fields stripped from the query's select list.

**Verify**: a yes/no per field, with the byte saving if yes.

### Step 4: Evaluate the shortlist against the measurements

For each option, state whether the Step 1–3 numbers support it, and its
correctness risk. **Do not implement any of them.**

- **A. Drop dead columns from the wire.** Narrow the `select` in
  `listDailyPrices` to the fields consumers actually read. Zero semantic change.
  Viable only if Step 3 finds dead columns and Step 1 shows serialization is a
  meaningful share.
- **B. Serve `dataHealth` from an aggregate.** `select distinct ticker` instead
  of feeding it 124k rows (`dataHealth.ts:306`). Small, safe, independent of the
  rest.
- **C. Persist a client-side cache and load deltas.** Keep parsed prices in
  IndexedDB, query only rows newer than the cached max `updated_at`. **Must
  handle upsert corrections to historical rows** — `saveDailyPrices` is not
  append-only (see Current state). Highest payoff, highest complexity, new
  invalidation surface.
- **D. Do nothing.** If Step 1 shows the fetch is a small share of startup, this
  is the correct answer and should be stated as such.

Rank them by (measured benefit ÷ risk) and recommend one — including D.

### Step 5: Write it up and STOP

Create `docs/daily-prices-startup-spike.md` containing:

1. The measurements from Steps 1–3, as a table.
2. The four dead ends from this plan's header, **carried across verbatim** — the
   next person must not re-tread them.
3. The shortlist with your assessment.
4. A single recommendation, with the follow-up plan it implies (or "no action").

Remove all instrumentation. **Then stop** — do not start the recommended work.

**Verify**:
- `git diff --stat` shows only `docs/daily-prices-startup-spike.md`
- `git diff | grep -c "console.log"` → 0
- `npm test` → 129 files / 1505 pass (nothing was touched)

## Test plan

None — this plan changes no behaviour. The assertion is that the test count is
untouched at 1505 and the only changed file is the new doc.

## Done criteria

- [ ] `docs/daily-prices-startup-spike.md` exists with all four sections
- [ ] Four measurements from Step 1 recorded, plus the SQLite/IPC split from Step 2
- [ ] Step 3 answers yes/no for `source` and `updatedAt`
- [ ] All four shortlist options assessed against real numbers, one recommended
- [ ] `git diff --stat 4473222a..HEAD` lists **only** the new doc
- [ ] `git diff | grep -c "console.log"` returns 0
- [ ] `npm test` → 1505 passing
- [ ] `plans/README.md` status row updated

## STOP conditions

- You are about to implement a fix. This plan ends at a recommendation.
- You are about to modify `src/domain/portfolioAnalytics.ts` for any reason.
- The real profile database is not readable in your session — report it and ask
  the operator to run the Step 2 query. **Do not route around a permission
  denial with a different tool.**
- Step 1 shows the fetch dominates startup by far *and* you are tempted to fix it
  immediately. Still stop — a measured problem deserves a reviewed plan.

## Maintenance notes

- **The reason this is a spike**: within this batch, three fix plans were written
  on plausible-but-unverified assumptions and two were killed by contact with
  reality (261 by the operator's own `count(*)`, 267's original mechanism by the
  bundler). The startup cost here is real, but the *shape* of the fix is not yet
  known, and guessing it costs more than measuring it.
- Whatever lands, `priceBasket`'s semantics stay untouched. If a future proposal
  requires changing them, it is a financial-semantics decision for the operator,
  not a performance optimisation.
- Option C's correctness hinges on `saveDailyPrices` being an upsert. Anyone
  designing that cache must re-read `repositories.ts:4611` first.
