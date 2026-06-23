# Plan 060: Deleting an imported holding's opening lot must remove the holding (it currently resurrects)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. The data layer has TWO
> implementations (browser + Tauri SQLite) — keep them in lockstep. If a STOP
> condition occurs, stop and report. Update this plan's row in `plans/README.md`
> unless a reviewer maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat 65775330..HEAD -- src/data/repositories.ts`
> If it changed, compare the "Current state" excerpts against live code before proceeding.

## Status
- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches delete semantics + the manual-holding self-heal; finance data)
- **Depends on**: plan 058 (merged) — uses the manual/holdingSource model
- **Category**: bug (correctness/UX)
- **Planned at**: commit `65775330`, 2026-06-23

## Why this matters
Operator-reported: they imported a custom/manual holding (匯入持倉, e.g. CRWD 3.5),
then **deleted its row from 交易紀錄, but the 持倉 row stays** (shows again with the
same shares). You can't get rid of an imported holding by deleting its transaction.

Root cause (confirmed in code): a manual holding carries its baseline on the asset
row as `baseQuantity`, plus a cashless "opening-balance" record
(`inv_open_<assetId>`, `cashless: true`). When you delete that record,
`deleteInvestmentRecord` only tombstones the record — but `recomputeAssets`
**self-heals** the position: for a manual holding with `baseQuantity != null` and no
live cashless record, it reconstructs a `syntheticOpeningRecord` from `baseQuantity`
(a sync-lag safety net). So the quantity comes right back → the holding "resurrects".

The proper way to remove an imported holding is `deleteManualHolding` (tombstones
the asset + its opening record), reachable from the holding's 編輯 → 刪除. But
deleting the **opening lot** from the 交易紀錄 list silently does nothing useful,
which is the trap the operator hit.

## Current state
`src/data/repositories.ts`:
- `deleteInvestmentRecord(id)` (browser) — tombstones the record (and its DRIP pair /
  ledger leg), then `recompute()`. It does NOT special-case a manual holding's
  opening lot:
```ts
async deleteInvestmentRecord(id: string) {
  const existingRecord = this.data.investmentRecords.find((r) => r.id === id && r.deletedAt === null);
  if (!existingRecord) throw new Error("找不到投資交易。");
  // … dripGroupId pair handling …
  this.data.investmentRecords = this.data.investmentRecords.map((record) =>
    targetIds.has(record.id) ? bump({ ...record, deletedAt: nowIso() }) : record);
  // … ledger leg tombstone …
  this.recompute();
  await this.persist();
}
```
- `recomputeAssets` self-heal (around line 490–525): for a manual holding with
  `baseQuantity != null` and no live cashless record, it injects
  `syntheticOpeningRecord(asset)` (quantity = `baseQuantity`) — so a tombstoned
  opening record is replaced by a synthetic one. **This is why the holding persists.**
- `deleteManualHolding(id)` (line ~989) — the CORRECT removal: refuses if there are
  real (non-cashless) records (`"已有逐筆交易的持倉不能直接刪除。"`), else tombstones
  the asset + its opening record:
```ts
async deleteManualHolding(id: string) {
  const hasRealRecords = this.data.investmentRecords.some((r) => r.assetId === id && r.deletedAt === null && !r.cashless);
  if (hasRealRecords) throw new Error("已有逐筆交易的持倉不能直接刪除。");
  // tombstone asset + openingRecordId(id)
}
```
- The Tauri SQLite repo overrides both `deleteInvestmentRecord` and
  `deleteManualHolding` (grep them) — mirror any change there too.
- `openingRecordId(assetId)` → `inv_open_<assetId>`; a record is the opening lot iff
  `record.id === openingRecordId(record.assetId)` (and `cashless === true`).

### Conventions to follow
- Two impls (browser `FinanceRepository` + Tauri `SqliteRepository`) must stay
  behaviorally identical; mirror the change in both (see how plan 058 did it).
- `bump()` on any row you mutate (revision + updatedAt) so sync LWW propagates.
- Manual-holding model is synced; the deterministic `inv_open_<assetId>` id must stay.

## Decision (recommended — implement unless operator overrides)
When `deleteInvestmentRecord` is called on a **manual holding's opening lot** (the
record's id === `openingRecordId(record.assetId)` AND the asset is `holdingSource:
"manual"`), it should **delete the whole manual holding** (delegate to the same
logic as `deleteManualHolding`: tombstone the asset + the opening record), provided
there are no OTHER live real (non-cashless) records on that asset. If there ARE real
trades, keep the current guard (`"已有逐筆交易的持倉不能直接刪除。"`) — deleting the
opening lot of a holding that also has real trades should be blocked, not silently
no-op'd.

(Alternative the operator may prefer: don't delete from 交易紀錄 at all for opening
lots — hide/disable the delete and point to 編輯→刪除持倉. If chosen, that's a UI
change in the 交易紀錄 list instead; note it and stop for confirmation.)

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Test (repo) | `npx vitest run src/data/repositories.investments.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |

## Scope
**In scope:**
- `src/data/repositories.ts` — `deleteInvestmentRecord` (browser) + the SQLite
  override: detect the manual-holding opening lot and remove the holding.
- `src/data/repositories.investments.test.ts` — new tests.

**Out of scope:**
- `recomputeAssets` / `syntheticOpeningRecord` self-heal — leave the self-heal
  intact (it's the sync safety net); the fix is in delete, not in recompute.
- Cost-basis math, valuation.
- Non-opening-lot deletes (a normal buy/sell delete must behave exactly as today).

## Git workflow
- Branch from current main: `git checkout -B advisor/060-delete-imported-holding main`.
- Short imperative commit style. Do NOT push/PR.

## Steps
### Step 1: route opening-lot deletes to holding removal (both impls)
In `deleteInvestmentRecord`, after finding the record: if it's a manual holding's
opening lot (`id === openingRecordId(record.assetId)` and the asset is manual), and
the asset has no other live non-cashless records, tombstone the **asset** as well as
the opening record (mirror `deleteManualHolding`). If it has real records, throw the
existing guard message. Mirror in the SQLite override. Bump revisions.
**Verify**: `npx vitest run src/data/repositories.investments.test.ts` → all pass.

### Step 2: full verification
**Verify**: `npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors;
`npm run build` 0.

## Test plan
In `src/data/repositories.investments.test.ts`:
- **Repro/fix**: create a manual holding (baseQuantity 3.5, no real trades) → delete
  its opening lot via `deleteInvestmentRecord(openingRecordId(assetId))` → the asset
  is tombstoned and `listPortfolioAssets()` no longer shows it; a recompute does NOT
  resurrect it (the self-heal must not fire because the asset is gone).
- **Guard**: a manual holding that also has a real buy → deleting the opening lot
  throws `"已有逐筆交易的持倉不能直接刪除。"` and nothing is removed.
- **Regression**: deleting a normal (non-opening) buy/sell record behaves exactly as
  before (record tombstoned, asset stays, quantity recomputes).

## Done criteria
- [ ] Deleting an imported holding's opening lot from 交易紀錄 removes the holding
      (no resurrection on recompute)
- [ ] A holding with real trades still blocks opening-lot deletion with the existing message
- [ ] Normal record deletes unchanged; browser ≡ SQLite
- [ ] `npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0
- [ ] No files outside scope modified
- [ ] `plans/README.md` row updated

## STOP conditions
- Code at cited lines doesn't match (drift since `65775330`).
- Removing the holding on opening-lot delete would require changing `recomputeAssets`
  self-heal — it shouldn't; if it seems to, stop and report.
- Browser and SQLite would diverge — report.
- The operator prefers the UI alternative (disable delete on opening lots) — confirm before building.

## Maintenance notes
- Load-bearing: the self-heal stays (sync safety); we fix the DELETE path so removal
  actually tombstones the asset whose `baseQuantity` would otherwise resurrect it.
- Reviewer: confirm a normal trade delete is unchanged and the manual-with-real-trades guard holds.
