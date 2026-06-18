# Plan 026: Taiwan broker fee + securities-tax auto-calc on trade entry

> **Executor instructions**: Feature plan with Taiwan-domain specifics. Follow the
> Design decisions as settled; honor the STOP conditions where a tax-rule nuance
> would change a computed number. Auto-fill must remain **user-overridable** — never
> force a fee. Run every verification command. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4cc86eab..HEAD -- src/routes/InvestmentsAddSheet.tsx src/domain/types.ts src/routes/SettingsRoute.tsx`
> If any changed, re-confirm the "Current state" excerpts before proceeding.

## Status
- **Priority**: P2 (strongest standalone practical win for the core TW user)
- **Effort**: M
- **Risk**: MED (computes money the user records — must match TW convention & be overridable)
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `4cc86eab`, 2026-06-18

## Why this matters
The app is Taiwan-first (bundled TW broker logos, zh-TW). Every TW stock trade
carries a brokerage fee (typically **0.1425%** of consideration, often with a
broker discount, min ~NT$20) and, **on sells**, a securities transaction tax
(**0.3%** for stocks, **0.1%** for ETFs). Today the trade sheet has a single manual
`fee` field — the user computes and types it every time (`ROADMAP.md` 規劃中: 券商
設定). Auto-calculating it from a configurable rate removes that friction on every
trade. `ROADMAP.md` 執行原則 #1 (correctness/explainability) applies: the auto-filled
number must be right and overridable.

## Current state (verified at 4cc86eab)
- **Trade entry**: `src/routes/InvestmentsAddSheet.tsx` — the transaction form has a
  `fee` field (default `fee: 0`, line 87; read as `const fee = Math.max(0, transactionForm.fee || 0)`, line 291). Cost math:
  - buy: `totalValue = qty * price + fee`; new avg cost includes fee (lines ~298-300).
  - sell: `totalValue = qty * price - fee` (line ~303).
  `stockDividend`/`stockSplit`/`capitalReduction` force `fee: 0` (lines 100-105) — leave those untouched.
- **Settings model**: `src/domain/types.ts` — `interface AppSettings` (line 296) currently holds `categories`, `merchants`, `exchangeRates` (lines 298-300). No fee/broker config exists. AppSettings is persisted + synced (it's edited via `updateAppSettings`).
- **Account model**: `AccountType` includes `"investment"` (`types.ts:3-10`). Trades link to an account (`linkedAccountId`).
- **Settings UI**: `src/routes/SettingsRoute.tsx` + `src/routes/settings/*Section.tsx` (sectioned settings; e.g. `CategoriesSection`). A new "交易成本 / 券商費率" control belongs here.

## Design decisions (settled for v1)
1. **Config location: global default in `AppSettings`** (not per-account) for v1.
   Add an optional `tradingFees?: { brokerFeeRate: number; sellTaxRateStock: number; sellTaxRateEtf: number; minBrokerFee: number; enabled: boolean }` to `AppSettings`, defaulting to TW norms: `brokerFeeRate 0.001425`, `sellTaxRateStock 0.003`, `sellTaxRateEtf 0.001`, `minBrokerFee 20`, `enabled false` (opt-in). Per-account broker rates are a documented follow-on.
2. **Auto-fill, not auto-force**: when `enabled` and the user is entering a buy/sell,
   compute a suggested fee and prefill the `fee` field; the user can edit it. Show a
   tiny 「自動試算」hint. Recompute when qty/price/action change *only if the user hasn't
   manually edited the fee* (track a `feeTouched` flag).
3. **Formula**:
   - brokerage = `max(minBrokerFee, round(qty * price * brokerFeeRate))` — applied to **both** buy and sell.
   - sell tax = `round(qty * price * sellTaxRate)` — **sell only**. Rate is stock vs ETF: v1 uses `sellTaxRateStock` by default with a per-trade instrument toggle (stock/ETF) defaulting to stock; auto-detecting ETF is a follow-on. Total fee = brokerage (+ sell tax on sells).
   - Round to integer NTD (TW convention). Rounding mode: round half-up; flag if the executor finds the app uses a different money-rounding helper — reuse it if so.
4. **Scope of auto-fill**: only for TWD-priced / `.TW`/`.TWO` tickers (skip for foreign trades where the rate doesn't apply). Foreign trades keep the manual fee field.
5. **Calculation lives in a tested domain helper**, not inline in the sheet.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass incl. new tests |

## Scope
**In scope**:
- `src/domain/tradingFees.ts` (create — the fee/tax calc) + `src/domain/tradingFees.test.ts` (create)
- `src/domain/types.ts` (add the optional `tradingFees` field to `AppSettings` — additive, optional so old data loads)
- `src/routes/InvestmentsAddSheet.tsx` (prefill `fee` from the helper when enabled; `feeTouched` guard; instrument toggle for sells)
- `src/routes/settings/*` (a control to enable + edit the rates; reuse an existing Section pattern)

**Out of scope**:
- Per-account broker rates (follow-on).
- Auto-detecting ETF vs stock (follow-on; v1 uses a per-trade toggle).
- Changing the cost-basis math (lines ~298-303) — only the `fee` *value* is prefilled; how fee feeds cost is unchanged.
- Day-trading reduced-tax, futures/options — out of scope.

## Steps
1. **Domain helper**: create `tradingFees.ts`:
   ```ts
   export interface TradingFeeConfig { brokerFeeRate: number; sellTaxRateStock: number; sellTaxRateEtf: number; minBrokerFee: number; enabled: boolean; }
   export const DEFAULT_TW_FEES: TradingFeeConfig = { brokerFeeRate: 0.001425, sellTaxRateStock: 0.003, sellTaxRateEtf: 0.001, minBrokerFee: 20, enabled: false };
   export function computeTradeFee(opts: { action: "buy" | "sell"; qty: number; price: number; instrument: "stock" | "etf"; config: TradingFeeConfig }): number
   ```
   Implement the formula in Design decision #3. Unit-test (`tradingFees.test.ts`): buy fee = max(min, qty*price*rate); sell adds tax; ETF uses the ETF rate; min-fee floor applies on tiny trades; rounding to integer; `enabled:false` is irrelevant to the pure calc (caller gates). **Verify**: `npm run test -- tradingFees` pass.
2. **AppSettings field**: add optional `tradingFees?: TradingFeeConfig` to `AppSettings` in `types.ts`. Confirm load path tolerates its absence (it's optional → undefined for old data; treat undefined as `DEFAULT_TW_FEES`). **Verify**: `npx tsc --noEmit` 0.
3. **Settings control**: in a settings Section, add an "交易成本（台股）" group: an enable toggle + numeric inputs for the rates (shown as %, stored as decimals) + min fee. Persist via the existing `updateAppSettings` mutation. **Verify**: tsc 0; build 0.
4. **Trade-sheet prefill**: in `InvestmentsAddSheet.tsx`, when `config.enabled` and action is buy/sell and the ticker is TWD/`.TW(O)`, compute `computeTradeFee(...)` and prefill `fee` on qty/price/action/instrument change *unless* `feeTouched`. Add a stock/ETF toggle (sells) and a 「自動試算」hint with a way to revert to manual. Set `feeTouched=true` on manual edit. **Verify**: tsc 0; build 0.
5. Full gates + `npm run dev`: enable in settings; enter a TW buy → fee prefills (= max(20, qty*price*0.1425%)); a sell → fee = brokerage + 0.3% tax; editing fee stops auto-recompute; a foreign-ticker trade keeps the manual field.

## Test plan
- `tradingFees.test.ts` — the cases in Step 1 (correctness-critical: rates, min-fee floor, sell-tax-only, ETF rate, rounding). This is the part that must be right.
- No UI unit test required; suite stays green.

## Done criteria (ALL)
- [ ] `src/domain/tradingFees.ts` + `.test.ts` exist; tests pass; default rates = TW norms
- [ ] `AppSettings.tradingFees` optional field added; old data (undefined) loads cleanly
- [ ] Trade sheet prefills an overridable fee for TW buys/sells when enabled; `feeTouched` respected
- [ ] `npx tsc --noEmit` 0; `npm run build` 0; `npm run lint` 0 errors; `npm run test` pass
- [ ] Cost-basis math (InvestmentsAddSheet lines ~298-303) unchanged (`git diff`)
- [ ] `plans/README.md` row updated

## STOP conditions
- `AppSettings` shape or the trade-sheet `fee` handling differ from "Current state" — report.
- Implementing auto-fill would require changing how `fee` feeds cost basis — STOP (out of scope; only the prefilled value changes).
- You're unsure of a TW tax rate for an instrument class — use the documented v1 defaults (stock 0.3% / ETF 0.1% / brokerage 0.1425% / min NT$20) and note the assumption; do NOT invent day-trade/futures rules.
- The repo has a canonical money-rounding helper that disagrees with round-half-up — reuse it and note the change.

## Maintenance notes
- Follow-ons: per-account broker discount rates; auto ETF/stock detection; day-trade reduced tax; foreign-market fee schedules.
- Reviewer: confirm fees are *suggested and overridable* (never forced), the min-fee floor, and that sells (not buys) carry the tax.
- TW rule reference for reviewers: brokerage 0.1425% (pre-discount), securities tax 0.3% stocks / 0.1% ETFs, charged on sells; brokers often set a NT$20 minimum.
