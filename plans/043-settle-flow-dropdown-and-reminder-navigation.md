# Plan 043: Fix the receivable/payable settle flow — account dropdown, and reminder→transaction navigation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 13f6a723..HEAD -- src/routes/CashFlowRoute.tsx src/routes/DashboardRoute.tsx src/components/TransactionDetailPanel.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW–MED (touches the settle flow + the shared detail panel)
- **Depends on**: none (independent of plan 042; see Maintenance notes re: merge)
- **Category**: bug (correctness / UX)
- **Planned at**: commit `13f6a723`, 2026-06-20

## Why this matters

Settling an outstanding receivable/payable (應收/應付) is currently broken or
dead-ended in three places the operator hit:

1. **The settle modal's account dropdown can't be selected.** In 收款結清 /
   付款結清, the 收款帳戶 select renders its option list, but clicks don't
   register — choosing an account is impossible, so the receivable can never be
   settled. Root cause: the modal is `zIndex: 1000` but the account dropdown's
   popover positioner defaults to `z-50`, so the dropdown renders *behind* the
   modal's full-screen backdrop; clicks land on the backdrop (which closes the
   modal). The app already solves this elsewhere (QuickAdd lifts its dropdown
   with `positionerClassName="z-[90]"` above its z-80 modal); the settle modal
   just forgot to.
2. **The 記帳 "未結清" reminder banner isn't clickable.** It's a static card; the
   user can't act on it and must hunt for the row in the activity list.
3. **The Dashboard 應收/應付未結清 reminder doesn't open the transaction.** Its
   rows link to a bare `/cash-flow` with no transaction reference, so clicking
   lands on the ledger page but not on the specific row.

A merged feature already gives us the deep-link primitive: the CashFlow route
accepts a `tx` search param that opens that transaction's detail panel (plan
035). The detail panel, however, has no 結清 action, so even after navigating
there the user can't settle. This plan: fixes the dropdown (1), makes both
reminders navigate to the transaction (2, 3), and adds a 結清 button to the
detail panel so the navigation is actionable end-to-end.

## Current state

Files and roles:

- `src/routes/CashFlowRoute.tsx` — the ledger page. Contains `SettleModal`
  (the broken dropdown), the static "未結清" banner, the settle handler
  (`setSettlePrompt` / `confirmSettle`), the `tx` deep-link effect, and the
  `TransactionDetailPanel` render site.
- `src/routes/DashboardRoute.tsx` — the 應收/應付未結清 card with the
  non-deep-linking rows.
- `src/components/TransactionDetailPanel.tsx` — the shared read-only detail
  panel (opened by a row tap or the `tx` deep-link). Has 編輯/複製/刪除/退款
  actions but **no** 結清 action.

### (1) The broken dropdown — `CashFlowRoute.tsx:1373-1396`

The modal wrapper is `zIndex: 1000`:

```tsx
<div onClick={onCancel}
  style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", ... }}>
  <div onClick={(e) => e.stopPropagation()} style={{ ... }}>
    ...
    <DrawerField label={isReceivable ? "收款帳戶" : "付款帳戶"} required>
      <AccountFilter
        accounts={accounts}
        value={accountId}
        onChange={setAccountId}
        allowAll={false}
        placeholder="選擇帳戶"
        style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
      />            {/* ← no positionerClassName → dropdown defaults to z-50, behind the z-1000 modal */}
    </DrawerField>
```

The exemplar fix (`QuickAdd.tsx:365`): `<AccountFilter ... positionerClassName="z-[90]" />`
where the QuickAdd modal is `zIndex: 80`. `AccountFilter` forwards
`positionerClassName` to the popover positioner (`AccountFilter.tsx:136` →
`popover.tsx:40` = `cn("isolate z-50", positionerClassName)`; `twMerge` lets the
override win).

### (2) The static banner — `CashFlowRoute.tsx:929-946`

```tsx
{settlements.items.length > 0 ? (
  <Card style={{ padding: "12px 16px", marginBottom: 14, flexDirection: "row", ... }}>
    <span className="ns-eyebrow">未結清</span>
    {/* …應收/應付 badges + totals… */}
    <span className="muted text-xs" style={{ marginLeft: "auto" }}>結清後會計入收支 · 在下方明細點 ✓ 結清</span>
  </Card>
) : null}
```

It is a plain `Card` — no `onClick`, no link. `settlements` here is built by
`buildOutstandingSettlements` (`CashFlowRoute.tsx:837`), whose `items[]` each
carry `id` = the ledger transaction id. `detailRow` state (line 161) +
`setDetailRow` open the `TransactionDetailPanel`; `ledgerRows` (line 178) is the
full ledger array.

### (3) The Dashboard reminder rows — `DashboardRoute.tsx:1039-1050`

```tsx
{settlements.items.slice(0, 5).map((item, i) => (
  <Link key={item.id} to="/cash-flow" style={{ ... }}>
    {/* …badge + counterparty + amount… */}
  </Link>
))}
```

`to="/cash-flow"` with **no** `search`. `item.id` is the ledger transaction id
(`buildOutstandingSettlements` in `src/domain/dashboardSummary.ts:234`,
`id: row.id`). The CashFlow route's `validateSearch` already accepts
`{ account?: string; tx?: string }` (`router.tsx:61-63`), and CashFlowRoute's
effect opens the detail for it (`CashFlowRoute.tsx:188-192`):

```tsx
useEffect(() => {
  if (!txParam) return;
  const row = ledgerRows.find((r) => r.id === txParam);
  if (row) setDetailRow(row);
}, [txParam, ledgerRows]);
```

### The settle handler + detail panel

- `CashFlowRoute.tsx:657` — `setSettlePrompt(row)` opens `SettleModal`.
- `SettleModal` is rendered at `CashFlowRoute.tsx:1341-1349` with
  `accounts={accountRows}` and `onConfirm={confirmSettle}`.
- The list-row settle button (the only existing one) —
  `CashFlowRoute.tsx:1632`: `<Button variant="ghost" size="icon-sm" title="結清" onClick={onSettle}><Check size={14} /></Button>`.
- `TransactionDetailPanel` props (`TransactionDetailPanel.tsx:9-25`):
  `row, onClose, onEdit, onDuplicate?, onDelete, accountName, recurringRows, onRefund?`.
  It computes `isSettled` (line 82) and `isReceivable` (line 88) and shows a
  settlement status chip (line 148) but has **no** settle action button.

### Conventions to follow

- Inline `style={{}}` + DS tokens + `Button` from `./coss/button` — match the
  surrounding code in each file.
- Dropdowns inside a fixed-overlay modal must lift their positioner above the
  modal's z-index (exemplar: `QuickAdd.tsx:365`).
- Deep-linking to a transaction = navigate to `/cash-flow` with
  `search={{ tx: <ledger id> }}` (exemplar: the effect at `CashFlowRoute.tsx:188`,
  added by plan 035; the Reconcile screen already links this way).
- Optional callback props are the panel's pattern (`onDuplicate?`, `onRefund?`) —
  add `onSettle?` the same way so other callers are unaffected.

## Commands you will need

| Purpose   | Command                          | Expected on success     |
|-----------|----------------------------------|-------------------------|
| Install   | `npm install`                    | exit 0 (fresh worktree) |
| Typecheck | `npx tsc --noEmit`               | exit 0, no errors       |
| Tests     | `npm test`                       | all pass                |
| Lint      | `npm run lint`                   | exit 0 (0 errors; warnings ok) |
| Build     | `npm run build`                  | exit 0                  |
| Dev server| `npm run dev`                    | serves on localhost     |

## Suggested executor toolkit

- This is interactive UI. **Verify in a browser preview** (preview tools or
  `npm run dev`) with demo mode if needed: open a 應收/應付 settle modal and
  confirm the account dropdown is now selectable; click the 記帳 banner and a
  Dashboard reminder row and confirm each opens the right transaction's detail;
  from the detail, confirm 結清 opens the (now-working) settle modal. If you
  cannot run a browser, say so and rely on code inspection + the gates — do not
  claim visual verification you didn't perform.

## Scope

**In scope** (the only files you should modify):
- `src/routes/CashFlowRoute.tsx` — (a) add `positionerClassName="z-[1001]"` to the
  SettleModal `AccountFilter`; (b) make the "未結清" banner open the first
  unsettled item's detail; (c) pass an `onSettle` to `TransactionDetailPanel`.
- `src/components/TransactionDetailPanel.tsx` — add the optional `onSettle?` prop
  and a 結清 button shown only for unsettled receivable/payable rows.
- `src/routes/DashboardRoute.tsx` — add `search={{ tx: item.id }}` to the
  reminder rows' `Link`.

**Out of scope** (do NOT touch):
- The settle math / `confirmSettle` / `buildOutstandingSettlements` — only
  navigation + the dropdown z-index + a new button that calls existing handlers.
- The other modals in CashFlowRoute (RecurringScopeModal etc.) — they have no
  dropdown problem; don't change their z-index.
- Plan 042's lines in DashboardRoute (`stripStartDate`/`todayIso`/`stripData`) —
  this plan only edits the settlements `Link` near line 1040. Stay out of the
  net-worth window code.
- `AccountFilter` / `popover.tsx` internals — pass the prop, don't change them.

## Git workflow

- Branch from current main: `git checkout -B advisor/043-settle-flow-fixes main`.
- Commit per logical unit (one per fix is fine); short imperative messages
  (e.g. `fix: settle-modal account dropdown renders above the modal backdrop`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: make the settle-modal account dropdown selectable

In `src/routes/CashFlowRoute.tsx`, the `AccountFilter` inside `SettleModal`
(around line 1388) — add `positionerClassName="z-[1001]"` (one above the modal's
`zIndex: 1000`):

```tsx
<AccountFilter
  accounts={accounts}
  value={accountId}
  onChange={setAccountId}
  allowAll={false}
  placeholder="選擇帳戶"
  style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
  positionerClassName="z-[1001]"
/>
```

**Verify**: `npx tsc --noEmit` → exit 0. Browser: open a settle modal → the
account dropdown opens and an option can be clicked and selected (the 結清 button
enables).

### Step 2: add an optional `onSettle` + 結清 button to the detail panel

In `src/components/TransactionDetailPanel.tsx`:
- Add `onSettle?: (row: LedgerTransaction) => void;` to the props type (line ~9-16)
  and destructure it (line 25).
- Render a 結清 `Button` (variant `outline`, full-width, with a `Check` icon —
  import it from `@phosphor-icons/react` if not already imported) in the actions
  area, shown only when `onSettle && !isSettled && (row.settlementStatus ===
  "receivable" || row.settlementStatus === "payable")`. Label it
  `isReceivable ? "收款結清" : "付款結清"`. On click: `onSettle(row)`.

Place it near the existing action buttons (the 退款/刪除/複製 group, around lines
247-308). Keep it visually consistent with those buttons.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: wire `onSettle` from CashFlowRoute

At the `TransactionDetailPanel` render site (`CashFlowRoute.tsx:1294`), add:

```tsx
onSettle={(row) => { setDetailRow(null); setSettlePrompt(row); }}
```

(Close the detail, then open the settle modal — same `setSettlePrompt` the list
row uses.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: make the 記帳 "未結清" banner open the transaction

In `src/routes/CashFlowRoute.tsx`, the banner `Card` (around line 930) — make it
actionable. Because the banner can represent several items, clicking opens the
**first (earliest) unsettled** item's detail (the common case is one item; the
detail panel then offers 結清 from Step 2). Convert the `Card` into a clickable
element:

- Add `onClick` that finds the first unsettled row and opens it:
  ```tsx
  onClick={() => {
    const first = ledgerRows.find((r) => r.id === settlements.items[0]?.id);
    if (first) setDetailRow(first);
  }}
  ```
- Add `style={{ cursor: "pointer" }}` (and keep the existing styles).
- Update the hint text from `結清後會計入收支 · 在下方明細點 ✓ 結清` to something
  that matches the new affordance, e.g. `結清後會計入收支 · 點此查看並結清`.
  (Edit the zh-TW string in place — this banner copy is inline in the TSX today;
  match how it currently lives. If the project's copy-catalog workflow is in use
  for this string, follow it; otherwise an inline edit matching the existing
  inline string is acceptable.)

**Verify**: `npx tsc --noEmit` → exit 0. Browser: clicking the banner opens the
unsettled transaction's detail; the detail shows a 結清 button.

### Step 5: deep-link the Dashboard reminder rows

In `src/routes/DashboardRoute.tsx`, the settlements `Link` (line ~1040) — add the
`tx` search param:

```tsx
<Link key={item.id} to="/cash-flow" search={{ tx: item.id }} style={{ ... }}>
```

(`item.id` is the ledger transaction id; the CashFlow route opens its detail via
the existing `tx` effect.)

**Verify**: `npx tsc --noEmit` → exit 0 (the route's `validateSearch` already
types `tx`). Browser: clicking a Dashboard reminder row navigates to
`/cash-flow?tx=…` and opens that transaction's detail.

### Step 6: full verification

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → all pass
- `npm run lint` → 0 errors
- `npm run build` → exit 0
- Browser end-to-end: Dashboard reminder → detail opens → 收款結清 → dropdown
  selectable → 結清 succeeds; 記帳 banner → detail opens → settle works.

## Test plan

This change is UI wiring (navigation, a prop, a z-index, a button) over existing,
already-tested handlers (`confirmSettle`, `buildOutstandingSettlements`). There is
no new domain math, so do **not** fabricate a domain unit test that asserts
nothing.

- The existing suite must stay green (`npm test`) — it covers
  `buildOutstandingSettlements` (`src/domain/dashboardSummary.test.ts`) and the
  settle invariants; confirm none regressed.
- Primary verification is the browser end-to-end walkthrough in Step 6.
- If a browser is unavailable, state that explicitly and provide the `grep`/diff
  evidence that each of the five edits is present.

## Done criteria

ALL must hold:

- [ ] SettleModal's `AccountFilter` has `positionerClassName="z-[1001]"`
      (`grep -n 'z-\[1001\]' src/routes/CashFlowRoute.tsx` → 1 match)
- [ ] `TransactionDetailPanel` accepts an optional `onSettle` and renders a 結清
      button only for unsettled receivable/payable rows
- [ ] CashFlowRoute passes `onSettle` to `TransactionDetailPanel` and the "未結清"
      banner is clickable (opens the first unsettled item's detail)
- [ ] Dashboard reminder rows link with `search={{ tx: item.id }}`
      (`grep -n 'search={{ tx: item.id }}' src/routes/DashboardRoute.tsx` → 1 match)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] `npm run build` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (skip if your reviewer maintains the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `13f6a723`).
- `AccountFilter` turns out not to forward `positionerClassName` (it does at
  `AccountFilter.tsx:136`) — if a different select component is in the modal,
  report rather than guessing its prop.
- Adding `search={{ tx: item.id }}` produces a TanStack Router type error (the
  route's `validateSearch` should already accept `tx`) — report the error.
- The detail panel's 結清 button would require changing `confirmSettle` or the
  settle math to work — stop; this plan only wires existing handlers.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- For the reviewer: the only behavioral changes are (a) the dropdown is now
  clickable, (b) two reminder surfaces navigate to the transaction, (c) a new
  detail-panel button that calls the existing `setSettlePrompt`. No settle math
  changed. Scrutinize that the 結清 button is gated to unsettled AR/AP only
  (a settled or normal row must not show it), and that the banner's
  `setDetailRow` uses a row actually present in `ledgerRows`.
- **Merge interaction with plan 042**: both edit `DashboardRoute.tsx`, but in
  disjoint regions (042: the net-worth window code ~lines 53–490; 043: the
  settlements `Link` ~line 1040). Merging both is conflict-free; build each
  branch on current `main`.
- Follow-up worth considering (out of scope here): the CashFlow banner opens only
  the *first* unsettled item when several exist. If multiple outstanding items is
  common for the operator, a future change could make the banner filter the
  activity list to unsettled-only instead of opening one. Note it; don't build it.
- Other fixed-overlay modals that embed a dropdown should be audited for the same
  z-index bug (the RecurringScopeModal has no dropdown, so it's fine).
