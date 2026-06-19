# Plan 036: 延後入帳 — a charge can post to a later date and bill to the next statement

> **Executor instructions**: This is a **phased** plan touching a schema column
> across a large module. Do each phase fully, verify, and commit before the next.
> Phase 0 is mandatory: confirm the touch-point list before writing any code. If
> anything in "STOP conditions" occurs, stop and report. Update
> `plans/README.md` when done.
>
> **Drift check (run first)**:
> `git diff --stat 721f216f..HEAD -- src/domain/types.ts src/data/repositories.ts src/domain/creditCardStatements.ts src/routes/CashFlowRoute.tsx`
> Compare excerpts to live code; on mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED-HIGH (adds a persisted column to `ledger_transactions`)
- **Depends on**: none (independent of 035, but designed to pair with it)
- **Category**: feature / migration
- **Planned at**: commit `721f216f`, 2026-06-19

## Why this matters

The operator: "信用卡對賬的時候希望可以有延後入帳的功能（可能在編輯明細那邊要可以
訂該筆消費是當下入帳或是延後到哪天入帳），然後算入下一期帳單."

A Taiwan credit-card charge sometimes posts to a **later statement** than its
purchase date (e.g. a charge made just after the closing date, or a merchant that
delays settlement). The operator wants to record the **consumption date** and a
separate **posting date** so the charge falls into the correct (often *next*)
statement cycle. Today there is only a single `date`, so the reconcile screen
buckets it by purchase date and bills it to the wrong cycle.

Key semantic decision (already made — do not change): a credit-card charge is
real debt **immediately**, so the *account balance* must not change based on
posting date. Only **which statement cycle it appears in** changes. Therefore the
only behavioral change is in `buildStatementPeriods`, which buckets by
`postDate ?? date` instead of `date`. Account-balance math
(`deriveAccountBalances`) is untouched.

## Current state

- `src/domain/types.ts:90-146` — `LedgerTransaction`. Recently-added optional
  fields (`installmentGroupId?`, `refundOfLedgerId?`, `recurringOccurrenceKey?`)
  are the **pattern** for adding a new optional field cleanly.
- `src/data/repositories.ts`:
  - `LedgerDraft` interface (around line 50–90) — mirrors the draft fields.
  - `createLedgerRow(input)` factory (search `function createLedgerRow`) — maps
    every field, e.g. `refundOfLedgerId: input.refundOfLedgerId ?? null,`.
  - `ensureSqliteColumn("ledger_transactions", ...)` migration calls (lines
    1875–1945) — the established additive-migration mechanism. `refund_of_ledger_id`
    / `counter_account_id` were added the same way.
  - `insertLedgerRow` (search `private async insertLedgerRow`) — the column list +
    `$n` params for inserts.
  - `updateLedgerTransaction` SQL (Tauri override, around line 2060–2064) — the
    `update ledger_transactions set ...` column list.
  - `listLedgerTransactions` Tauri mapper (lines 2015–2030) — the
    `col as camelCase` projection (e.g. `refund_of_ledger_id as refundOfLedgerId`).
- `src/domain/creditCardStatements.ts` — `buildStatementPeriods<T extends
  StatementRow>` buckets rows by `row.date` via `closingDateFor(row.date, statementDay)`
  (line 120). `StatementRow` (line 13) is the minimal row shape it needs.
- `src/routes/CashFlowRoute.tsx` — the `EntryDrawer` is where a charge is entered/
  edited; `submitLedger` (line 459) builds the `LedgerDraft` payload. A `dueDate`
  control already exists and is encoded into `note` (line 481) — the new 入帳日 is
  a *real field*, not a note hack.
- Sync: ledger rows are serialized for cross-device sync. **Phase 0 must locate
  where** (grep below) so `post_date` is included — otherwise it won't sync.

**Conventions to match:**
- Additive SQLite migrations via `ensureSqliteColumn` (never destructive).
- Optional fields default to `null`; `?? null` coalescing everywhere (see the
  `insertLedgerRow` "defensive fallbacks" comment at ~line 3527).
- zh-TW UI; date inputs use the app's datetime-local helpers
  (`nowAsDatetimeLocal`, already imported in CashFlowRoute).

## Commands you will need

| Purpose   | Command                                              | Expected         |
|-----------|------------------------------------------------------|------------------|
| Typecheck | `npx tsc --noEmit`                                   | exit 0           |
| Tests     | `npm run test`                                       | all pass         |
| One file  | `npx vitest run src/domain/creditCardStatements.test.ts` | pass         |
| Lint      | `npm run lint`                                       | exit 0, 0 errors |
| Build     | `npm run build`                                      | exit 0           |

## Scope

**In scope**:
- `src/domain/types.ts` — `LedgerTransaction.postDate`.
- `src/data/repositories.ts` — `LedgerDraft`, `createLedgerRow`, migration,
  insert/update/list SQL (both Browser and Tauri repos), sync serialization.
- `src/domain/creditCardStatements.ts` + `.test.ts` — bucket by `postDate ?? date`.
- `src/routes/CashFlowRoute.tsx` — 入帳日 control + pass `postDate` in `submitLedger`.

**Out of scope**:
- `deriveAccountBalances` / `accountBalanceDelta` (`ledgerTrust.ts`) — balance
  must NOT depend on posting date.
- Cash-flow income/expense totals, charts, categories — they bucket by `date`
  (the consumption date), which is correct and unchanged.
- Non-credit accounts — `postDate` is accepted everywhere but only *consumed* by
  statement bucketing (credit cards).

## Git workflow

- Branch: `git checkout -B advisor/036-deferred-posting main`.
- One commit per phase; conventional commits.
- Do NOT push or open a PR unless instructed.

## Phases

### Phase 0 (mandatory): Confirm the touch-point map

Run and read the output of each, then write the confirmed list into the PR
description before coding:
```
grep -n "refundOfLedgerId\|refund_of_ledger_id" src/data/repositories.ts
grep -n "insertLedgerRow" src/data/repositories.ts
grep -n "update ledger_transactions set" src/data/repositories.ts
grep -rn "refund_of_ledger_id\|refundOfLedgerId" src/domain/sync.ts src/data
```
Confirm `post_date` will be added everywhere `refund_of_ledger_id` appears
(that field is the structural twin). **If `refund_of_ledger_id` is NOT present in
the sync serialization path**, STOP and report — it means either ledger sync
serializes a whole-object blob (then `postDate` rides along automatically) or
uses an explicit field list (then `post_date` must be added there). State which.

**Verify**: touch-point list recorded; no code changed yet.

### Phase 1: Add the field + all read/write plumbing (no behavior change)

1. `types.ts`: add to `LedgerTransaction`:
   ```ts
   /** Optional posting date for credit-card charges that bill to a later
    *  statement than their purchase `date`. Null = posts on `date`. The account
    *  balance is unaffected; only statement bucketing uses this. */
   postDate?: string | null;
   ```
2. `repositories.ts` `LedgerDraft`: add `postDate?: string | null;`.
3. `createLedgerRow`: add `postDate: input.postDate ?? null,`.
4. Migration: add
   `await this.ensureSqliteColumn("ledger_transactions", "post_date", "text");`
   alongside the other ledger `ensureSqliteColumn` calls (~line 1945).
5. `insertLedgerRow`: add `post_date` to the column list, a `$n` placeholder, and
   `row.postDate ?? null` to the values array (renumber `$n` carefully).
6. `updateLedgerTransaction` (Tauri): add `post_date = $n` to the SET list and the
   param (renumber).
7. `listLedgerTransactions` (Tauri mapper): add `post_date as postDate`.
8. Sync serialization: per Phase 0's finding, add `post_date`/`postDate` wherever
   `refund_of_ledger_id` is serialized/deserialized.

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `npm run test` → all pass (existing ledger/sqlite-tx tests still green — proves
  the SQL column/param renumbering is correct).
- `npm run build` → exit 0.

### Phase 2: Bucket statements by `postDate ?? date`

In `src/domain/creditCardStatements.ts`:
- Extend `StatementRow` (line 13) with an optional `postDate?: string | null`.
- Where the cycle is chosen (line 120, `const close = closingDateFor(row.date, statementDay);`),
  use the effective posting date:
  ```ts
  const effectiveDate = (row.postDate ?? row.date);
  const close = closingDateFor(effectiveDate, statementDay);
  ```
  Apply the same `row.postDate ?? row.date` substitution anywhere the function
  reads `row.date` for **cycle assignment** (do NOT change anything that displays
  the row's own date to the user — the purchase date still shows).

Add tests in `creditCardStatements.test.ts` (match existing cases): a charge with
`date` just before the closing day but `postDate` after it lands in the **next**
cycle; a charge with no `postDate` behaves exactly as today (regression).

**Verify**: `npx vitest run src/domain/creditCardStatements.test.ts` → all pass
including 2 new cases.

### Phase 3: 入帳日 control in the entry editor

In `src/routes/CashFlowRoute.tsx`'s `EntryDrawer`, for `expense` entries on a
**credit-card** account, add a small control: 入帳時間 = 「當下入帳」(default) or
「延後到…」with a date input. When 延後 is chosen, set `postDate` on the payload in
`submitLedger`; otherwise leave it null. Keep it unobtrusive (a collapsible row
near the date field). Only render it when the selected account's type is credit
(`accountRows.find(a => a.id === ledgerForm.accountId)?.type === "credit"`).

In `submitLedger`, add `postDate: <chosen value or null>` to the `payload`.

**Verify**:
- `npx tsc --noEmit` → exit 0; `npm run build` → exit 0.
- Manual (if runnable): add a credit-card charge dated the 1st with 入帳 延後到 the
  20th on a card closing on the 5th → on 對帳 it appears in the cycle that closes
  *after* the 20th (next statement), not the early-month one; the account balance
  is unchanged; the row still shows its purchase date in the list.

## Test plan

- `creditCardStatements.test.ts`: deferred charge buckets to next cycle;
  no-postDate regression unchanged (Phase 2).
- Existing `repositories.*.test.ts` must stay green after Phase 1 (proves SQL
  renumbering). If a test directly asserts an inserted row's columns, update it to
  include `postDate: null`.
- Verification: `npm run test` → all pass.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test` exits 0; new statement-bucketing tests pass
- [ ] `grep -rn "post_date" src/data/repositories.ts` shows it in migration,
      insert, update, and list mapper
- [ ] `grep -n "postDate" src/domain/creditCardStatements.ts` returns matches
- [ ] Account balances are unchanged by setting `postDate` (verify a charge's
      effect on `deriveAccountBalances` is identical with/without postDate — add a
      unit assertion or reason it in the PR)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Phase 0 reveals the ledger sync path uses an explicit field list you cannot
  confidently extend — STOP and report (a missed field silently drops `postDate`
  on sync).
- Any existing `repositories` test fails after Phase 1 in a way that isn't a
  simple `postDate: null` addition — the SQL renumbering is likely off; STOP.
- `buildStatementPeriods`'s row shape is consumed somewhere that can't supply
  `postDate` — STOP and report rather than widening unrelated call sites.

## Maintenance notes

- `postDate` affects **only** statement bucketing. If a future feature wants
  cash-flow/charts to honor posting date, that is a separate, deliberate decision
  — do not let it leak there silently.
- Pairs with plan 035: once 延後入帳 exists, editing a charge's 入帳日 from the
  reconcile screen is reachable via 035's deep-link to the editor.
- The single-`date`-encoded `dueDate` note hack (CashFlowRoute.tsx:481) is
  unrelated; do not refactor it here.
