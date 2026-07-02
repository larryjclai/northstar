# Plan 096: Make imported-holding opening lots permanently cash-neutral

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b33bf55e..HEAD -- src/data/repositories.ts src/routes/TransactionsRoute.tsx src/data/repositories.investments.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches financial invariants + a data-repair step)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b33bf55e`, 2026-07-02

## Why this matters

Northstar's documented invariant is that a manual holding import (匯入現有持倉)
records an *already-held* position and must never move cash: the holding is
backed by a `cashless: true` "opening lot" investment record that deliberately
skips the 交割 ledger leg. The user reported that their broker account balance
changes with the imported holdings' share count — and the code confirms a real
leak: **editing an opening lot through the transaction editor silently converts
it into a cash-moving buy**, debiting the broker account by `price × quantity`.
This corrupts the cash-basis net worth (a locked product invariant: correctness
first for finance) and leaves already-affected users with a wrong balance until
a repair runs.

## Current state

All functionality lives in `src/data/repositories.ts`, which contains TWO
repository implementations that must stay behaviorally identical:
- `FinanceRepository` (browser/in-memory; used by tests and web fallback)
- the SQLite repository (used by the real Tauri app)

### The invariant (works correctly on the create path)

`src/data/repositories.ts:4951-4953` — cashless drafts never create a ledger row:

```ts
function createInvestmentLedgerRow(input: InvestmentDraft, investmentRecordId: string): LedgerTransaction | null {
  // Opening-balance lots record an already-held position — they never move cash.
  if (input.cashless) return null;
```

Account balance is derived purely from ledger rows
(`src/domain/ledgerTrust.ts:118-136`, `deriveAccountBalances`:
`balance = openingBalance + Σ settled ledger deltas`). So "no ledger row" ⇒
"no balance impact". Opening lots are built with `cashless: true`
(`buildOpeningRecord`, repositories.ts:4836-4858, note `note: "期初部位"` and
deterministic id `inv_open_<assetId>` from `openingRecordId()` at 4827-4829).

### The bug chain

1. **The transactions list exposes edit/duplicate on opening-lot rows.**
   `src/routes/TransactionsRoute.tsx:566-576` (desktop) and `619-625` (mobile)
   render 編輯/複製/刪除 buttons for every row with a `recordId` —
   `tx.isOpeningLot` only changes the amount cell to `—`, not the actions.

2. **The edit preset drops `cashless`.** `src/routes/TransactionsRoute.tsx:203-227`:

   ```ts
   const editingPreset = useMemo<TransactionPreset | undefined>(() => {
     ...
     return {
       id: editingRecordId ? record.id : undefined,
       draft: {
         ticker: asset?.ticker ?? "",
         ...
         fee: record.fee,
         note: record.note,
         // NOTE: no `cashless` field — the flag is lost here
       },
     };
   }, [...]);
   ```

   `src/routes/InvestmentsAddSheet.tsx:352-357` then submits that draft:

   ```ts
   const payload = normalizeTransactionDraft(transactionForm);
   if (transactionPreset?.id) {
     await updateRecord.mutateAsync({ ...payload, id: transactionPreset.id });
   ```

3. **`updateInvestmentRecord` trusts `input.cashless`.** Browser impl
   (repositories.ts:1064-1092): `createInvestmentLedgerRow(input, id)` sees
   `input.cashless === undefined` → **creates a brand-new settled transfer
   ledger row** of `-(price×qty+fee)` on the broker account (line 1083-1086),
   and `investmentDraftFields(input)` (line 5078-5089, `cashless: input.cashless ?? false`)
   **flips the stored record to `cashless: false`**. SQLite impl
   (repositories.ts:2505-2550): same ledger-row creation at 2523/2539-2542; the
   UPDATE at 2543-2545 doesn't touch the `cashless` column, so SQLite ends in an
   even worse state — a `cashless = 1` record *with* a linked cash leg.

4. **Validation also mistreats cashless drafts.** `validateInvestmentDraft`
   (browser, repositories.ts:1710-1734) and `validateSqliteInvestmentDraft`
   (repositories.ts:4088-4121) run the purchasing-power check on the raw draft:

   ```ts
   const cashDelta = calculateInvestmentCashDelta(input);
   if (cashDelta >= 0) return;
   if (allowsTwdTPlus2Buffer(input, account.currency)) return;
   ...
   if (isEffectivelyNegative(nextBalance)) throw new Error(`購買力不足，目前餘額 ...`);
   ```

   So editing an opening lot whose value exceeds the broker's cash throws
   購買力不足 even though no cash should move at all.

5. **複製 (duplicate) on an opening-lot row** (`openDuplicate`,
   TransactionsRoute.tsx:284-289) creates a *new* record via
   `createInvestmentRecord` with no `cashless` → a real cash-moving buy. There
   is no sensible use for duplicating a baseline marker.

### Helper you will reuse

`src/routes/transactionsTxLabel.ts:19-21`:

```ts
export function isImportOpeningLot(record: { cashless?: boolean; id: string; assetId: string }): boolean {
  return record.cashless === true || record.id === `inv_open_${record.assetId}`;
}
```

### Repo conventions

- Comments in code are English-or-Chinese mixed, explaining *why* (see the
  existing comments around `cashless` in repositories.ts — match that style).
- Tests: vitest, colocated `*.test.ts`. Investment-repository behavior tests
  live in `src/data/repositories.investments.test.ts` — model new tests on it.
  It exercises the browser `FinanceRepository` directly.
- vitest runs under jsdom with **no `localStorage`** — if a test needs it, stub
  per-test with `vi.stubGlobal` (see existing tests for the pattern).

## Commands you will need

| Purpose   | Command                                             | Expected on success |
|-----------|-----------------------------------------------------|---------------------|
| Tests     | `npm test`                                          | exit 0, all pass    |
| One file  | `npx vitest run src/data/repositories.investments.test.ts` | all pass    |
| Typecheck + build | `npm run build`                             | exit 0              |
| Lint      | `npm run lint`                                      | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/data/repositories.ts`
- `src/routes/TransactionsRoute.tsx` (hide 複製 for opening lots only)
- `src/data/repositories.investments.test.ts` (add tests)

**Out of scope** (do NOT touch, even though they look related):
- `src/domain/investmentCash.ts` — the cash-delta math is correct; do not add
  cashless awareness there.
- `src/routes/InvestmentImportWizard.tsx` — 匯入證券交易 (CSV trade import)
  moves cash **by design** ("買入交易需要該投資帳戶有足夠現金交割"); not a bug.
- `src/routes/InvestmentsAddSheet.tsx` — no UI change needed once the
  repository preserves the flag server-side.
- Any sync code (`src/features/connect/**`, `applySyncChanges`) — sync copies
  whole rows; it does not go through `updateInvestmentRecord`.
- `HoldingEditModal.tsx` / `updateManualHolding` — already correct (it updates
  the opening record's qty/price directly and never creates a ledger row).

## Git workflow

- Branch: `fix/ai-opening-lot-cash-leak` (repo convention: `fix/ai-<name>`,
  per `.agentrules` — never commit to `main`).
- Conventional-commit style, e.g. `fix(investments): preserve cashless flag when editing opening lots`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Preserve `cashless` in the browser `updateInvestmentRecord`

In `FinanceRepository.updateInvestmentRecord` (repositories.ts:1064), after
`existingRecord` is resolved, derive an effective input and use it for ALL
downstream calls (validation, `findOrCreateAsset`, `createInvestmentLedgerRow`,
`investmentLedgerFields`, `investmentDraftFields`):

```ts
// The cashless flag is a stored property of the record, not something the edit
// UI supplies — an opening lot must stay cashless no matter what draft arrives.
const effective: InvestmentDraft = { ...input, cashless: existingRecord.cashless };
```

Result: editing an opening lot never creates/updates a ledger row (the
`createInvestmentLedgerRow` guard returns null), and the record keeps
`cashless: true`.

**Verify**: `npx vitest run src/data/repositories.investments.test.ts` → existing tests still pass.

### Step 2: Same fix in the SQLite `updateInvestmentRecord`

In the SQLite override (repositories.ts:2505), apply the same
`effective` substitution before `validateSqliteInvestmentDraft` /
`createInvestmentLedgerRow` / `investmentLedgerFields`.

**Verify**: `npm run build` → exit 0 (this path is exercised at runtime in
Tauri; type-level verification plus Step 6 tests on the shared helpers).

### Step 3: Skip the purchasing-power check for cashless drafts

In BOTH `validateInvestmentDraft` (repositories.ts:1710) and
`validateSqliteInvestmentDraft` (repositories.ts:4088), immediately before the
`const cashDelta = calculateInvestmentCashDelta(input);` line, add:

```ts
// Cashless opening lots never settle cash, so purchasing power is irrelevant.
if (input.cashless) return;
```

(Keep the account/currency checks above it — they still apply.)

**Verify**: `npx vitest run src/data/repositories.investments.test.ts` → pass.

### Step 4: Hide 複製 for opening-lot rows

In `src/routes/TransactionsRoute.tsx`, in both `InvestmentTransactionRow`
(around line 570) and `InvestmentTransactionMobile` (around line 622), render
the 複製 button only when `!tx.isOpeningLot`. Keep 編輯 and 刪除 (delete
already safely reroutes to `deleteManualHolding`). Match the existing inline
conditional style used elsewhere in the file.

**Verify**: `npm run lint` → exit 0.

### Step 5: Repair already-corrupted data

Users who hit this bug have a settled ledger row pointing at a cashless record.
Heal it on load, idempotently, in both impls:

1. **Browser**: in `normalizeStoredData` (repositories.ts:4528), after
   `materializeOpeningRecords` produces the normalized records, soft-delete
   (set `deletedAt`, bump `revision` + `updatedAt`) every non-deleted ledger
   row whose `linkedInvestmentRecordId` refers to a record with
   `cashless === true`, and null out that record's `linkedLedgerTransactionId`.
   Write it as a small pure function (e.g. `repairCashlessLedgerLegs(ledger,
   records)`) next to `materializeOpeningRecords`, with a doc comment
   explaining the invariant. Balances self-correct because `recompute()`
   derives them from ledger rows.
2. **SQLite**: in the migration path, directly after the existing
   `ensureSqliteColumn("investment_records", "cashless", ...)` call
   (repositories.ts:2048), add two idempotent statements:

   ```sql
   update ledger_transactions set deleted_at = <now>, updated_at = <now>, revision = revision + 1
     where deleted_at is null and linked_investment_record_id in
       (select id from investment_records where cashless = 1);
   update investment_records set linked_ledger_transaction_id = null, updated_at = <now>, revision = revision + 1
     where cashless = 1 and linked_ledger_transaction_id is not null;
   ```

   Bumping `revision`/`updated_at` matters: it lets the repair win last-write-wins
   and propagate over E2E sync (same reasoning as the account-adoption comment at
   repositories.ts:1665-1667). Follow with a call to the existing SQLite
   account-recompute routine if the migration path doesn't already recompute
   balances afterwards (check how neighboring migrations handle it; mirror them).

**Verify**: `npm test` → exit 0.

### Step 6: Tests

See test plan below.

**Verify**: `npx vitest run src/data/repositories.investments.test.ts` → all pass, including the new cases.

## Test plan

Add to `src/data/repositories.investments.test.ts`, modeled on its existing
structure (create a `FinanceRepository`, seed an investment account, act,
assert):

1. **Import is cash-neutral**: `createManualHolding` → account balance unchanged.
2. **Editing an opening lot stays cash-neutral** (the reported bug): create a
   manual holding, call `updateInvestmentRecord(openingId, draft)` with a draft
   that has NO `cashless` field and a changed quantity → no new ledger row,
   account balance unchanged, record still `cashless: true`.
3. **No 購買力不足 on opening-lot edits**: same as (2) but with
   `price × quantity` far exceeding the account's cash → resolves without throwing.
4. **Repair heals corrupted data**: construct stored data containing a cashless
   record with a linked, settled, non-deleted ledger row; run it through
   `normalizeStoredData` (or a repository constructed from it) → the ledger row
   is tombstoned, the link cleared, the balance equals the pre-corruption value.
5. **Regression guard**: a normal (non-cashless) buy still creates its ledger
   row, still debits the account, and still throws 購買力不足 when cash is
   insufficient (non-TWD account, to avoid the T+2 buffer).

Verification: `npm test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0; the 5 new test cases exist and pass
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] In both `updateInvestmentRecord` impls, no code path passes the raw
      `input` to `createInvestmentLedgerRow` (grep the two functions)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts above don't match the live code (drift since `b33bf55e`).
- You find any OTHER code path that creates a ledger row from a cashless
  record (e.g. inside recurring-investment materialization or sync) — report
  it; do not widen scope silently.
- The SQLite repair statements would delete more than ledger rows linked to
  `cashless = 1` records (double-check the `in (select ...)` subquery before
  finalizing).
- Test (4) reveals the repair changes balances in a direction you cannot
  explain — a wrong repair on finance data is worse than no repair.

## Maintenance notes

- Any future code path that calls `createInvestmentLedgerRow` or the validators
  with a caller-supplied `InvestmentDraft` must decide explicitly where
  `cashless` comes from — the stored record, never the UI.
- Reviewer should scrutinize: the repair step (Step 5) — it soft-deletes ledger
  rows; confirm the subquery only matches cashless-linked rows, and that
  revision bumps are present for sync propagation.
- Deferred (deliberately): making the edit drawer render opening lots with a
  distinct "期初部位" mode (hiding fee/交割 hints). Cosmetic; the invariant is
  now enforced in the repository layer regardless.
