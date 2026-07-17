# Plan 225: 對帳 → 編輯交易 round-trips back to the reconcile page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat af28266e..HEAD -- src/routes/ReconcileRoute.tsx src/routes/CashFlowRoute.tsx src/routes/router.tsx`
> Mismatch with the excerpts below = STOP.

## Status

- **Priority**: P1 (operator-reported live friction)
- **Effort**: S–M
- **Risk**: LOW (navigation plumbing only; no financial logic)
- **Depends on**: none (224 fixes the related scroll-freeze independently)
- **Category**: bug / UX
- **Planned at**: commit `af28266e`, 2026-07-17

## Why this matters

Mid-reconcile the operator spots a wrong transaction and clicks 編輯交易. That
navigates to `/cash-flow?account=X&tx=Y` — the ledger page with an account
filter and the detail panel open. After editing, they are stranded on the
filtered ledger and must manually navigate 帳戶 → find the card → 對帳 to
resume. The fix: remember where the user came from and return there when the
detail panel closes.

## Current state

- `src/routes/ReconcileRoute.tsx:360-369` — the origin:

  ```tsx
  <Button
    variant="ghost"
    size="icon-sm" aria-label="編輯交易"
    title="編輯交易"
    onClick={(e) => {
      e.stopPropagation();
      navigate({ to: "/cash-flow", search: { account: accountId, tx: row.id } });
    }}
  >
  ```

- `src/routes/router.tsx:62-66` — the /cash-flow search schema:

  ```ts
  validateSearch: (search: Record<string, unknown>): { account?: string; tx?: string } => {
    ...
    return { ...(account ? { account } : {}), ...(tx ? { tx } : {}) };
  },
  ```

- `src/routes/CashFlowRoute.tsx:272` — consumption:

  ```tsx
  const { account: accountParam, tx: txParam } = useSearch({ strict: false }) as { account?: string; tx?: string };
  ```

  `txParam` hydrates the detail panel (`detailRow` local state); find the
  effect that does this (grep `txParam` in the file) — the panel is CLOSED via
  `onClose={() => setDetailRow(null)}` at `:2056` and via the same
  `setDetailRow(null)` inside `onEdit`/`onDuplicate`/`onDelete` handlers
  (`:2057-2059`).

- The reconcile route is `/cash-flow/reconcile/$accountId` (see `router.tsx`,
  `ReconcileRoute.tsx`).

## Design (decided — do not re-derive)

Thread a `from: "reconcile"` search param. When the ledger page was reached
with `from=reconcile` AND an `account` param, then **when the user finishes
with the detail panel** the app navigates back to
`/cash-flow/reconcile/$accountId` instead of just closing the panel. "Finishes"
means: the detail panel's `onClose`, OR the edit drawer saving/closing after
`onEdit`. Deleting the row also returns (the reconcile list is where they were
working). Duplicating stays on /cash-flow (a new row draft is a new task —
returning mid-draft would lose it).

Chosen mechanics (simplest that survives the existing state machine): keep a
`returnToReconcile` value derived from the search params, and call one helper
`returnIfFromReconcile()` in the three finish paths; it navigates with
`navigate({ to: "/cash-flow/reconcile/$accountId", params: { accountId: accountParam } })`.
Do NOT try to restore scroll position or expanded periods inside ReconcileRoute
— its current-period default is fine (out of scope).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 762 warnings |
| Tests     | `npm test`         | 1338+ pass          |

## Scope

**In scope**: `src/routes/ReconcileRoute.tsx` (the navigate call),
`src/routes/router.tsx` (search schema gains `from`),
`src/routes/CashFlowRoute.tsx` (consume `from`, the return helper, 3 wire-ups).
**Out of scope**: TransactionDetailPanel component itself (its props stay);
EntryDrawer internals; ReconcileRoute state restoration; any other `navigate`
caller passing `tx` (e.g. dashboard todo links — they must NOT gain `from`).

## Git workflow

- Branch: `fix/ai-reconcile-edit-roundtrip` off `main`. Conventional commit.
  No push/merge.

## Steps

### Step 1: Schema

`router.tsx:62` — widen to `{ account?: string; tx?: string; from?: string }`;
accept only the literal `"reconcile"` (anything else → omitted), following the
existing string-guard style in that validateSearch.

**Verify**: `npx tsc --noEmit` → 0.

### Step 2: Origin

`ReconcileRoute.tsx:366` → `search: { account: accountId, tx: row.id, from: "reconcile" }`.

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: Return path

In `CashFlowRoute.tsx`:
1. `:272` — also read `from: fromParam`.
2. Add (near the other handlers):
   ```tsx
   // 對帳 round-trip (plan 225): arriving via 編輯交易 from the reconcile page
   // returns there when the user finishes with the transaction.
   const returnIfFromReconcile = useCallback(() => {
     if (fromParam !== "reconcile" || !accountParam) return false;
     navigate({ to: "/cash-flow/reconcile/$accountId", params: { accountId: accountParam } });
     return true;
   }, [fromParam, accountParam, navigate]);
   ```
3. Wire the finish paths:
   - Detail panel `onClose` (`:2056`): `() => { setDetailRow(null); returnIfFromReconcile(); }`
   - The edit-drawer save path for an edit that STARTED from the panel while
     `from=reconcile`: after the drawer's successful save closes it (find where
     `startEdit`-initiated saves complete — the mutation success handler that
     closes the drawer), call `returnIfFromReconcile()`. If save-completion and
     drawer-close are the same code path for creates and edits, gate on
     `editingId` being set so plain creates never bounce.
   - Delete confirm success (the `requestDelete` flow's success): same call.
   - `onDuplicate` — explicitly NOT wired (see Design).
4. Ensure closing the panel WITHOUT `from` behaves byte-identically (helper
   returns false, nothing else runs).

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0/762; `npm test` → pass.

## Test plan

No new unit tests — navigation glue over jsdom-hostile router+overlay stack;
the repo tests routing behavior via live checks. Reviewer feel-check (dev
server, demo data): (a) 帳戶 → a credit card → 對帳 → expand a period → 編輯交易
→ drawer opens over the ledger → save → **lands back on the 對帳 page**;
(b) same but just close the detail panel with ✕ → back on 對帳; (c) open a
transaction from the dashboard todo card (no `from`) → closing stays on
/cash-flow (regression); (d) with plan 224 also merged, scrolling works after
the round-trip.

## Done criteria

- [ ] Gates green
- [ ] `grep -n '"reconcile"' src/routes/router.tsx src/routes/CashFlowRoute.tsx src/routes/ReconcileRoute.tsx` shows schema guard + origin + consumer
- [ ] Feel-check (a)-(c) pass
- [ ] No files outside scope modified

## STOP conditions

- The edit-drawer's save path cannot distinguish panel-initiated edits from
  in-page edits (i.e. no `editingId`/equivalent to gate on) — report the actual
  state shape instead of guessing.
- `validateSearch` at router.tsx:62 doesn't match the excerpt.
- Wiring the return breaks the recurring-edit scope prompt flow (editing an
  occurrence asks this/future/all — the return must fire only after that
  resolves; if the prompt flow makes this ambiguous, STOP and describe it).

## Maintenance notes

- If other surfaces later deep-link into /cash-flow with `tx`, they can reuse
  `from` with a new literal — extend the schema guard, never free-text.
- Reviewer should scrutinize: no double-navigation (panel close + save both
  firing the helper) — the helper is idempotent per navigation but a double
  call would be a code smell.
