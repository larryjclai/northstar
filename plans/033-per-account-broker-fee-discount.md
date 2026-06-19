# Plan 033: Per-account broker-fee discount (折扣) + a visible fee breakdown

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 721f216f..HEAD -- src/domain/tradingFees.ts src/routes/InvestmentsAddSheet.tsx src/routes/settings/TradingFeesSection.tsx`
> Compare the "Current state" excerpts to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: **plan 026** (`advisor/026-tw-broker-fee-autocalc`) must be
  merged to `main` first — this plan extends the `tradingFees.ts` calculator and
  the auto-fill it added. If `src/domain/tradingFees.ts` does not exist on the
  branch you start from, STOP and merge 026 first.
- **Category**: direction / feature
- **Planned at**: commit `721f216f`, 2026-06-19

## Why this matters

The operator: "你幫我新增的券商手續費的功能，但我在帳戶那邊要可以設定乘以多少才對
嗎？像台灣會有券商手續費與證券交易稅…而且每個人的費率不一樣。"

Plan 026 added a **single global** Taiwan fee calculator (0.1425% brokerage +
0.3%/0.1% securities tax, min NT$20). But Taiwan brokers compete on **手續費折扣**
— electronic-order discounts of 6折/5折/2.8折 are common, and different per broker.
With one global rate the auto-filled fee is wrong for anyone with a discount, and
the user can't see how the number was derived. This plan adds:
1. A per-account brokerage **discount multiplier** (折扣), applied to the
   brokerage portion only (the securities-transaction **tax** is statutory and is
   never discounted).
2. A small fee **breakdown caption** in the trade sheet so the user sees
   "券商手續費 NT$X（6 折）＋ 證交稅 NT$Y".

Storage is in the existing `AppSettings.tradingFees` JSON blob (no DB schema
change), keyed by account id.

## Current state

- `src/domain/tradingFees.ts` (added by plan 026):
  - `TradingFeeConfig` has `brokerFeeRate`, `sellTaxRateStock`, `sellTaxRateEtf`,
    `minBrokerFee`, `enabled`.
  - `computeTradeFee({ action, qty, price, instrument, config })`:
    ```ts
    const consideration = qty * price;
    const brokerage = Math.max(config.minBrokerFee, Math.round(consideration * config.brokerFeeRate));
    if (action === "sell") { const taxRate = instrument === "etf" ? config.sellTaxRateEtf : config.sellTaxRateStock; return brokerage + Math.round(consideration * taxRate); }
    return brokerage;
    ```
  - `DEFAULT_TW_FEES` has `enabled: false`.
- `src/domain/types.ts:296-307` — `AppSettings.tradingFees?: TradingFeeConfig`
  (optional; stored in the settings JSON blob, **not** a DB column — confirm by
  noting `categories`/`exchangeRates` are arrays in the same interface, also
  blob-serialized).
- `src/routes/InvestmentsAddSheet.tsx`:
  - Reads config (lines 150–151): `const feeConfig = settingsQuery.data?.tradingFees ?? DEFAULT_TW_FEES;`
  - Selected account (line 231):
    `const selectedTransactionAccount = eligibleAccounts.find((a) => a.id === transactionForm.linkedAccountId) ?? null;`
  - Auto-fill effect (lines 191–204) calls `computeTradeFee({ ..., config: feeConfig })`.
  - There is a manual fee row + recompute button around lines 597–660 that also
    call `computeTradeFee` with `config: feeConfig`.
- `src/routes/settings/TradingFeesSection.tsx` — the 交易成本 settings tab. Takes
  `Pick<SettingsTabProps, "form" | "submit">` and edits `form.tradingFees`.
  Settings sections may pull live data via `useFinanceData()` — see
  `src/routes/settings/MerchantsSection.tsx:10` for the precedent.

**Conventions to match:**
- zh-TW UI. `ns-input`, `ns-eyebrow`, `muted`, `Card`, `Button` utility classes.
- The section persists via `submit({ ...form, tradingFees: next })` (line 32).
- Percentages displayed via `decimalToPct`/`pctToDecimal` helpers already in the
  section.
- Account filtering: `account.deletedAt === null && account.type === "investment"`
  (see `InvestmentsAddSheet.tsx:228-229`).

## Commands you will need

| Purpose   | Command                                        | Expected            |
|-----------|------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                             | exit 0              |
| Tests     | `npm run test`                                 | all pass            |
| One file  | `npx vitest run src/domain/tradingFees.test.ts`| pass                |
| Lint      | `npm run lint`                                 | exit 0, 0 errors    |
| Build     | `npm run build`                                | exit 0              |

## Scope

**In scope**:
- `src/domain/tradingFees.ts` — add `accountDiscounts` to config + `brokerFeeDiscount` to the calc.
- `src/domain/tradingFees.test.ts` — discount tests.
- `src/routes/InvestmentsAddSheet.tsx` — pass the selected account's discount; show breakdown caption.
- `src/routes/settings/TradingFeesSection.tsx` — per-account discount editor.

**Out of scope**:
- Any DB schema / `repositories.ts` change — discounts live in the settings blob.
- The securities-tax rates (statutory; not discountable).
- Auto-detecting stock vs ETF (the existing per-trade toggle stays).
- Non-Taiwan tickers (auto-fill is still gated on `.TW`/`.TWO`).

## Git workflow

- Branch: `git checkout -B advisor/033-per-account-broker-fee-discount main`
  (only after confirming 026 is merged — see Depends on).
- Commit per step; conventional commits.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Extend the calculator with a brokerage discount

In `src/domain/tradingFees.ts`:
1. Add to `TradingFeeConfig`:
   ```ts
   /** Per-account brokerage discount multiplier (折扣), keyed by account id.
    *  1 = no discount (full rate); 0.6 = 6 折. Absent/undefined = 1. The
    *  securities-transaction tax is statutory and is never discounted. */
   accountDiscounts?: Record<string, number>;
   ```
   Leave `DEFAULT_TW_FEES` as-is (no `accountDiscounts` key → treated as no
   discount everywhere).
2. Add an optional `brokerFeeDiscount` to `ComputeTradeFeeOpts` and apply it to
   the **brokerage only**:
   ```ts
   export interface ComputeTradeFeeOpts {
     action: "buy" | "sell";
     qty: number;
     price: number;
     instrument: "stock" | "etf";
     config: TradingFeeConfig;
     /** Brokerage discount multiplier (0 < d <= 1). Default 1 (no discount). */
     brokerFeeDiscount?: number;
   }
   ```
   In `computeTradeFee`, clamp the discount to `(0, 1]` and apply it before the
   minimum-fee floor:
   ```ts
   const discount = opts.brokerFeeDiscount == null ? 1 : Math.min(1, Math.max(0, opts.brokerFeeDiscount));
   const brokerage = Math.max(
     config.minBrokerFee,
     Math.round(consideration * config.brokerFeeRate * discount),
   );
   ```
   The sell-tax branch is unchanged (tax uses the undiscounted consideration).

   Also export a tiny helper for the call sites and the breakdown caption:
   ```ts
   /** Resolve an account's discount from config (1 when unset). */
   export function brokerFeeDiscountFor(config: TradingFeeConfig, accountId: string | null): number {
     if (!accountId) return 1;
     const d = config.accountDiscounts?.[accountId];
     return d == null ? 1 : Math.min(1, Math.max(0, d));
   }
   ```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Test the discount math

In `src/domain/tradingFees.test.ts` (match its existing `describe`/`it`), add:
- A buy where `brokerFeeDiscount: 0.6` yields `round(consideration * rate * 0.6)`
  (when above the min) — assert the exact integer.
- A discount that drives the rate-based fee below `minBrokerFee` still floors at
  `minBrokerFee`.
- A sell: tax is computed on the **undiscounted** consideration; only brokerage
  is discounted. Assert `total === discountedBrokerage + fullTax`.
- `brokerFeeDiscountFor`: returns 1 for `null`, 1 for an unset id, the clamped
  value for an out-of-range entry (e.g. `1.5 → 1`, `-0.2 → 0`).

**Verify**: `npx vitest run src/domain/tradingFees.test.ts` → all pass.

### Step 3: Apply the selected account's discount in the trade sheet

In `src/routes/InvestmentsAddSheet.tsx`:
1. Import `brokerFeeDiscountFor` from `../domain/tradingFees`.
2. In the auto-fill effect (lines ~197–203) and the manual recompute button
   (~655), pass `brokerFeeDiscount: brokerFeeDiscountFor(feeConfig, transactionForm.linkedAccountId)`
   into the `computeTradeFee({ ... })` call(s). Add `transactionForm.linkedAccountId`
   to the auto-fill effect's dependency array (so changing the account
   recomputes the suggested fee).
3. Add a breakdown caption near the fee input, shown only when
   `feeConfig.enabled && isTaiwanTicker(transactionForm.ticker)` and a buy/sell.
   Compute the parts with the same formulas (do not duplicate the rounding logic
   loosely — reuse `computeTradeFee` for the total and show the discount label):
   ```tsx
   {(() => {
     const d = brokerFeeDiscountFor(feeConfig, transactionForm.linkedAccountId);
     return d < 1 ? (
       <div className="text-xs muted mt-1">
         此帳戶券商手續費折扣 {(d * 10).toFixed(d * 10 % 1 === 0 ? 0 : 1)} 折（證交稅不打折）
       </div>
     ) : null;
   })()}
   ```
   (`d * 10` renders 0.6 → "6 折".)

**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → exit 0.

### Step 4: Per-account discount editor in the 交易成本 settings tab

In `src/routes/settings/TradingFeesSection.tsx`:
1. Pull accounts: `const { accounts } = useFinanceData();` (import from
   `../../data/hooks`), then
   `const investmentAccounts = (accounts.data ?? []).filter((a) => a.deletedAt === null && a.type === "investment");`
2. Below the rate-fields `Card`, render a second `Card` titled「各券商手續費折扣」
   listing each investment account with a 折數 input. Store the value as a
   decimal multiplier in `draft.accountDiscounts`. Suggested input: a number
   where the user types the 折數 (e.g. `6` for 6折), stored as `value/10`:
   ```tsx
   {investmentAccounts.map((a) => {
     const current = draft.accountDiscounts?.[a.id];
     return (
       <div key={a.id} className="flex items-center justify-between gap-3">
         <span className="text-sm">{a.name}</span>
         <input
           className="ns-input"
           type="number" step="0.1" min="0" max="10"
           style={{ width: 96, fontFamily: "var(--ns-font-mono)", textAlign: "right" }}
           placeholder="10"
           value={current == null ? "" : (current * 10).toString()}
           onChange={(e) => {
             const raw = e.target.value;
             const next = { ...(draft.accountDiscounts ?? {}) };
             if (raw === "") delete next[a.id];
             else next[a.id] = Math.min(1, Math.max(0, (parseFloat(raw) || 0) / 10));
             setDraft({ ...draft, accountDiscounts: next });
           }}
           onBlur={() => save(draft)}
         />
       </div>
     );
   })}
   ```
   Add a one-line hint: 「輸入折數（例：6 = 6 折；留空 = 無折扣）。僅折抵券商手續費。」
   Guard the whole card behind `investmentAccounts.length > 0` with an empty hint
   otherwise (前往「帳戶」新增券商帳戶).

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0.
- Manual (if runnable): set 6折 on a broker, then add a `.TW` buy on that broker
  → the auto-filled 手續費 is 0.6× the undiscounted value and the「6 折」caption
  shows; a sell still charges full 證交稅.

## Test plan

- `src/domain/tradingFees.test.ts`: discounted brokerage, min-fee floor under
  discount, sell tax undiscounted, `brokerFeeDiscountFor` clamping (Step 2).
- Manual UI verification (Step 3/4) for the wiring + caption.
- Verification: `npm run test` → all pass including new cases.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test` exits 0; new discount tests pass
- [ ] `grep -n "brokerFeeDiscount" src/domain/tradingFees.ts` and `src/routes/InvestmentsAddSheet.tsx` return matches
- [ ] `grep -n "accountDiscounts" src/routes/settings/TradingFeesSection.tsx` returns matches
- [ ] No `repositories.ts` / schema changes (`git status` shows only in-scope files)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `src/domain/tradingFees.ts` does not exist (plan 026 not merged) — STOP.
- `computeTradeFee`'s signature differs from the excerpt (026 changed) — re-read
  and adapt, or STOP if unrecognizable.
- The settings `submit`/`form.tradingFees` plumbing differs from the excerpt.

## Maintenance notes

- Discounts live in the `AppSettings.tradingFees.accountDiscounts` blob keyed by
  account id; deleting an account leaves a stale entry (harmless — looked up only
  for existing accounts). A future cleanup could prune entries for deleted ids.
- If a later plan adds account-drawer placement ("在帳戶那邊"), it can write the
  same `accountDiscounts[accountId]` key — keep settings as the single source of
  truth so the two entry points stay consistent.
- The securities-transaction tax is deliberately never discounted; if a reviewer
  questions a sell's total, point them at the `+ fullTax` test from Step 2.
