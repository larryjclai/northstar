# Holding identity plan (Plan 058)

A holding imported via 匯入持倉 and later traded under the **same ticker** must
accumulate into **one** portfolio asset, not split into two rows. This note
records the resolved design decisions for that fix.

## Problem

When a trade is recorded, the asset is resolved by `findOrCreateAsset`
(`src/data/repositories.ts`). It matched an existing manual (imported) holding
**only** when `accountId === input.linkedAccountId` (`findManualAsset`).
Imported holdings are frequently account-less (`accountId: null`) or linked to a
different account than the trade. When the account-scoped match failed, the trade
fell through and created a separate `holdingSource: "transactions"` asset for the
same ticker — splitting quantity, blended cost, unrealized P/L, allocation, and
the net-worth picture. The same gap existed in the Tauri SQLite path.

`findTransactionAsset` already matches by ticker account-agnostically; only
`findManualAsset` was account-scoped. That asymmetry is the bug.

## Decision A — new-trade resolution: same-ticker merge with account adoption

A trade resolves to an existing **same-ticker** holding regardless of
`holdingSource`, preferring in order:

1. A manual holding whose `accountId` matches the trade's `linkedAccountId`.
2. A manual holding with `accountId == null` (account-less import) — **adopt**
   the trade's account onto it: set the asset's `accountId` AND re-point its
   opening record's `linkedAccountId` so per-account available quantity (used by
   sell-validation via `calculateInvestmentAccountQuantity`) stays correct.
3. A transaction asset by ticker.
4. Otherwise create a new asset.

## Decision B — reconcile existing duplicates: automatic idempotent migration

For a ticker that already has BOTH a manual and a transaction asset (same
security), move the transaction asset's records onto the manual asset and
tombstone the now-empty transaction asset. This runs automatically:

- Browser: inside `normalizeStoredData` (run on every load/import).
- SQLite: a SQL pass in `initialize` (run on every startup).

The migration **must be idempotent**: once a ticker has a single surviving
asset, a second run finds no manual+transaction pair for it and does nothing.

## Cost basis — UNCHANGED

Cost basis stays moving-average over all records (the manual holding's cashless
opening lot plus all trades), derived by `buildPositionMetrics`. The fix is
purely an identity/resolution change; no financial math is altered. A position
of 3.5 imported + 0.5 bought reads as 4.0 with a single blended average cost.

## Scope guard — same-ticker only; GOOG ≠ GOOGL

Only **same-ticker** holdings merge. `GOOG` and `GOOGL` are different securities
and are never merged. (The operator confirmed a reported GOOG/GOOGL case was a
personal data-entry typo, not a bug — out of scope.)
