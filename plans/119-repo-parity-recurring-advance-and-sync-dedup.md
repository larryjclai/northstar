# Plan 119: Fix two in-memory ↔ SQLite repository divergences (recurring nextRunDate advance; sync occurrence de-dup)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/data/repositories.ts`
> If the file changed since this plan was written, re-locate every excerpt by
> its code content (grep), not by line number; on a content mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (money-path merge logic)
- **Depends on**: none (but lands cleanly before plan 126's harness)
- **Category**: bug
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

`src/data/repositories.ts` holds two implementations of the same interface:
`BrowserFinanceRepository` (in-memory/IndexedDB — used by the web dev shell
AND by every test) and `TauriSqlFinanceRepository` (SQLite — what desktop/iOS
users actually run). Two behaviors have drifted:

1. **Recurring `nextRunDate` never advances in the browser build** when every
   due occurrence already exists (e.g. arrived via sync). The rule stays
   perpetually "overdue" and is re-scanned on every app open. SQLite advances
   it correctly.
2. **The browser sync-apply path lacks the recurring-occurrence de-dup** the
   SQLite path has. After two devices each post the same occurrence and sync,
   SQLite converges to one row; the browser keeps both → double-counted spend.

Divergences like these are exactly how sync bugs ship: tests pass (they test
the browser twin) while production behaves differently.

## Current state

All in `src/data/repositories.ts`.

**Bug 1 — browser `postDueRecurringTransactions`** (~line 1240–1280). The loop
records advances into a local map, but the persist is gated on `posted > 0`:

```ts
      if (next !== rule.nextRunDate) advanced.set(rule.id, next);
    }
    if (posted > 0) {
      this.data.recurringTransactions = this.data.recurringTransactions.map((row) =>
        advanced.has(row.id) ? bump({ ...row, nextRunDate: advanced.get(row.id)! }) : row,
      );
      this.recompute();
      await this.persist();
    }
```

When all occurrences hit the "already exists" `continue` branch, `posted`
stays 0 and `advanced` is discarded. The SQLite twin (~line 2789) writes the
advance unconditionally per rule:

```ts
        if (next !== rule.nextRunDate) {
          await this.db.execute(`update recurring_transactions set next_run_date = $1, updated_at = $2, revision = revision + 1 where id = $3`, [next, nowIso(), rule.id]);
        }
      }
      if (posted > 0) await this.recomputeSqliteAccounts();
```

**Bug 2 — browser `applySyncChanges`** (~line 1608) upserts each incoming row
by `id` only. The SQLite path `applySqliteSyncChange` (~line 4288) has a
de-dup guard for ledger rows sharing a `recurring_occurrence_key`:

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
```

The winner rule: among all non-deleted rows sharing the key, the
lexicographically **smallest id** survives; the others are tombstoned
(`deletedAt = now`, revision bumped). The browser merge must produce the
identical outcome or the two stores will still diverge after sync.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Typecheck | `npx tsc`                        | exit 0              |
| Tests     | `npm test`                       | all pass (~831)     |
| Targeted  | `npm test -- repositories.recurring` | pass            |
| Targeted  | `npm test -- repositories.sync`  | pass                |
| Lint      | `npm run lint`                   | exit 0              |

## Scope

**In scope**:
- `src/data/repositories.ts` — browser `postDueRecurringTransactions` and
  browser `applySyncChanges` (ledger branch) only
- `src/data/repositories.recurring.test.ts` (add cases)
- `src/data/repositories.sync.test.ts` (add cases)

**Out of scope**:
- The SQLite twins of both methods — they are the reference behavior; do not
  "improve" them here.
- `src/domain/sync.ts` (conflict semantics) and the sync client under
  `src/features/connect/` — untouched.
- The recurring **investments** path (`recurring_investments`) — different
  table; only if you find the identical `posted > 0` gate there, note it in
  your report; do not fix it unverified.

## Git workflow

- Branch: `fix/ai-repo-parity-recurring-sync`
- Commits: one per bug, conventional style, e.g.
  `fix(recurring): persist nextRunDate advance even when all occurrences exist`
  and `fix(sync): dedupe recurring occurrences in the browser apply path`.
- Do NOT push or merge to `main`.

## Steps

### Step 1: Characterization test for bug 1 (fails first)

In `src/data/repositories.recurring.test.ts`, add a test: create a rule due in
the past, manually insert the occurrence ledger row (same
`recurringOccurrenceKey` the poster would generate — see `recurringKey(...)`
usage in the browser loop), pin the clock with `vi.setSystemTime` (this file
already does this — follow its existing pattern), call
`postDueRecurringTransactions()`, and assert the rule's `nextRunDate` advanced
past today AND no duplicate row was created. It should FAIL on the
`nextRunDate` assertion before the fix.

**Verify**: `npm test -- repositories.recurring` → the new test fails with
the stale `nextRunDate`, all old tests pass.

### Step 2: Fix bug 1

Persist advances independently of `posted`:

```ts
    if (advanced.size > 0) {
      this.data.recurringTransactions = this.data.recurringTransactions.map((row) =>
        advanced.has(row.id) ? bump({ ...row, nextRunDate: advanced.get(row.id)! }) : row,
      );
    }
    if (posted > 0) this.recompute();
    if (advanced.size > 0 || posted > 0) await this.persist();
```

Keep `recompute()` gated on `posted > 0` (balances only change when rows were
actually created), matching the SQLite twin's `recomputeSqliteAccounts` gate.

**Verify**: `npm test -- repositories.recurring` → all pass, including Step 1's.

### Step 3: Characterization test for bug 2 (fails first)

In `src/data/repositories.sync.test.ts`, add a test against the **memory**
repository: seed one non-deleted ledger row with `recurringOccurrenceKey: K`
and id `"tx_bbb"`, then call `applySyncChanges` with an incoming ledger payload
(different id `"tx_aaa"`, same key K, `deletedAt: null`). Assert exactly one
non-deleted row with key K remains and it is the sorted-first id (`"tx_aaa"`),
with the loser tombstoned. Follow the existing arrange/act style in this file.
It should FAIL (two live rows) before the fix.

**Verify**: `npm test -- repositories.sync` → new test fails as described.

### Step 4: Fix bug 2

In the browser `applySyncChanges` ledger branch, before the upsert, replicate
the SQLite winner rule against `this.data.ledgerTransactions`: find other
non-deleted rows with the same `recurringOccurrenceKey` and a different id;
if any, sort ids, tombstone the losers (`deletedAt`/`updatedAt = nowIso()`,
`bump(...)` for the revision — match how tombstones are written elsewhere in
this class), or mark the incoming payload deleted when it loses. The end state
for any given input must equal the SQLite path's end state.

**Verify**: `npm test -- repositories.sync` → all pass.

### Step 5: Full gates

**Verify**: `npx tsc` → exit 0; `npm test` → all pass; `npm run lint` → exit 0.

## Test plan

Covered in steps 1 and 3 (fail-first characterization). Cases: stale-rule
advance with zero posts; winner-by-sorted-id in both directions (incoming wins
/ existing wins); incoming already tombstoned (guard must skip).

## Done criteria

- [ ] `npm test` all pass, including ≥3 new tests
- [ ] Browser and SQLite `postDueRecurringTransactions` both advance
      `nextRunDate` when occurrences pre-exist
- [ ] Browser `applySyncChanges` converges duplicate occurrence keys to the
      sorted-first id, identical to the SQLite rule
- [ ] `npx tsc` and `npm run lint` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Either excerpt no longer matches (someone touched these paths).
- The SQLite winner rule turns out to consider more than `sort()[0]` (e.g. a
  revision tie-break you find in `applySqliteSyncChange`) — report the actual
  rule; do not invent one.
- Fixing bug 2 requires touching `insertLedgerRow` or `src/domain/sync.ts`.

## Maintenance notes

- Plan 126 (dual-repo test harness) will run these suites against BOTH
  implementations; these fixes remove two known divergences it would flag.
- Reviewer: scrutinize the tombstone in step 4 — it must `bump()` the revision
  so the tombstone itself syncs to other devices (that was the point of the
  `ca05a6bc` parity fix).
- The recurring-investments poster may share bug 1's gate; deliberately left
  out of scope — check it when that feature (DCA rework, plan 142) revives.
