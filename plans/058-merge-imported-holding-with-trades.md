# Plan 058: Trades of an imported holding's ticker should accumulate into ONE asset

> **Executor instructions**: This is a **finance-correctness bug with a design
> gate**. Phase 0 reproduces the bug, writes a short design note, and requires
> operator sign-off on the resolution rule + how to reconcile EXISTING duplicate
> holdings before any fix is written. Do NOT skip to the fix. The data layer has
> **two implementations** (browser + Tauri SQLite) — a fix to one without the
> other is incomplete. Run every verification command and confirm the expected
> result. If anything in "STOP conditions" occurs, stop and report. When done,
> update this plan's row in `plans/README.md` unless a reviewer told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/data/repositories.ts src/domain/portfolioCalculator.ts src/domain/types.ts`
> If these changed since this plan was written, compare the "Current state"
> excerpts against live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P1 (data correctness — splits a position's quantity / cost basis)
- **Effort**: M–L (resolution fix in two impls + a reconcile path for existing data + tests)
- **Risk**: HIGH (touches asset identity, cost-basis blending, per-account quantity, and existing user data)
- **Depends on**: none
- **Category**: bug (correctness)
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Operator-reported (with screenshots): a holding imported via 匯入持倉 (e.g. CRWD,
GOOG) and **later traded under the same ticker does not accumulate into one
symbol** — the 持倉 list shows **two rows for CRWD** (3.5 shares and 0.5 shares)
instead of one position of 4.0. This splits quantity, blended cost, unrealized
P/L, allocation, and the net-worth picture — exactly the finance correctness the
app exists to get right (`AGENTS.md` invariant #1).

Root cause (confirmed in code): when a trade is recorded, the asset is resolved
by `findOrCreateAsset`. It matches an existing **manual** (imported) holding only
when `accountId === input.linkedAccountId` (`findManualAsset`,
`repositories.ts:1551-1556`). An imported holding frequently has a **different or
`null` account** than the trade (imports may not be linked to the trading
account; transaction-based assets always store `accountId: null`). When the match
fails, the trade falls through and creates a **separate `"transactions"` asset**
for the same ticker (`repositories.ts:1558-1586`) → two rows. The same logic
exists in the Tauri SQLite path (`repositories.ts:3801` manual lookup is
`… and account_id = $2`, then `3829` creates `holdingSource: "transactions"`).

Note the asymmetry: `findTransactionAsset` (`:1546-1549`) matches by ticker
**account-agnostically**, but `findManualAsset` is **account-scoped**. That gap is
the bug's source.

## Current state

`src/data/repositories.ts` — browser asset resolution:

```ts
private findTransactionAsset(input: InvestmentDraft): PortfolioAsset | undefined {
  const ticker = input.ticker.trim().toUpperCase();
  return this.data.portfolioAssets.find((item) =>
    item.ticker === ticker && item.deletedAt === null && item.holdingSource === "transactions"); // account-agnostic
}
private findManualAsset(input: InvestmentDraft): PortfolioAsset | undefined {
  const ticker = input.ticker.trim().toUpperCase();
  return this.data.portfolioAssets.find((item) =>
    item.ticker === ticker && item.deletedAt === null && item.holdingSource === "manual"
    && item.accountId === input.linkedAccountId);  // ← account-scoped: the gap
}
private findOrCreateAsset(input: InvestmentDraft): PortfolioAsset {
  const existing = this.findTransactionAsset(input);
  if (existing) return existing;
  const manualAsset = this.findManualAsset(input);
  if (manualAsset) return manualAsset;
  // …else create a NEW holdingSource:"transactions" asset (accountId: null)
}
```

The Tauri SQLite mirror (`repositories.ts:~3801`):

```sql
select id, total_quantity as totalQuantity, base_quantity as baseQuantity
from portfolio_assets
where ticker = $1 and holding_source = 'manual' and account_id = $2 and deleted_at is null limit 1
```
…and `:~3829` creates `holdingSource: "transactions"` when no match.

How a manual holding is modeled (so the fix preserves it):
- `manualHoldingFields` (`:~4458`) sets `holdingSource: "manual"`, `accountId:
  input.accountId || null`, `baseQuantity: totalQuantity` (the durable snapshot).
- `recomputeAssets` / `materializeOpeningRecords` (`:~4179`) give every manual
  holding a deterministic **cashless opening-balance record** (`inv_open_<assetId>`)
  whose `linkedAccountId = asset.accountId`. `buildPositionMetrics` then derives
  quantity + blended average cost from **all** records (opening lot + later
  trades) — so once trades attach to the same asset, the math already blends
  correctly. The split is purely an *identity/resolution* failure, not a math bug.
- `syntheticOpeningRecord` (`:~497`) self-heals the opening lot from
  `baseQuantity` during sync lag.
- Per-account available quantity for sell-validation uses
  `calculateInvestmentAccountQuantity(records, assetId, accountId)`
  (`validateInvestmentDraft`, `:1603`) — so the opening record's
  `linkedAccountId` matters for what's sellable in an account.

### Conventions to follow

- **Finance correctness invariant** (`AGENTS.md` #1; `ROADMAP.md` 執行原則): math
  must be explainable + tested; don't silently change cost-basis semantics. After
  the fix, a CRWD position of 3.5 (imported) + 0.5 (bought) MUST read as 4.0 with
  a blended moving-average cost, and realized/unrealized P/L must stay consistent.
- **Two implementations must stay in lockstep**: the browser `FinanceRepository`
  and the Tauri `SqliteRepository`. Any resolution change is applied to BOTH and
  asserted by the same behavior. (See how prior plans, e.g. 030, mirrored a
  browser guard into the SQLite path.)
- Manual holdings are synced entities with a deterministic opening-record id —
  don't break that determinism (it's what keeps sync from duplicating openings).
- GOOG vs GOOGL are **different securities** (Alphabet Class C vs Class A) — do
  NOT merge across different tickers. Only same-ticker holdings merge.

## Decision gate (Phase 0 — REQUIRED before any fix)

First **reproduce** and capture the exact state, then write
`docs/holding-identity-plan.md` and get operator sign-off.

**Reproduce**: in a scratch/dev copy (or via a unit test), import a manual holding
for ticker X (note its `accountId` — likely `null` or unset), then record a buy of
X linked to an investment account. Confirm two assets result. Capture whether the
imported holding's `accountId` is `null` or a real-but-different account — the fix
differs slightly.

**Decision A — the resolution rule** (how a trade picks its asset):
- **(Recommended)** Resolve a trade to an existing same-ticker holding regardless
  of `holdingSource`, preferring: (1) a manual holding whose `accountId` matches
  the trade's `linkedAccountId`, then (2) a manual holding with `accountId == null`
  (an account-less import) — **adopting** the trade's account onto it (set the
  asset's `accountId` and re-point its opening record's `linkedAccountId` so
  per-account quantity stays correct), then (3) a transaction asset by ticker,
  then (4) create new. This makes an imported holding + its trades one asset.
- (Alternative) Identity = (ticker, account): one asset per ticker per account,
  manual or not. Cleaner long-term but a bigger change and it still needs the
  account-less-import adoption rule. Discuss in the note.
- State explicitly: cost basis stays **moving-average over all records** (opening
  lot + trades), unchanged math; only which asset the trade lands on changes.

**Decision B — reconcile EXISTING duplicates** (the user already has split CRWD /
GOOG):
- **(Recommended)** A small, explicit **merge action / migration** that, for a
  given ticker with both a manual and a transaction asset (same security), moves
  the transaction asset's records onto the manual asset and tombstones the empty
  one — idempotent, with a test. Surface it either as a one-time normalize step in
  `recomputeAssets`/`normalizeStoredData` (auto, safest if perfectly idempotent)
  or as a user-triggered "合併重複持倉" button on the 持倉 list. Recommend the
  migration approach if it can be proven idempotent + reversible-by-design; else
  the explicit button.
- Must NOT merge different tickers (GOOG≠GOOGL) and must NOT merge across truly
  distinct accounts unless Decision A says (ticker,account) identity.

The note records the chosen A/B options, the cost-basis statement, and the
GOOG/GOOGL non-merge rule. **STOP and get sign-off before Phase 1.**

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Test (repo) | `npx vitest run src/data/repositories.investments.test.ts` | all pass |
| Test (calc) | `npx vitest run src/domain/portfolioCalculator.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |

## Scope

**Phase 1 (after the gate) — In scope:**
- `src/data/repositories.ts` — the resolution functions (`findManualAsset` /
  `findOrCreateAsset`) in the **browser** impl AND the equivalent in the **Tauri
  SQLite** impl (`:~3801`/`:~3829`), per Decision A; plus the account-adoption of
  an account-less manual holding.
- The Decision-B reconcile path (a migration in `recomputeAssets` /
  `normalizeStoredData`, or a repository merge method + a 持倉 button) — both impls.
- Tests: `src/data/repositories.investments.test.ts` (+ a new merge/reconcile test).

**Out of scope (do NOT touch):**
- `buildPositionMetrics` / cost-basis math — it already blends correctly once
  records share one asset; changing it would be a regression.
- `syntheticOpeningRecord` / `materializeOpeningRecords` determinism — keep the
  `inv_open_<assetId>` id scheme.
- Cross-ticker merging (GOOG/GOOGL) — different securities.
- Quote refresh, benchmark, sync envelope format.

## Git workflow

- Branch from current main: `git checkout -B advisor/058-merge-imported-holding main`.
- Commit the design note separately from the fix; the reconcile/migration as its
  own commit. Match the repo's short imperative commit style. Do NOT push/PR
  unless told.

## Steps

### Step 0 (gate): reproduce + design note
Reproduce the split (capture the imported holding's `accountId`). Write
`docs/holding-identity-plan.md` (Decisions A/B). **STOP for sign-off.**

### Step 1: fix new-trade resolution (both impls)
Implement Decision A in `findOrCreateAsset`/`findManualAsset` (browser) and the
SQLite mirror: a trade resolves to the same-ticker manual holding (matching
account, then account-less → adopt the account + re-point the opening record),
else transaction asset, else create. Keep the two impls behaviorally identical.

**Verify**: `npx vitest run src/data/repositories.investments.test.ts` → all pass,
including a NEW test: import holding (account-less) + buy same ticker in account A
⇒ ONE asset, quantity = imported + bought, blended average cost.

### Step 2: reconcile existing duplicates (Decision B)
Implement the chosen merge/migration so the user's already-split CRWD/GOOG
collapse into one asset each. Idempotent (running twice is a no-op). Both impls.

**Verify**: a NEW test seeds a manual + a transaction asset for the same ticker
with records, runs the reconcile, and asserts one surviving asset with the summed
records and correct blended cost; a second run changes nothing.

### Step 3: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0.

## Test plan

In `src/data/repositories.investments.test.ts` (model after existing cases there):
- **Repro/fix**: account-less imported holding + later buy of same ticker ⇒ one
  asset; quantity and moving-average cost blend the opening lot + the buy.
- Imported holding linked to account A + buy in account A ⇒ one asset (already
  worked — keep as a regression guard).
- **Reconcile**: pre-existing duplicate (manual + transaction, same ticker) ⇒
  merged to one; idempotent on a second run.
- **Non-merge guard**: GOOG and GOOGL stay separate; two genuinely different
  accounts behave per Decision A (assert whichever rule was chosen).
- Sell-validation still respects per-account available quantity after a merge
  (the opening record's `linkedAccountId` is correct).

## Done criteria

ALL must hold:

- [ ] `docs/holding-identity-plan.md` records the operator's A/B choices + the
      cost-basis + GOOG/GOOGL statements
- [ ] A new trade of an imported holding's ticker accumulates into ONE asset
      (browser AND SQLite), with blended moving-average cost
- [ ] Existing split holdings (CRWD/GOOG) reconcile into one each; the reconcile
      is idempotent
- [ ] `buildPositionMetrics` math is unchanged (no existing calc test's expected
      value edited)
- [ ] `npx tsc --noEmit` exits 0; `npm test` all pass; `npm run lint` 0 errors;
      `npm run build` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `8f2e90bd`).
- Reproduction shows the imported holding's `accountId` actually DOES equal the
  trade's account (then the split has a different cause — re-investigate before
  changing resolution).
- The fix would require changing `buildPositionMetrics` cost-basis math (it must
  not) or breaking the deterministic opening-record id.
- The reconcile cannot be made idempotent — stop; an auto-migration that isn't
  idempotent can corrupt data on reload/sync. Prefer the explicit-button path and
  report.
- You cannot keep the browser and SQLite impls behaviorally identical — report;
  divergence here causes sync drift between devices.

## Maintenance notes

- For the reviewer: the load-bearing properties are (1) **one asset per security**
  after a trade on an imported holding, (2) **cost-basis math untouched** (blending
  comes free from shared records), (3) **browser ≡ SQLite**, (4) **reconcile is
  idempotent**. Scrutinize the account-adoption (opening-record `linkedAccountId`
  re-point) — get it wrong and per-account sell limits break.
- If field-level sync merge (ROADMAP 5.3) lands later, asset identity (ticker +
  the chosen account rule) must survive a round-trip — add it to a sync test.
- Deferred: a UI affordance to manually split/merge holdings if the auto-rule ever
  guesses wrong for an edge case.
