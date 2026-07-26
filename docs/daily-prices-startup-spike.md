# Daily-prices startup cost — measurement spike (plan 271)

> **Status:** Spike complete. This document is the deliverable — no production code
> changed. **Successor to `plans/261-bound-market-history-loads.md`** (REJECTED by
> measurement; see Dead end 1 below).
> **Measured at:** commit `4473222a`, on the operator's real profile
> (`~/Library/Application Support/app.northstar.finance/northstar.db`),
> 2026-07-26.

## TL;DR

`useFinanceData()` loads all 124,158 rows of `daily_prices` on every launch. Measured
end-to-end in the running desktop app (debug build), that fetch takes **1833 ms** —
**not** because SQLite is slow (a raw `sqlite3` CLI run of the identical query takes
~80 ms) and **not** because the JS grouping in `priceBasket`/`buildPortfolioTwr` is slow
(~11–13 ms). The cost is almost entirely **Tauri IPC serialization + JS JSON parsing**
of a ~16.5 MB payload (**95.6%** of the fetch time is unaccounted for by SQL execution).

Two of the six wired columns (`source`, `updated_at`) are dead — read by no consumer
outside their own write path. Stripping them from the query, measured live in the same
app, cut the fetch from 1833 ms to **1143 ms** — a **690 ms / 37.6%** reduction, for a
change with **zero semantic risk**. That is this spike's recommendation (Option A
below); everything else is out of scope for now.

## Measurements

### Step 1 — live app, full query (`select … source, updated_at`)

Instrumented `src/data/hooks.ts`'s `dailyPrices` queryFn and the `buildPortfolioTwr` /
`buildPortfolioValueSeries` call sites in `src/routes/DashboardRoute.tsx`, then ran
`npm run tauri dev` against the real profile (debug build — see caveat below).

| Stage | Measurement |
|---|---|
| **Fetch** (`repository.data!.listDailyPrices()`, wall time) | **1833.0 ms** |
| **Size** (`JSON.stringify(rows).length`) | **17,283,435 bytes** (≈16.48 MiB) |
| **Shape** | **124,158 rows**, **114 distinct tickers** |
| **Compute** (`buildPortfolioTwr`, first calls with data present) | **10–22 ms** (typ. ~11–13 ms) |
| **Compute** (`buildPortfolioValueSeries`, same renders) | **10–14 ms** (typ. ~11–12 ms) |

Fetch is nowhere near the plan's ~150 ms "small share" threshold — it is over 12×
that. This is a real, substantial cost.

One incidental finding: on this operator's data, `buildPortfolioTwr` does **not**
gate out the `buildPortfolioValueSeries` fallback inside `stripData`'s `useMemo`
(`DashboardRoute.tsx:650-712`) — both ran on every observed render, back to back.
Noted for the record; not something this spike proposes changing, and it's
irrelevant to the fetch cost either way since both computations are ~11 ms.

### Step 2 — SQLite-only floor

```
sqlite3 ~/Library/Application\ Support/app.northstar.finance/northstar.db \
  ".timer on" \
  "select ticker, date, close, currency, source, updated_at from daily_prices order by ticker, date asc;" > /dev/null
```

Run 4 times: **91 ms, 92 ms, 68 ms, 69 ms** → average **≈80 ms**.

**IPC + JS-parse remainder = 1833 ms − 80 ms ≈ 1753 ms**, i.e. **≈95.6%** of the
measured fetch time is *not* SQLite executing the query. It is the Rust→JSON
serialization across the Tauri IPC bridge and/or the JS-side `JSON.parse`/object
construction of 124,158 rows. This is the spike's central finding: the bottleneck is
payload size and per-row IPC overhead, not query complexity, and not the analytics
math.

### Step 3 — dead-column check

```
grep -rn '\.source\b' src/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
grep -rn '\.updatedAt\b' src/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
```

- **`DailyPrice.source`: DEAD.** Every `.source` hit outside the write/read
  round-trip in `repositories.ts` (`listDailyPrices`/`saveDailyPrices`) belongs to
  unrelated types (`transferName.source`, sync `source`, `marketDataStore` FX rows,
  `etfSectorFeed`, `bulkCategorize` match hits). `priceBasket`'s `source` at
  `portfolioAnalytics.ts:548,554,598` is a **local variable** of type
  `Array<{date, price}>` — not `DailyPrice.source` — confirmed by reading the code.
  No consumer reads the string field.
- **`DailyPrice.updatedAt`: DEAD.** Every `.updatedAt` hit is on a different type
  (`MarketQuote.updatedAt` in `dataHealth.ts:192`, `HoldingDetailRoute.tsx:469`,
  `DashboardRoute.tsx:272`; `DailyFxRate`/sync/settings `updatedAt` elsewhere). No
  consumer reads `DailyPrice.updatedAt`.
- **Sanity check (not dead):** `DailyPrice.currency` **is** consumed —
  `portfolioAnalytics.ts:795` (`price?.currency || position.currency`) and `:916`
  (`toPrimary(close * qty, p.currency, d)`) — confirming the plan's claim.

**Byte/time saving, measured live** (temporarily stripped `source`, `updated_at`
from the `select` in `repositories.ts::listDailyPrices`, kept the two `DailyPrice`
keys present with empty-string values so the type didn't need changing, reran
`npm run tauri dev`):

| | Full (6 cols) | Stripped (4 cols, 2 keys emptied) | Delta |
|---|---|---|---|
| Fetch | 1833.0 ms | **1143.0 ms** | **−690.0 ms (−37.6%)** |
| Bytes | 17,283,435 | **12,689,589** | **−4,593,846 (−26.6%)** |

The byte saving here is a **floor**: the two dead keys were emptied
(`source: "", updatedAt: ""`) rather than removed from the object shape (changing
`DailyPrice`'s type was out of scope for a spike measurement). A cross-check via
`sqlite3 -json` with the columns fully absent from the row shape showed a larger
~45% raw-JSON reduction (17.75 MB → 9.68 MB), consistent with "fully dropping the
keys, not just emptying them, saves more." Either way, the **690 ms / 37.6% fetch-time
reduction is the real, live-measured number** and is the load-bearing one.

### Caveat: debug build

All live-app numbers were measured under `cargo run` (`[unoptimized + debuginfo]`),
because that is what `npm run tauri dev` runs. A `--release` build's serialization
and JSON parsing would very likely be faster in absolute terms. The *relative*
finding — IPC/serialization dominates over SQL execution and JS compute, and is
roughly proportional to payload size — should hold under release too, since it's
architectural rather than an artifact of unoptimized codegen, but the absolute
1833 ms / 1143 ms figures should not be quoted as production numbers without a
release-mode re-measurement.

## The four dead ends (carried over verbatim — do not re-tread)

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
`priceBasket()` (`src/domain/portfolioAnalytics.ts:509-613`) is not a sum — it
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
This spike's own Step 1 measurement reinforces the rejection independently: the JS
compute (`buildPortfolioTwr`/`buildPortfolioValueSeries`, ~11-13 ms each) is not
where the time goes, so rewriting it into SQL would not even address the measured
bottleneck.

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

## Shortlist, evaluated against the measurements

- **A. Drop dead columns from the wire.** Narrow the `select` in `listDailyPrices`
  to the fields consumers actually read (`ticker`, `date`, `close`, `currency`).
  **Strongly supported by measurement**: Step 3 confirms `source` and `updatedAt`
  are read by zero consumers, and the live-measured saving is real and
  substantial — **690 ms (37.6%) off a 1833 ms fetch**, for a change that touches
  one `select` statement and the `DailyPrice` type (dropping two fields everywhere
  they're written/read), with **zero semantic change** — the analytics engine
  never looked at either field. Lowest complexity, lowest risk, largest single
  measured win available in this shortlist.
- **B. Serve `dataHealth` from an aggregate.** `select distinct ticker` instead
  of feeding it 124k rows (`dataHealth.ts:306`). Confirmed viable —
  `tickersWithPriceHistory` only ever calls `.map((p) => p.ticker.toUpperCase())`.
  **But it does not reduce the dashboard's fetch cost**: `dailyPriceRows` is still
  needed in full for the other 7 consumers in `DashboardRoute` (charts, TWR,
  fixed-basket series, benchmark). This is a safe, independent micro-optimization
  with negligible effect on the measured startup number — worth doing opportunistically,
  not worth its own plan.
- **C. Persist a client-side cache and load deltas.** Highest theoretical payoff:
  since IPC/serialization dominates (95.6% of the fetch, Step 2) and scales with
  row count, a cache that loads only rows newer than the cached max `updated_at`
  after first launch could cut *subsequent* launches' fetch from ~1.8 s toward the
  ~114-rows/day incremental cost. **Not measured in this spike** — building and
  timing a cache layer is implementation, not measurement, and is out of scope
  here. Must handle `saveDailyPrices`'s upsert-not-append-only behavior
  (`repositories.ts:4611`): a re-fetch can correct a historical close, so "new
  since last sync" cannot be purely additive. Highest complexity, new invalidation
  surface, needs its own design plan if pursued.
- **D. Do nothing.** **Not supported.** Fetch is 1833 ms, far above the plan's
  ~150 ms "small share" bar, and Step 2 shows the majority of that is IPC/parse
  overhead proportional to a payload that Option A can shrink for free. Doing
  nothing would leave a measured, fixable cost on the table.

Ranked by (measured benefit ÷ risk): **A > B > C > D** — A has the best evidence and
the lowest risk of anything in the shortlist; D is ruled out by the numbers; B is
safe but low-leverage; C has the highest ceiling but the least evidence (nothing here
was measured — it's a stub for a future plan).

## Recommendation

**Ship Option A as its own small, low-risk fix plan**: narrow `listDailyPrices`'s
`select` to `ticker, date, close, currency`, drop `source`/`updatedAt` from the
`DailyPrice` type and its call sites (verify no other reader was missed by this
spike's grep — repeat it against `HEAD` at implementation time), and re-verify the
fetch-time improvement in a real `tauri dev` run against the same profile, plus
ideally one release-mode run to get a production-representative absolute number.
Bundle Option B (`dataHealth`'s `select distinct ticker`) into the same plan since
it is independent, safe, and touches an adjacent line — but do not oversell its
impact; it will not move the startup number.

**Do not pursue Option C in this cycle.** It is plausible and has the highest
ceiling of anything considered, but it needs its own scoped design plan — one that
starts from `saveDailyPrices`'s upsert semantics (`repositories.ts:4611`) — rather
than being folded into a spike follow-up. If the operator wants next-launch startup
to approach zero rather than ~1.1 s (post-Option-A), that plan is the one to write
next, informed by this spike's numbers.

**Option D is rejected** by the numbers above; this is not a "leave it alone" case.

## Follow-up

- **Immediate**: new fix plan for Option A (+ B), informed directly by this spike's
  measurements. No new investigation needed — the grep and the live A/B fetch
  numbers are already in hand.
- **Future, separately scoped**: a design plan for Option C's client-side cache,
  starting from the upsert-correction constraint noted above and re-reading
  `repositories.ts:4611` first, per this plan's maintenance notes.
- `priceBasket`'s semantics remain untouched by everything in this document, as
  required. Nothing here changes financial math.
