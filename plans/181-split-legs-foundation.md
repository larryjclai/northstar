# Plan 181: 多類別拆分 foundation — legKind column, buildSplitLegs helper, createSplit/updateSplit repository methods

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update the status row in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 232b90df..HEAD -- src/domain/types.ts src/domain/groupClassifier.ts src/data/repositories.ts src/data/migrations.ts src/domain/ledgerTrust.ts`
> On drift, compare the "Current state" excerpts against live code; on a
> mismatch, treat as STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the ledger write path; every guard here protects the
  reconciliation identity 資產 − 負債 = 淨值)
- **Depends on**: none (design record: `docs/split-legs-plan.md`, plan 176 —
  operator approved the sibling-legs model 2026-07-13)
- **Category**: direction (roadmap 規劃中「多類別」, phase P1+P2 of the spike's sketch)
- **Planned at**: commit `232b90df`, 2026-07-13

## Why this matters

The operator approved the split-legs design (plan 176 / `docs/split-legs-plan.md`):
one purchase = N sibling `LedgerTransaction` rows sharing a `groupId`, each leg
carrying its own category + amount. The MOZE-style entry UI (plan 182) needs a
safe write path first: an invariant-enforcing way to create and update a split
group atomically. The codebase is closer than it looks — the fee-leg path
already writes sibling rows sharing a `groupId`, `classifyLedgerGroup` already
returns `"split"` for same-account multi-row groups, and `deleteLedgerTransaction`
already cascades by `groupId`. This plan adds the one missing discriminator
(`legKind`), the pure leg builder, and the two repository methods, with tests.

**分帳 (counterparty shares / AR-AP) is explicitly phase 2 — NOT in this plan.**

## Current state (all verified at `232b90df`)

- `src/domain/types.ts:124` — `LedgerTransaction.groupId: string | null`; the
  comment at `:127` documents groupId cascade-delete semantics. There is no
  `legKind` field yet (`grep -n "legKind" src/domain/types.ts` → no match).
- `src/domain/groupClassifier.ts` (30 lines, read it whole) — already ships:

  ```ts
  export type LedgerGroupKind = "singleton" | "split" | "transfer" | "unknown";
  // ...same-account, same-groupId multi-row → "split"
  if (accountIds.size === 1 && activeRows.every((row) => row.groupId === activeRows[0].groupId)) {
    return "split";
  }
  ```

  NOTE: a fee-leg pair (main row + auto 手續費 row, same account) ALSO
  classifies as `"split"` today. `legKind` exists to tell user splits apart
  from fee pairs — fee rows keep `legKind: null`.
- `src/data/repositories.ts`:
  - `:52` — `interface LedgerDraft` (fields: accountId, counterAccountId,
    date, name, amount, currency, originalAmount/Currency, category,
    subcategory, merchant, entryType, settlementStatus, note, groupId,
    installment*, refundOfLedgerId, recurringOccurrenceKey, postDate — read
    the interface before extending).
  - `:745-764` — fee-leg creation: two `createLedgerRow(...)` sharing
    `createId("group")` — the sibling-rows exemplar to mirror.
  - `:795-805` — `deleteLedgerTransaction` cascade:

    ```ts
    const groupId = target?.groupId;
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id || (groupId && row.groupId === groupId)
        ? bump({ ...row, deletedAt: nowIso() })
        : row,
    );
    ```

    Deleting any leg already tombstones the whole group — split delete works
    with NO new code (verify with a test, don't reimplement).
  - There are TWO repository implementations (in-memory + SQLite twin —
    e.g. fee-leg twin at `~:2291`); every method you add needs both. The
    dual-repo test harness (`repositories.testHarness.ts`) runs suites against
    both — use it.
- `src/data/migrations.ts:237-239` — schema-column convention: columns are
  added via `ensureSqliteColumn` inside the SQLite bootstrap (idempotent),
  NOT bare `ALTER TABLE`. Find an existing `ensureSqliteColumn` call for a
  nullable text column and mirror it for `leg_kind`.
- `src/domain/ledgerTrust.ts:151-165` — `incompleteTransferGroupIds` (a
  groupId whose transfer legs ≠ 2) — the partial-sync-arrival guard pattern
  this plan extends to splits.
- Consumers verified unchanged by the spike (do NOT touch): `categorySpend.ts`
  counts each row by its own category; budgets, dashboardSummary, CSV export,
  sync all treat rows independently.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Install   | `npm install`      | exit 0 (fresh worktree — run FIRST) |
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0, 0 errors    |

## Scope

**In scope**:
- `src/domain/types.ts` (add `legKind`)
- `src/domain/splitLegs.ts` + `src/domain/splitLegs.test.ts` (create — pure builder)
- `src/data/repositories.ts` (both implementations: `createSplit`, `updateSplit`; extend row serialization for the new column)
- `src/data/migrations.ts` (only if the column bootstrap lives there rather than in repositories.ts — follow where `ensureSqliteColumn` calls actually are)
- `src/data/repositories.split.test.ts` (create, on the dual-repo harness)
- `src/domain/ledgerTrust.ts` + its test (add `incompleteSplitGroupIds`)
- `src/domain/index.ts` (exports)

**Out of scope** (do NOT touch):
- Any UI file — plan 182 owns the UI.
- Fee-leg, transfer, installment, DRIP creation paths — their semantics are
  frozen; splits are a NEW parallel path.
- `categorySpend.ts`, `budgetRollover.ts`, `dashboardSummary.ts`, `csv.ts` —
  the design's whole point is that they stay untouched.
- 分帳 / counterparty legs / AR-AP — phase 2.
- Sync core (`push.ts`/`pull.ts`) — legs sync as ordinary records already.

## Git workflow

- Branch: `feat/ai-split-legs-foundation`
- Conventional commits, e.g. `feat(ledger): split-legs schema + createSplit/updateSplit`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1: `legKind` field + column

Add to `LedgerTransaction` (types.ts): `legKind: "category" | null` with a
doc comment (「多類別拆分 leg;null = 一般列/系統腿(手續費/轉帳/分期)」).
Thread it through both repositories' row creation/serialization the same way
an existing nullable field (e.g. `refundOfLedgerId`) flows: in-memory default
null; SQLite `ensureSqliteColumn` for `leg_kind` TEXT + read/write mapping.
`LedgerDraft` gets optional `legKind?: "category" | null`.

**Verify**: `npx tsc --noEmit` → 0; `npm test` → all pass (migration test
suite still green — the column bootstrap must be idempotent).

### Step 2: Pure builder `buildSplitLegs`

Create `src/domain/splitLegs.ts`:

```ts
export interface SplitLegInput { amount: number; category: string; subcategory: string }
export interface SplitSharedFields { /* accountId, date, name, merchant, currency, entryType: "expense" | "income", settlementStatus, note, postDate — mirror LedgerDraft's shared subset */ }
/** N legs → N LedgerDrafts sharing a fresh groupId, legKind:"category". */
export function buildSplitLegs(shared: SplitSharedFields, legs: SplitLegInput[], groupId: string): LedgerDraft[]
```

Rules (each enforced with a thrown Error, message in zh-TW matching repo
style): ≥ 2 legs; every leg amount > 0 (the builder applies the expense/income
sign itself, mirroring how the EntryDrawer composes signs — verify the sign
convention from `LedgerDraft` usage before hardcoding); every leg has a
non-empty category; legs keep input order. The derived total is the leg sum —
the builder does NOT take a separate total to reconcile (MOZE-style: total is
computed, so the sum invariant holds by construction). Document that in the
header.

**Verify**: `npm test` → new `splitLegs.test.ts` passes.

### Step 3: `createSplit` + `updateSplit` in both repositories

- `createSplit(shared, legs)`: calls `buildSplitLegs` with `createId("group")`
  and inserts all rows in one repository operation (mirror the fee-leg
  multi-row insert at `:745-764`; SQLite twin inside one transaction — follow
  how the existing multi-row writes batch, see `repositories.sqlite-tx.test.ts`
  for the transactional precedent).
- `updateSplit(groupId, shared, legs)`: replace-in-place — tombstone rows of
  the group that are no longer present, update matching ones, insert new ones;
  OR the simpler tombstone-all + recreate with the SAME groupId. Pick the
  simpler one, state the choice in the code comment, and ensure `revision`
  bumps so sync (LWW) propagates. Editing must not change the groupId (list
  grouping and sync identity depend on it).
- Add both to the `FinanceRepository` interface (near
  `createInstallmentPlan`, `:261`).

**Verify**: `npx tsc --noEmit` → 0; `npm test` → all pass.

### Step 4: `incompleteSplitGroupIds` in ledgerTrust

Mirror `incompleteTransferGroupIds` (`ledgerTrust.ts:151-165`): a groupId
whose active `legKind === "category"` legs number exactly 1 is incomplete
(a lone leg means a half-arrived or half-deleted split). Export it alongside
the transfer version and include it in whatever report structure the transfer
one feeds (read the call sites first).

**Verify**: `npm test` → extended `ledgerTrust.test.ts` passes.

## Test plan

- `splitLegs.test.ts`: happy path (2 and 3 legs — shared fields copied,
  groupId shared, legKind set, signs correct); throws on 1 leg / zero-amount
  leg / empty category; input order preserved.
- `repositories.split.test.ts` on the dual-repo harness (model after
  `repositories.installments.test.ts`): createSplit inserts N rows sharing a
  groupId; account balance moves by exactly the leg sum (reconciliation);
  `classifyLedgerGroup` on the group returns `"split"`; deleting ANY leg
  tombstones the whole group (existing cascade); updateSplit re-shapes legs
  (add/remove/edit) without changing groupId; categorySpend over a split
  counts each leg's own category (import and assert — proves consumers
  unchanged).
- `ledgerTrust.test.ts`: lone category-leg → its groupId reported; complete
  split → not reported; fee-leg pairs (legKind null) → never reported.

## Done criteria

- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` all pass with new suites (≥ 5 splitLegs + ≥ 6 repository + ≥ 2 ledgerTrust cases)
- [ ] `grep -n "legKind" src/domain/types.ts src/data/repositories.ts` shows field + both implementations
- [ ] `grep -n "createSplit\|updateSplit" src/data/repositories.ts` → interface + 2 implementations each
- [ ] `git diff --stat` shows NO changes to categorySpend/budgetRollover/dashboardSummary/csv or any `src/routes/` file
- [ ] `plans/README.md` status row updated

## STOP conditions

- The SQLite twin's multi-row write cannot be made atomic with the existing
  transaction helpers — report; do not ship a non-atomic split insert.
- Threading `legKind` requires touching the sync envelope/worker schema
  (it shouldn't — records serialize whole rows) — report if it does.
- The sign convention for expense/income amounts turns out to be ambiguous
  across the two repositories — report with examples.
- Any existing test fails for reasons other than your own changes.

## Maintenance notes

- Plan 182 (UI) builds directly on `createSplit`/`updateSplit`/`buildSplitLegs`
  — keep their signatures stable during review.
- 分帳 phase 2 will add a `"share"` legKind + counterparty; the union type is
  deliberately extensible.
- Reviewer: scrutinize the SQLite column bootstrap idempotency and the
  updateSplit revision bumps (sync depends on them).
