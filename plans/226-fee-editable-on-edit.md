# Plan 226: 手續費 editable when editing a transaction (linked fee-leg reconciliation)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat af28266e..HEAD -- src/data/repositories.ts src/routes/CashFlowRoute.tsx`
> Mismatch with the excerpts below = STOP.

## Status

- **Priority**: P2 (operator-reported: cannot set a fee on existing 海外 credit-card transactions)
- **Effort**: M
- **Risk**: MED (creates/updates ledger rows on edit — finance path; mitigated
  by dual-harness tests and the group-linking precedent)
- **Depends on**: none
- **Category**: bug / feature-gap (documented deferral, now demanded)
- **Planned at**: commit `af28266e`, 2026-07-17

## Why this matters

Creating an expense/income can attach a 手續費: the repo emits a linked fee
expense leg (same `groupId`, name/category 「手續費」). But **editing** an
existing transaction deliberately hides the field — a recorded deferral:

```tsx
// src/routes/CashFlowRoute.tsx:913-916
// Fees attach to newly-created income/expense rows; the repo emits a
// linked 手續費 expense leg. Edits never carry a fee (consistent with
// transfer behaviour: re-editing can't retroactively add fee legs).
feeAmount: !editingId && (entryType === "expense" || entryType === "income") ? (ledgerForm.feeAmount || 0) : 0,
```

The operator now hits it for real: 海外 credit-card transactions already in the
ledger (imported or entered without the fee) need their 手續費 set — 進階 shows
no field. This plan lifts the deferral for expense/income rows: the edit form
shows the fee, hydrated from the linked leg, and saving reconciles the leg
(create / update / remove). Transfers keep their existing separate fee path —
out of scope.

## Current state

- **Fee-leg creation** — `src/data/repositories.ts:1126-1145` (browser repo;
  the SQLite override mirrors it around `:1345`):

  ```ts
  if (input.feeAmount && input.feeAmount > 0) {
    const groupId = input.groupId || createId("group");
    this.data.ledgerTransactions.push(
      createLedgerRow({ ...input, groupId }),
      createLedgerRow({
        accountId: input.accountId,
        date: input.date,
        name: "手續費",
        amount: -Math.abs(input.feeAmount),
        currency: input.currency,
        category: "手續費",
        subcategory: input.entryType === "income" ? "收入手續費" : "海外交易手續費",
        merchant: input.merchant,
        entryType: "expense",
        settlementStatus: "settled",
        note: "由系統自動建立的手續費紀錄",
        groupId,
      })
    );
  }
  ```

  The fee leg is identified by: same `groupId`, `category === "手續費"`,
  `legKind == null` (system leg — user split legs are `"category"`/`"share"`),
  `deletedAt === null`.

- **The UI gate** — `src/routes/CashFlowRoute.tsx:3430`:

  ```tsx
  {(type === "expense" || type === "income") && !editing && !activeInstallment && !splitMode && (
    <DrawerField label={`外加手續費（選填） · ${ledgerForm.currency}`}>
  ```

  plus the save-path force-zero at `:916` (excerpt above), and the fee field
  binding `expenseFeeField` at `:2760-2763`.

- **Edit hydration** — find where `startEdit(row)` populates `ledgerForm`
  (grep `function startEdit` / `setLedgerForm` in the edit path); today it
  never sets `feeAmount` (stays 0).

- `updateLedgerTransaction` today (grep in repositories.ts, both repos):
  updates the single row; it does nothing with `feeAmount`.

- Group cascade precedent: `updateSplit` (`repositories.ts:1230-1245`)
  tombstones+recreates group rows with `bump()` revision raises so sync LWW
  propagates — match its revision discipline for any row this plan tombstones
  or mutates.

- Guard precedent: the transfer partial-group logic and
  `incompleteSplitGroupIds` ignore system legs (`legKind == null`) — fee legs
  stay invisible to those guards; nothing to change there.

- Dual-harness test exemplar: `src/data/repositories.split.test.ts`
  (`describeEachRepo`). Fee-leg behavior today is covered in a ledger-fee test
  file — grep `手續費` under `src/data/*.test.ts` and read it before writing
  tests; extend it rather than creating a parallel file if it fits.

## Design (decided — do not re-derive)

Repository-level semantics on `updateLedgerTransaction(id, input)` where
`input.feeAmount` is a non-negative number and the target row's entryType is
expense/income (NOT transfer):

| Existing linked fee leg | `input.feeAmount` | Action |
|---|---|---|
| none | 0 / undefined | nothing (today's behavior) |
| none | > 0 | ensure main row has a `groupId` (assign `createId("group")` and write it to the main row if null), then create the fee leg exactly as the creation path does |
| exists | > 0 | update the leg: `amount = -abs(fee)`, and sync `date`/`merchant`/`accountId`/`currency` from the updated main row; revision-bump per repo convention |
| exists | 0 | tombstone the leg (`deletedAt = nowIso()`, `bump()`) |

The fee leg lookup: same `groupId` + `category === "手續費"` + `legKind == null`
+ active. If the row's `groupId` is shared with OTHER system/user legs
(transfer pair, installments, splits), fee-leg lookup still works (category
match), but **creating a NEW groupId must not run when the row already has
one** — reuse it.

UI: drop `!editing` from the `:3430` gate; hydrate `feeAmount` in `startEdit`
from the linked leg (compute it where the edit row is loaded — pass the ledger
rows the route already holds); remove the `!editingId` force-zero at `:916`
(keep the expense/income restriction). Update the field caption for edits: the
existing copy stays, it already describes the linked-leg behavior.

Out of scope by decision: editing the fee leg row directly in the ledger list
(it remains an ordinary row the user can edit/delete manually — unchanged);
transfers (`transferForm.feeAmount` path at `:3179`); installments and splits
(the `!activeInstallment && !splitMode` gates STAY).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 762 warnings |
| Tests     | `npm test`         | 1338+ and new pass  |

## Scope

**In scope**: `src/data/repositories.ts` (both repo impls of
`updateLedgerTransaction`), the fee test file found in recon (or a new
`repositories.ledger-fee-edit.test.ts` if extending doesn't fit),
`src/routes/CashFlowRoute.tsx` (gate, hydration, save path).
**Out of scope**: transfer fee path, installments, splits, ReconcileRoute,
domain/ modules, sync wiring (fee legs are ordinary synced rows already).

## Git workflow

- Branch: `feat/ai-fee-edit` off `main`. Conventional commit. No push/merge.

## Steps

### Step 1: Repo — browser impl

Implement the Design table inside the browser `updateLedgerTransaction`
(after the main-row update, before `recompute()`). Extract a private helper if
both repos can share it via the existing inheritance pattern (the SQLite class
extends the browser one — check how `updateSplit` shares; prefer the same
structure).

**Verify**: `npx tsc --noEmit` → 0.

### Step 2: Repo — SQLite parity

Mirror in the SQLite override (or inherit if step 1's placement already
covers it — confirm by reading the override's call chain, don't assume).

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: Dual-harness tests

In the fee test file (see recon), `describeEachRepo` over:
1. Add fee on edit (row without groupId): update with `feeAmount: 250` → fee
   leg exists (category 手續費, amount −250, same new groupId as main row);
   account balance reflects −250 more.
2. Change fee: 250 → 100 → same leg id updated (amount −100), no second leg.
3. Remove fee: → leg tombstoned with bumped revision; balance restored.
4. Edit UNRELATED fields with an existing fee leg and `feeAmount` echoing the
   current fee → leg intact (no churn: assert its `updatedAt`/revision only
   bumps when the design table says so — if echo-updates unavoidably bump,
   assert amount unchanged and note it).
5. Transfer rows: `feeAmount` in input is ignored (no leg created).

**Verify**: targeted vitest run → all pass.

### Step 4: UI unlock

`CashFlowRoute.tsx`: remove `!editing` from `:3430`; hydrate
`ledgerForm.feeAmount` in the edit-start path from the linked leg (lookup
helper can live beside the other row-derivation helpers in the file); change
`:916` to pass `ledgerForm.feeAmount || 0` for expense/income regardless of
`editingId`.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0/762; `npm test` → all pass.

## Test plan

Step 3 carries the semantics. Reviewer feel-check: edit an existing 海外
expense → 進階 shows 外加手續費 with the current fee (0 if none) → set 30 →
save → ledger shows a linked 手續費 row; re-edit shows 30; set 0 → row gone;
recurring-rule-generated occurrence edit still shows the this/future/all prompt
and the fee applies to the edited occurrence only.

## Done criteria

- [ ] Gates green with ≥5 new dual-harness tests
- [ ] `grep -n '!editing' src/routes/CashFlowRoute.tsx` no longer gates the fee DrawerField
- [ ] Editing with fee echo (test 4) does not duplicate legs
- [ ] No files outside scope modified

## STOP conditions

- `updateLedgerTransaction`'s structure differs materially between the two
  repos such that the Design table can't be implemented with parity — report
  both shapes.
- The recurring-edit scope flow (`applyRecurringScopeEdit`,
  repositories.ts:1246+) routes edits through a path that would fan the fee
  leg out to future/all occurrences — if the fee interaction with scope edits
  is ambiguous, STOP and describe (expected: fee applies only to the edited
  occurrence row; scope propagation copies template fields, not fee legs).
- The 外幣 (originalAmount/originalCurrency) edit path stores fee in a
  different currency than `ledgerForm.currency` implies — report; the fee stays
  in the ROW's currency (same as creation) and the plan assumes the label
  `· ${ledgerForm.currency}` remains accurate.

## Maintenance notes

- The fee-leg identification contract (groupId + category 手續費 + legKind
  null) is now load-bearing in TWO places (create + update). If 分帳/split UI
  (plan 222) ever lets users recategorize a system fee leg, this lookup breaks
  — reviewers of 222 should keep 手續費 category immutable on system legs or
  add a `legKind: "fee"` migration first.
- CSV import paths that create fee-less rows are exactly the rows this feature
  serves — no importer change needed.
