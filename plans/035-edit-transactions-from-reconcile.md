# Plan 035: Edit a transaction while reconciling (open its detail/edit from the Reconcile screen)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 721f216f..HEAD -- src/routes/ReconcileRoute.tsx src/routes/CashFlowRoute.tsx src/routes/router.tsx`
> Compare the "Current state" excerpts to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `721f216f`, 2026-06-19

## Why this matters

The operator: "信用卡對帳的時候希望可以編輯資訊（可能要新增一些海外手續費，或是
突然發現有折扣等）." Today the Reconcile screen rows only toggle the ✓ reviewed
flag (`ReconcileRoute.tsx` row `onClick` calls `toggle(...)`); there is no way to
fix an amount, add an overseas fee, or apply a discount without leaving for the
CashFlow list and hunting for the row.

Rather than duplicate the full transaction editor inside Reconcile (high risk),
this plan reuses the existing CashFlow edit flow: a per-row edit affordance on the
Reconcile screen deep-links to CashFlow with the transaction's detail panel open,
where the operator already has Edit / 退款(refund) / 複製 / 刪除. This is the
lowest-risk way to satisfy "edit while reconciling" without forking the editor.

## Current state

- `src/routes/ReconcileRoute.tsx` — each statement row is a clickable `<div>`
  (lines 257–272) whose only action is `onClick={() => toggle(row.id, row.isReviewed)}`
  (toggles ✓). It has `useNavigate` already imported (line 7, used for the
  breadcrumb at line 154).
- `src/routes/CashFlowRoute.tsx`:
  - Reads a deep-link param (line 153):
    `const { account: accountParam } = useSearch({ strict: false }) as { account?: string };`
  - Has the detail panel state + opener: `detailRow` (line 160), `setDetailRow`,
    `startEdit` (line 380), and `<TransactionDetailPanel row={detailRow} .../>`
    (line 1268). Opening a row's detail is `setDetailRow(r)`.
  - `ledgerRows` (the full list) is available to look a row up by id.
- `src/routes/router.tsx` — the CashFlow route's `validateSearch` (lines 61–64)
  currently only accepts `account`:
  ```ts
  validateSearch: (search: Record<string, unknown>): { account?: string } => {
    const account = typeof search.account === "string" ? search.account : undefined;
    return account ? { account } : {};
  },
  ```

**Conventions to match:**
- zh-TW. Phosphor icons (`PencilSimple` is used widely, e.g. `TransactionsRoute.tsx:595`).
- TanStack Router navigation: `navigate({ to: "/cash-flow", search: { account, tx } })`.
- `TransactionDetailPanel` already exposes Edit (which calls `startEdit`, opening
  the `EntryDrawer` where 海外手續費/金額/折扣 are all editable). Reuse it; do not
  build a new editor.

## Commands you will need

| Purpose   | Command            | Expected         |
|-----------|--------------------|------------------|
| Typecheck | `npx tsc --noEmit` | exit 0           |
| Build     | `npm run build`    | exit 0           |
| Tests     | `npm run test`     | all pass         |
| Lint      | `npm run lint`     | exit 0, 0 errors |

## Scope

**In scope**:
- `src/routes/router.tsx` — accept a `tx` search param on the CashFlow route.
- `src/routes/CashFlowRoute.tsx` — open `detailRow` from the `tx` param on mount.
- `src/routes/ReconcileRoute.tsx` — add a per-row edit button that navigates with
  `{ account, tx }`.

**Out of scope**:
- Building any new edit form — reuse `TransactionDetailPanel` + `EntryDrawer`.
- Adding fee-leg editing semantics (the existing editor already supports it).
- The ✓ toggle behavior (keep it; the edit button must `stopPropagation`).

## Git workflow

- Branch: `git checkout -B advisor/035-edit-from-reconcile main`.
- Commit per step; conventional commits
  (e.g. `feat(reconcile): edit a transaction via deep-link to its detail`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Accept a `tx` deep-link param on the CashFlow route

In `src/routes/router.tsx`, widen the CashFlow `validateSearch`:
```ts
validateSearch: (search: Record<string, unknown>): { account?: string; tx?: string } => {
  const account = typeof search.account === "string" ? search.account : undefined;
  const tx = typeof search.tx === "string" ? search.tx : undefined;
  return { ...(account ? { account } : {}), ...(tx ? { tx } : {}) };
},
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Open the detail panel from the `tx` param

In `src/routes/CashFlowRoute.tsx`:
- Read `tx` alongside `account` (line 153):
  `const { account: accountParam, tx: txParam } = useSearch({ strict: false }) as { account?: string; tx?: string };`
- Add an effect that opens the detail panel once the ledger has loaded and a
  `tx` is present (place it near the other effects, after `ledgerRows` is in
  scope):
  ```ts
  useEffect(() => {
    if (!txParam) return;
    const row = ledgerRows.find((r) => r.id === txParam);
    if (row) setDetailRow(row);
  }, [txParam, ledgerRows]);
  ```
  (Opening the **detail** panel — not `startEdit` directly — matches what a tap
  on a CashFlow row does, and gives the operator the full Edit/退款/複製/刪除
  menu. Editing 海外手續費/折扣 is then one more tap on "編輯".)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Add the edit affordance to Reconcile rows

In `src/routes/ReconcileRoute.tsx`, inside the statement row (lines 257–272), add
a `PencilSimple` button to the right of the amount that navigates to CashFlow
with both params. It must `stopPropagation` so it doesn't also toggle ✓:
```tsx
import { PencilSimple } from "@phosphor-icons/react"; // add to the existing import
// ...inside the row, after the amount <div>:
<Button
  variant="ghost"
  size="icon-sm"
  title="編輯交易"
  onClick={(e) => {
    e.stopPropagation();
    navigate({ to: "/cash-flow", search: { account: accountId, tx: row.id } });
  }}
>
  <PencilSimple size={14} />
</Button>
```
Keep the row's own `onClick={() => toggle(...)}` intact.

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0.
- Manual (if runnable): from a card's 對帳 screen, click ✏ on a row → lands on
  現金流 with that transaction's detail panel open; "編輯" opens the drawer where
  amount, 海外手續費, and category are editable; saving returns to the updated
  list. Going back to 對帳 shows the corrected amount.

## Test plan

- Wiring over existing, tested components (`TransactionDetailPanel`,
  `EntryDrawer`). No new domain unit test required.
- If a route test harness exists: assert that mounting CashFlow with `tx` set to a
  known row id opens `detailRow`. Otherwise rely on manual + typecheck/build.
- Verification: `npm run test` → all pass.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test` exits 0; `npm run lint` 0 errors
- [ ] `grep -n "tx" src/routes/router.tsx` shows the param accepted on CashFlow
- [ ] `grep -n "txParam" src/routes/CashFlowRoute.tsx` returns matches
- [ ] Reconcile row ✏ navigates and opens the detail panel (manual)
- [ ] Clicking ✏ does NOT also toggle the ✓ state (stopPropagation verified)
- [ ] Only the 3 in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The Reconcile row block or CashFlow `useSearch`/`detailRow` wiring no longer
  matches the excerpts.
- `TransactionDetailPanel`/`startEdit` no longer exist or changed shape — re-read
  and adapt, or STOP.
- The `EntryDrawer` opened from the detail panel does **not** expose an amount /
  fee editor (so "edit info" can't be satisfied this way) — STOP and report; the
  fallback is a heavier in-Reconcile editor, which is a separate plan.

## Maintenance notes

- This reuses the single transaction editor, so any future field added to the
  editor is automatically available from Reconcile — keep it that way rather than
  forking.
- If deep-link UX feels indirect, a follow-up could open the `EntryDrawer`
  in-place on the Reconcile screen by extracting it into a shared component; that
  extraction is the higher-risk path deliberately deferred here.
- Pairs with plan 036 (deferred posting), which adds a 入帳日 control to the same
  editor.
