# Plan 034: 信用卡繳款 records a real transfer from a chosen account, with an optional 回饋/折抵 credit

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 721f216f..HEAD -- src/routes/ReconcileRoute.tsx`
> Compare the "Current state" excerpts to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (complements plan 029's credit-card display; can land independently)
- **Category**: feature
- **Planned at**: commit `721f216f`, 2026-06-19

## Why this matters

Two operator requests about credit-card payment:
- "信用卡繳款提醒要可以標示已繳款，且要讓我選擇是從哪個帳戶扣款才對（應該是轉帳的
  形式？）" — paying a card should move money **out of a bank account** and onto
  the card, as a transfer. Today「標記已繳款」only sets a flag
  (`creditPaymentPaidUntil`) that hides the reminder; **no money moves**, so the
  bank balance and the card's 未繳 are both left wrong.
- "可以要有一個帳單扣抵的選項，因為有些信用卡會有現金回饋" — at payment time, allow
  a 帳單折抵/回饋 credit so the cash paid is less than the amount owed.

This plan replaces the flag-only button with a payment dialog that (1) records a
transfer from a chosen paying account to the card, (2) optionally records a
回饋/折抵 credit on the card, and (3) still suppresses the reminder. After it, the
card nets toward 0 and the paying account drops by the cash paid — the books are
actually correct.

## Current state

`src/routes/ReconcileRoute.tsx`:
- Owed figure (line 140): `const owed = Math.max(0, -account.balance);`
- The current `markPaid` (lines 84–106) only updates the account's
  `creditPaymentPaidUntil`:
  ```ts
  async function markPaid() {
    if (!account?.paymentDueDay) return;
    const dueDate = currentPeriod?.dueDate ?? periods.find((p) => p.dueDate && !p.isPaid)?.dueDate;
    if (!dueDate) return;
    try {
      await updateAccount.mutateAsync({ id: account.id, /* ...all fields... */ creditPaymentPaidUntil: dueDate, /* ... */ });
      toast.success(`已標記繳款，提醒將在 ${dueDate} 後再次顯示`);
    } catch { toast.error("更新失敗"); }
  }
  ```
- The button that calls it (lines 170–180):
  ```tsx
  {account.type === "credit" && account.paymentDueDay && (
    <Button variant={isPaid ? "default" : "outline"} onClick={markPaid} ...>
      <CurrencyCircleDollar size={14} weight={isPaid ? "fill" : "regular"} />
      {isPaid ? "已繳款" : "標記已繳款"}
    </Button>
  )}
  ```
- It already imports `useFinanceData`, `useRepositoryMutation`, `useToast`,
  `Button`, `Card`, and has `accounts`, `account`, `updateAccount` in scope.

Repository methods available (already in the repo interface):
- `createTransfer(input: TransferDraft)` — `src/data/repositories.ts:237`, shape:
  ```ts
  interface TransferDraft { date: string; sourceAccountId: string; destinationAccountId: string; sourceCurrency: string; destinationCurrency: string; sourceAmount: number; destinationAmount?: number; note: string; feeAmount?: number; }
  ```
  A transfer posts `-sourceAmount` to the source and `+sourceAmount` to the
  destination (the card), reducing the card's debt. See `createTransfer` at
  `repositories.ts:833`.
- `createLedgerTransaction(input: LedgerDraft)` — for the 回饋 credit row. A
  positive settled `income` row on the card adds `+amount` to the card balance.
  `LedgerDraft` requires at least: `accountId, counterAccountId, date, name,
  amount, currency, originalAmount, originalCurrency, category, subcategory,
  merchant, entryType, settlementStatus, note` (see other call sites, e.g.
  `CashFlowRoute.tsx:482-500`).

**Conventions to match:**
- zh-TW. Modal pattern: copy the `SettleModal` overlay structure in
  `src/routes/CashFlowRoute.tsx:1330-` (fixed inset, click-backdrop-to-close,
  `Card` body, account `<select>`).
- Money via `formatNumber`. Toasts via `toast.success/error`.
- Mutations via `useRepositoryMutation(fn, invalidateKeys)`; for a transfer +
  credit + account update, invalidate `["accounts", "ledger"]`.

## Commands you will need

| Purpose   | Command            | Expected         |
|-----------|--------------------|------------------|
| Typecheck | `npx tsc --noEmit` | exit 0           |
| Build     | `npm run build`    | exit 0           |
| Tests     | `npm run test`     | all pass         |
| Lint      | `npm run lint`     | exit 0, 0 errors |

## Scope

**In scope**: `src/routes/ReconcileRoute.tsx` only (UI + wiring; it can call the
existing repository methods, no repo changes needed).

**Out of scope**:
- `src/data/repositories.ts` — `createTransfer` / `createLedgerTransaction`
  already exist; do not modify them.
- FX between paying account and card — require same currency for v1 (guard +
  message); cross-currency card payment is a follow-up.
- The reconcile ✓ row-toggle behavior and statement bucketing.

## Git workflow

- Branch: `git checkout -B advisor/034-credit-card-payment-transfer main`.
- Commit per step; conventional commits
  (e.g. `feat(reconcile): record card payment as a transfer with optional cashback`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add transfer + credit mutations and a payment-dialog state

In `ReconcileRoute.tsx`:
- Add mutations near `updateAccount`:
  ```ts
  const createTransfer = useRepositoryMutation(
    (repository, input: TransferDraft) => repository.createTransfer(input),
    ["accounts", "ledger"],
  );
  const createLedger = useRepositoryMutation(
    (repository, input: LedgerDraft) => repository.createLedgerTransaction(input),
    ["accounts", "ledger"],
  );
  ```
  Import the `TransferDraft` / `LedgerDraft` types from `../data/repositories`
  (the file already imports `AccountDraft` from there — extend that import).
- Add `const [payOpen, setPayOpen] = useState(false);`
- Compute non-credit paying-account options:
  ```ts
  const payingAccounts = (accounts.data ?? []).filter(
    (a) => a.deletedAt === null && a.type !== "credit" && a.type !== "loan" && a.currency === account?.currency,
  );
  ```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Replace the button action — open the dialog instead of flag-only

Change the button (lines 170–180) so that for an unpaid card it opens the dialog,
while keeping the「已繳款」display state:
```tsx
<Button variant={isPaid ? "default" : "outline"} onClick={() => setPayOpen(true)} ...>
  <CurrencyCircleDollar size={14} weight={isPaid ? "fill" : "regular"} />
  {isPaid ? "已繳款" : "繳款 / 標記已繳"}
</Button>
```
Keep the old `markPaid` function — it becomes the "just suppress the reminder"
fallback the dialog calls when the user pays 0 (see Step 3).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Build the payment dialog

Add a `PayCardModal` component in the same file (model the overlay on
`SettleModal` from `CashFlowRoute.tsx:1330`). Fields:
- **付款帳戶** `<select>` over `payingAccounts` (default first). If
  `payingAccounts.length === 0`, show a hint「沒有可扣款的同幣別帳戶」and disable
  confirm.
- **繳款金額** number input, default `owed`.
- **帳單折抵 / 回饋（選填）** number input, default `0`.

On confirm (`handlePay(payAccountId, payAmount, creditAmount)`):
```ts
const today = todayInTimezone(timezone);
// 1) The cash transfer (only if paying > 0)
if (payAmount > 0) {
  await createTransfer.mutateAsync({
    date: today,
    sourceAccountId: payAccountId,
    destinationAccountId: account.id,
    sourceCurrency: account.currency,
    destinationCurrency: account.currency,
    sourceAmount: payAmount,
    note: "信用卡繳款",
  });
}
// 2) The cashback / statement credit (only if > 0): a positive settled income
//    row on the card, which reduces its debt toward 0.
if (creditAmount > 0) {
  await createLedger.mutateAsync({
    accountId: account.id,
    counterAccountId: null,
    date: today,
    name: "帳單折抵 / 回饋",
    amount: creditAmount,                 // positive → reduces card debt
    currency: account.currency,
    originalAmount: null, originalCurrency: null,
    category: "現金回饋", subcategory: "",
    merchant: "",
    entryType: "income",
    settlementStatus: "settled",
    note: "信用卡帳單折抵",
  });
}
// 3) Suppress the reminder for this cycle (reuse existing markPaid logic).
await markPaid();
setPayOpen(false);
toast.success("已記錄繳款");
```
Render `{payOpen && <PayCardModal .../>}` near the end of the component. Guard the
whole flow so it only applies to `account.type === "credit"`.

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0.
- Manual (if runnable): on a card owing 868, open 繳款, pick a bank account, pay
  818 with 折抵 50 → card 未繳 becomes 0 (per plan 029's display), bank account
  drops by 818, a 帳單折抵/回饋 +50 income row appears in 現金流, reminder hidden.

### Step 4: Edge guards

- If `payAmount` + `creditAmount` exceed `owed`, allow it but the card simply
  goes into 溢繳 (positive balance) — that's fine (plan 029 renders it). Do not
  block.
- If both `payAmount` and `creditAmount` are 0, skip the transfer/credit and just
  call `markPaid()` (pure reminder suppression — preserves old behavior).
- Disable the confirm button while any mutation `isPending`.

**Verify**: `npm run test` → all pass (no regressions).

## Test plan

- This is UI wiring over already-tested repository methods (`createTransfer`,
  `createLedgerTransaction` are covered by existing repo tests, e.g.
  `repositories.sqlite-tx.test.ts`). No new domain unit test is strictly
  required.
- If a route-component test harness exists (`grep -rl "render(" src/routes/*.test.* 2>/dev/null`):
  add a test that confirming the dialog with payAmount=818 calls `createTransfer`
  with `{ sourceAccountId, destinationAccountId: card.id, sourceAmount: 818 }`.
  Otherwise rely on manual verification + typecheck/build.
- Verification: `npm run test` → all pass.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test` exits 0
- [ ] `npm run lint` exits 0, 0 errors
- [ ] `grep -n "createTransfer" src/routes/ReconcileRoute.tsx` returns matches
- [ ] Paying a card moves cash from the chosen account and clears 未繳 (manual)
- [ ] Only `src/routes/ReconcileRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `markPaid` or the button block no longer matches the "Current state" excerpt.
- `TransferDraft` / `LedgerDraft` shapes differ from the excerpts (re-read the
  types; adapt field names, or STOP if unrecognizable).
- `createTransfer` rejects a destination that is a credit account (check
  `assertTransferInvariants` in `src/domain/ledgerTrust.ts:75` — if it forbids
  credit destinations, STOP and report; the card payment needs that path).

## Maintenance notes

- The 回饋 credit is modeled as `income` on the card so it both reduces debt and
  shows as a (small) inflow in cash flow. If the operator later wants cashback
  excluded from income totals, revisit — it would need its own neutral category
  handling.
- Cross-currency card payments are deliberately excluded; a follow-up can reuse
  the transfer's `destinationAmount` + FX rate.
- This does not auto-mark the statement's rows as ✓ reconciled — paying and
  reconciling stay separate actions by design.
