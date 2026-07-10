# Plan 127: Test the SQLite migration + data-repair chain against legacy schemas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/data/repositories.ts src/data/migrations.ts`
> Re-locate by grep; STOP on shape mismatch in `initialize()`.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW to add; may reveal non-idempotent repairs (the point)
- **Depends on**: plans/126 (uses its SQLite test factory knowledge; can run
  in parallel if you read `createSqliteFinanceRepositoryForTests` yourself)
- **Category**: tests
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

`TauriSqlFinanceRepository.initialize()` is the de-facto migration engine.
On every app launch it runs the CREATE-TABLE migrations, then ~60
`ensureSqliteColumn(...)` runtime ALTERs, then **data-mutating repairs**:
base_quantity backfill, opening-lot materialization
(`insert ... 'inv_open_' || a.id`), the opening-lot cash-leak repair
(tombstones settled ledger legs), and a manual/transaction asset merge. This
chain runs against real users' money data after every update — and no test
exercises it on anything but a FRESH database, where every ALTER is a no-op
and every repair matches zero rows. A regression here silently corrupts
existing users' balances. These tests are also the safety net plans 125 and
the repositories refactor (future) stand on.

## Current state

- `src/data/migrations.ts` — 4 migrations, all `create table if not exists`
  (lines ~9/171/194/210). No ALTER migrations exist; schema evolution happens
  at runtime.
- `src/data/repositories.ts:2005` — `initialize()`:
  - `:2011-2141` — the `ensureSqliteColumn` calls (each does
    `alter table ... add column` when missing; implementation ~line 4320).
  - `:2059-2072` — cash-leak repair (updates + tombstones ledger legs of
    opening lots; the shipped fix from plan 096).
  - `:2075-2100` — manual + transaction asset merge (dedupes
    `portfolio_assets` rows for the same ticker).
- SQLite test factory: `createSqliteFinanceRepositoryForTests`
  (`repositories.ts:~418`); setup patterns in
  `src/data/repositories.sqlite-tx.test.ts`.

Read `initialize()` fully before writing fixtures — the list above is a map,
not an inventory.

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Tests     | `npm test -- repositories.migration` | pass |
| All tests | `npm test`     | all pass            |
| Typecheck | `npx tsc`      | exit 0              |

## Scope

**In scope**:
- New `src/data/repositories.migration.test.ts`
- A fixtures helper in the same file (raw-SQL legacy schema builders)

**Out of scope**:
- Fixing any repair bug you find (report as DIVERGENCE items).
- Changing `initialize()` / `migrations.ts` — except that if a repair is
  provably non-idempotent, you may NOT fix it here; report it.
- Introducing a schema-version table (a design decision; report if the tests
  make its absence painful).

## Git workflow

- Branch: `feat/ai-migration-tests`
- Commit: `test(data): legacy-schema migration + repair chain coverage`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Build the "legacy DB" fixture mechanism

The test needs a database whose schema/data predates current code. Mechanism:
obtain the raw DB handle the way the SQLite test factory does (read it; the
factory wraps a driver with `select/execute`). Create tables with RAW SQL
that mirrors an OLDER shape — practically: copy the current CREATE TABLE from
`migrations.ts` migration 1 and REMOVE the columns that `initialize()`'s
`ensureSqliteColumn` calls add (pick 3 representative ones you can verify by
reading the ensure list, e.g. a ledger column, an assets column, a recurring
column). Then insert seed rows WITHOUT those columns.

If the factory offers no path to a raw pre-seeded DB (it may force
`initialize()` immediately), STOP and report the factory's exact construction
sequence — a `createUninitializedSqliteForTests` addition would then need a
1-line production change, which requires review.

**Verify**: a test creating the legacy DB and selecting from it passes.

### Step 2: Upgrade test

Test 1 — schema upgrade: legacy DB from Step 1 → construct the repository →
`initialize()` → assert: (a) the removed columns now exist (PRAGMA
table_info), (b) seeded rows still readable through repository list methods,
(c) seeded balances unchanged where no repair applies.

**Verify**: `npm test -- repositories.migration` → passes.

### Step 3: Repair-path tests

Test 2 — cash-leak repair: seed the PRE-repair shape (an opening-lot
investment record whose linked ledger leg is settled — reverse-engineer the
exact predicate from the repair SQL at `:2059-2072`; read it carefully) →
`initialize()` → assert the leg is tombstoned and account balance excludes it.

Test 3 — asset merge: seed two `portfolio_assets` rows for the same ticker in
the pre-merge shape (read `:2075-2100` for the matching predicate) →
`initialize()` → assert one survivor, records re-pointed.

Test 4 — **idempotency**: run `initialize()` a SECOND time on the upgraded DB
→ assert zero data changes (snapshot all row counts + balances before/after).

**Verify**: `npm test -- repositories.migration` → all pass. Failures in
tests 2–4 = real findings → mark `it.fails` with a `// DIVERGENCE:` comment
and report.

### Step 4: Full gates

**Verify**: `npm test` → all pass; `npx tsc` → exit 0.

## Test plan

The four tests above. Model arrange/act/assert style on
`repositories.sqlite-tx.test.ts`.

## Done criteria

- [ ] Legacy-schema fixture mechanism works without production changes (or
      STOP-reported)
- [ ] Upgrade, two repair paths, and idempotency covered; `npm test` green
- [ ] Any repair defect reported as DIVERGENCE, not fixed inline
- [ ] `plans/README.md` updated

## STOP conditions

- Step 1's factory blocker.
- The repair SQL predicates reference columns you can't reconstruct
  confidently — report the exact SQL and what's ambiguous rather than
  seeding a guess.

## Maintenance notes

- Every future `ensureSqliteColumn` or repair added to `initialize()` should
  gain a case here; consider one line in AGENTS.md gotchas.
- These tests become the regression gate for the eventual repositories.ts
  refactor (stalled plan `docs/repositories-refactor-plan.md`).
