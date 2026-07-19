# Plan 235: 分帳一鍵還款 — share legs get a prefilled-transfer 還款 shortcut

> **Executor instructions**: Follow steps exactly; verify each. STOP conditions
> are binding. Do NOT update `plans/README.md`.
>
> **Drift check**: `git diff --stat ba4bc966..HEAD -- src/routes/CashFlowRoute.tsx`
> Non-empty = compare excerpts before proceeding.

## Status

- **Priority**: P3 · **Effort**: S · **Risk**: LOW (a prefill — no new posting
  math, no new data model)
- **Depends on**: plan 222 (merged — share legs render in the expanded split)
- **Category**: UX (分帳 phase-2 follow-up)
- **Planned at**: commit `ba4bc966`, 2026-07-19

## Why this matters

A 分帳 share leg parks the friend's portion on an 應收帳戶 (代墊 pass-through,
plan 221). Repayment reality: the friend pays you back → in Northstar that is a
**transfer 應收帳戶 → 收款帳戶** using the existing transfer machinery — no new
concept. Today the user must build that transfer by hand (pick both accounts,
retype the amount, remember who). One tap on the share leg should open the
transfer form prefilled. Deliberately NO per-leg "repaid" flag — 代墊 tracking
is account-balance-based (the 應收帳戶 balance IS the outstanding amount);
adding leg-state would be a data-model change out of scope.

## Current state

All in `src/routes/CashFlowRoute.tsx` at `ba4bc966`:

- Expanded split legs render share legs as `分帳 · ${leg.name}` (plan 222 —
  grep `分帳 · ` to find the row JSX; each `leg` is a full `LedgerTransaction`
  with `counterAccountId`, negative `amount`, `name` = 對象).
- `TransferDraft` shape — `makeEmptyTransfer` (`:173-185`): `date`,
  `sourceAccountId`, `destinationAccountId`, `sourceCurrency`,
  `destinationCurrency`, `sourceAmount`, `destinationAmount`, `note`,
  `feeAmount`.
- `openCreate(type)` (`:581-600`) — the reset-then-open pattern (resets split
  state, editing ids, recurring freq…). A prefill helper must do the SAME
  resets (call `openCreate("transfer")` first, then set the form — simplest).
- The transfer form's amount display: READ how the 轉帳 form binds
  `sourceAmount`/`destinationAmount` (grep `transferForm.sourceAmount` — if an
  expression/display state feeds it, set that too; STOP if the amount can't be
  prefilled without touching unrelated state machines).
- Account/currency: source = `leg.counterAccountId` (the 應收帳戶), destination
  = `leg.accountId` (the account that originally paid). Currencies from the
  matching `accountRows` entries. Amount = `Math.abs(leg.amount)` both sides
  (same-currency default; if the two accounts' currencies differ, still prefill
  source side and leave destination amount as the form's FX behavior dictates —
  read how the form handles cross-currency and follow it).

## Steps

1. Add `startShareRepayment(leg: LedgerTransaction)` near the other drawer
   openers: `openCreate("transfer")`, then `setTransferForm({ ...emptyTransfer,
   date: nowAsDatetimeLocal(timezone), sourceAccountId: leg.counterAccountId ?? "",
   destinationAccountId: leg.accountId, sourceCurrency/destinationCurrency from
   accountRows lookups (fallback "TWD"), sourceAmount/destinationAmount:
   Math.abs(leg.amount), note: `${leg.name} 分帳還款` })` + whatever amount
   display state step-reading found.
2. In the expanded split-leg row JSX, for `leg.legKind === "share"` add a small
   ghost button (match the row's existing icon-button conventions, e.g.
   `size="icon-sm"`, `aria-label`/`title` 「還款」, an appropriate Phosphor icon
   already imported or add `HandCoins`/`ArrowUUpLeft` — pick one consistent
   with the file's icon imports) calling `startShareRepayment(leg)` with
   `e.stopPropagation()` (the row may have click handlers).

**Verify**: `npx tsc --noEmit` → 0 · `npm run lint` → 0 errors / 761 warnings ·
`npm test` → 1414 pass.

3. Live check (dev server + demo): create a 分帳 (leg 400 + share 600 小明 →
   應收帳戶), expand the split in the list, tap 還款 → transfer form opens
   prefilled (應收帳戶 → original account, 600, note 小明 分帳還款); save →
   應收帳戶 balance back down by 600, bank up 600. If browser tools are
   unavailable, say so — the reviewer runs it.

## Scope

In: `src/routes/CashFlowRoute.tsx` only. Out: data model, repositories,
splitEntryState, any "repaid" state, transfer save path.

## Done criteria

- [ ] Gates green
- [ ] `grep -n "startShareRepayment" src/routes/CashFlowRoute.tsx` → definition + call site
- [ ] Live flow (step 3) passes
- [ ] No files outside scope modified

## STOP conditions

- The transfer amount is driven by state that can't be prefilled without
  refactoring the transfer form.
- Share-leg rows in the expanded view don't exist as described (222 drift).

## Maintenance notes

- If a future plan adds per-leg repaid tracking, this button becomes the entry
  point for a richer settle flow — the prefill contract (source =
  counterAccountId, dest = original account) stays.
- Tapping twice creates two transfers — same as doing it manually; acceptable,
  documented here.
