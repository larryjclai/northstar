# Plan 062: 代墊 (AR/AP) 收款/付款 account labels are reversed (esp. after settlement)

> **Executor instructions**: This is a **finance-semantics bug — investigate and
> confirm the correct mapping before changing labels.** The code carries a comment
> claiming the current mapping is intentional, so do NOT blindly swap. Reproduce the
> actual data first. Run every verification command. If a STOP condition occurs, stop
> and report. Update this plan's row in `plans/README.md` unless a reviewer maintains it.
>
> **Drift check (run first)**:
> `git diff --stat 65775330..HEAD -- src/components/TransactionDetailPanel.tsx src/routes/CashFlowRoute.tsx`
> Compare the "Current state" excerpts against live code first.

## Status
- **Priority**: P2
- **Effort**: S–M
- **Risk**: MED (finance/accounting labels — wrong fix mislabels money direction)
- **Depends on**: none
- **Category**: bug (correctness — display)
- **Planned at**: commit `65775330`, 2026-06-23

## Why this matters
Operator-reported (with screenshot): on a 代墊 (應收/應付) transaction the
detail panel shows **收款帳戶（代墊）= 富邦 Costco** and **付款帳戶 = Richart 數位帳戶**,
but it should be **收款帳戶 = Richart, 付款帳戶 = 富邦 Costco** — the two are reversed.
Money direction labels being wrong on a finance app is a correctness issue.

## Current state
`src/components/TransactionDetailPanel.tsx` (around lines 83–88, 216–217):
```ts
const isSettled = row.settlementStatus === "settled";
const isReimbursement = row.counterAccountId != null;
// 應收: counter = 付款帳戶, main = 收款帳戶. 應付: counter = 收款帳戶, main = 付款帳戶.
const isReceivable = row.settlementStatus === "receivable";
// …
<DetailField label={isReceivable ? "付款帳戶（代墊）" : "收款帳戶（代墊）"} value={accountName(row.counterAccountId!)} />
<DetailField label={isReceivable ? "收款帳戶" : "付款帳戶"} value={row.accountId ? accountName(row.accountId) : "結清時指定"} />
```
`src/routes/CashFlowRoute.tsx` — AR/AP are persisted as income/expense rows with a
`settlementStatus`:
```ts
type CashType = "expense" | "income" | "transfer" | "ar" | "ap";   // ~line 59
function settlementFor(type) { if (type === "ar") return "receivable"; /* ap → "payable" */ } // ~80
```

**Likely root cause (confirm in Step 1):** `isReceivable` is derived from the LIVE
`settlementStatus`, which becomes `"settled"` once the item is settled. So for a
**settled** receivable, `settlementStatus === "settled"` → `isReceivable === false`
→ the panel falls into the `else` (應付) branch and prints the 應付 labels
("收款帳戶（代墊）" on the counter leg, "付款帳戶" on the main leg) — i.e. **reversed**
for what is actually a receivable. The operator's screenshot is a 收入/代墊 row, which
is an `ar` (receivable); if it's settled, this is exactly the bug.

## Investigation (Step 1 — REQUIRED before changing labels)
Determine, for the operator's actual transaction (and one of each type):
1. Its `settlementStatus` (`receivable` / `payable` / `settled`) and `entryType`
   (income vs expense), and which of `accountId` / `counterAccountId` holds which
   real account. (Reproduce in the running app, or add a focused log/test reading
   the row.)
2. The intended accounting mapping for 代墊:
   - 應收 (you advanced money, someone owes you): the account that **paid out** on
     creation = 付款帳戶 (代墊); the account that will **receive** on settle = 收款帳戶.
   - 應付 (someone advanced for you, you owe): mirror.
3. Confirm whether the bug is (a) `isReceivable` flipping to false after settlement
   (most likely), (b) the counter/main → 收款/付款 mapping itself being inverted, or
   (c) `accountId`/`counterAccountId` stored opposite to the comment.

Write the finding (1–2 paragraphs) at the top of the plan's branch commit message or
a short note, then implement the matching fix. **The operator's stated expectation is
the acceptance oracle:** for their 代墊 row, 收款帳戶 must read the account that
receives the repayment and 付款帳戶 the account that paid out — i.e. for that row,
收款 = Richart, 付款 = 富邦 Costco.

## Decision (recommended fix, pending Step 1 confirmation)
Derive receivable-vs-payable from a **stable** signal, not the live
`settlementStatus`. Options (pick per Step 1):
- If the row keeps its origin type: use that (e.g. `entryType === "income"` ⇒ was an
  `ar`/receivable; `expense` ⇒ `ap`/payable) — but verify a plain income/expense with
  a `counterAccountId` is genuinely only ever AR/AP (the `isReimbursement` guard
  already gates the 代墊 block on `counterAccountId != null`).
- Within the 代墊 block, compute `isReceivable` as "was a receivable" using that
  stable signal so it stays correct after settlement, then keep the existing
  counter/main → 收款/付款 label mapping (which the comment says is right for the
  unsettled case). If Step 1 shows the mapping itself is inverted, fix the mapping
  instead — but only one of these, guided by the data.

Do NOT change how AR/AP rows are stored (accountId/counterAccountId) — this is a
display-label fix only.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev (visual) | `npm run dev` | serves 127.0.0.1 |

## Scope
**In scope:**
- `src/components/TransactionDetailPanel.tsx` — the 代墊 account-label derivation/mapping.
- A focused test if the receivable/payable determination can be extracted to a tiny
  pure helper (preferred — testable across unsettled/settled).
**Out of scope:**
- AR/AP creation + storage in `CashFlowRoute.tsx` (`accountId`/`counterAccountId`,
  `settlementFor`) — do NOT change the data model; labels only.
- Settlement flow, ledger postings, balances.

## Git workflow
- Branch from current main: `git checkout -B advisor/062-arap-account-labels main`.
- Short imperative commit style. Do NOT push/PR.

## Steps
### Step 1: investigate + confirm (above). STOP if the data contradicts the hypothesis
and the correct mapping is unclear — report with the actual field values.
### Step 2: implement the label fix per the confirmed semantics (display only).
**Verify**: `npx tsc --noEmit` → 0; the operator's 代墊 row now reads 收款 = the
receiving account, 付款 = the paying account (for their case: 收款 Richart, 付款 Costco).
### Step 3: full verification
`npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0.

## Test plan
- If you extract a helper (e.g. `arApAccountRoles(row)` → `{ payLabel, payValue,
  receiveLabel, receiveValue }`), unit-test all four states: unsettled 應收, settled
  應收, unsettled 應付, settled 應付 — each shows the right account under 收款 vs 付款.
- The settled-receivable case is the regression guard (the reported bug).
- Existing tests stay green.

## Done criteria
- [ ] Step-1 finding recorded; the bug's true cause confirmed (not guessed)
- [ ] 代墊 detail labels show the correct 收款/付款 account in ALL of {AR,AP}×{unsettled,settled}
- [ ] The operator's reported row reads 收款 = Richart, 付款 = 富邦 Costco
- [ ] AR/AP storage unchanged; display-only diff
- [ ] `npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0
- [ ] `plans/README.md` row updated

## STOP conditions
- The data shows the mapping is correct for unsettled and only wrong for settled →
  fix the `isReceivable`-after-settlement derivation (don't touch the mapping).
- The data contradicts both hypotheses → stop and report the actual field values so
  the operator can confirm the intended accounting.
- Fixing labels appears to need changing AR/AP storage — out of scope; stop and report.

## Maintenance notes
- Load-bearing: money-direction labels must be correct; the settled state is the
  trap (settlementStatus stops being "receivable"/"payable"). Derive role from a
  stable signal.
- Reviewer: check all four AR/AP × settled/unsettled states, not just the reported one.
