# Plan 227: 編輯轉帳 — editing a transfer creates a DUPLICATE pair instead of updating

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 9ece3bde..HEAD -- src/data/repositories.ts src/routes/CashFlowRoute.tsx src/components/TransactionDetailPanel.tsx`
> Material mismatch with the excerpts below = STOP.

## Status

- **Priority**: P1 (silent data corruption on a normal user action — every
  "edit transfer" save mints a duplicate transfer pair while the original stays)
- **Effort**: M
- **Risk**: MED-HIGH (writes ledger rows on a balance-moving path; mitigated by
  dual-harness tests, `assertTransferInvariants`, and the `updateSplit`
  atomicity precedent)
- **Depends on**: none (226 touches `updateLedgerTransaction` + the same route
  file — coordinate merge order, trivial conflicts; this plan adds a NEW repo
  method and does not modify `updateLedgerTransaction`)
- **Category**: bug (discovered by plan 225's executor, advisor-verified at `93ee4103`)
- **Planned at**: commit `9ece3bde`, 2026-07-17

## Why this matters

The detail panel shows 編輯交易 unconditionally — transfers included
(`src/components/TransactionDetailPanel.tsx:322`). Tapping it on a transfer:

1. `startEdit` (`CashFlowRoute.tsx:693`) sets `drawerType` to `"transfer"`
   (`cashTypeFromRow`, `:638-639`) and `editingId`, but hydrates **`ledgerForm`
   only** (`:713-729`) — `transferForm` is never touched, so the drawer opens
   with `emptyTransfer` or whatever the last transfer draft left behind.
2. `submitTransfer` (`:1025-1039`) **always** calls
   `createTransfer.mutateAsync(transferForm)` — there is no update path.

So "editing" a transfer shows a wrong (empty/stale) form titled 編輯交易, and
saving **creates a brand-new transfer pair** (plus fee leg if entered) while
the original pair stays. Account balances silently double-move. The reverse
direction is broken too: while editing an expense, tapping the 轉帳 type tab
(`changeType`, `:604`; tabs are NOT hidden while editing, `:2976-2996`) and
saving creates a new transfer and strands the original expense.

**Interim mitigation option (operator's call, NOT part of this plan's steps):**
a one-line patch hiding 編輯交易 for transfer rows in
`TransactionDetailPanel.tsx:322` (`row.entryType !== "transfer"`), leaving
複製 (`startDuplicate` handles transfers correctly, `:759-772`) + 刪除
(repo groupId cascade deletes both legs + fee, `repositories.ts:1176/3101`) as
the workaround — delete + re-create via duplicate. Ship it only if this plan
can't be executed promptly; it is superseded by the real fix below.

## Current state (verified at `9ece3bde`)

- **Transfer shape** — `createTransfer` (browser `repositories.ts:1310-1363`,
  SQLite override `:3193+`): one `groupId = createId("group")` shared by a
  source leg (`amount = -abs(sourceAmount)`, name 轉出/外幣換出), a dest leg
  (`amount = +abs(...)`, name 轉入/外幣換入), and an **optional fee leg**
  (`entryType: "expense"`, category 手續費, subcategory 轉帳手續費, same
  groupId, `:1345-1360`). Name/category/subcategory are derived from
  currency-sameness (轉帳/帳戶轉移 vs 外幣兌換).
- **No `updateTransfer` exists anywhere** (`grep -n "updateTransfer" src/` → 0).
- **Delete already cascades** on `groupId` in both repos
  (`repositories.ts:1176-1186`, `:3101-3110`) — deletion is NOT broken.
- **Display merge** — `mergeTransferRows` (`CashFlowRoute.tsx:3790`) collapses
  legs into one `DisplayRow` carrying `transferPair {source, dest}`. BUT the
  detail panel can also receive a **raw leg without `transferPair`**: the
  reconcile deep-link (`:334-338`) and the settlements list (`:1897-1899`) set
  `detailRow` straight from `ledgerRows`. **Hydration must therefore look legs
  up by `groupId`** (the `mergeTransferRows`/`startDuplicate` pattern), never
  rely on `transferPair` being present.
- **`splitGroupRowsFor` is transfer-safe** (`:539-546`): requires every leg
  `legKind === "category"`, so a transfer group falls through to the plain
  edit path — no change needed there.
- **Reconcile state lives ON the legs**: `ReconcileRoute.tsx:27/31` calls
  `setLedgerReviewed` / `setLedgerPostDate` on individual rows — including
  transfer legs (繳卡費 is a transfer into the card account). Any fix that
  tombstones+recreates legs would silently wipe `isReviewed`/`postDate` from
  the operator's active reconcile workflow. This drives the design choice.
- **Atomicity precedent**: SQLite `updateSplit` wraps multi-row mutation in
  `withTransaction` (`:3178-3190`); revision discipline is `bump()` /
  `revision = revision + 1` so sync LWW propagates.
- **Route mutations** are thin `useRepositoryMutation` wrappers
  (`CashFlowRoute.tsx:412-415` for `createTransfer`, keys
  `["ledger","accounts"]`).
- **Plan-225 round-trip hooks already exist**: `submitTransfer` ends with
  `if (editingId) returnIfFromReconcile();` (`:1033-1034`) — reachable today
  only through the broken flow; correct once this plan lands.
- **Dual-harness test exemplar**: `src/data/repositories.split.test.ts`
  (`describeEachRepo` from `repositories.testHarness`). There is currently
  **no transfer test file** under `src/data/` (grep `createTransfer` in
  `src/data/*.test.ts` → 0 hits).

## Design (decided — do not re-derive)

### Repo: `updateTransfer(groupId: string, input: TransferDraft)` — in-place leg update

New interface method (beside `createTransfer`, `repositories.ts:359`),
implemented in the browser repo and overridden in SQLite (mirroring the
`updateSplit` split). **In-place update, NOT tombstone+recreate** — leg ids,
`isReviewed`, and `postDate` must survive an edit (see Current state: the
reconcile flow stores state on legs; `updateSplit`'s recreate approach is the
wrong precedent here because transfers have a fixed 2+1 shape, not N legs).

Semantics:

1. `assertTransferInvariants(input, accounts)` — same guard as create, BEFORE
   any mutation.
2. Load active rows with this `groupId`. Identify:
   - source leg: `entryType === "transfer" && amount < 0`
   - dest leg: `entryType === "transfer"`, the other one
   - fee leg: `category === "手續費"` (entryType expense), optional
   If there is not exactly one source and one dest transfer leg →
   `throw new Error("找不到轉帳交易。")` (zh-TW, matching repo convention).
3. Rewrite both transfer legs from `input` exactly as `createTransfer` derives
   them (accountId, date, signed amount, currency, name 轉出/轉入 vs
   外幣換出/換入, category/subcategory 轉帳/帳戶轉移 vs 外幣兌換, note), with
   `bump()` (browser) / `revision = revision + 1, updated_at` (SQLite).
   **Do NOT touch `isReviewed`, `postDate`, `id`, `groupId`, `createdAt`** —
   editing does not reset review state (consistent with
   `updateLedgerTransaction`, which never touches `is_reviewed`).
4. Fee reconciliation (mirrors plan 226's table, transfer flavor):

   | Existing fee leg | `input.feeAmount` | Action |
   |---|---|---|
   | none | 0 / undefined | nothing |
   | none | > 0 | create the fee leg exactly as `createTransfer` does (same groupId) |
   | exists | > 0 | update in place: `amount = -abs(fee)`, sync accountId/date/currency from the new source leg; bump |
   | exists | 0 | tombstone (`deletedAt = nowIso()`, bump) |

5. SQLite: whole method inside `withTransaction`; end with
   `recomputeSqliteAccounts()`. Browser: `recompute()` + `persist()`.

### UI: `CashFlowRoute.tsx`

- New state `editingTransferGroupId: string | null` beside
  `editingSplitGroupId` (`:245` area) — groupId is the stable handle (leg ids
  are per-leg; the display row may be either leg).
- `startEdit` (`:693`): when `type === "transfer"` —
  - guard: if `!row.groupId`, toast an error (此筆轉帳資料不完整，無法編輯) and
    return (defensive; `createTransfer` always sets groupId).
  - look up active group legs from `ledgerRows` by `row.groupId` (source =
    `amount < 0`, dest = other, fee = category 手續費) — the
    `startDuplicate`/`mergeTransferRows` pattern;
  - hydrate `transferForm` fully **including `feeAmount` from the fee leg**
    (`Math.abs(fee.amount)`, else 0);
  - set `editingTransferGroupId(row.groupId)` and `editingId(row.id)` (keeps
    the drawer's `editing` flag and plan-225's `returnIfFromReconcile` gate
    working unchanged);
  - skip the `ledgerForm` hydration for this branch.
- `submitTransfer` (`:1025`): if `editingTransferGroupId` → call the new
  `updateTransfer` mutation (`{ groupId, input: transferForm }`, keys
  `["ledger","accounts"]`), toast 已更新轉帳; else today's create path. The
  existing `if (editingId) returnIfFromReconcile();` stays as-is.
- `closeDrawer` (`:594`): clear `editingTransferGroupId`.
- `changeType` (`:604`): extend the split guard with the transfer analogues —
  ignore taps when `editingTransferGroupId && next !== "transfer"` (would save
  a single row over one leg) AND when `editingId && !editingTransferGroupId &&
  next === "transfer"` (would create a new transfer and strand the row being
  edited — the reverse duplicate bug). Comment both, mirroring `:605-608`.

Out of scope by decision: 複製 (`startDuplicate` — already correct);
delete (already cascades); investment-generated transfer groups
(`investmentImport.ts` / `repositories.ts:6156` cash-dividend rows — those are
edited through the investment flows, not this drawer; the detail-panel edit
button on them behaves as before); copy.csv migration (this route uses inline
zh-TW strings — follow file convention).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 762 warnings (baseline) |
| Tests     | `npm test`         | all pass (baseline ≥1341 after plans 224-225; record the number you see) |

## Scope

**In scope**: `src/data/repositories.ts` (interface + both impls of the NEW
`updateTransfer`), new `src/data/repositories.transfer.test.ts`,
`src/routes/CashFlowRoute.tsx` (state, `startEdit`, `submitTransfer`,
`closeDrawer`, `changeType`, mutation hook).
**Out of scope**: `TransactionDetailPanel.tsx` (the mitigation is NOT taken
once the real fix lands — the edit button becomes correct),
`domain/ledgerTrust.ts` (`assertTransferInvariants` is reused, not modified),
ReconcileRoute, sync wiring (legs are ordinary synced rows; bump discipline
covers propagation), `updateLedgerTransaction` (plan 226's file region —
avoid touching to keep the merge clean).

## Git workflow

- Branch: `fix/ai-transfer-edit` off `main`. Conventional commit. No push/merge.

## Steps

### Step 1: Repo — interface + browser impl

Add `updateTransfer(groupId: string, input: TransferDraft): Promise<void>` to
the repository interface next to `createTransfer` (`repositories.ts:359`) and
implement per the Design in the browser repo (place it directly after
`createTransfer`, `:1363`). Factor the leg-field derivation (name/category/
subcategory/amount from `TransferDraft`) into a small private helper IF it can
be shared with `createTransfer` without reshaping it — otherwise duplicate the
6 lines and keep both readable.

**Verify**: `npx tsc --noEmit` → 0.

### Step 2: Repo — SQLite override

Mirror in the SQLite repo (after its `createTransfer`), inside
`withTransaction`, ending with `recomputeSqliteAccounts()`. Reuse
`insertLedgerRow` for a newly-created fee leg; plain `update` statements with
`revision = revision + 1, updated_at = $…` for leg rewrites (see
`:3072-3074` for the column list style).

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: Dual-harness tests — new `src/data/repositories.transfer.test.ts`

`describeEachRepo` (exemplar: `repositories.split.test.ts`) over at least:

1. **Update amounts/date/note**: create transfer, `updateTransfer` with new
   sourceAmount → both legs updated in place (SAME leg ids, signed amounts
   correct), active row count unchanged (no duplicate pair — THE regression),
   account balances reflect only the new amounts.
2. **Move source account**: source leg's accountId changes; both accounts'
   balances correct after recompute.
3. **Cross-currency**: edit dest to a different-currency account with
   `destinationAmount` → names flip to 外幣換出/外幣換入, category 外幣兌換,
   dest leg amount = destinationAmount.
4. **Fee lifecycle**: 0→100 creates fee leg (same groupId, −100, category
   手續費); 100→50 updates the SAME leg id; 50→0 tombstones it (deletedAt set,
   revision bumped).
5. **Reconcile state survives**: `setLedgerReviewed(destLeg, true)` +
   `setLedgerPostDate(destLeg, "2026-08-01")`, then `updateTransfer` →
   both survive on the same leg.
6. **Invariant rejection is atomic**: `updateTransfer` with
   sourceAccountId === destinationAccountId throws 來源與目標帳戶不可相同 and
   the group rows are byte-unchanged (assert amounts + revisions).
7. **Missing group**: unknown/tombstoned groupId → throws 找不到轉帳交易.

**Verify**: targeted vitest run of the new file → all pass on BOTH harnesses.

### Step 4: UI wiring

Implement the UI section of the Design in `CashFlowRoute.tsx` (state,
`startEdit` transfer branch, `submitTransfer` branch, `closeDrawer`,
`changeType` guards, `useRepositoryMutation` hook).

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors / 762 warnings;
`npm test` → all pass.

### Step 5: Live feel-check (dev server, demo mode)

Create a transfer A→B 1000. Open its detail panel → 編輯交易 → the drawer
MUST show the real values (accounts, 1000, date). Change to 800, save →
list shows ONE transfer at 800; both account balances moved by exactly 800
total (not 1800). Re-edit → shows 800. Add fee 15 → save → linked 手續費 row
appears; edit fee to 0 → row gone. While editing the transfer, tap the 支出
type tab → nothing happens. While editing a plain expense, tap 轉帳 →
nothing happens. If running in a worktree: `lsof`-verify the dev server's cwd
is THIS worktree (known hazard — the shared preview server serves the main
checkout).

## Test plan

Step 3 carries the semantics; step 5 is the operator-visible proof. Reviewer
should additionally check the reconcile deep-link path: from 信用卡對帳, open a
transfer leg's detail (`tx` param) → 編輯交易 → drawer hydrates correctly even
though `detailRow` came from raw `ledgerRows` (no `transferPair`), and saving
returns to reconcile (plan 225 gate).

## Done criteria

- [ ] Gates green with ≥7 new dual-harness tests
- [ ] `grep -n "updateTransfer" src/data/repositories.ts` → interface + 2 impls
- [ ] Editing a transfer and saving changes the EXISTING pair — active
      transfer-leg row count for the group stays 2 (+1 fee at most)
- [ ] `transferForm` is hydrated on transfer edit (no `emptyTransfer` flash)
- [ ] Type tabs are inert in both hazardous directions while editing
- [ ] No files outside scope modified

## STOP conditions

- A transfer group in demo/fixture data carries MORE than 2 active transfer
  legs or its fee leg's category ≠ 手續費 — report the shape; the leg-role
  detection in Design step 2 would misfire.
- `assertTransferInvariants` rejects a valid existing transfer on re-save
  (e.g. an account whose currency was edited after the transfer was created)
  — report; do not weaken the invariant unilaterally.
- The SQLite override cannot express the fee create inside `withTransaction`
  with `insertLedgerRow` (signature drift) — report both shapes.
- Anything requires touching `updateLedgerTransaction` or financial-math
  modules — STOP (plan 226 owns that region; dual-harness rule applies).

## Maintenance notes

- `updateTransfer` bakes in the same leg-role contract as `mergeTransferRows`
  and `startDuplicate` (source = negative transfer leg; fee = category 手續費,
  same groupId). Now THREE consumers — if 分帳 UI (plan 222) or a future
  `legKind: "fee"` migration reshapes system legs, update all three together.
- The `changeType` guard now encodes "type is immutable while editing" for
  transfer↔non-transfer. If a future plan wants type conversion on edit, it
  must go through delete+create semantics at the repo level, not the drawer.
- Plan 226 and this plan both add fee-reconciliation tables. They are
  deliberately parallel, not shared: the ledger fee leg syncs
  merchant/subcategory from the main row; the transfer fee leg derives from
  the source leg. Unifying them is possible but not worth the coupling today.
