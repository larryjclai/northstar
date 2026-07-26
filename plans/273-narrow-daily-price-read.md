# Plan 273: Stop shipping two dead columns across the IPC bridge on every launch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. **There is a data-corruption trap in this change; the whole design
> exists to avoid it. Read "The trap" before writing any code.** When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 989f9ea8..HEAD -- src/data/repositories.ts src/data/hooks.ts src/domain/types.ts src/domain/portfolioAnalytics.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (the trap below is real; the mitigation is the design)
- **Depends on**: `plans/271-daily-prices-startup-cost-spike.md` — DONE, merged in `5137462a`.
  This plan implements that spike's Option A.
- **Category**: perf
- **Planned at**: commit `5137462a`; **rebased to `989f9ea8` (post-272), 2026-07-26**. Note 272 touched `repositories.ts:2739/2748` (error handling) — a different region from this plan's `:427/:4578`.

## Why this matters

Plan 271 measured the real cost, live, against the operator's actual profile
(`docs/daily-prices-startup-spike.md`):

| Stage | Measured |
|---|---|
| `listDailyPrices()` fetch, wall time | **1,833 ms** |
| Payload | **17,283,435 bytes** (16.5 MiB), 124,158 rows |
| SQLite alone (same query via `sqlite3` CLI) | **~80 ms** |
| JS compute (`buildPortfolioTwr` / `buildPortfolioValueSeries`) | **~11–13 ms** |

**95.6% of that 1.8 s is Tauri IPC serialization plus JSON parsing** — not the
database, not the maths. It happens before the first paint, on every launch.

Two of the six columns in that payload — `source` and `updated_at` — are **read
by no consumer**. They exist for the write path only. Plan 271 measured stripping
them, live in the same app:

```
fetch  1833 ms → 1143 ms   (−690 ms, −37.6%)
bytes  17.28 MB → 12.69 MB (−4.59 MB, −26.6%)
```

**690 ms off cold start, with no change to any calculation.**

## The trap — read this before writing code

**You cannot simply remove the two columns from `listDailyPrices()`.** That method
is on a round-trip path that would silently corrupt data:

```
exportSnapshot()            repositories.ts:4905
  → this.listDailyPrices()  repositories.ts:4917
    → RepositorySnapshot.dailyPrices
      → backup file / export / sync
        → importSnapshot()
          → saveDailyPrices(snapshot.dailyPrices)   repositories.ts:5293
```

and `saveDailyPrices` normalises with fallbacks (`repositories.ts:4611`, and the
in-memory twin at `marketDataStore.ts:118-137`):

```ts
          source: price.source || "manual",
          updatedAt: price.updatedAt || updatedAt,
```

So if the exported rows lack those fields, **every backup/restore cycle would
rewrite all 124,158 rows' `source` to `"manual"` and `updated_at` to the restore
timestamp**, destroying price provenance. It would be silent, and it would only
surface much later when someone asked where a price came from.

**Therefore: `listDailyPrices()` keeps returning full rows. This plan adds a
separate, narrower read used only by the boot path.**

## Current state

### The boot query (`src/data/hooks.ts:80-84`)

```ts
  const dailyPrices = useQuery({
    queryKey: keys.dailyPrices,
    queryFn: () => repository.data!.listDailyPrices(),
    enabled,
  });
```

This is the 1,833 ms call. It is the **only** call site that needs narrowing.

### The full read that must NOT change (`src/data/repositories.ts:4578`)

```ts
  override async listDailyPrices(filter?: { ticker?: string; since?: string }) {
    …
      `select ticker, date, close, currency, source, updated_at from daily_prices ${where} order by ticker, date asc`,
```

Used by `exportSnapshot()` (`:4917`). Leave it exactly as it is.

### The type (`src/domain/types.ts:504-511`)

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

### Consumers that only ever read the first four fields

Verified by the advisor: no consumer reads a *loaded* row's `.source` or
`.updatedAt`. Every `.source` hit in `src/` is either a **write** path
(`useMarketRefresh.ts:54,55,97,226,293`, `marketDataStore.ts:89,130`,
`csv.ts:60`) or an unrelated identifier (`sourceAccountId`,
`sourcePublicKeyB64`). `currency` **is** read (`portfolioAnalytics.ts:795,916`;
`dataHealth.ts:164-165`) — it stays.

These signatures currently say `DailyPrice[]` but only touch the four live fields:

```
src/domain/dataHealth.ts:123
src/domain/portfolioAnalytics.ts:511, 527, 629, 705, 742, 850, 996, 1044, 1110, 1120
src/domain/valuation.ts:25, 28
src/domain/portfolioCalculator.ts:19
```

### Conventions to match

- Comments explain *why* and cite plan numbers.
- `AGENTS.md`: financial calculations must not silently change. **This plan
  changes no arithmetic** — only which columns cross the wire and which type
  annotation describes them.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 129 files / **1506** pass |
| Analytics suites | `npx vitest run src/domain/portfolioAnalytics.test.ts src/domain/portfolioTwr.test.ts src/domain/attribution.test.ts` | pass **unedited** |
| Snapshot suite | `npx vitest run src/data/repositories.snapshot.test.ts` | pass |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| Dev app | `npm run tauri dev` | launches |

## Scope

**In scope**:
- `src/domain/types.ts` — add the narrower interface
- `src/data/repositories.ts` — add `listDailyPriceSeries` (interface + both implementations); **do not modify `listDailyPrices`**
- `src/data/marketDataStore.ts` — the in-memory twin of the new method
- `src/data/hooks.ts` — point the boot query at the new method
- `src/domain/portfolioAnalytics.ts`, `dataHealth.ts`, `valuation.ts`, `portfolioCalculator.ts` — **parameter type annotations ONLY**

**Out of scope**:
- `listDailyPrices()`, `exportSnapshot()`, `importSnapshot()`, `saveDailyPrices()` — the round-trip path. Not one character.
- **Any logic anywhere.** This plan changes type annotations and one SQL select
  list. If you find yourself editing an expression, a condition, or a loop, stop.
- The `daily_prices` table schema. Both columns stay in the database.
- The other consumers' behaviour.

## Git workflow

- Branch: `perf/ai-narrow-daily-price-read`
- Commits:
  1. `refactor(types): introduce DailyPriceSeriesRow as the read-only price shape`
  2. `perf(data): load only the four live columns on the startup path`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

```bash
npm test 2>&1 | tail -3        # expect 129 files / 1506
npx tsc --noEmit               # exit 0
```

### Step 1: Add the narrower type as a supertype

In `src/domain/types.ts`, split the interface so the full row *extends* the read
shape. This is what makes the change type-safe: anything holding a full
`DailyPrice` still satisfies a `DailyPriceSeriesRow` parameter, so no call site
breaks.

```ts
/**
 * The four columns any *reader* of price history actually uses. The startup path
 * loads only these — `source`/`updatedAt` are write-path metadata that no
 * consumer reads, and shipping them cost ~690 ms and ~4.6 MB of IPC on every
 * launch (plan 273; measurements in docs/daily-prices-startup-spike.md).
 */
export interface DailyPriceSeriesRow {
  ticker: string;
  date: string;
  close: number;
  currency: string;
}

/**
 * A full stored row, including write-path provenance. Returned by
 * `listDailyPrices()`, which feeds exportSnapshot() → importSnapshot() →
 * saveDailyPrices(); those fields MUST survive that round trip or every
 * backup/restore rewrites `source` to "manual" (plan 273).
 */
export interface DailyPrice extends DailyPriceSeriesRow {
  source: string;
  updatedAt: string;
}
```

Then widen the **parameter type annotations only** at the sites listed in Current
state, from `DailyPrice[]` to `DailyPriceSeriesRow[]`. Do not touch anything else
in those functions.

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → 1506 passing, unchanged
- `git diff -- src/domain/portfolioAnalytics.ts | grep -vE "^[-+].*DailyPrice"` shows
  **only** diff headers — i.e. every changed line is a type annotation

Commit as commit 1. At this point nothing has changed at runtime at all.

### Step 2: Add the narrow read

In `src/data/repositories.ts`, add to the `FinanceRepository` interface next to
`listDailyPrices` (line 427):

```ts
  /**
   * Startup path: the four columns readers use. See DailyPriceSeriesRow.
   * NOT interchangeable with listDailyPrices() — that one feeds
   * exportSnapshot() and must keep returning full rows (plan 273).
   */
  listDailyPriceSeries(filter?: { ticker?: string; since?: string }): Promise<DailyPriceSeriesRow[]>;
```

SQLite implementation, modelled on the existing `listDailyPrices` override
(same filter handling, same `order by ticker, date asc`):

```ts
  override async listDailyPriceSeries(filter?: { ticker?: string; since?: string }) {
    // … identical clause building to listDailyPrices …
      `select ticker, date, close, currency from daily_prices ${where} order by ticker, date asc`,
    // … map to { ticker, date, close, currency } only …
  }
```

Add the in-memory twin in `src/data/marketDataStore.ts` beside `listDailyPrices`
(line 109), returning the same four fields from `ctx.data.dailyPrices`, and the
delegating one-liner on the browser repository (beside `repositories.ts:2311`).

**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → 1506 passing. Nothing calls
the new method yet.

### Step 3: Point the boot query at it

In `src/data/hooks.ts`:

```ts
  const dailyPrices = useQuery({
    queryKey: keys.dailyPrices,
    // Only the four columns any reader uses. The full row (with source/updatedAt)
    // is still what exportSnapshot() reads via listDailyPrices() — see plan 273.
    queryFn: () => repository.data!.listDailyPriceSeries(),
    enabled,
  });
```

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → 1506 passing
- `npx vitest run src/domain/portfolioAnalytics.test.ts src/domain/portfolioTwr.test.ts src/domain/attribution.test.ts` → pass, **unedited**
- `npx vitest run src/data/repositories.snapshot.test.ts` → pass (this is the
  suite that protects the export/import round trip)

Commit as commit 2.

### Step 4: Prove the round trip is intact

This is the step that guards against the trap. Confirm export still carries
provenance:

```bash
grep -n "listDailyPrices()" src/data/repositories.ts     # exportSnapshot's call must still be there
git diff 5137462a..HEAD -- src/data/repositories.ts | grep -E "^[-+].*(exportSnapshot|importSnapshot|saveDailyPrices|source, updated_at)"
```

**Verify**: the second command prints **nothing** — none of those four things
changed. If it prints anything, you have modified the round-trip path; STOP.

Additionally, confirm by reading that `exportSnapshot()` (`~line 4905`) still
calls `this.listDailyPrices()` and **not** the new method. Getting this backwards
is the single failure this plan exists to prevent.

### Step 5: Measure, and full verification

Temporarily instrument the boot query's wall time and payload size the way plan
271 did (`docs/daily-prices-startup-spike.md` records the method), run
`npm run tauri dev` against the real profile, and record fetch ms and bytes.

Expected from 271's measurement: **~1143 ms and ~12.7 MB**, down from ~1833 ms /
17.3 MB. Report what you actually get.

Remove the instrumentation.

**Verify**, each exiting 0: `npx tsc --noEmit`, `npm run lint`, `npm test`,
`npm run build`. And `git diff | grep -c "console.log"` → 0.

## Test plan

No new unit tests — no behaviour changes, and the existing suites are the net:

- `portfolioAnalytics.test.ts`, `portfolioTwr.test.ts`, `attribution.test.ts` must
  pass **unedited**. They encode the locked financial semantics; if the narrower
  type changed anything, they fail.
- `repositories.snapshot.test.ts` must pass — it covers export/import, the exact
  path the trap threatens.
- `npm test` at 1506, unchanged in either direction.

If you believe a new test is warranted, the one worth adding is a snapshot
round-trip assertion that `source` and `updatedAt` survive
`exportSnapshot()` → `importSnapshot()`. Add it **only** if
`repositories.snapshot.test.ts` does not already assert that — check first, and
say which you found.

## Done criteria

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` all exit 0
- [ ] `npm test` → 1506 passing (or 1507 with the optional round-trip test)
- [ ] `grep -c "listDailyPriceSeries" src/data/hooks.ts` returns 1
- [ ] `grep -c "listDailyPrices()" src/data/repositories.ts` returns at least 1
      (exportSnapshot still uses the full read)
- [ ] Step 4's diff-grep prints nothing
- [ ] `grep -n "source, updated_at from daily_prices" src/data/repositories.ts`
      still hits — the full query is unchanged
- [ ] Step 5's before/after fetch ms and bytes recorded
- [ ] `git diff | grep -c "console.log"` → 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- `exportSnapshot()` ends up calling `listDailyPriceSeries()`. That is the
  corruption path — stop and report immediately.
- Any diff to `saveDailyPrices`, `importSnapshot`, or the full
  `select … source, updated_at …` query.
- Any analytics test fails, or you feel the need to edit one.
- `tsc` errors that would be fixed by changing logic rather than a type
  annotation. Report the error instead.
- Your measured saving is far off ~690 ms. Report the number; do not chase it
  with further changes.

## Maintenance notes

- **The rule to remember**: `listDailyPrices()` is the *storage* shape and feeds
  backup/export; `listDailyPriceSeries()` is the *reader* shape and feeds the UI.
  Anything that persists rows must use the former. The doc comments on both types
  say so — keep them if you refactor.
- If a future feature genuinely needs `source` or `updatedAt` in the UI (e.g.
  showing "price from Yahoo, updated 2h ago"), do **not** widen the startup
  query — add a targeted read for that view. Restoring those columns to the boot
  path costs the 690 ms back.
- Remaining startup cost after this lands is still ~1143 ms of IPC for ~12.7 MB.
  Option C from `docs/daily-prices-startup-spike.md` (client-side cache + delta
  loading) is the next lever, and is a bigger, separate design — note that
  `saveDailyPrices` is an upsert, so it must handle corrections to historical
  rows, not just appends.
