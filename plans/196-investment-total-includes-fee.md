# Plan 196: Investment transaction 總額 shows the real net cash flow (incl. fee/tax)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat db007657..HEAD -- src/routes/TransactionsRoute.tsx src/routes/HoldingDetailRoute.tsx src/domain/investmentCash.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `db007657`, 2026-07-14

## Why this matters

The investment transaction list shows a 總額 (total) column that is meant to be
the money that actually moved — the broker's 應收付金額. Today it displays
`price × quantity` with the brokerage fee (and, on sells, the securities
transaction tax folded into `fee`) **dropped**. For a 台光電 buy of 2 shares @
5,065 with an 8 元 fee, it shows −TWD 10,130 instead of the correct −TWD 10,138.

This is a **display-only** defect. The real cash leg posted to the brokerage
account is already correct — `src/data/repositories.ts` posts it via
`calculateInvestmentCashDelta`, which includes the fee. So account balances are
right; only the number the user reads is wrong. That mismatch is exactly what
makes the ledger look "off" when the user tries to reconcile against a broker
statement. Fixing the display to reuse the same `calculateInvestmentCashDelta`
the ledger already uses makes the on-screen total tie out to the cash movement
to the cent, and is a prerequisite for the daily-settlement view (plan 197),
whose per-day 小計 sums these totals.

## Current state

Two display surfaces compute the total as gross (`price × quantity`), diverging
from the ledger's own cash-delta function.

**Source of truth (do NOT change — this is already correct):**
`src/domain/investmentCash.ts` — `calculateInvestmentCashDelta` returns the
signed net cash flow (+ inflow, − outflow) and is what the ledger posts:

```ts
export function calculateInvestmentCashDelta(input: InvestmentCashInput) {
  const price = Math.max(0, Number(input.price) || 0);
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const gross = price * quantity;
  const fee = Math.max(0, Number(input.fee) || 0);
  if (input.action === "buy") return -(gross + fee);
  if (input.action === "sell") return gross - fee;
  if (input.action === "cashDividend") {
    const dividend = quantity > 0 ? gross : price;
    return dividend - fee;
  }
  if (input.action === "capitalReduction") return gross;
  return 0;
}
```

It is re-exported from the domain barrel (`src/domain/index.ts` has
`export * from "./investmentCash";`), so it can be imported from `"../domain"`.
It is already imported that way in `src/routes/InvestmentsAddSheet.tsx:15` and
called in `src/data/repositories.ts` (4 sites) — reuse it, do not reimplement.

**Bug site 1 — `src/routes/TransactionsRoute.tsx:130-158`** (the 交易紀錄 list).
`InvestmentTransactionRow`/`InvestmentTransactionMobile` render `tx.signed`
(lines 549-551 and 603-605). `tx.signed` is built here:

```ts
// src/routes/TransactionsRoute.tsx:135-137
const gross = record.action === "cashDividend" ? record.price : record.price * record.quantity;
// The opening lot has no cash leg, so its total is neutral (shown as 「—」).
const signed = openingLot ? 0 : record.action === "buy" ? -gross : gross;
```

`openingLot` is `isImportOpeningLot(record)` (line 134). Opening lots are
cashless import baselines and must stay neutral (rendered as 「—」 by the
`tx.isOpeningLot` branches at lines 546-552 and 600-606) — preserve that.

The import at the top of the file already pulls several helpers from `"../domain"`:

```ts
// src/routes/TransactionsRoute.tsx:19
import { createFxConverter, formatMoney, formatNumber, formatPrice, formatQuantity, isWithinDateScope, makeDefaultDateScope, resolveDateScope } from "../domain";
```

**Bug site 2 — `src/routes/HoldingDetailRoute.tsx:658-660`** (per-holding 交易紀錄
list). Here each `tx` is a raw `InvestmentRecord` (fields `action`, `price`,
`quantity`, `fee`, `cashless`). The `txns` list (defined at line 131-136)
includes **all** records for the asset, **including opening lots**:

```tsx
// src/routes/HoldingDetailRoute.tsx:658-660
<span className={"num text-sm text-right font-medium " + (tx.action === "sell" ? "pos" : tx.action === "buy" ? "" : "pos")}>
  {tx.action === "sell" ? "+" : tx.action === "cashDividend" ? "+" : "−"}{formatNumber(tx.quantity * tx.price)}
</span>
```

`isImportOpeningLot` is a pure guard exported from
`src/routes/transactionsTxLabel.ts:19`:

```ts
export function isImportOpeningLot(record: { cashless?: boolean; id: string; assetId: string }): boolean {
  return record.cashless === true || record.id === `inv_open_${record.assetId}`;
}
```

**Behavior change to be aware of (intended):** for a legacy `cashDividend` row
stored with `quantity > 0`, the old display used `record.price` alone; the new
value is `price × quantity − fee` (what `calculateInvestmentCashDelta` returns).
This is the correct, ledger-consistent number — accept it.

## Commands you will need

| Purpose   | Command                                         | Expected on success        |
|-----------|-------------------------------------------------|----------------------------|
| Typecheck | `npx tsc --noEmit`                              | exit 0, no errors          |
| Tests     | `npm test -- src/domain/investmentCash`         | all pass                   |
| Full test | `npm test`                                       | all pass (baseline green)  |
| Lint      | `npm run lint`                                   | exit 0                     |

## Scope

**In scope** (the only files you should modify):
- `src/routes/TransactionsRoute.tsx`
- `src/routes/HoldingDetailRoute.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/domain/investmentCash.ts` — already correct; it is the source of truth
  you are reusing. Changing it would alter the ledger cash leg.
- `src/data/repositories.ts` — the cash-leg posting is correct; leave it.
- `src/routes/transactionsSummary.ts` and the top summary cards (總買入/總賣出/
  總股利) — those intentionally aggregate **gross** turnover, a different metric
  from net cash flow. Do not "fix" them here; changing them is out of scope.
- `src/routes/transactionsTxLabel.ts` — reuse `isImportOpeningLot`, don't edit it.

## Git workflow

- Branch: `fix/ai-investment-total-fee` (repo convention: `fix/ai-<name>`, per `.agentrules`).
- One commit is fine. Message style is conventional commits (see `git log --oneline -5`),
  e.g. `fix(investments): 總額 shows net cash flow incl. fee/tax`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the 交易紀錄 list total (`TransactionsRoute.tsx`)

Add `calculateInvestmentCashDelta` to the existing `"../domain"` import at line 19:

```ts
import { calculateInvestmentCashDelta, createFxConverter, formatMoney, formatNumber, formatPrice, formatQuantity, isWithinDateScope, makeDefaultDateScope, resolveDateScope } from "../domain";
```

Replace the `gross`/`signed` computation at lines 135-137 with a single call to
the shared cash-delta function, keeping the opening-lot neutral branch:

```ts
// Net cash flow (應收付金額) — identical to the ledger cash leg, so the on-screen
// total ties out to the account movement (brokerage fee, and the securities-
// transaction tax folded into `fee` on sells, are included). Opening lots are
// cashless import baselines, so their total stays neutral (shown as 「—」).
const signed = openingLot
  ? 0
  : calculateInvestmentCashDelta({
      action: record.action,
      price: record.price,
      quantity: record.quantity,
      fee: record.fee,
    });
```

Delete the now-unused `gross` local. Do not touch the render branches — they
already read `tx.signed` and show 「—」 for `tx.isOpeningLot`.

**Verify**: `npx tsc --noEmit` → exit 0, no errors (in particular, no
"'gross' is declared but never read" and no unused-import error).

### Step 2: Fix the per-holding 交易紀錄 list total (`HoldingDetailRoute.tsx`)

Add two imports near the top of the file (match the existing import style;
`calculateInvestmentCashDelta` comes from the domain barrel, `isImportOpeningLot`
from the sibling route module):

```ts
import { calculateInvestmentCashDelta } from "../domain";
import { isImportOpeningLot } from "./transactionsTxLabel";
```

(If `HoldingDetailRoute.tsx` already imports other symbols from `"../domain"`,
add `calculateInvestmentCashDelta` to that existing import instead of adding a
second line. Check first.)

The transaction rows are rendered by `txns.map((tx, i) => ( ... ))` starting at
line 642 (implicit-return arrow). Convert it to a block body so you can compute
the net amount once, and replace the amount span (lines 658-660). Target shape:

```tsx
txns.map((tx, i) => {
  const opening = isImportOpeningLot(tx);
  const net = opening
    ? 0
    : calculateInvestmentCashDelta({ action: tx.action, price: tx.price, quantity: tx.quantity, fee: tx.fee });
  return (
    <div key={tx.id} /* ...unchanged grid wrapper... */ >
      {/* ...unchanged date / badge / quantity / price / fee cells... */}
      <span className={"num text-sm text-right font-medium " + (net > 0 ? "pos" : net < 0 ? "" : "muted")}>
        {opening ? "—" : `${net >= 0 ? "+" : "−"}${formatNumber(Math.abs(net))}`}
      </span>
      {/* ...unchanged account cell... */}
    </div>
  );
})
```

Only the amount `<span>` changes (sign + magnitude now from `net`, opening lots
render 「—」). Leave every other cell in the row exactly as it is. `formatNumber`
is already imported in this file (it is used at line 659 today).

**Verify**: `npx tsc --noEmit` → exit 0, no errors.

### Step 3: Full gate

**Verify**:
- `npm run lint` → exit 0
- `npm test` → all pass (no regressions; the existing
  `src/domain/investmentCash.test.ts` still green — you did not change that module)

## Test plan

No new test file is strictly required: the math is already covered by
`src/domain/investmentCash.test.ts` (the function you are reusing), and this
change only rewires two display sites to call it. Do **not** write brittle
component-render tests for the two routes — the repo has no React-render test
harness for these routes (see the absence of `TransactionsRoute.test.tsx`).

Optional, only if trivial: extend `src/domain/investmentCash.test.ts` with an
explicit assertion mirroring the user's report, to lock the reconciliation
identity in place:

```ts
it("buy net cash includes fee (應收付金額)", () => {
  expect(calculateInvestmentCashDelta({ action: "buy", price: 5065, quantity: 2, fee: 8 })).toBe(-10138);
});
```

If you add it, run `npm test -- src/domain/investmentCash` → all pass incl. the
new case.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0 (baseline green; +1 passing test if you added the optional case)
- [ ] `grep -n "record.price \* record.quantity" src/routes/TransactionsRoute.tsx` returns no matches (the gross computation is gone)
- [ ] `grep -n "tx.quantity \* tx.price" src/routes/HoldingDetailRoute.tsx` returns no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 196 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts
  (the codebase has drifted since this plan was written — `db007657`).
- `calculateInvestmentCashDelta` is no longer exported from `"../domain"`, or its
  signature/behavior differs from the excerpt above.
- Converting the `HoldingDetailRoute` map to a block body forces changes to any
  cell other than the amount span, or breaks an existing test.
- `npm test` is already failing before you start (record the baseline first with
  `npm test` and report if red on a clean checkout).

## Maintenance notes

- The three display surfaces of "how much money moved" now split cleanly:
  per-row 總額 (this plan) = net cash = `calculateInvestmentCashDelta`; the top
  summary cards = **gross** turnover (`transactionsSummary.ts`, intentionally
  different). A reviewer should confirm nobody later "reconciles" the summary
  cards to the row totals — they are different metrics by design.
- If a future change splits `fee` into separate brokerage vs. tax fields,
  `calculateInvestmentCashDelta` is the single place to update; both display
  sites will follow automatically.
- Plan 197 (daily-settlement view) depends on this: its per-day 小計 sums these
  net totals, so land 196 first.
