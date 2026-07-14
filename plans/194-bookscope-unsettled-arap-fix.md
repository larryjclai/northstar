# Plan 194: 修 bookScope 回歸 — 未結清應收/應付（accountId=""）在總帳與帳本視圖中消失

> **Executor instructions**: Follow step by step, verify each step, honor
> STOP conditions. Do NOT update `plans/README.md` — the reviewer maintains
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 50419301..HEAD -- src/domain/bookScope.ts src/routes/CashFlowRoute.tsx`

## Status

- **Priority**: P1 (shipped 189 regression — user-visible data disappearance)
- **Effort**: S
- **Risk**: LOW (widens a filter; guarded by a new test)
- **Depends on**: none (independent; blocks 191's live verification)
- **Category**: bug
- **Planned at**: commit `50419301`, 2026-07-13 (fill actual main HEAD at dispatch)

## Why this matters

Plan 189's `scopeRows` drops every ledger row whose `accountId` is `""` or
null. Unsettled 應收/應付 rows (代墊, and invoices from plan 191) carry
`accountId === ""` until they settle (the receiving account is chosen at
settle time — `CashFlowRoute.tsx:705-726`). So they are filtered out of
`bookLedgerRows` (`CashFlowRoute.tsx:254`), which feeds the **未結清
settlements card** (`CashFlowRoute.tsx:1153-1158`) — **including in 總帳**,
where `bookAccountIdSet(accounts, "all")` returns every real account id but
still not `""`. Net effect on the shipped app: every unsettled receivable/
payable vanishes from the 未結清 card in every book view. This also blocks
plan 191's flow (a freshly created invoice would not appear in 未結清).

## Current state (verified at `50419301`)

- `src/domain/bookScope.ts` — `scopeRows`:
  ```ts
  export function scopeRows<T extends { accountId: string | null }>(
    rows: T[],
    accountIdSet: Set<string>,
  ): T[] {
    return rows.filter((row) => row.accountId != null && accountIdSet.has(row.accountId));
  }
  ```
  This is the bug: an unassigned row (`accountId === ""`) is never in the
  set, so it is always dropped.
- `bookAccountIdSet(accounts, ALL_BOOKS)` returns all real account ids —
  `""` is not among them, so even 總帳 drops unassigned rows.
- Callers: `CashFlowRoute.tsx:254` (`bookLedgerRows`), feeding the
  settlements card (`1153`), stats (`969`), activity (`922`), chart (`1019`),
  CategoriesTab (`1673`). Cash-flow stats already filter to
  `settlementStatus === "settled"`, so keeping unsettled rows does NOT change
  settled-only numbers — it only restores the unsettled ones to the
  settlements card (which wants them).
- 189's `booksPartition` characterization test asserts money aggregates are
  unchanged — those use `accounts`, not scoped ledger rows, so this fix does
  not touch them (verify they stay green).

## Commands you will need

| Purpose   | Command              | Expected |
|-----------|----------------------|----------|
| Install   | `npm install`        | exit 0   |
| Typecheck | `npx tsc --noEmit`   | exit 0   |
| Tests     | `npm test`           | all pass |
| Lint      | `npm run lint`       | exit 0   |

## Scope

**In scope**:
- `src/domain/bookScope.ts` — `scopeRows` (the fix)
- `src/domain/bookScope.test.ts` — new cases

**Out of scope**:
- Per-book precision for unassigned rows (scoping a 代墊 by its
  `counterAccountId`, or an invoice by its linked `invoices.bookId`) — a
  refinement, NOT this fix. This plan makes unassigned rows visible
  EVERYWHERE (總帳 + every book), which is the safe direction (a pending
  receivable showing in one extra view beats it vanishing). Note it as a
  follow-up.
- Any route/component change (the callers already pass rows through
  `scopeRows`; fixing the helper fixes all of them).
- Repository/sync/schema.

## Git workflow
- Branch `fix/ai-bookscope-unsettled` off `main`. Conventional commit. Do NOT push/PR.

## Steps

### Step 1: Failing test FIRST
In `src/domain/bookScope.test.ts`, add: given accounts in book A + book B and
an unsettled `ar` row with `accountId: ""` (settlementStatus "receivable"),
assert `scopeRows([thatRow, ...normalRows], bookAccountIdSet(accounts, "all"))`
INCLUDES the unassigned row (總帳 must show it) — and that it is also included
for a specific book id (unassigned = shown everywhere, per the scope
decision). Also keep the existing case proving a normal row IS filtered by
book.
**Verify**: `npm test -- bookScope` → the new assertion FAILS before Step 2.

### Step 2: Keep unassigned rows in scopeRows
```ts
export function scopeRows<T extends { accountId: string | null }>(
  rows: T[],
  accountIdSet: Set<string>,
): T[] {
  // An unassigned row (accountId "" or null) belongs to no account yet —
  // typically an unsettled 應收/應付 whose receiving account is chosen at
  // settle time. It must not be scoped out (that hid it from 未結清 even in
  // 總帳 — plan 194). Rows WITH an account filter by book membership.
  return rows.filter((row) => !row.accountId || accountIdSet.has(row.accountId));
}
```
**Verify**: `npm test -- bookScope` → all pass, including the new case.

### Step 3: Full gate
**Verify**: `npm test` all green (incl. 189 `booksPartition` + 190
`invoicesPartition` byte-unchanged); `npx tsc --noEmit` 0; `npm run lint` 0.

## Done criteria
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0; `npm test` 0 failures
- [ ] `bookScope.test.ts` asserts an `accountId:""` row survives `scopeRows` in both "all" and a specific-book set
- [ ] `scopeRows` keeps `!row.accountId` rows
- [ ] 189 `booksPartition` + 190 `invoicesPartition` tests unchanged and green
- [ ] Only `bookScope.ts` + `bookScope.test.ts` modified (`git status`)

## STOP conditions
- `scopeRows` no longer matches the excerpt (changed since planning).
- Keeping unassigned rows breaks a `booksPartition`/`invoicesPartition`
  assertion (would mean an aggregate DOES consume scoped unsettled rows —
  report the exact number).

## Maintenance notes
- Follow-up (deferred): precise per-book affiliation for unassigned rows —
  scope a 代墊 by `counterAccountId`, an invoice-receivable by its linked
  `invoices.bookId`. Until then, unsettled ar/ap show in every book view.
- Reviewer live pass: after this + 191, create an invoice in a company book →
  it appears in 未結清; settle it → it leaves 未結清 and `settledAt` stamps.
- My own 189 review missed this (I live-tested the switcher but not the
  settlements-with-unsettled-ar interaction) — the reviewer of THIS plan
  should live-verify the settlements card specifically.
