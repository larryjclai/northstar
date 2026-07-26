# Plan 268: Separate schema DDL from data healing, and make the startup gate self-invalidating

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. This plan touches the schema-upgrade path: a
> mistake means a user's database never receives a new column, or a data
> self-heal silently stops running. The test plan is not optional.
>
> **This plan supersedes `plans/260-gate-startup-schema-pipeline.md`, which was
> BLOCKED after execution proved its central premise wrong.** Read the
> post-mortem below — it is the reason this plan is shaped the way it is.
>
> **Drift check (run first)**:
> `git diff --stat 72fc7a7f..HEAD -- src/data/repositories.ts src/data/migrations.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/259-sqlite-indexes-and-synchronous-pragma.md` — DONE, merged in `aa791298`
- **Supersedes**: `plans/260-gate-startup-schema-pipeline.md` (BLOCKED)
- **Category**: perf
- **Planned at**: commit `72fc7a7f`, 2026-07-25

## Why this matters

`TauriSqlFinanceRepository.initialize()` runs before the first paint on every
launch. Measured at `72fc7a7f`:

- 26 migration statements
- **64 `ensureSqliteColumn()` calls, each issuing its own `pragma table_info(...)`
  SELECT** — 62 in `initialize()` plus 2 in `ensureSyncInfrastructure()`.
  **Count them with `grep -c "await this.ensureSqliteColumn("`, not by grepping
  the bare identifier** — a comment at `repositories.ts:3099` mentions the
  function by name and inflates a naive count to 65.
- 3 `create index` + 22 `create trigger`
- 13 row-touching repair/backfill statements
- `backfillSyncOutbox()` — 11 `insert or ignore … select … from <table>`, a full
  scan of every synced table
- the 帳本 / 信用卡群組 backfills and `recalculateDerivedData()`

Every one is **serialized** through `serializeDatabase()`
(`repositories.ts:2874`), one Tauri IPC round trip each. That is roughly **150
sequential round trips before the user sees anything.**

### The post-mortem that shapes this plan

Plan 260 tried to gate that whole block behind `PRAGMA user_version`. It failed
in execution, and the failure was instructive:

1. **`repositories.creditGroup.test.ts` broke (2 tests).** `backfillCreditGroups()`
   is not one-time schema work — it is an **ongoing self-heal**. An account synced
   from an older client can arrive at any time carrying a legacy free-text
   `credit_limit_group` and no `credit_group_id`. Gate it and that account is
   never healed.
2. Two siblings have the identical property, and **the code says so in its own
   comments**:
   - `backfillUnassignedAccount()` — *"Runs every initialize() pass but is
     idempotent"* (`repositories.ts:6156-6157`)
   - `mergeAndHealBooks()` — *"at every wired call site (initialize,
     importSnapshot, applySyncChanges…)"* (`repositories.ts:3186-3187`), and it
     really is called from `:5249` and `:5414` too.
3. **Worse, the repairs are interleaved with the column adds.** The opening-lot
   insert, the cashless-leak repair and the manual/transactions asset merge sit
   *between* `ensureSqliteColumn` calls (lines 2999-3069). So "extract lines X-Y
   verbatim" — plan 260's whole approach — cannot separate them.

The lesson: **"schema work" and "data healing" are two different lifetimes that
this function has always mixed together.** Gating cannot be bolted on. They have
to be separated first.

### What this plan does instead

Two independent changes, in order, each valuable on its own:

**Phase A — collapse the probes (no gate, no risk).** 64 `pragma table_info`
calls cover only **7 distinct tables**. Read each table's columns *once* and
reuse. 64 round trips → 7, unconditionally, with zero behavioral change and
nothing gated. This is most of the win and it carries essentially no risk.

**Phase B — a DDL-only phase behind a self-invalidating fingerprint.** Move every
DDL statement (and *only* DDL) into `runSchemaDdl()`, leave every row-touching
statement running unconditionally, and skip the DDL phase when the schema
definition has not changed.

The gate's key property, and the reason this plan is worth the effort:
**it invalidates itself.** Plan 260 used a hand-maintained `SCHEMA_GENERATION`
constant, whose failure mode was silent and catastrophic — forget to bump it and
existing installs never get your new column. Here the stamp is a **fingerprint
computed from the DDL definition itself**. Add a column, an index, a migration or
a trigger and the fingerprint changes automatically, so the DDL phase re-runs.
Nobody has to remember anything. That is what makes this maintainable long-term.

## Current state

### The classification — every statement in `initialize()` (verified at `72fc7a7f`)

This table is the heart of the plan. **DDL may be gated; anything that touches
rows may not.**

| Lines | What | Class |
|---|---|---|
| 2953-2957 | `migrations` loop (`create table/index if not exists`) | **DDL** |
| 2958-2998 | 40 × `ensureSqliteColumn` | **DDL** |
| 2999-3001 | `update portfolio_assets set base_quantity = total_quantity …` | **DATA** |
| 3008 | `ensureSqliteColumn(investment_records, cashless)` | **DDL** |
| 3016-3026 | cashless-leak repair (2 × `update`) | **DATA** |
| 3028 | `ensureSqliteColumn(investment_records, drip_group_id)` | **DDL** |
| 3029-3037 | opening-lot `insert … select … where not exists` | **DATA** |
| 3044-3069 | manual/transactions asset merge (2 × `update`) | **DATA** |
| 3073-3097 | 20 × `ensureSqliteColumn` | **DDL** |
| 3098, 3102, 3103 | 3 × `create index` | **DDL** |
| 3104 | `ensureSyncInfrastructure()` — 2 × `ensureSqliteColumn`, 1 × `create unique index`, 22 × `create trigger` | **DDL** |
| 3105 | `ensureSqliteDefaultBook()` — inserts a book, backfills `book_id = ''` | **DATA** |
| 3106 | `mergeAndHealBooks()` | **DATA** |
| 3107 | `backfillUnassignedAccount()` | **DATA** |
| 3108 | `backfillCreditGroups()` | **DATA** |
| 3109 | `ensureDefaultSettings()` | **DATA** |
| 3110-3113 | accounts count → `seedSqlite()` | **DATA** |
| 3114 | `backfillSyncOutbox()` | **DATA** (see note below) |
| 3115 | `recalculateDerivedData()` | **DATA** |

**On `backfillSyncOutbox()`**: it is arguably terminal — once the triggers exist,
local writes maintain the outbox themselves, and sync-applied writes deliberately
suppress it. **This plan still classifies it DATA and leaves it ungated.** The
failure mode if that reasoning is wrong is a record that silently never syncs,
which is far worse than 11 scans. Making it cheaper is listed as deferred work,
not done here. Do not gate it.

### The probe that Phase A fixes (`src/data/repositories.ts:6049-6053`)

```ts
  private async ensureSqliteColumn(table: string, column: string, definition: string) {
    const rows = await this.db.select<Array<{ name: string }>>(`pragma table_info(${table})`);
    if (rows.some((row) => row.name === column)) return;
    await this.db.execute(`alter table ${table} add column ${column} ${definition}`);
  }
```

One SELECT per call. The 64 calls touch only these 7 tables:

| Table | Calls |
|---|---|
| `ledger_transactions` | 16 |
| `accounts` | 14 |
| `financial_goals` | 13 |
| `portfolio_assets` | 11 |
| `recurring_transactions` | 6 |
| `investment_records` | 2 |
| `sync_outbox` | 2 (inside `ensureSyncInfrastructure`) |

### The migration array (`src/data/migrations.ts:1-11`, ids 1..9)

```ts
export interface Migration {
  id: number;
  description: string;
  sql: string;
}

export const migrations: Migration[] = [ … ];

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
```

### `PRAGMA user_version` is free to use

`grep -rn "user_version\|schema_version" src/data/` → nothing. The app registers
`tauri_plugin_sql::Builder::default().build()` (`src-tauri/src/lib.rs:270`) with
**no** migrations, and the vendored plugin never touches `user_version`
(`grep -rn "user_version" src-tauri/vendor/tauri-plugin-sql/src/` → no hits).

It is a signed 32-bit integer, so any fingerprint must be masked into
`0 … 0x7fffffff`.

### ⚠️ One real behavior change this plan causes

Today the data repairs at 2999-3069 run **before** `ensureSyncInfrastructure()`
creates the sync triggers (3104). After Phase B, all DDL — including the triggers
— runs first, so those repairs will fire the outbox triggers and enqueue sync
rows they previously did not.

In practice this only differs on a database whose triggers do not yet exist, i.e.
a brand-new file (where the repairs match nothing) or a pre-sync-era upgrade. And
the repairs' own comments say they *want* to propagate: *"Revision/updated_at are
bumped so the repair wins last-write-wins and propagates over sync."* So the new
ordering is arguably more correct — but it **is** a change, and Test 6 pins it.

### Conventions to match

- Long `//` comments citing the plan number for non-obvious code — e.g.
  `repositories.ts:2925-2931`, `:5917-5924`.
- 繁體中文 for domain nouns already written that way (帳本, 信用卡群組, 股息再投入);
  English for technical rationale.
- Dual-repo invariant: `BrowserFinanceRepository` (in-memory) and
  `TauriSqlFinanceRepository` behave identically —
  `src/data/repositories.testHarness.ts` enforces it. **The in-memory repo has no
  schema; do not add any of this to it.**

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 129 files / 1498 tests pass |
| Migration suite | `npx vitest run src/data/repositories.migration.test.ts` | all pass |
| Credit-group suite | `npx vitest run src/data/repositories.creditGroup.test.ts` | all pass |
| Sync suite | `npx vitest run src/data/repositories.sync.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/data/migrations.ts` — the declarative DDL lists and the fingerprint helper
- `src/data/repositories.ts` — `initialize()`, `ensureSqliteColumn`,
  `ensureSyncInfrastructure`, and the new private methods
- `src/data/repositories.migration.test.ts` — new tests

**Out of scope** (do NOT touch):
- **The text of any SQL statement.** Statements move between methods; not one
  changes its text. If your diff shows altered SQL, you have gone wrong.
- The **relative order of the DATA statements** among themselves. The
  `base_quantity` update must still precede the opening-lot insert that reads it.
- `backfillSyncOutbox()` — stays ungated, unchanged, in its current position.
- `recalculateDerivedData()`, `ensureDefaultSettings()`, the seed check.
- `BrowserFinanceRepository`.
- `serializeDatabase()` — the single-connection serialization is deliberate
  (vendored `tauri-plugin-sql` pins the pool to 1; see `src-tauri/Cargo.toml`).
  Do not parallelise it.
- `plans/README.md` — your reviewer maintains it.

## Git workflow

- Branch: `perf/ai-schema-ddl-phase`
- Commits, one per phase so they can be reviewed and reverted independently:
  1. `perf(data): probe each table's columns once instead of per column`
  2. `refactor(data): split schema DDL from data healing in initialize()`
  3. `perf(data): skip the DDL phase when the schema fingerprint is unchanged`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm your base

```bash
git log --oneline -1          # expect 72fc7a7f (or later on main)
grep -c "await this.ensureSqliteColumn(" src/data/repositories.ts   # expect 64
npm test                      # expect 129 files / 1498 tests passing
```

If the test baseline is not 1498 passing, STOP — you are not on a clean base.

### Step 1 (Phase A): Probe each table once

Replace the per-column `pragma table_info` with a per-table cache. In
`src/data/repositories.ts`, add a private field and rewrite `ensureSqliteColumn`:

```ts
  /**
   * Cache of `pragma table_info` results, keyed by table. The 64
   * ensureSqliteColumn() calls in initialize() cover only 7 distinct tables, so
   * probing per column cost 64 serialized IPC round trips where 7 suffice
   * (plan 268). Populated lazily; invalidated for a table whenever we add a
   * column to it, so the cache can never go stale within a run.
   */
  private tableColumnsCache = new Map<string, Set<string>>();

  private async readTableColumns(table: string): Promise<Set<string>> {
    const cached = this.tableColumnsCache.get(table);
    if (cached) return cached;
    const rows = await this.db.select<Array<{ name: string }>>(`pragma table_info(${table})`);
    const columns = new Set(rows.map((row) => row.name));
    this.tableColumnsCache.set(table, columns);
    return columns;
  }

  private async ensureSqliteColumn(table: string, column: string, definition: string) {
    const columns = await this.readTableColumns(table);
    if (columns.has(column)) return;
    await this.db.execute(`alter table ${table} add column ${column} ${definition}`);
    columns.add(column);
  }
```

Note `columns.add(column)` after a successful `alter` — the cached set stays
truthful for the rest of the run.

**Important**: the cache lives for the life of the repository instance. The
migrations loop runs before any `ensureSqliteColumn`, and nothing else adds
columns at runtime, so this is safe. If you find any other code path that alters
a table, STOP and report.

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → 129 files / 1498 tests pass (unchanged)
- Behavior is identical by construction; this step gates nothing.

Commit as commit 1.

### Step 2 (Phase B-1): Make the DDL declarative

In `src/data/migrations.ts`, below `migrations`, add the DDL definition as
**data**, so it can be both executed and fingerprinted:

```ts
/**
 * Additive columns applied after the `migrations` array. SQLite has no
 * `add column if not exists`, so these are applied by probing the table first
 * (see TauriSqlFinanceRepository.ensureSqliteColumn).
 *
 * This list is DECLARATIVE ON PURPOSE (plan 268): it is both the thing that gets
 * executed and the thing that gets fingerprinted, so adding a column here
 * automatically invalidates the startup DDL gate. Never apply a column by
 * calling ensureSqliteColumn() directly from initialize() — it would run, but it
 * would not be part of the fingerprint, and existing installs would silently
 * miss it.
 */
export const ADDITIVE_COLUMNS: ReadonlyArray<readonly [table: string, column: string, definition: string]> = [
  ["ledger_transactions", "merchant", "text not null default ''"],
  // … every ensureSqliteColumn call from initialize(), IN THE SAME ORDER …
  ["sync_outbox", "updated_at", "text"],
  ["sync_outbox", "deleted_at", "text"],
] as const;

/** Indexes that cannot live in a migration because their column is added above. */
export const ADDITIVE_INDEXES: readonly string[] = [
  `create unique index if not exists idx_ledger_recurring_occurrence on ledger_transactions (recurring_occurrence_key) where recurring_occurrence_key is not null and deleted_at is null`,
  `create index if not exists idx_investment_drip_group on investment_records (drip_group_id) where drip_group_id is not null and deleted_at is null`,
  `create index if not exists idx_accounts_book on accounts (book_id) where deleted_at is null`,
];
```

Move **all 64** `ensureSqliteColumn` calls into `ADDITIVE_COLUMNS`, preserving
order, including the 2 `sync_outbox` ones currently inside
`ensureSyncInfrastructure()`. Carry each call's explanatory comment across as a
comment on the corresponding entry — those comments (帳本, 信用卡群組, DRIP) are
load-bearing documentation.

Then add the fingerprint:

```ts
/**
 * Fingerprint of the entire DDL definition: the migrations, the additive
 * columns, the additive indexes, and the sync-trigger entity list. Stamped into
 * `PRAGMA user_version` after the DDL phase runs, and compared on the next
 * launch to decide whether the phase can be skipped (plan 268).
 *
 * SELF-INVALIDATING BY DESIGN. There is no constant to bump: change any DDL
 * above and this number changes, so the phase re-runs on every existing install.
 * That is the whole point — a hand-maintained version constant fails silently
 * when someone forgets it, and "existing databases never get the new column" is
 * the worst bug this area can produce.
 *
 * FNV-1a, masked to 31 bits because PRAGMA user_version is a signed 32-bit int.
 * Collision risk is irrelevant here: a collision means one skipped DDL pass on
 * one schema revision, and every statement in that pass is `if not exists`
 * anyway — the next change re-runs it.
 */
export function schemaFingerprint(): number {
  const source = JSON.stringify([
    migrations.map((m) => [m.id, m.sql]),
    ADDITIVE_COLUMNS,
    ADDITIVE_INDEXES,
    SYNC_TRIGGER_ENTITIES,
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}
```

`SYNC_TRIGGER_ENTITIES` is the `tables` array currently duplicated inside
`ensureSyncInfrastructure()` and `backfillSyncOutbox()` (`repositories.ts:5881-5893`
and `:5952-5964`). Export it from `migrations.ts` and have **both** call sites
import it, so the trigger set and the backfill set can never drift apart.

**Verify**:
- `npx tsc --noEmit` → exit 0
- `node -e "import('./src/data/migrations.ts')"` is not runnable directly; instead
  add a temporary test asserting `ADDITIVE_COLUMNS.length === 64` and
  `schemaFingerprint()` returns a stable positive integer across two calls, then
  run `npx vitest run src/data/repositories.migration.test.ts`.

### Step 3 (Phase B-2): Split `initialize()` into a DDL phase and a healing phase

Rewrite `initialize()` so the two lifetimes are structurally separate:

```ts
  /**
   * Schema DDL only. Every statement here is `create … if not exists` or an
   * `alter table … add column` guarded by a probe — i.e. provably terminal: once
   * applied to a database it can never need applying again.
   *
   * ⚠️ NOTHING THAT TOUCHES ROWS MAY GO IN THIS METHOD. It is skipped whenever
   * the schema fingerprint is unchanged, so a data statement placed here would
   * silently stop running. Data repairs and backfills belong in
   * runDataHealing() — see plan 268 and the 260 post-mortem.
   */
  private async runSchemaDdl() {
    for (const migration of migrations) {
      for (const statement of splitSqlStatements(migration.sql)) {
        await this.db.execute(statement);
      }
    }
    for (const [table, column, definition] of ADDITIVE_COLUMNS) {
      await this.ensureSqliteColumn(table, column, definition);
    }
    for (const sql of ADDITIVE_INDEXES) {
      await this.db.execute(sql);
    }
    await this.ensureSyncTriggers();
  }

  /**
   * Data repairs, backfills and self-heals. These run on EVERY launch and must
   * never be gated: a row that needs healing can arrive at any time via sync
   * from an older client or an import — not only when the schema changes.
   * Plan 260 tried to gate these and broke the credit-group self-heal.
   *
   * Order matters and is preserved from the original initialize():
   * base_quantity is set before the opening-lot insert reads it.
   */
  private async runDataHealing() {
    // … the 13 row-touching statements, in their original relative order …
    // … then ensureSqliteDefaultBook / mergeAndHealBooks /
    //     backfillUnassignedAccount / backfillCreditGroups …
  }

  override async initialize() {
    // DDL is skipped when the schema definition is byte-identical to what this
    // database was last stamped with. The fingerprint is derived from the DDL
    // itself, so it invalidates automatically when the schema changes — there is
    // no constant to forget to bump (plan 268).
    const fingerprint = schemaFingerprint();
    if (await this.readSchemaFingerprint() !== fingerprint) {
      await this.runSchemaDdl();
      await this.writeSchemaFingerprint(fingerprint);
    }

    // Never gated. See runDataHealing()'s doc comment.
    await this.runDataHealing();
    await this.ensureDefaultSettings();
    const rows = await this.db.select<Array<{ count: number }>>("select count(*) as count from accounts");
    if ((rows[0]?.count ?? 0) === 0) {
      await this.seedSqlite();
    }
    await this.backfillSyncOutbox();
    await this.recalculateDerivedData();
  }
```

Split `ensureSyncInfrastructure()` into `ensureSyncTriggers()` (the DDL: the
`sync_runtime_flags` table, the `sync_conflicts` table, the unique index, and the
22 triggers — all `if not exists`) and leave nothing row-touching in it. Its two
`ensureSqliteColumn("sync_outbox", …)` calls have already moved into
`ADDITIVE_COLUMNS` in Step 2; delete them from here.

Add the fingerprint accessors next to `ensureSqliteColumn`:

```ts
  private async readSchemaFingerprint(): Promise<number> {
    try {
      const rows = await this.db.select<Array<{ user_version: number }>>("PRAGMA user_version;");
      return Number(rows?.[0]?.user_version ?? 0) || 0;
    } catch {
      // Unreadable pragma → treat as "never stamped" and run the full DDL phase.
      // Never skip on uncertainty.
      return 0;
    }
  }

  private async writeSchemaFingerprint(fingerprint: number): Promise<void> {
    // PRAGMA does not accept bound parameters; the value is a locally-computed
    // integer, never user input.
    await this.db.execute(`PRAGMA user_version = ${Math.trunc(fingerprint)};`);
  }
```

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → **129 files / 1498 tests pass.** In particular
  `repositories.creditGroup.test.ts` must pass — that is the suite plan 260 broke.
- `git diff` shows SQL statements **moved**, never edited. Report the
  moved-line counts.

### Step 4: Prove the round-trip reduction

Add a temporary counter around `this.db.select`/`this.db.execute` (or wrap the
test harness's db) and record, for a **fresh** database and for a **second**
`initialize()` on the same database:

- total `select` + `execute` calls
- how many are `pragma table_info`

Expected shape: first run ≈ unchanged in count except `pragma table_info` drops
from 64 to 7; second run drops by the whole DDL phase (26 migrations + 7 probes +
3 indexes + ~24 sync-infrastructure statements).

Record both numbers in your report, then **remove the instrumentation**.

**Verify**: numbers recorded; `git diff | grep -c "console.log"` → 0.

### Step 5: Full verification pass

**Verify**, in order, each exiting 0:
1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm test` — 129 files / 1498 tests + your new tests
4. `npm run build`

## Test plan

All in `src/data/repositories.migration.test.ts` unless noted. Read the file
first and match its harness (`makeRawDb()` + `createSqliteFinanceRepositoryForTests`).

1. **Fresh database gets the full schema and a stamp.** After
   `createSqliteFinanceRepositoryForTests`, assert `PRAGMA user_version` equals
   `schemaFingerprint()` and is non-zero, and that late-added columns exist
   (`pragma table_info(ledger_transactions)` contains `post_date` and `leg_kind`).

2. **Second `initialize()` skips the DDL phase.** Spy on the db passed to the
   harness and assert the second call issues **no** `pragma table_info`, no
   `create trigger`, and no `alter table`. Do not add a counter to production
   code to make this testable.

3. **A changed fingerprint re-runs the DDL.** Force `PRAGMA user_version = 1`,
   then `initialize()` again, and assert (a) it completes, (b) `user_version` is
   back to `schemaFingerprint()`, (c) row counts in `accounts`,
   `ledger_transactions`, `investment_records` are unchanged.

4. **A missing column is restored on an upgrade.** Set `user_version = 0`, drop a
   late-added column if the bundled SQLite supports
   `alter table … drop column` (if not, assert case 3 and note the limitation in
   a comment — do not silently skip).

5. **The self-heals still run on a second `initialize()` — the regression tests
   for plan 260's failure.** Three separate cases, each: initialize once, then
   introduce a row needing healing, then initialize again and assert it was
   healed.
   - **credit groups**: an account with `credit_limit_group` set and
     `credit_group_id` null → gets grouped. (`repositories.creditGroup.test.ts`
     already covers this; confirm it passes and add a comment there pointing at
     this plan.)
   - **unassigned account**: an investment record with no `linked_account_id` →
     gets the sentinel account.
   - **default book**: an account with `book_id = ''` → gets the default 個人帳.

   These three tests are the point of this plan. If any is missing, the next
   person to "optimise" `initialize()` will reintroduce the same bug.

6. **Trigger-ordering change is pinned.** On a fresh database, assert the outbox
   state after `initialize()` is what you observe post-change, and add a comment
   explaining that DDL (including triggers) now precedes the data repairs, so
   repairs enqueue outbox rows they previously could not. If this test reveals
   duplicated or unexpected outbox rows, STOP and report — that is a real
   regression, not a test to adjust.

Verification: `npm test` → all pass, including the new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0 with **at least** 1498 passing, plus the new tests
- [ ] `npx vitest run src/data/repositories.creditGroup.test.ts` passes
- [ ] `grep -c "await this.ensureSqliteColumn(" src/data/repositories.ts` returns 1
      (the single call inside the `ADDITIVE_COLUMNS` loop) — i.e. no per-column
      calls remain in `initialize()`
- [ ] `ADDITIVE_COLUMNS.length` is 64
- [ ] `grep -n "runSchemaDdl\|runDataHealing" src/data/repositories.ts` shows one
      definition and one call site each
- [ ] `grep -c "backfillSyncOutbox" src/data/repositories.ts` returns 3
      (definition, the ungated `initialize()` call, the import/resync call)
- [ ] No `update `/`insert into ` statement appears inside `runSchemaDdl()`
- [ ] Round-trip counts from Step 4 recorded in the report
- [ ] `git diff --name-only` lists only the three in-scope files

## STOP conditions

Stop and report back (do not improvise) if:

- The Step 0 baseline is not 1498 passing tests.
- **`repositories.creditGroup.test.ts` fails at any point.** That is the exact
  failure that blocked plan 260. Do not modify that test.
- Any of the three Test-5 self-heal cases fails — a self-heal has been gated.
- You need to change the *text* of any SQL statement, or the relative order of
  the DATA statements.
- Test 6 shows duplicated or missing outbox rows.
- You find another code path (outside `initialize()`) that alters a table's
  columns, which would make the Step 1 column cache unsafe.
- You are tempted to put `backfillSyncOutbox()` inside `runSchemaDdl()` because
  it "looks terminal". It is deliberately excluded; report the argument instead.
- `ADDITIVE_COLUMNS.length` does not come out at 64 — you dropped or duplicated
  a column while transcribing. (Verified at `72fc7a7f`:
  `grep -c "await this.ensureSqliteColumn(" src/data/repositories.ts` → 64,
  `sort -u` on the (table, column) pairs → 64, i.e. no duplicates.)

## Maintenance notes

- **The one rule that keeps this correct**: `runSchemaDdl()` contains DDL only.
  A reviewer can check it mechanically — if a statement touches rows, it is in
  the wrong method. That rule is the whole safety model, and it is why this plan
  separates the phases rather than gating the existing mixed block.
- **Adding a column**: append to `ADDITIVE_COLUMNS`. Nothing else. The
  fingerprint changes automatically and every existing install re-runs the DDL
  phase. Never call `ensureSqliteColumn()` directly from `initialize()` — it
  would work on your machine and silently skip on everyone else's.
- **Adding a synced entity**: add it to `SYNC_TRIGGER_ENTITIES`, which now feeds
  both the trigger creation and `backfillSyncOutbox()`. They can no longer drift.
- The column cache is per repository instance and only valid because nothing
  alters tables at runtime. If that ever changes, the cache must be invalidated
  at the alter site.
- Deferred, in order of remaining value:
  1. **`backfillSyncOutbox()` is now the largest remaining startup cost** — 11
     full-table scans, every launch, ungated on purpose. The safe fix is to make
     it cheap rather than skip it: add a `not exists` anti-join against
     `sync_outbox`, or track a fingerprint of `SYNC_TRIGGER_ENTITIES` so it
     re-runs only when the entity set changes. Worth its own plan.
  2. `recalculateDerivedData()` could be driven by a dirty flag set by the sync
     apply path instead of running unconditionally.
  3. The 13 data-healing statements are all unbounded `update … where`
     predicates. Once the schema gate lands they are the bulk of the remaining
     per-launch work, and several could be bounded by an index or a marker.
