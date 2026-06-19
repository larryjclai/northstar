# Plan 030: Deleting an account can no longer orphan AR/AP rows, and existing orphans are detected

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 721f216f..HEAD -- src/data/repositories.ts src/domain/dataHealth.ts src/routes/CashFlowRoute.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `721f216f`, 2026-06-19

## Why this matters

The operator reported: "帳戶刪除後連動的交易也沒有刪除一直在總覽出現" — after
deleting an account, linked transactions survived and kept appearing in 總覽.

Root cause: `deleteAccount` blocks deletion when an account has linked rows, but
its guard checks **only `account_id`**, never `counter_account_id`. An 應收/應付
(AR/AP) row created with a 代墊 *counter* account (the 付款/收款 account that
fronts or receives the money now) but **no settle account** has `account_id = ""`
and `counter_account_id = <that account>`. The guard misses it, so that account
can be deleted. The AR/AP row then survives as an **orphan**: it still posts its
counter leg to the now-deleted account's id in `deriveAccountBalances`, and still
renders in the activity feed and dashboard — exactly the operator's symptom.
This is also the most likely source of the "+302" credit-card balance from plan
029 (a payable whose counter account is the card posts `+amount` immediately).

This plan (1) closes the guard so the deletion is blocked, and (2) adds an orphan
detector to the existing data-health report so any orphans **already** in the
operator's data surface with the offending rows named — so they can be settled
or deleted.

## Current state

- `src/data/repositories.ts` — `deleteAccount`, two implementations:
  - **Browser** (lines 674–682):
    ```ts
    async deleteAccount(id: string) {
      const hasRows = this.data.ledgerTransactions.some((row) => row.accountId === id && row.deletedAt === null)
        || this.data.investmentRecords.some((row) => row.linkedAccountId === id && row.deletedAt === null);
      if (hasRows) throw new Error("已有交易的帳戶不能刪除。");
      this.data.accounts = this.data.accounts.map((account) =>
        account.id === id ? bump({ ...account, deletedAt: nowIso() }) : account,
      );
      await this.persist();
    }
    ```
  - **Tauri/SQLite** (lines 2004–2014):
    ```ts
    override async deleteAccount(id: string) {
      const linkedLedger = await this.db.select<Array<{ count: number }>>(
        `select count(*) as count from ledger_transactions where account_id = $1 and deleted_at is null`,
        [id],
      );
      const linkedInvestments = await this.db.select<Array<{ count: number }>>(
        `select count(*) as count from investment_records where linked_account_id = $1 and deleted_at is null`,
        [id],
      );
      if ((linkedLedger[0]?.count ?? 0) > 0 || (linkedInvestments[0]?.count ?? 0) > 0) throw new Error("已有交易的帳戶不能刪除。");
      await this.db.execute(`update accounts set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
    }
    ```
  Both must also reject when `counter_account_id` references the account.
- The balance/counter-leg semantics live in `src/domain/ledgerTrust.ts:106-136`
  (`accountBalanceDelta` / `deriveAccountBalances`): a row with a
  `counterAccountId` always posts `-amount` to that counter account. So a row
  referencing a deleted account via `counterAccountId` keeps moving balances.
- `src/domain/dataHealth.ts` — `buildDataHealthReport` already produces a list
  of `DataHealthIssue`s shown on the Dashboard. The `DataHealthKind` union is at
  lines 8–14; existing rules (negative-cash at 215–232, overdue-settlement at
  234–257) are the structural pattern to copy.
- AR/AP rows **do** appear in CashFlow's 近期動態 list (no filter excludes them;
  see `scopedRows` at `src/routes/CashFlowRoute.tsx:680`). They are intentionally
  excluded from income/expense **until settled** (the「結清後會計入收支」note at
  `CashFlowRoute.tsx:927`). That exclusion is by design — do not change it.

**Conventions to match:**
- zh-TW UI strings. Error messages thrown from the repo are surfaced verbatim by
  callers (see `AccountsRoute.submit` catch at line 201).
- The SQLite and Browser repos must stay behaviorally identical — every change to
  one needs the mirror change to the other (this repo maintains both; see the
  many paired `override` methods).

## Commands you will need

| Purpose   | Command                                          | Expected            |
|-----------|--------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                               | exit 0              |
| Tests     | `npm run test`                                   | all pass            |
| One file  | `npx vitest run src/domain/dataHealth.test.ts`   | pass                |
| Repo test | `npx vitest run src/data/repositories.refund.test.ts` | pass (pattern ref) |
| Lint      | `npm run lint`                                   | exit 0, 0 errors    |
| Build     | `npm run build`                                  | exit 0              |

## Scope

**In scope**:
- `src/data/repositories.ts` — both `deleteAccount` implementations (Step 1).
- `src/domain/dataHealth.ts` — new `orphaned-row` health rule (Step 2).
- `src/domain/dataHealth.test.ts` — tests for the new rule.
- A new test file `src/data/repositories.deleteAccount.test.ts` (Step 3) —
  unless an existing repo test file is the obvious home; check
  `ls src/data/repositories.*.test.ts` first and reuse if one clearly fits.

**Out of scope**:
- `deriveAccountBalances` / `accountBalanceDelta` in `ledgerTrust.ts` — the
  counter-leg math is correct.
- The income/expense exclusion of unsettled AR/AP (by design).
- Any auto-deletion or auto-repair of orphan rows. This plan only **detects and
  names** them; deciding their fate (settle vs delete) is the operator's call
  via existing per-row controls. Do not add a destructive "clean orphans" button.

## Git workflow

- Branch: `git checkout -B advisor/030-ar-ap-integrity main`.
- Commit per step; conventional commits
  (e.g. `fix(accounts): block deletion of accounts referenced as a counter leg`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Close the `deleteAccount` guard against counter-account references

**Browser impl** — extend the `hasRows` check:
```ts
const hasRows = this.data.ledgerTransactions.some((row) =>
    (row.accountId === id || row.counterAccountId === id) && row.deletedAt === null)
  || this.data.investmentRecords.some((row) => row.linkedAccountId === id && row.deletedAt === null);
```

**Tauri impl** — extend the SQL predicate:
```ts
const linkedLedger = await this.db.select<Array<{ count: number }>>(
  `select count(*) as count from ledger_transactions where (account_id = $1 or counter_account_id = $1) and deleted_at is null`,
  [id],
);
```
Leave the rest of both methods unchanged.

**Verify**: `npx tsc --noEmit` → exit 0. (Behavioral verification is in Step 3.)

### Step 2: Detect orphaned ledger rows in the data-health report

In `src/domain/dataHealth.ts`:
1. Add `"orphaned-row"` to the `DataHealthKind` union (lines 8–14).
2. After Rule 6 (overdue-settlement, ends line 257) add Rule 7. Build a set of
   **valid (non-deleted) account ids**, then flag any active ledger row whose
   `accountId` (when non-empty) or `counterAccountId` (when non-null) points to
   an id not in that set:
   ```ts
   // ── Rule 7: orphaned-row — ledger rows referencing a deleted/missing account ──
   const validAccountIds = new Set(accounts.filter((a) => a.deletedAt === null).map((a) => a.id));
   const orphanRows: string[] = [];
   for (const row of ledger) {
     if (row.deletedAt !== null) continue;
     const mainOrphan = row.accountId !== "" && !validAccountIds.has(row.accountId);
     const counterOrphan = row.counterAccountId != null && !validAccountIds.has(row.counterAccountId);
     if (mainOrphan || counterOrphan) {
       orphanRows.push(row.name || row.merchant || row.id);
     }
   }
   if (orphanRows.length > 0) {
     issues.push({
       id: "orphaned-row",
       severity: "error",
       kind: "orphaned-row",
       message: `以下交易連結到已刪除或不存在的帳戶，仍在影響餘額，請結清或刪除：${orphanRows.slice(0, 8).join("、")}${orphanRows.length > 8 ? ` 等 ${orphanRows.length} 筆` : ""}`,
       affected: orphanRows,
     });
   }
   ```
   Note: an AR/AP row legitimately has `accountId === ""` until settled — that is
   **not** an orphan (the `!== ""` guard handles it). Only a *non-empty* id that
   doesn't resolve, or a dangling `counterAccountId`, counts.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Tests

**Repo guard test** — new `src/data/repositories.deleteAccount.test.ts` (model
its setup on `src/data/repositories.refund.test.ts`, which constructs a
`BrowserFinanceRepository` and exercises CRUD):
- Create account A and account B. Create an AR ledger row with `accountId: ""`,
  `counterAccountId: B.id`, `settlementStatus: "receivable"`. Attempt
  `deleteAccount(B.id)` → expect it to **throw** `已有交易的帳戶不能刪除。`.
- Sanity: deleting an account with no references still succeeds.

**Health test** — in `src/domain/dataHealth.test.ts` (match existing
`describe`/`it`): build a report where one active ledger row's
`counterAccountId` points to an id not present in `accounts`, assert the report
contains an issue with `kind: "orphaned-row"` and `severity: "error"`, and that
a normal unsettled AR row with `accountId: ""` and a **valid** counter account
does **not** trigger it.

**Verify**:
- `npx vitest run src/data/repositories.deleteAccount.test.ts` → pass.
- `npx vitest run src/domain/dataHealth.test.ts` → pass.
- `npm run test` → all pass.

### Step 4: Verify AR rows are visible (item 9a) — investigate-only

**Update (operator, 2026-06-19):** the operator found their AR rows by *searching*
the list, and confirmed the likely cause was the **missing pagination** (plan 031)
— not a persistence bug. So this step is now a *confirmation*, not an
investigation: once 031 has landed, AR rows should be visible without searching.

The original reasoning: the code path (`scopedRows` →
`activityRows` → `displayRows` → `dayGroups` in `src/routes/CashFlowRoute.tsx`)
does **not** filter out AR/AP rows, and the default date scope is the current
month (`makeDefaultDateScope(timezone, "month")`, line 151), so a row dated today
should appear. Do **not** change code speculatively. Instead:
1. Run `npm run dev`, go to 現金流, add an 應收帳款 dated today with an amount.
2. Confirm it appears in 近期動態 with an 應收 badge.
3. If it appears → item 9a is resolved (it was the orphan/visibility confusion
   from Steps 1–2); note that in the PR description and move on.
4. If it genuinely does **not** appear → this is an unconfirmed separate bug.
   **STOP and report** the exact repro (account chosen, counter account chosen,
   date) so it can be diagnosed with real data — do not guess at a fix.

**Verify**: documented repro result (appears / does-not-appear) in the commit or
PR notes.

## Test plan

- `src/data/repositories.deleteAccount.test.ts` (new): counter-account guard
  blocks deletion; unreferenced account still deletes.
- `src/domain/dataHealth.test.ts` (extend): `orphaned-row` fires for a dangling
  `counterAccountId`; does not fire for a normal unsettled AR.
- Pattern refs: `repositories.refund.test.ts` (repo construction),
  existing `dataHealth.test.ts` blocks.
- Verification: `npm run test` → all pass including new cases.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test` exits 0; new deleteAccount + orphaned-row tests pass
- [ ] `grep -n "counter_account_id = \$1 or" src/data/repositories.ts` OR `grep -n "counterAccountId === id" src/data/repositories.ts` returns a match (both impls patched — verify each)
- [ ] `grep -n "orphaned-row" src/domain/dataHealth.ts` returns matches
- [ ] Item 9a repro result recorded (Step 4)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- Either `deleteAccount` body no longer matches the "Current state" excerpt.
- A freshly-added AR row does not appear in 近期動態 (Step 4 path 4) — real
  separate bug needing the operator's data.
- The `accounts` array passed to `buildDataHealthReport` turns out to **exclude**
  deleted accounts entirely (then `validAccountIds` would also miss legitimately
  recently-deleted-but-pending-sync accounts) — verify by checking the call site
  in `DashboardRoute.tsx`; if accounts are pre-filtered, adjust the rule to use
  the unfiltered set or report.

## Maintenance notes

- This guard makes a previously-deletable account undeletable while an AR/AP
  references it as a counter leg. That is correct, but the operator now needs a
  path to *settle or delete that row first*. The row is editable/deletable from
  the CashFlow 近期動態 list (per-row ✓ / 🗑 controls) — confirm that still works
  for an `accountId: ""` AR row.
- The orphan detector is detection-only by design. A future plan could add a
  guided "settle or delete" action from the data-health card; keep it
  non-destructive.
- Plan 029's `explainAccountBalance` helper is the companion tool for confirming
  a card nets to 0 once orphans are cleaned.
