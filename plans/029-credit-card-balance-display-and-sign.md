# Plan 029: Credit-card balance reads correctly as 未繳/溢繳, and the opening-balance hint stops lying

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 721f216f..HEAD -- src/routes/AccountsRoute.tsx src/domain/dashboardSummary.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (but read plan 030 — the operator's real "+302" is most likely an orphaned AR/AP counter leg fixed there; this plan makes the number *legible*, 030 fixes the likely *source*)
- **Category**: bug
- **Planned at**: commit `721f216f`, 2026-06-19

## Why this matters

The operator reported their 玉山 Ubear credit card showing a balance of **+302**
when they expected **0**, and that "未繳金額餘額怪怪的". Two distinct problems
sit behind this:

1. **The account card prints the raw signed balance** with no credit-card
   semantics. A credit card's balance is a *liability*: negative = 未繳 (owed),
   positive = 溢繳/預付 (overpaid). Today a +302 balance renders as a bare
   "302" with no sign and no label, which is meaningless to the user and
   *disagrees with the Reconcile screen*, which already computes
   `owed = Math.max(0, -balance)` (so Reconcile shows 0 while the card shows
   302). The two screens must tell the same story.
2. **The "新增帳戶" drawer hint lies.** For credit cards it says the entered
   balance「系統會記錄為負數（負債）」, but the save path stores the value
   verbatim — no negation happens anywhere. A user who types their owed amount
   as a positive number gets a positive (asset-like) balance that inflates net
   worth.

This plan makes the credit-card balance legible and consistent across screens,
corrects the misleading hint, and adds a one-shot diagnostic the operator can
run to locate the exact rows producing their +302.

## Current state

- `src/routes/AccountsRoute.tsx` — the Accounts page. Renders each account row's
  balance and the credit-utilization bar.
  - Balance render (lines 433–437) prints the raw signed balance for **all**
    account types:
    ```tsx
    <div className="num text-[15px]" style={{ fontWeight: 500, color: a.balance < 0 ? "var(--ns-neg)" : undefined }}>
      {a.balance < 0 ? "−" : ""}{formatNumber(Math.abs(base))}
    </div>
    {a.currency !== primaryCurrency ? <div className="muted mono text-caption">{formatNumber(a.balance)} {a.currency}</div> : null}
    ```
    `base` is the balance converted to the primary currency:
    `const base = toBase(a.balance, a.currency);` (line 375).
  - The credit-utilization figure already exists just above (line 386):
    `const creditUsed = groupCredit ? groupCredit.used : Math.max(0, -a.balance);`
  - The credit-card hint in the drawer (lines 769–773):
    ```tsx
    {form.type === 'credit' && (
      <p className="muted text-caption" ...>
        信用卡餘額請輸入「本期消費應還金額」，系統會記錄為負數（負債）
      </p>
    )}
    ```
  - The submit path (lines 193–204) passes `form.openingBalance` **verbatim** —
    no negation for any type:
    ```tsx
    const payload = { ...form, currency: selectedCurrency };
    if (editingId) await updateAccount.mutateAsync({ ...payload, id: editingId });
    else await createAccount.mutateAsync(payload);
    ```
- `src/data/repositories.ts` — `createAccount` (lines 634–655) stores
  `balance: input.openingBalance` with no sign transform. `deriveAccountBalances`
  (`src/domain/ledgerTrust.ts:118`) then computes
  `balance = openingBalance + Σ(settled deltas + counter legs)`. **Do not change
  the balance math** — it is correct; the bug is presentation + the hint.

**Conventions to match:**
- This is a zh-TW-first app (see `MEMORY.md` / `src/locales`). UI strings are
  Traditional Chinese. The repo uses an English-eyebrow / Chinese-body header
  convention but inline labels here are Chinese.
- Money is rendered with `formatNumber` (already imported in AccountsRoute) and
  the `num`/`muted`/`text-caption` utility classes. Colors come from CSS tokens
  `var(--ns-neg)` (red/owed), `var(--ns-pos)` (green), `var(--ns-fg-dim)`.
- Reconcile's existing owed semantics live in `src/routes/ReconcileRoute.tsx:140`:
  `const owed = Math.max(0, -account.balance);` — mirror this exactly.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
|-----------|------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                       | exit 0, no errors   |
| Tests     | `npm run test`                           | all pass            |
| One file  | `npx vitest run src/domain/dashboardSummary.test.ts` | pass    |
| Lint      | `npm run lint`                           | exit 0, 0 errors (warnings pre-exist) |
| Build     | `npm run build`                          | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/routes/AccountsRoute.tsx` — credit-card balance display + hint copy.
- `src/domain/dashboardSummary.ts` — add a pure helper `creditBalanceLabel` (so
  it is unit-testable; see Step 1).
- `src/domain/dashboardSummary.test.ts` — new tests for the helper.

**Out of scope** (do NOT touch):
- `src/domain/ledgerTrust.ts` / `deriveAccountBalances` — the balance math is
  correct; changing it would corrupt every account.
- `createAccount` / `updateAccount` in `src/data/repositories.ts` — do **not**
  add silent negation of `openingBalance`. Existing accounts already store a
  signed balance; flipping it retroactively would change live net worth for
  every credit account. The hint is being corrected to match the *current*
  behavior instead (Step 3).
- Any change to the Reconcile screen.

## Git workflow

- Branch: `advisor/029-credit-card-balance-display`. Create it from current
  `main`: `git checkout -B advisor/029-credit-card-balance-display main`.
- Commit per step; conventional-commit style (e.g.
  `fix(accounts): show credit-card balance as 未繳/溢繳`).
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Add a pure `creditBalanceLabel` helper with tests

In `src/domain/dashboardSummary.ts`, add an exported helper that maps a signed
credit-card balance to a display descriptor. Put it near `buildCreditCardReminders`
(which already encodes the `owed = Math.max(0, -balance)` convention).

```ts
export interface CreditBalanceDisplay {
  /** "owed" when the card has an unpaid balance, "credit" when overpaid, "zero" when settled. */
  state: "owed" | "credit" | "zero";
  /** Magnitude to display (always >= 0). */
  magnitude: number;
  /** zh-TW label, e.g. "未繳" / "溢繳" / "已結清". */
  label: string;
}

/** Interpret a credit-card account's signed balance for display. Negative
 *  balance = owed (未繳); positive = overpaid/prepaid (溢繳); ~0 = settled. */
export function creditBalanceLabel(balance: number): CreditBalanceDisplay {
  if (balance < -0.005) return { state: "owed", magnitude: -balance, label: "未繳" };
  if (balance > 0.005) return { state: "credit", magnitude: balance, label: "溢繳" };
  return { state: "zero", magnitude: 0, label: "已結清" };
}
```

(The `0.005` epsilon avoids labeling a floating-point `-0.0001` as 未繳.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Render credit-card balances with 未繳/溢繳 semantics

In `src/routes/AccountsRoute.tsx`:
1. Import the helper: add `creditBalanceLabel` to the existing import from
   `../domain` if it is re-exported there, otherwise import from
   `../domain/dashboardSummary`. Confirm the export path first:
   `grep -n "creditBalanceLabel" src/domain/index.ts` — if absent, add it to
   `src/domain/index.ts`'s re-exports (that file just re-exports domain modules;
   match the existing lines) **and** that single line is then in-scope.
2. Replace the balance render block (lines 433–437) so that **credit accounts**
   show the magnitude plus a 未繳/溢繳 label, while all other types keep today's
   exact rendering. Target shape:
   ```tsx
   {a.type === "credit" ? (() => {
     const cb = creditBalanceLabel(a.balance);
     const toneColor = cb.state === "owed" ? "var(--ns-neg)" : cb.state === "credit" ? "var(--ns-pos)" : "var(--ns-fg-dim)";
     return (
       <>
         <div className="num text-[15px]" style={{ fontWeight: 500, color: toneColor }}>
           {cb.state === "owed" ? "−" : cb.state === "credit" ? "+" : ""}{formatNumber(Math.abs(toBase(cb.state === "zero" ? 0 : a.balance, a.currency)))}
         </div>
         <div className="muted text-caption">{cb.label}</div>
       </>
     );
   })() : (
     <>
       <div className="num text-[15px]" style={{ fontWeight: 500, color: a.balance < 0 ? "var(--ns-neg)" : undefined }}>
         {a.balance < 0 ? "−" : ""}{formatNumber(Math.abs(base))}
       </div>
       {a.currency !== primaryCurrency ? <div className="muted mono text-caption">{formatNumber(a.balance)} {a.currency}</div> : null}
     </>
   )}
   ```
   Keep the surrounding `<div style={{ textAlign: "right" }}>` wrapper intact.
   Do not change the non-credit branch's output at all.

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0.
- Manual: run `npm run dev`, open the Accounts page with a credit card that has
  a negative balance → it shows e.g. `−302` with a 未繳 caption; with a positive
  balance → `+302` with a 溢繳 caption; with zero → `0` / 已結清. (If you cannot
  run the app, rely on the unit tests from Step 4 and the typecheck.)

### Step 3: Correct the misleading credit-card hint

In `src/routes/AccountsRoute.tsx`, replace the hint text (lines 769–773) so it
describes what the code *actually does* (stores the value as-is; owed must be a
negative number):

```tsx
{form.type === 'credit' && (
  <p className="muted text-caption" ...>
    信用卡尚未繳清的金額請以負數輸入（例：輸入 −302 表示尚欠 302）；已結清請填 0。
  </p>
)}
```

Keep the same wrapper element and classes that are already there — only the
text changes.

**Verify**: `grep -n "系統會記錄為負數" src/routes/AccountsRoute.tsx` → **no
matches** (old misleading copy gone).

### Step 4: Unit-test the helper

In `src/domain/dashboardSummary.test.ts` (already exists — match its `describe`/
`it` + `vitest` style), add a `describe("creditBalanceLabel", ...)` block
covering:
- `-302` → `{ state: "owed", magnitude: 302, label: "未繳" }`
- `302` → `{ state: "credit", magnitude: 302, label: "溢繳" }`
- `0` → `{ state: "zero", magnitude: 0, label: "已結清" }`
- `-0.001` (epsilon) → `state: "zero"` (not "owed")

**Verify**: `npx vitest run src/domain/dashboardSummary.test.ts` → all pass,
including the 4 new cases.

### Step 5: Add an opt-in diagnostic for the operator's "+302"

The operator's specific +302 is data, not (necessarily) a display bug. Add a
**dev-only console diagnostic** they can run to find which rows post to a card.
Do this as a tiny exported pure function so it is testable and has no UI cost:

In `src/domain/dashboardSummary.ts`, add:
```ts
/** Debug helper: every ledger row that contributes to `accountId`'s balance,
 *  with the contributed delta. Mirrors deriveAccountBalances' per-row logic so
 *  an operator can see exactly what sums to a surprising balance. Pure; no I/O. */
export function explainAccountBalance(
  accountId: string,
  openingBalance: number,
  ledger: Array<Pick<LedgerTransaction, "id" | "date" | "name" | "amount" | "accountId" | "counterAccountId" | "settlementStatus" | "deletedAt">>,
): { opening: number; contributions: Array<{ id: string; date: string; name: string; delta: number; via: "main" | "counter" }>; total: number } {
  const contributions: Array<{ id: string; date: string; name: string; delta: number; via: "main" | "counter" }> = [];
  for (const row of ledger) {
    if (row.deletedAt !== null) continue;
    if (row.counterAccountId) {
      if (row.counterAccountId === accountId) contributions.push({ id: row.id, date: row.date, name: row.name, delta: -row.amount, via: "counter" });
      if (row.settlementStatus === "settled" && row.accountId === accountId) contributions.push({ id: row.id, date: row.date, name: row.name, delta: row.amount, via: "main" });
    } else if (row.settlementStatus === "settled" && row.accountId === accountId) {
      contributions.push({ id: row.id, date: row.date, name: row.name, delta: row.amount, via: "main" });
    }
  }
  const total = openingBalance + contributions.reduce((s, c) => s + c.delta, 0);
  return { opening: openingBalance, contributions, total };
}
```
Import `LedgerTransaction` type at the top of the file if not already imported
(`grep -n "LedgerTransaction" src/domain/dashboardSummary.ts`).

Add one unit test in `dashboardSummary.test.ts` proving that a payable row whose
`counterAccountId` is the card and `amount` is `-302` contributes `+302` via
`"counter"` (this is the exact mechanism that most plausibly produced the
operator's number — confirming it here documents the link to plan 030).

**Verify**: `npx vitest run src/domain/dashboardSummary.test.ts` → all pass.

## Test plan

- New tests in `src/domain/dashboardSummary.test.ts`:
  - `creditBalanceLabel`: owed / credit / zero / epsilon (4 cases).
  - `explainAccountBalance`: settled expense contributes via main; a payable
    with `counterAccountId === card` and negative amount contributes `+|amount|`
    via counter (the +302 mechanism).
- Pattern to follow: the existing `describe`/`it` blocks already in
  `dashboardSummary.test.ts`.
- Verification: `npx vitest run src/domain/dashboardSummary.test.ts` → all pass,
  ≥ 6 new assertions.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test` exits 0; new `creditBalanceLabel` + `explainAccountBalance` tests pass
- [ ] `grep -n "系統會記錄為負數" src/routes/AccountsRoute.tsx` returns no matches
- [ ] Credit accounts render a 未繳/溢繳/已結清 caption; non-credit rows render exactly as before (diff the non-credit branch — it must be byte-identical)
- [ ] No files outside the in-scope list modified (`git status`) — except possibly `src/domain/index.ts` if a re-export was needed (allowed per Step 2)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The balance render block in `AccountsRoute.tsx` no longer matches the excerpt
  in "Current state" (drift).
- You find that `createAccount`/`updateAccount` already negates `openingBalance`
  for credit cards (someone fixed it) — then Step 3's hint must instead be
  reverted to describe negation, so ask.
- Changing the credit branch alters the non-credit rendering in any way you
  cannot prevent.

## Maintenance notes

- **Update (operator, 2026-06-19):** the operator confirmed they did **not** do
  any 代墊 against 玉山 Ubear (recent 代墊/AR was on 玉山 UniCard and 富邦 Costco
  卡), so the "counter leg lands on the card" theory is **disproven for this
  card**. The +302 source is therefore still open — `explainAccountBalance`
  (Step 5) is now the *primary* tool: run it against 玉山 Ubear and report the
  contributions list so the real cause (stray opening balance? a mis-signed row?)
  can be identified. Do not assume the cause.
- We deliberately did **not** retro-negate stored `openingBalance`. If a future
  plan wants a positive "本期應還" input that auto-negates, it must (a) transform
  only at the form boundary, (b) round-trip on edit by showing `Math.abs`, and
  (c) **migrate existing rows carefully** — flipping signs in place corrupts
  net worth. That is a separate, higher-risk plan.
- Reviewer should scrutinize that the non-credit balance rendering is unchanged.
