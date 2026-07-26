# Plan 259: Add the missing SQLite indexes and set `synchronous=NORMAL`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 79032d3b..HEAD -- src/data/migrations.ts src/data/repositories.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `79032d3b`, 2026-07-25

## Why this matters

The five highest-volume tables in the file — `ledger_transactions`,
`investment_records`, `portfolio_assets`, `invoices`, `clients` — have **no
secondary indexes at all**. Every one of them is queried by non-primary-key
columns dozens of times across the repository (`group_id`, `asset_id`,
`account_id`, `counter_account_id`, `installment_group_id`, `drip_group_id`,
`linked_account_id`, `linked_ledger_transaction_id`, `ticker`, `book_id`), and
each of those queries is a **full table scan** today. The cost grows linearly
with the user's transaction history and is paid on every edit, delete, transfer,
split, reconcile and app launch.

This is the cheapest, lowest-risk speed work available in the repo: indexes are
additive, change no query results, and are covered by the existing dual-repo test
harness. Land this first — plans 260 and 261 both make the startup path do *less*
work, and their measurements are easier to read once scans are no longer the
dominant term.

The plan also sets `PRAGMA synchronous=NORMAL`. In WAL mode SQLite defaults to
`FULL`, which fsyncs on every commit; `NORMAL` is the setting SQLite's own
documentation recommends for WAL and is the standard durability/latency trade
(the WAL file is still crash-safe; only a power loss at the exact moment of
commit can lose the most recent transaction — never corrupt the file).

## Current state

### Files in play

- `src/data/migrations.ts` (331 lines) — the ordered `Migration[]` array. Every
  migration's SQL is re-run on every launch via `initialize()`, so all DDL is
  written `if not exists`.
- `src/data/repositories.ts` (7061 lines) — `TauriSqlFinanceRepository` holds
  every SQL query; `createFinanceRepository()` (line 548) sets the PRAGMAs.

### What indexes exist today (verified at `79032d3b`)

`grep -n "create index" src/data/migrations.ts` returns exactly three:

```
155:      create index if not exists idx_fx_rates_pair_date on fx_rates (currency_from, currency_to, date);
167:      create index if not exists idx_daily_prices_ticker_date on daily_prices (ticker, date);
206:      create index if not exists idx_manual_price_snapshots_asset_date on manual_price_snapshots (asset_id, date);
```

Two more are created imperatively in `repositories.ts`:

```
3095:    await this.db.execute(`create unique index if not exists idx_ledger_recurring_occurrence on ledger_transactions (recurring_occurrence_key) where recurring_occurrence_key is not null and deleted_at is null`);
5855:    await this.db.execute(`create unique index if not exists idx_sync_outbox_record_revision on sync_outbox (record_type, record_id, revision)`);
```

**`sync_outbox` is therefore already indexed — do not add another index to it.**
Everything else below is unindexed.

### The migration array shape (`src/data/migrations.ts:1-11`)

```ts
export interface Migration {
  id: number;
  description: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    description: "Initial local-first finance schema",
    sql: `
      create table if not exists accounts (
```

Existing migration ids run 1..8 (`grep -n "^    id: " src/data/migrations.ts` →
lines 9, 171, 194, 210, 237, 256, 280, 298). **Your new migration is id 9.**

An existing index-bearing migration to copy the style from — `migrations.ts:145-168`:

```
      create table if not exists fx_rates (
        ...
      );

      create index if not exists idx_fx_rates_pair_date on fx_rates (currency_from, currency_to, date);
```

### The query sites that justify each index (all verified at `79032d3b`)

| Table | Column(s) | Call sites in `repositories.ts` |
|---|---|---|
| `ledger_transactions` | `group_id` | 3611, 3669, 3744, 3749, 3814 |
| `ledger_transactions` | `account_id` | 3540, 5846, and `where account_id = $1 or counter_account_id = $1` |
| `ledger_transactions` | `counter_account_id` | 3540, 5846 (same `or` predicate — SQLite needs a **separate** index per side of an `OR` to use them) |
| `ledger_transactions` | `installment_group_id` | 3702, 3708 |
| `ledger_transactions` | `linked_investment_record_id` | the cashless-leak repair `update` in `initialize()` (~line 3009) |
| `investment_records` | `asset_id` | 3955, plus `recomputeSqliteAssets` |
| `investment_records` | `linked_account_id` | 3544, 6107, 6124 |
| `investment_records` | `drip_group_id` | 4108 |
| `portfolio_assets` | `ticker` | 5749, 5760 |
| `invoices` | `linked_ledger_transaction_id` | 3428, 3439 |
| `invoices` | `book_id` | 3304, 3184 |
| `clients` | `book_id` | 3307, 3188 |
| `accounts` | `book_id` | 3299, 3180, 3140 |

### ⚠️ Two of those columns do NOT exist when migrations run

**This is the trap that a first execution attempt fell into — read it carefully.**

`initialize()` runs the `migrations` loop **first** (`repositories.ts:2946-2950`), and
only *then* the ~62 `ensureSqliteColumn()` calls. So a `create index` inside a
migration can only reference columns present in a `create table` DDL. Two of the
thirteen columns above are **not**:

| Column | In migration DDL? | Actually added by |
|---|---|---|
| `accounts.book_id` | **NO** — `accounts` DDL (`migrations.ts:12-27`) ends at `custom_group` | `ensureSqliteColumn("accounts", "book_id", …)` at `repositories.ts:2976` |
| `investment_records.drip_group_id` | **NO** — `investment_records` DDL (`migrations.ts:75-91`) ends at `linked_ledger_transaction_id` | `ensureSqliteColumn("investment_records", "drip_group_id", "text")` at `repositories.ts:3020` |

Putting either in migration 9 makes `initialize()` throw
`no such column: drip_group_id` on a fresh database, which aborts the rest of
initialization for **every** caller — 36/72 tests in
`repositories.investments.test.ts` fail, and so does the whole migration suite.

The other **eleven** columns were verified present in the base DDL and are safe
in the migration:
`ledger_transactions` (`group_id`, `account_id`, `counter_account_id`,
`installment_group_id`, `linked_investment_record_id`),
`investment_records` (`asset_id`, `linked_account_id`),
`portfolio_assets` (`ticker`),
`invoices` (`linked_ledger_transaction_id`, `book_id`),
`clients` (`book_id`).

**The repo already has the right pattern for this case.** `repositories.ts:3095`
creates an index imperatively, *after* the `ensureSqliteColumn` calls, for exactly
this reason:

```ts
    await this.db.execute(`create unique index if not exists idx_ledger_recurring_occurrence on ledger_transactions (recurring_occurrence_key) where recurring_occurrence_key is not null and deleted_at is null`);
```

The two problem indexes go there (Step 2), not in the migration.

### The PRAGMA block (`src/data/repositories.ts:564-577`)

```ts
    try {
      await db.execute("PRAGMA journal_mode=WAL;");
      await db.execute("PRAGMA busy_timeout=15000;");
      await db.execute("PRAGMA foreign_keys=ON;");
      const journal = await db.select<{ journal_mode: string }[]>("PRAGMA journal_mode;");
      const mode = journal?.[0]?.journal_mode ?? "unknown";
      if (mode.toLowerCase() !== "wal") {
        console.warn(`[db] journal_mode is '${mode}', expected 'wal' — lock contention is more likely on this platform`);
      } else {
        console.info("[db] journal_mode=wal, busy_timeout=15000");
      }
    } catch (e) {
      console.warn("[db] failed to set pragmas", e);
    }
```

### Conventions to match

- SQL is lowercase in this repo (`create index if not exists`, not
  `CREATE INDEX`) — except PRAGMAs, which are uppercase. Match both.
- Comments in `migrations.ts` and `repositories.ts` explain *why*, in the voice
  of the surrounding code. Several are in 繁體中文 where they describe a domain
  concept (e.g. 帳本 / 信用卡群組). Technical rationale is in English. Match that.
- Soft deletes are universal: almost every query carries `and deleted_at is null`.
  Prefer **partial indexes** (`where deleted_at is null`) for the tables where
  every read filters that way — smaller index, and SQLite will use it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Targeted tests | `npx vitest run src/data/repositories.migration.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/data/migrations.ts` — add migration id 9
- `src/data/repositories.ts` — TWO sites only: (a) the PRAGMA block (lines
  564-577), and (b) the imperative index creation next to line 3095 (Step 2).
  Nothing else in this 7061-line file.
- `src/data/repositories.migration.test.ts` — add the assertions in the test plan

**Out of scope** (do NOT touch, even though they look related):
- Any `select`/`update`/`delete` statement text. This plan adds indexes; it does
  **not** rewrite queries. Rewriting a query changes results; adding an index
  cannot.
- `src/data/repositories.ts:3095` and `:5855` — the two EXISTING imperative
  `create unique index` calls. They are correct. Leave them where they are; do
  not move them into the migration. Step 2 adds new lines *after* 3095; it does
  not modify either existing statement.
- `PRAGMA journal_mode`, `busy_timeout`, `foreign_keys` — already correct.
- The `BrowserFinanceRepository` (in-memory) implementation — it has no SQL.

## Git workflow

- Branch: `fix/ai-sqlite-indexes` (the repo uses `feat/ai-<name>` / `fix/ai-<name>`
  — see `.agentrules`).
- Conventional commits; recent examples from `git log --oneline`:
  `fix(sync): …`, `perf(data): …`, `chore: bump version to 0.1.0-alpha.69`.
  Use `perf(data): add missing SQLite indexes` and
  `perf(data): set PRAGMA synchronous=NORMAL under WAL`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add migration id 9 with the new indexes

Append a ninth entry to the `migrations` array in `src/data/migrations.ts`,
after the `id: 8` entry. Target shape:

```ts
  {
    id: 9,
    description: "Secondary indexes for the high-volume ledger/investment tables",
    sql: `
      -- Every one of these columns is queried on a hot path but was a full table
      -- scan until now (see plan 259). All are additive: they change no query
      -- result, only how SQLite reaches the rows.

      -- Split/fee/transfer legs are grouped by group_id; every edit, delete and
      -- reconcile of a grouped transaction fans out through it.
      create index if not exists idx_ledger_group on ledger_transactions (group_id)
        where group_id is not null and deleted_at is null;

      -- Account balance derivation and the delete-guard both filter by
      -- `account_id = ? or counter_account_id = ?`. SQLite can only use an index
      -- per side of an OR, so both sides need their own.
      create index if not exists idx_ledger_account on ledger_transactions (account_id)
        where deleted_at is null;
      create index if not exists idx_ledger_counter_account on ledger_transactions (counter_account_id)
        where counter_account_id is not null and deleted_at is null;

      -- 分期 (installments): the whole schedule is rewritten by group.
      create index if not exists idx_ledger_installment_group on ledger_transactions (installment_group_id)
        where installment_group_id is not null and deleted_at is null;

      -- The cashless-leak repair in initialize() joins ledger legs back to their
      -- investment record through this column.
      create index if not exists idx_ledger_linked_investment on ledger_transactions (linked_investment_record_id)
        where linked_investment_record_id is not null;

      -- recomputeSqliteAssets and the per-asset guards group records by asset.
      create index if not exists idx_investment_asset on investment_records (asset_id)
        where deleted_at is null;
      create index if not exists idx_investment_linked_account on investment_records (linked_account_id)
        where deleted_at is null;

      -- Ticker lookups drive holding identity (manual vs transactions split).
      create index if not exists idx_portfolio_assets_ticker on portfolio_assets (ticker)
        where deleted_at is null;

      -- 帳本 (books) membership counts, and invoice settlement by ledger leg.
      -- NOTE: accounts.book_id is NOT indexed here — that column is added by
      -- ensureSqliteColumn(), which runs after this migration. See Step 2.
      create index if not exists idx_invoices_linked_ledger on invoices (linked_ledger_transaction_id)
        where deleted_at is null;
      create index if not exists idx_invoices_book on invoices (book_id) where deleted_at is null;
      create index if not exists idx_clients_book on clients (book_id) where deleted_at is null;
    `,
  },
```

That is **eleven** indexes. `idx_investment_drip_group` and `idx_accounts_book`
are deliberately absent — they go in Step 2. Do not add them here, however
natural it looks.

**Do not put a `;` inside a `--` comment**, and do not put a backtick inside one
either (the whole block is a TypeScript template literal — a stray backtick ends
it and produces a parse error).

Note: `initialize()` splits each migration's `sql` on statement boundaries via
`splitSqlStatements()` and executes them one at a time
(`repositories.ts:2946-2950`) — so multiple statements in one `sql` string is the
established pattern, and SQL comments must survive that splitter.

**Verify**: `npx vitest run src/data/repositories.migration.test.ts` → all pass.
Then `npm test` → all pass.

### Step 2: Create the two late-column indexes imperatively

`accounts.book_id` and `investment_records.drip_group_id` only exist after their
`ensureSqliteColumn()` calls, so their indexes must be created after those calls —
not in the migration.

In `src/data/repositories.ts`, find the existing imperative index creation
(currently line 3095):

```ts
    await this.db.execute(`create unique index if not exists idx_ledger_recurring_occurrence on ledger_transactions (recurring_occurrence_key) where recurring_occurrence_key is not null and deleted_at is null`);
```

Add two statements immediately after it, matching that line's style:

```ts
    // These two columns are added by ensureSqliteColumn() above, not by a
    // create-table migration, so their indexes cannot live in migration 9 —
    // it runs before those columns exist (plan 259).
    await this.db.execute(`create index if not exists idx_investment_drip_group on investment_records (drip_group_id) where drip_group_id is not null and deleted_at is null`);
    await this.db.execute(`create index if not exists idx_accounts_book on accounts (book_id) where deleted_at is null`);
```

Placement matters: they must come **after** the `ensureSqliteColumn` calls at
`repositories.ts:2976` (`accounts.book_id`) and `:3020`
(`investment_records.drip_group_id`). Line 3095 is after both — that is why it is
the right home.

**Verify**:
- `npx vitest run src/data/repositories.migration.test.ts` → all pass
- `npx vitest run src/data/repositories.investments.test.ts` → all pass (this is
  the suite that failed loudly when the indexes were mis-placed; treat it as the
  canary)

### Step 3: Confirm the splitter handles the comments

`splitSqlStatements()` is what turns the migration string into individual
statements. Confirm it does not choke on the `--` comments you just added.

Find it: `grep -n "function splitSqlStatements" src/data/repositories.ts`, read
it, and check how it treats `--`.

- If it splits purely on `;` and leaves comments attached to the following
  statement, that is fine — SQLite accepts a leading comment.
- **If a `--` comment could swallow the following `;`** (i.e. the splitter does
  not strip line comments and the comment text contains a semicolon), remove the
  `--` comments from the migration SQL and put the same explanation in a
  TypeScript `//` comment above the `sql` template literal instead.

**Verify**: `npx vitest run src/data/repositories.migration.test.ts` → all pass
(this suite exercises the real migration path against an in-memory SQLite).

### Step 4: Set `PRAGMA synchronous=NORMAL`

In `src/data/repositories.ts`, inside the existing `try` block at line 564, add
one line after the `busy_timeout` PRAGMA:

```ts
      await db.execute("PRAGMA journal_mode=WAL;");
      await db.execute("PRAGMA busy_timeout=15000;");
      // WAL defaults to synchronous=FULL, which fsyncs on every commit — the
      // dominant cost of a small write on iOS storage. NORMAL is SQLite's
      // recommended setting under WAL: the WAL file stays crash-safe, and only
      // a power loss at the moment of commit can cost the most recent
      // transaction (never corruption). Set AFTER journal_mode so it applies to
      // the WAL journal, not the rollback journal.
      await db.execute("PRAGMA synchronous=NORMAL;");
      await db.execute("PRAGMA foreign_keys=ON;");
```

Then extend the existing success log so the effective setting is visible in
`tauri ios dev` console output, matching the existing style at line 573:

```ts
        console.info("[db] journal_mode=wal, busy_timeout=15000, synchronous=normal");
```

**Verify**: `npx tsc --noEmit` → exit 0. `npm test` → all pass.

### Step 5: Full verification pass

**Verify**, in order, each exiting 0:
1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm test`
4. `npm run build`

## Test plan

Add to `src/data/repositories.migration.test.ts`, modelled on the assertions
already in that file (read it first and match its harness — it builds a real
SQLite repository via `createSqliteFinanceRepositoryForTests`):

1. **Indexes exist after initialize.** After creating the test repository, query
   `select name from sqlite_master where type = 'index' and name like 'idx_%'`
   and assert every index name added in Step 1 is present.
2. **Re-running initialize is still idempotent.** Call `initialize()` a second
   time on the same database and assert it does not throw and the index count is
   unchanged. (This is the property `if not exists` buys; it is also what plan
   260 will lean on.)
3. **No behavior change.** Do not write new behavioral assertions — the point of
   this plan is that behavior is identical. The existing suites
   (`repositories.investments.test.ts`, `repositories.split.test.ts`,
   `repositories.transfer.test.ts`, `repositories.sync.test.ts`, and the rest of
   `src/data/repositories.*.test.ts`) are the regression net. They must all
   still pass unchanged.

Verification: `npm test` → all pass, including the 2 new assertions.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0, and the 2 new assertions in
      `src/data/repositories.migration.test.ts` pass
- [ ] `npm run build` exits 0
- [ ] `grep -c "create index if not exists" src/data/migrations.ts` returns 14
      (3 pre-existing + 11 new)

> **⚠️ Reconciled 2026-07-26 — the two grep criteria below are STALE.**
> Plan 268 moved the imperative index statements out of `repositories.ts` into
> the declarative `ADDITIVE_INDEXES` array in `migrations.ts`, so the counts are
> now **16 in `migrations.ts` and 0 in `repositories.ts`**. That is 268 working
> as designed, not a regression — all 13 indexes from this plan are still
> defined. Verify the **property**, not the string location:
>
> ```bash
> grep -ohE "idx_[a-z_]+" src/data/migrations.ts src/data/repositories.ts | sort -u
> ```
> must contain all 13 names listed in Step 1 and Step 2. (Verified at `0aa7f972`.)
- [ ] `grep -c "create index if not exists" src/data/repositories.ts` returns 2
      (the 2 new ones from Step 2). The two pre-existing statements are
      `create unique index if not exists` — the word `unique` breaks the
      substring match, so they are NOT counted here. Use
      `grep -c "index if not exists" src/data/repositories.ts` → 4 for the
      full picture.
- [ ] `npx vitest run src/data/repositories.investments.test.ts` passes — the
      canary suite for mis-placed indexes
- [ ] `grep -c "PRAGMA synchronous=NORMAL" src/data/repositories.ts` returns 1
- [ ] `git diff --name-only` lists only the three in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `migrations.ts` already contains an `id: 9` migration —
  someone else added one; renumber is not your call.
- `splitSqlStatements()` turns out to mangle the migration in a way Step 2's
  fallback does not fix.
- Any existing test in `src/data/repositories.*.test.ts` fails after adding the
  indexes. An index must never change a result — a failure means one of these
  indexes is `unique` when it should not be, or a query depended on scan order.
  **Do not "fix" the test.** Report which test and which index.
- You find yourself wanting to change a `select`/`update`/`delete` statement to
  make an index apply. That is out of scope for this plan.
- The assumption "`sync_outbox` already has its index at `repositories.ts:5855`"
  is false on the live code.
- Any index you add throws `no such column: <x>`. That means `<x>` is added by
  `ensureSqliteColumn()` rather than by a `create table`, exactly like the two
  handled in Step 2 — report which column rather than guessing at a placement.

## Maintenance notes

- **Every new query on these tables should be checked against this index set.**
  If a future query filters by a column not listed here, it is a full scan again.
- Partial indexes (`where deleted_at is null`) only apply when the query carries
  the *same* predicate. If a future query drops `and deleted_at is null`, it
  silently stops using the index. That is the thing to scrutinise in review.
- Indexes cost write amplification. `ledger_transactions` now carries five. If a
  bulk-import path (`importSnapshot`, `forceFullResync`) becomes measurably
  slower, the standard remedy is to drop and recreate indexes around the bulk
  load — not to remove them.
- `synchronous=NORMAL` is set per-connection, not persisted in the file, so it
  must stay in `createFinanceRepository()`. If a second connection is ever
  opened, it needs the same PRAGMA. (Today the pool is pinned to one connection
  by the vendored `tauri-plugin-sql` patch — see `src-tauri/Cargo.toml`.)
- Deferred out of this plan: index tuning based on real `EXPLAIN QUERY PLAN`
  output. That belongs with plan 260's measurement step, once the startup path
  stops dominating the profile.
