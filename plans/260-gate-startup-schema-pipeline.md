# Plan 260: Stop re-running the whole schema/repair pipeline on every launch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. This plan touches the schema-upgrade path: a
> mistake here means a user's database never receives a new column. The test
> plan is not optional. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat aa791298..HEAD -- src/data/repositories.ts src/data/migrations.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/259-sqlite-indexes-and-synchronous-pragma.md` — **DONE, merged in `aa791298`**
- **Category**: perf
- **Planned at**: commit `79032d3b`, 2026-07-25; **reconciled to `aa791298` (post-259 merge), 2026-07-25**

## Why this matters

`TauriSqlFinanceRepository.initialize()` runs before the first paint, on every
single app launch, and it unconditionally re-executes the **entire** schema
history plus every one-time data repair ever written. Measured at `79032d3b`:

- 26 migration statements (`create table if not exists` × 17, indexes, etc.)
- **62 `ensureSqliteColumn()` calls, each issuing its own `pragma table_info(...)`
  SELECT** — 62 round trips whose only possible outcome on a settled database is
  "column already there, do nothing"
- ~15 data-repair `UPDATE` statements, several of which are correlated subqueries
  across `ledger_transactions` × `investment_records` × `portfolio_assets`
- 22 `create trigger if not exists` statements
- `backfillSyncOutbox()` — **11 `insert or ignore into sync_outbox … select … from <table>`,
  i.e. a full scan of every synced table, every launch**
- the 帳本 / 信用卡群組 backfills, each with their own queries

Every one of those is **serialized**: `serializeDatabase()`
(`repositories.ts:2867`) funnels all `select`/`execute` through a single-connection
queue, so they run strictly one after another, each a separate Tauri IPC round
trip. That is roughly **150 sequential round trips and 11 full-table scans before
the user sees anything** — and the full-scan portion grows with the user's
history forever.

All of this work is idempotent by design, which is exactly why it can be skipped:
once a database has been brought up to schema generation *N*, re-running
generation *N* cannot change it. This plan records the generation the file has
reached and skips the block when it already matches.

**What this plan does not do**: it does not delete, reorder, or rewrite any
migration, column, repair or backfill. Every statement stays exactly as it is.
The only change is *when* the block runs.

## Current state

### The pipeline (`src/data/repositories.ts:2952-3115`, verified at `aa791298`)

```ts
  override async initialize() {
    for (const migration of migrations) {
      for (const statement of splitSqlStatements(migration.sql)) {
        await this.db.execute(statement);
      }
    }
    await this.ensureSqliteColumn("ledger_transactions", "merchant", "text not null default ''");
    await this.ensureSqliteColumn("ledger_transactions", "name", "text not null default ''");
    // … 60 more ensureSqliteColumn calls, interleaved with data-repair UPDATEs …
    await this.db.execute(`create unique index if not exists idx_ledger_recurring_occurrence ...`);  // line 3098
    // Added by plan 259 — these two MUST move with the block:
    await this.db.execute(`create index if not exists idx_investment_drip_group ...`);  // line 3102
    await this.db.execute(`create index if not exists idx_accounts_book ...`);          // line 3103
    await this.ensureSyncInfrastructure();          // line 3104
    await this.ensureSqliteDefaultBook();           // line 3105
    await this.mergeAndHealBooks();                 // line 3106
    await this.backfillUnassignedAccount();         // line 3107
    await this.backfillCreditGroups();              // line 3108
    await this.ensureDefaultSettings();             // line 3109
    const rows = await this.db.select<Array<{ count: number }>>("select count(*) as count from accounts");
    if ((rows[0]?.count ?? 0) === 0) {
      await this.seedSqlite();                      // line 3112
    }
    await this.backfillSyncOutbox();                // line 3114
    await this.recalculateDerivedData();            // line 3115
  }
```

### The per-column probe (`src/data/repositories.ts:6049-6053`)

```ts
  private async ensureSqliteColumn(table: string, column: string, definition: string) {
    const rows = await this.db.select<Array<{ name: string }>>(`pragma table_info(${table})`);
    if (rows.some((row) => row.name === column)) return;
    await this.db.execute(`alter table ${table} add column ${column} ${definition}`);
  }
```

One SELECT per call. 62 calls in `initialize()`, plus 2 more inside
`ensureSyncInfrastructure()` (`repositories.ts:5865-5866`).

### The outbox backfill (`src/data/repositories.ts:5951-5977`)

```ts
  private async backfillSyncOutbox() {
    const tables: Array<[string, Exclude<SyncEntity, "settings">]> = [
      ["accounts", "account"],
      ["ledger_transactions", "ledger"],
      // … 9 more …
    ];
    for (const [table, entity] of tables) {
      await this.db.execute(
        `insert or ignore into sync_outbox
         (id, space_id, record_type, record_id, revision, created_at, updated_at, deleted_at)
         select '${entity}:' || id || ':' || revision, space_id, '${entity}', id, revision, updated_at, updated_at, deleted_at
         from ${table}`,
      );
    }
    // … settings meta …
  }
```

Note it is **also called from `importSnapshot`/resync at line 5055** — that call
site must keep working unconditionally. Only the `initialize()` call is gated.

### The serialization that makes each round trip sequential (`repositories.ts:2874-2909`)

```ts
function serializeDatabase(db: Database): SerializedDatabase {
  // Statement queue: every execute()/select() runs one at a time → pool only
  // ever uses one connection.
  let tail: Promise<unknown> = Promise.resolve();
  const run = <T,>(op: () => Promise<T>): Promise<T> => {
    const result = tail.then(op, op);
    tail = result.then(noop, noop);
    return result;
  };
```

### There is no schema-version tracking today

`grep -rn "user_version\|schema_version\|schemaVersion" src/data/` returns
**nothing**. Migrations carry an `id` (1..9 — id 9 was added by plan 259, now merged) but
nothing records which ones a given file has seen — hence the unconditional replay.

`PRAGMA user_version` is free to use: the app registers
`tauri_plugin_sql::Builder::default().build()` (`src-tauri/src/lib.rs:270`) with
**no** migrations, and the vendored plugin does not touch `user_version`
(`grep -rn "user_version" src-tauri/vendor/tauri-plugin-sql/src/` → no hits).

### Conventions to match

- Long `//` comments above non-obvious code explaining *why*, often citing the
  plan number — e.g. `repositories.ts:2918-2924`, `:5905-5912`. Match that
  density; this change is exactly the kind that needs it.
- Domain nouns in 繁體中文 where the code already does it (帳本, 信用卡群組,
  股息再投入). Technical rationale in English.
- The dual-repo invariant: `BrowserFinanceRepository` (in-memory) and
  `TauriSqlFinanceRepository` must behave identically — that is what
  `src/data/repositories.testHarness.ts` enforces. **The in-memory repo has no
  schema, so it is unaffected by this plan; do not add a version gate to it.**

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| Migration suite | `npx vitest run src/data/repositories.migration.test.ts` | all pass |
| Sync suite | `npx vitest run src/data/repositories.sync.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/data/repositories.ts` — `initialize()` and one new private helper
- `src/data/migrations.ts` — export the schema-generation constant
- `src/data/repositories.migration.test.ts` — the new tests

**Out of scope** (do NOT touch, even though they look related):
- The **contents** of any migration, `ensureSqliteColumn` call, repair `UPDATE`,
  trigger, or backfill. Not one statement changes. If a statement looks
  redundant or wrong, that is a separate finding — leave it.
- `recalculateDerivedData()` (line 3115) — it stays **outside** the gate and
  keeps running every launch. It is a self-heal for stale derived balances after
  sync, and it already skips unchanged rows (`repositories.ts:6195-6199`,
  `:6209-6219`), so its cost is 2 reads and few writes. Gating it is a separate,
  riskier decision.
- `ensureDefaultSettings()` and the `seedSqlite()` empty-database check (lines
  3109-3113) — they stay outside the gate. They are 1-2 cheap queries and they
  guard first-run correctness.
- The `backfillSyncOutbox()` call at line **5055** (import/resync path) — stays
  unconditional.
- `BrowserFinanceRepository`.
- `serializeDatabase()` — the serialization is deliberate (it exists because the
  vendored `tauri-plugin-sql` pins the pool to one connection; see
  `src-tauri/Cargo.toml`). Do not parallelise it.

## Git workflow

- Branch: `perf/ai-startup-schema-gate` (repo convention is `feat/ai-<name>` /
  `fix/ai-<name>` per `.agentrules`; use `perf/ai-` here since it is neither).
- Conventional commits, e.g. `perf(data): gate the startup schema pipeline on user_version`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define the schema generation constant

In `src/data/migrations.ts`, below the `migrations` array, add:

```ts
/**
 * 資料庫「世代」— the generation of the *whole* startup schema pipeline, not just
 * the `migrations` array above.
 *
 * `TauriSqlFinanceRepository.initialize()` runs a long, strictly idempotent
 * block: the migrations, ~64 `ensureSqliteColumn()` probes, the one-time data
 * repairs, the sync triggers, and the 帳本 / 信用卡群組 / sync_outbox backfills.
 * Re-running that block on a database that has already reached generation N
 * cannot change it — so we stamp the file's `PRAGMA user_version` with this
 * number and skip the block when it already matches. That removes ~150
 * sequential IPC round trips and 11 full-table scans from every cold start
 * (plan 260).
 *
 * ⚠️ BUMP THIS whenever you add ANYTHING to that gated block — a migration, an
 * `ensureSqliteColumn()` call, a repair statement, a trigger, or a backfill.
 * Forgetting to bump it means existing installs never receive your change and
 * will fail at runtime with "no such column". There is a test that fails if the
 * gated block runs on a stamped database, but nothing can detect a forgotten
 * bump for you — treat it as part of writing the migration.
 */
export const SCHEMA_GENERATION = 10;
```

Use `10` (one above the highest migration id, which is 9 after plan 259) so the
number is easy to reason about, but note in review that it is a generation
counter for the whole block — **not** a migration id.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Add the read/write helpers for `user_version`

In `src/data/repositories.ts`, next to `ensureSqliteColumn` (around line 6049),
add two private methods on `TauriSqlFinanceRepository`:

```ts
  /**
   * `PRAGMA user_version` is a plain integer in the SQLite file header — no
   * table, no extra round trip beyond this one read. It is ours to use:
   * tauri-plugin-sql is registered with no migrations (src-tauri/src/lib.rs) and
   * never touches it. A fresh or pre-plan-260 file reads back 0.
   */
  private async readSchemaGeneration(): Promise<number> {
    try {
      const rows = await this.db.select<Array<{ user_version: number }>>("PRAGMA user_version;");
      return Number(rows?.[0]?.user_version ?? 0) || 0;
    } catch {
      // Unreadable pragma → behave as if the file is brand new and run the full
      // pipeline. Never skip on uncertainty.
      return 0;
    }
  }

  private async writeSchemaGeneration(generation: number): Promise<void> {
    // PRAGMA user_version does not accept a bound parameter, so the value is
    // interpolated — it is a module-level integer constant, never user input.
    await this.db.execute(`PRAGMA user_version = ${Math.trunc(generation)};`);
  }
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Extract the gated block into its own method

Still in `src/data/repositories.ts`: move lines 2953-3108 of `initialize()` —
that is, **from** the `for (const migration of migrations)` loop **through**
`await this.backfillCreditGroups();` — verbatim into a new private method.
**This range now includes the three `create index` statements at 3098/3102/3103
that plan 259 added — they move with the block, which is correct: they are
`if not exists` and therefore idempotent.** Target:

```ts
  /**
   * The strictly-idempotent schema + repair block. Every statement here is
   * `if not exists` / `insert or ignore` / a repair whose predicate matches
   * nothing once applied. Gated on SCHEMA_GENERATION by initialize() — see
   * plan 260 and the ⚠️ note on that constant before adding anything here.
   */
  private async runSchemaPipeline() {
    // … the moved statements, unchanged …
  }
```

Do **not** move `ensureDefaultSettings()`, the seed check, `backfillSyncOutbox()`
or `recalculateDerivedData()` yet — that is Step 4.

**Verify**: `npx tsc --noEmit` → exit 0. `npm test` → all pass (behavior is
unchanged so far; this step is a pure extraction).

### Step 4: Move `backfillSyncOutbox()` into the gated block

`backfillSyncOutbox()` is the most expensive item (11 full-table scans) and is
just as idempotent as the rest — `insert or ignore` against the unique index
`idx_sync_outbox_record_revision` (`repositories.ts:5867`). Once the outbox
triggers exist (created by `ensureSyncInfrastructure()`, inside the gated block),
every subsequent write maintains the outbox itself; the backfill only exists to
catch rows written *before* the triggers existed.

Move the `await this.backfillSyncOutbox();` call from line 3114 to the **end of
`runSchemaPipeline()`**, after `backfillCreditGroups()`.

Leave the call at line 5055 (import/resync) exactly where it is.

**Verify**: `npx vitest run src/data/repositories.sync.test.ts` → all pass.
`npm test` → all pass.

### Step 5: Wire the gate

`initialize()` should now read:

```ts
  override async initialize() {
    // The schema + repair block is idempotent by construction, so a file already
    // stamped at the current generation cannot be changed by re-running it.
    // Skipping it removes ~150 sequential IPC round trips and 11 full-table
    // scans from every cold start (plan 260). A fresh file, or one written by a
    // build before this gate existed, reads 0 and runs the full pipeline.
    const generation = await this.readSchemaGeneration();
    if (generation < SCHEMA_GENERATION) {
      await this.runSchemaPipeline();
      await this.writeSchemaGeneration(SCHEMA_GENERATION);
    }

    // Deliberately OUTSIDE the gate — cheap, and load-bearing on every launch:
    // ensureDefaultSettings() guards first-run defaults, the accounts count
    // seeds an empty file, and recalculateDerivedData() self-heals derived
    // balances that a sync may have left stale (it skips unchanged rows).
    await this.ensureDefaultSettings();
    const rows = await this.db.select<Array<{ count: number }>>("select count(*) as count from accounts");
    if ((rows[0]?.count ?? 0) === 0) {
      await this.seedSqlite();
    }
    await this.recalculateDerivedData();
  }
```

Import `SCHEMA_GENERATION` from `./migrations` — extend the existing import at
`repositories.ts:46`:

```ts
import { migrations, SCHEMA_GENERATION, splitSqlStatements } from "./migrations";
```

Use `generation < SCHEMA_GENERATION` (not `!==`) so a file somehow stamped with a
*higher* number — e.g. after a downgrade — is left alone rather than having an
older pipeline replayed over it.

**Verify**: `npx tsc --noEmit` → exit 0. `npm test` → all pass.

### Step 6: Full verification pass

**Verify**, in order, each exiting 0:
1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm test`
4. `npm run build`

## Test plan

All new tests go in `src/data/repositories.migration.test.ts`. Read that file
first and match its harness (it builds a real SQLite repository via
`createSqliteFinanceRepositoryForTests` from `src/data/repositories.ts:542`).

1. **A fresh database runs the pipeline and gets stamped.**
   Create a repository on an empty database; assert `PRAGMA user_version` reads
   back `SCHEMA_GENERATION`, and assert the schema is complete — e.g.
   `pragma table_info(ledger_transactions)` contains `post_date` and `leg_kind`
   (two of the late-added columns), and `sqlite_master` contains the
   `sync_outbox_ledger_insert` trigger.

2. **A second `initialize()` skips the pipeline.** This is the core assertion.
   Call `initialize()` again on the same database and prove the block did not
   run. The cleanest way with no production-code instrumentation: **spy on the
   `db.execute` used by the test harness** and assert that the second
   `initialize()` issues no `create trigger` and no `pragma table_info`
   statement. If the harness makes spying awkward, the acceptable alternative is
   to count statements via a wrapper passed to
   `createSqliteFinanceRepositoryForTests` — but do **not** add a counter to
   production code to make the test possible.

3. **A stale database is upgraded.** Take a fully-initialized database, force
   `PRAGMA user_version = 0`, then run `initialize()` again and assert (a) it
   completes without error, (b) `user_version` is back to `SCHEMA_GENERATION`,
   and (c) the data is unchanged — same row counts in `accounts`,
   `ledger_transactions`, `investment_records` before and after. This is the
   test that proves an existing install upgrades safely.

4. **A pre-gate database with a missing column is repaired.** Build a database,
   then simulate an old install: `PRAGMA user_version = 0` **and** drop a
   late-added artifact if SQLite allows it (`alter table ledger_transactions drop column leg_kind`
   works on modern SQLite; if it fails on the bundled version, instead assert
   case 3 and note the limitation in a comment rather than skipping the test).
   Run `initialize()` and assert the column is back.

5. **The outbox backfill still works on the import path.** `npx vitest run src/data/repositories.sync.test.ts`
   must pass unchanged — it covers the line-5055 call site that this plan
   deliberately left ungated.

Verification: `npm test` → all pass, including the 4 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0, with the 4 new tests in
      `src/data/repositories.migration.test.ts` passing
- [ ] `npm run build` exits 0
- [ ] `grep -c "SCHEMA_GENERATION" src/data/repositories.ts` returns at least 2
- [ ] `grep -n "runSchemaPipeline" src/data/repositories.ts` shows exactly one
      definition and one call site
- [ ] `grep -c "backfillSyncOutbox" src/data/repositories.ts` returns 3
      (definition, the gated call, the import/resync call at ~5055)
- [ ] `git diff -- src/data/repositories.ts | grep -E "^[-+].*(ensureSqliteColumn|create trigger|insert or ignore)" | grep -vE "^[-+]\s*$"`
      shows only **moved** lines (equal counts of `+` and `-` for each) — proof
      that no statement was added, deleted or edited
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Migration id 9 is absent from `src/data/migrations.ts` (plan 259 landed in
  `aa791298`; if it is missing, you are on the wrong base commit).
- The code at lines 2952-3115 does not match the "Current state" excerpt.
- Test 3 or 4 fails — that means the gate does not correctly upgrade an existing
  install, which is the one outcome that must never ship. Report the failure;
  **do not weaken the test.**
- You find a statement inside the block that is **not** idempotent — i.e.
  re-running it would change data (anything that is not `if not exists`,
  `insert or ignore`, or an `update` whose `where` clause stops matching once
  applied). That would mean the current code has a pre-existing bug and the gate
  changes its behavior. Report it with the line number.
- Extracting the block turns out to need a change to any statement's text.
- `PRAGMA user_version` reads back a non-zero value on a brand-new database —
  something else is using it, and the whole approach needs rethinking.

## Maintenance notes

- **The single most important thing for reviewers**: any PR that adds a
  migration, an `ensureSqliteColumn()`, a repair, a trigger, or a backfill
  **must** bump `SCHEMA_GENERATION` in `src/data/migrations.ts`. This is the new
  failure mode this plan introduces, and it is silent on the author's machine
  (their DB is fresh) while breaking every existing install. Consider it the
  first thing to check on any `src/data/` schema PR.
- The gate is deliberately conservative: it skips only work that is provably
  idempotent. `recalculateDerivedData()`, `ensureDefaultSettings()` and the seed
  check still run every launch.
- Deferred out of this plan, in rough order of value:
  1. `ensureSqliteColumn()` still issues one `pragma table_info` per column even
     inside the gated block. Probing each table **once** and reusing the column
     set would cut 64 round trips to ~8 on the upgrade path. Cheap follow-up.
  2. `recalculateDerivedData()` could be gated on a dirty-flag set by the sync
     apply path instead of running unconditionally.
  3. The 14 eager table loads that follow initialize — see
     `plans/261-bound-market-history-loads.md`.
- If a future change makes part of the block genuinely non-idempotent, it does
  not belong in `runSchemaPipeline()` — put it outside the gate with a comment
  saying why.
