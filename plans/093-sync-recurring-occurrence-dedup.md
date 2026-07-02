# Plan 093: Fix sync crash on duplicate recurring_occurrence_key (cross-device dedup)

> **Executor instructions**: Follow step by step. This touches the **E2E sync apply path
> for financial data** — be precise and conservative. Run every verification command. If a
> STOP condition occurs, stop and report. NEVER push, NEVER touch `main`. Branch off `main`.

## Status
- **Priority**: P1 (sync is currently BROKEN — every sync aborts with a DB error)
- **Effort**: M  •  **Risk**: MED-HIGH (financial sync correctness; deterministic convergence required)
- **Depends on**: none  •  **Category**: bug (correctness)
- **Planned at**: commit `72135561`, 2026-06-29

## Why this matters
Sync fails with: `error returned from database: (code: 2067) UNIQUE constraint failed:
ledger_transactions.recurring_occurrence_key`. Root cause: a recurring transaction's
`recurring_occurrence_key` is **deterministic** (rule id + occurrence date), but each device
posts the same occurrence **independently** with a device-local random `id`. There is a
partial-unique index on the key:
`create unique index ... idx_ledger_recurring_occurrence on ledger_transactions (recurring_occurrence_key)
where recurring_occurrence_key is not null and deleted_at is null` (repositories.ts ~line 2119).
The recurring poster dedupes **locally** (it checks the key before posting), so a single device
never has two. But on **sync apply**, `applySqliteSyncChange` inserts the *other device's* copy of
the same occurrence — same key, different `id` — and the unique index rejects it (code 2067),
**aborting the entire sync batch** (the apply runs in one transaction). The fix: on apply,
**dedupe ledger rows by `recurring_occurrence_key`**, deterministically (both devices keep the same
one, tombstone the other → they converge with no further messaging).

## Current state (the exact code to change)
`src/data/repositories.ts`, `applySqliteSyncChange(change)` — the per-entity sync apply. For every
entity it deletes by `id` then re-inserts:
```ts
await this.db.execute(`delete from ${tableByEntity[change.entity]} where id = $1`, [String(payload.id)]);
switch (change.entity) {
  case "account": await this.insertAccountRow(payload as unknown as Account); break;
  case "ledger": await this.insertLedgerRow(payload as unknown as LedgerTransaction); break;
  // ... asset / investment / recurring / recurringInvestment / goal
}
```
`insertLedgerRow(row)` is a plain `insert into ledger_transactions (...)` (no ON CONFLICT). The
delete-by-`id` does NOT clear a *different*-id row that holds the same `recurring_occurrence_key`,
so the insert hits the unique index.

`LedgerTransaction` has `recurringOccurrenceKey?: string | null` and `deletedAt`. `nowIso()` exists.
The whole apply runs inside `applySyncChanges`'s `withTransaction(...)`, so an unhandled error rolls
back the entire batch — which is exactly why one bad row kills the whole sync.

## The fix — deterministic dedup before the ledger insert
In `applySqliteSyncChange`, in the **`ledger`** path only, before inserting: if the incoming row has a
non-null `recurringOccurrenceKey` and is not itself a tombstone (`deletedAt` null), look for an
existing **non-deleted** ledger row with the **same key** and a **different id**. If found, pick the
canonical winner **deterministically** so every device makes the same choice:

- `winner = the smaller id` (string compare; `[existingId, incomingId].sort()[0]`).
- If the **incoming** row is the winner → soft-delete the existing local loser
  (`update ledger_transactions set deleted_at = <now>, updated_at = <now>, revision = revision + 1 where id = <existingId>`),
  then insert the incoming normally.
- If the **existing** row is the winner → mark the incoming as a tombstone (`deletedAt = <now>`) before
  inserting, so it lands deleted (excluded from the unique index) and the existing winner stays.

Both devices, seeing the same two rows, compute the same `winner` (min id) → keep the same single
non-deleted occurrence, tombstone the other → convergent with no extra sync messages. (The apply runs
under `withOutboxSuppressed`, so these local tombstones are not re-emitted — that's fine; convergence
is by deterministic choice, not propagation.)

### Conventions
- Do NOT change the unique index or the recurring poster (the local dedup there is correct).
- Keep the change confined to the `ledger` branch of `applySqliteSyncChange`. Other entities are
  unaffected.
- Match the file's existing SQL style (`this.db.execute` / `this.db.select` with `$1` params, `nowIso()`).
- The in-memory base repo's `applySyncChanges` (~line 1605) does NOT have the SQLite unique index, so it
  can't throw this error; **out of scope** (note it in maintenance, don't change it).

## Commands
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Targeted test | `npx vitest run src/data/repositories.sync.test.ts` | pass (incl. the new case) |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |

## Scope
**In scope**:
- `src/data/repositories.ts` — dedup logic in the `ledger` branch of `applySqliteSyncChange`
- `src/data/repositories.sync.test.ts` — a new test for the cross-device duplicate-occurrence case
**Out of scope**: the unique index; the recurring poster (lines ~1207/1243); the in-memory base
`applySyncChanges`; any other entity; the sync push/pull/encrypt layers.

## Git workflow
- Branch: `fix/ai-sync-recurring-dedup` (off `main`)
- Commit: `fix(sync): dedupe recurring occurrences on apply to avoid UNIQUE constraint crash`
- Do NOT push.

## Steps

### Step 1: Add the dedup in `applySqliteSyncChange` (ledger branch)
Restructure the ledger case so the dedup runs before `insertLedgerRow`. Target shape:
```ts
case "ledger": {
  const incoming = payload as unknown as LedgerTransaction;
  const key = incoming.recurringOccurrenceKey;
  if (key && !incoming.deletedAt) {
    const dupes = await this.db.select<Array<{ id: string }>>(
      `select id from ledger_transactions
       where recurring_occurrence_key = $1 and deleted_at is null and id <> $2`,
      [key, incoming.id],
    );
    if (dupes.length > 0) {
      const existingId = dupes[0].id;
      const winner = [existingId, incoming.id].sort()[0];
      const now = nowIso();
      if (winner === incoming.id) {
        await this.db.execute(
          `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
          [now, existingId],
        );
      } else {
        incoming.deletedAt = incoming.deletedAt ?? now;
      }
    }
  }
  await this.insertLedgerRow(incoming);
  break;
}
```
Keep the existing `delete from ledger_transactions where id = $1` (it runs for ALL entities before the
switch) — it removes the incoming's own id, which is correct.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Test the cross-device duplicate case
In `src/data/repositories.sync.test.ts` (model on the existing sync-apply tests there), add a case:
1. Seed the SQLite repo with a ledger row that has `recurringOccurrenceKey: "rule_1:2026-06-01"`, id `"aaa"` (non-deleted).
2. Call `applySyncChanges([{ entity: "ledger", payload: <a row with the SAME key, id "zzz", a valid amount/account/date> }])`.
3. Assert: **no error thrown**; afterwards exactly **one** non-deleted ledger row has that key; and it's
   the `min(id)` winner (`"aaa"`), with `"zzz"` present-but-tombstoned (or absent). Use the repo's
   query API (or a direct `db.select`) to check `deleted_at`.
4. Add the reverse case (incoming id `"000"` < existing `"aaa"`): incoming wins, existing `"aaa"` becomes
   tombstoned, `"000"` is the surviving non-deleted row.

**Verify**: `npx vitest run src/data/repositories.sync.test.ts` → all pass including the 2 new cases.

### Step 3: Full verification
`npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` all pass.

## Done criteria (ALL)
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` exits 0 (0 errors)
- [ ] `npx vitest run src/data/repositories.sync.test.ts` passes incl. both new dedup cases (the test
  PROVES no UNIQUE-constraint throw and that exactly one non-deleted row remains per key)
- [ ] `npm test` exits 0 (no new failures)
- [ ] `grep -n "recurring_occurrence_key = \$1 and deleted_at is null" src/data/repositories.ts` matches
- [ ] No files outside the in-scope list modified
- [ ] Real cross-device convergence (two physical devices stop erroring) — **manual-verify-pending**
  (needs two synced devices; the unit test proves the apply logic)

## STOP conditions
- `applySqliteSyncChange` doesn't match the "Current state" excerpt (drift) — report.
- The `repositories.sync.test.ts` harness can't construct a SQLite repo + call `applySyncChanges` the
  way the existing tests do — report how the existing tests set up, don't invent a new harness.
- Making the dedup work appears to require changing the unique index, the recurring poster, or the
  push/pull layer — report (the fix must be confined to the apply path).
- The deterministic winner rule would differ between devices (e.g. you find ids are not globally
  comparable strings) — STOP; convergence depends on both devices picking the same winner.

## Maintenance notes
- **Convergence invariant**: both devices must pick the SAME winner for a given key. This plan uses
  `min(id)` (string sort). If id generation ever changes such that ids aren't stable/comparable, revisit.
- The in-memory base `applySyncChanges` doesn't hit the SQLite unique index, but for *behavioral* parity
  (no duplicate occurrences in demo/import paths) consider mirroring this dedup there later — deferred.
- Existing data: because the apply transaction is all-or-nothing, a previously-failed sync rolled back
  (no partial dupes), so once this ships the next sync deduplicates incoming occurrences and converges.
  If a user somehow already has two non-deleted rows with the same key locally, a one-time cleanup pass
  (soft-delete all but `min(id)` per key) would fix it — note as a follow-up if reported.
- Reviewer: confirm the dedup is ledger-only, deterministic, and that the new test actually triggers the
  pre-fix crash path (i.e. it would have thrown 2067 without the fix).
