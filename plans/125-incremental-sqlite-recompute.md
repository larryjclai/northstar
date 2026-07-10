# Plan 125: Stop reloading the full ledger on every mutation (scope the SQLite recompute)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/data/repositories.ts`
> Re-locate by grep (`recomputeSqliteAccounts`, `recomputeSqliteAssets`);
> STOP on shape mismatch.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (balance derivation is money-critical)
- **Depends on**: plans/126-dual-repo-test-harness.md (STRONGLY preferred
  first — it gives this change a safety net; may proceed without it only if
  the operator says so)
- **Category**: perf
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Every single ledger mutation (add/edit/delete a transaction, transfer,
installment, balance adjustment — ~8 write paths) calls
`recomputeSqliteAccounts()`, which SELECTs **every ledger row ever written
(including tombstones)** plus all accounts, recomputes all balances in JS,
then UPDATEs each account in a serial loop. Investment mutations (~12 paths)
similarly call `recomputeSqliteAssets()`, which is O(assets × records) due to
a per-asset `records.some(...)` scan. At ~10k transactions this is a
full-table reload per keystroke-level edit on the same serialized connection
that produced the documented `db-locked` incidents.

This plan reduces the work without changing any derived value: filter
tombstones in SQL, only write rows whose values changed, and kill the
quadratic scan. It deliberately does NOT attempt delta/incremental balance
math (higher risk, little residual payoff).

## Current state

`src/data/repositories.ts` (~line 4395):

```ts
  private async recomputeSqliteAccounts() {
    const accounts = await this.db.select<Account[]>(`select ... from accounts`);
    const ledger = await this.db.select<LedgerTransaction[]>(`select ... from ledger_transactions`);
    for (const account of recomputeAccounts(accounts, ledger)) {
      await this.db.execute(`update accounts set balance = $1 where id = $2`, [account.balance, account.id]);
    }
  }

  private async recomputeSqliteAssets() {
    const assets = await this.listPortfolioAssets();
    const records = await this.listInvestmentRecords();
    for (const asset of recomputeAssets(assets, records)) {
      // Manual holdings now carry their opening lot as a record, so every asset
      // with records persists both derived quantity AND blended average cost.
      // Skip assets with no records (manual snapshot pre-migration edge).
      if (!records.some((r) => r.assetId === asset.id)) continue;
      await this.db.execute(`update portfolio_assets set total_quantity = $1, average_cost = $2 where id = $3`, [asset.totalQuantity, asset.averageCost, asset.id]);
    }
  }
```

Notes verified at planning time:
- The ledger SELECT has **no `where deleted_at is null`**. Before changing it,
  read the shared `recomputeAccounts(accounts, ledger)` helper (grep its
  definition; it's shared with the browser repo): confirm it ignores
  soft-deleted rows itself. If it *uses* tombstones for anything, keep the
  unfiltered load and skip that sub-step.
- `recomputeAccounts` returns derived accounts; the loop writes every one
  regardless of whether the balance changed.
- `recomputeAssets` (~line 486) already builds a `recordsByAsset` grouping
  internally — the outer `records.some(...)` per asset re-scans redundantly.

Call sites (grep `recomputeSqliteAccounts\(|recomputeSqliteAssets\(`): ~8 and
~12 respectively; most run inside `withTransaction`.

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Targeted  | `npm test -- repositories` | pass    |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**: `src/data/repositories.ts` — only the two private methods above
(plus, if needed, a small exported helper next to `recomputeAssets` in the
same file to expose its per-asset grouping). Tests under
`src/data/repositories.investments.test.ts` / a new
`repositories.recompute.test.ts`.

**Out of scope**:
- `recomputeAccounts` / `recomputeAssets` shared derivation logic — the MATH
  must not change.
- The browser twin's `recompute()`.
- Any delta/incremental balance scheme.
- Call-site reduction (batching multiple recomputes per import) — a separate
  optimization; imports already call once at the end (verify, don't change).

## Git workflow

- Branch: `fix/ai-sqlite-recompute-scope`
- Commit: `perf(repo): filter tombstones, write only changed balances, drop O(n²) asset scan`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Characterize current outputs

Add a test (SQLite factory — `createSqliteFinanceRepositoryForTests`, see
`repositories.sqlite-tx.test.ts` for setup): seed 2 accounts + ~6 transactions
including one soft-deleted, run a mutation, snapshot all account balances.
This pins the pre-change behavior.

**Verify**: `npm test -- repositories` → passes (baseline recorded).

### Step 2: Filter tombstones (conditional) and skip no-op writes

- Read shared `recomputeAccounts`: if it filters `deletedAt` internally, add
  `where deleted_at is null` to the ledger SELECT (same for the accounts
  SELECT only if the helper ignores deleted accounts — check).
- Change the write loop to compare against the loaded balance and only
  `update` when different:

```ts
    const before = new Map(accounts.map((a) => [a.id, a.balance]));
    for (const account of recomputeAccounts(accounts, ledger)) {
      if (before.get(account.id) === account.balance) continue;
      await this.db.execute(...);
    }
```

**Verify**: `npm test` → all pass (incl. Step 1's snapshot — values identical).

### Step 3: Kill the quadratic asset scan

Build the membership set once:

```ts
    const assetIdsWithRecords = new Set(records.map((r) => r.assetId));
    ...
      if (!assetIdsWithRecords.has(asset.id)) continue;
```

Also apply the changed-value skip (compare `totalQuantity` AND `averageCost`
against the loaded asset before writing). Mind float comparison: use strict
equality only if the loaded values round-trip exactly (they come from SQLite
REAL columns — if the Step 1-style snapshot shows drift, compare with
`Object.is` on both and fall back to always-write for that asset; report it).

**Verify**: `npm test` → all pass.

### Step 4: Full gates

**Verify**: `npx tsc`, `npm run lint`, `npm test` all green.

## Test plan

Step 1 snapshot test + one test asserting a soft-deleted transaction does not
affect balances (this also guards the tombstone filter), + one asserting an
edit touching account A does not rewrite account B's row — observable via
`updated_at`? NO: the balance UPDATE doesn't touch `updated_at` (see excerpt).
Assert instead via behavior: the no-op-write skip is internal; cover it by the
snapshot equality and leave write-count assertions out (no SQL spy exists).

## Done criteria

- [ ] Balances/assets identical before/after for the seeded scenarios
- [ ] Ledger SELECT filters tombstones (or a report explains why not)
- [ ] No `records.some(` scan inside the asset loop
- [ ] `npm test`, `npx tsc`, `npm run lint` green
- [ ] `plans/README.md` updated

## STOP conditions

- `recomputeAccounts` consumes tombstoned rows for any purpose.
- Any balance in the Step 1 snapshot changes after Steps 2–3.
- The float-equality check shows nondeterministic round-trip drift you cannot
  bound — report with the observed values.

## Maintenance notes

- Plan 126's dual-repo harness should eventually pin browser-vs-SQLite
  balance equality on shared scenarios; this plan's snapshot test is a seed
  for that.
- Future work (deferred): batch the per-account UPDATEs into one statement;
  compute affected-accounts-only from the mutated rows. Only worth it if
  profiling still shows recompute in traces after this lands.
