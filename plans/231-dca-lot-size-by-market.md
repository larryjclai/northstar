# Plan 231: DCA 定額模式股數推導 — market-aware（台股整股、美股小數股）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 3da2db35..HEAD -- src/data/repositories.ts src/domain/marketSymbols.ts src/data/repositories.recurring-investments.test.ts`
> Mismatch with the excerpts below = STOP.

## Status

- **Priority**: P3 (Option A hardening; see `docs/dca-decision.md` §3.4)
- **Effort**: S
- **Risk**: LOW-MED (changes the derived quantity/cash of posted DCA records —
  finance math, but pure + dual-harness-tested; no existing records touched)
- **Depends on**: none strictly (independent of 228/229/230 — different code
  regions; merge in any order)
- **Category**: bug / correctness (market-convention fidelity)
- **Planned at**: commit `3da2db35`, 2026-07-18

## Why this matters — the investigated market conventions (decided design)

`recurringInvestmentToDraft` derives fixedAmount-mode quantity as a raw
division — `quantity = amount / price` — regardless of market. That matches no
real broker's behavior:

- **台股**: the minimum tradeable unit is **1 share** (零股 1–999 股; there is
  NO sub-1-share fraction on TWSE). Broker 定期定額 services buy whole shares
  and allocate — the actual debit is **less than the pledged amount**
  (分配不足), i.e. quantity is **floored to an integer**; and when the pledged
  amount can't cover even 1 share at market price, **the order simply fails**
  (「扣款金額低於約定個股當日一股的市價，該次定期定額視為圈存後下單不成功」).
- **美股**: fractional shares are the norm for dollar-based DCA. Broker
  precision: Fidelity converts dollar orders to shares at **3 decimal places,
  rounded down**; E*TRADE 3 dp; Webull up to 1/100,000th. Common ground:
  **round DOWN to a small fixed decimal precision**.

Decided semantics (operator delegated to convention, 2026-07-18):

| Market | fixedAmount quantity | Can't afford the minimum | fixedShares |
|---|---|---|---|
| 台股 (`.TW`/`.TWO` or bare 4–6 digit code) | `Math.floor(amount / price)` — integer | `floor === 0` → throw zh-TW error (mirrors 券商圈存失敗) | must already be a whole number → non-integer throws |
| everything else | `amount / price` rounded **down** to **4 decimal places** | quantity `=== 0` after rounding → throw same error | any positive number, unchanged |

The posted record's cash impact is `quantity × price + fee` (existing
`createInvestmentRecord` math) — so after this plan a TW 定期定額 of NT$3,000
at price 612 posts 4 shares = NT$2,448 + fee, exactly what a real broker debit
looks like, instead of a fictitious 4.9019… fractional TW share that cannot
exist. Cost basis stops being polluted by impossible lots.

## Current state

- `src/data/repositories.ts:6479-6499` — the derivation:

  ```ts
  function recurringInvestmentToDraft(rule: RecurringInvestment): InvestmentDraft {
    const price = Math.max(0, rule.price || 0);
    const quantity = rule.mode === "fixedShares"
      ? Math.max(0, rule.quantity || 0)
      : price > 0 ? rule.amount / price : 0;
    if (!(price > 0) || !(quantity > 0)) {
      throw new Error("請先設定參考價格與金額／股數，才能記錄這期定期定額。");
    }
    return { ticker: rule.ticker, ..., price, quantity, fee: Math.max(0, rule.fee || 0), note: rule.note || "定期定額" };
  }
  ```

- `src/domain/marketSymbols.ts` — the ONLY in-repo Taiwan-ticker detection,
  currently embedded in `quoteLookupKeys` (`:13-19`):

  ```ts
  const stripped = stripTaiwanMarketSuffix(normalized);
  if (normalized === stripped && /^\d{4,6}$/.test(normalized)) return [normalized, `${normalized}.TW`, `${normalized}.TWO`];
  ```

  i.e. TW = has `.TW`/`.TWO` suffix (`stripTaiwanMarketSuffix`, `:9-11`) OR is
  a bare 4–6-digit numeric code. There is no standalone predicate and **no
  `marketSymbols.test.ts`** today.

- `src/data/repositories.ts:27-32` — the data layer already imports freely from
  `../domain/*` (types, investmentCash, portfolioMetrics, recurringDates,
  installments) — importing the new predicate follows convention.

- Tests: `src/data/repositories.recurring-investments.test.ts` (8 tests,
  `describeEachRepo` dual-harness) covers the post flow — extend it.

- Error-message convention: zh-TW strings thrown from the repo (the existing
  one above; also 「拆分至少需要 2 筆明細。」 etc.).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 761 warnings |
| One suite | `npm test -- recurring-investments` | pass |
| Tests     | `npm test`         | prior + new pass    |

## Scope

**In scope**:
- `src/domain/marketSymbols.ts` — add `isTaiwanListedTicker` predicate
- `src/domain/marketSymbols.test.ts` (create)
- `src/data/repositories.ts` — `recurringInvestmentToDraft` only
- `src/data/repositories.recurring-investments.test.ts`

**Out of scope**:
- `quoteLookupKeys`' own logic — refactor it to USE the new predicate ONLY if
  byte-identical outputs are provable by the new tests; otherwise leave it and
  let the predicate stand alone (duplicated 2-line check is acceptable).
- `RecurringInvestmentsTab.tsx` UI (rule-creation validation, hint copy) —
  posting throws the honest error; UI-side pre-validation is follow-up polish.
- Existing posted `InvestmentRecord` rows — never rewritten.
- `createInvestmentRecord` / cash-delta math — unchanged.
- Plans 228/229/230 files.

## Git workflow

- Branch: `fix/ai-dca-lot-size` off `main`. Conventional commit, e.g.
  `fix: DCA fixedAmount quantity follows market lot conventions — TW integer, US 4dp (plan 231)`.
  No push/merge.

## Steps

### Step 1: The predicate

In `src/domain/marketSymbols.ts` add (near `stripTaiwanMarketSuffix`):

```ts
/** Taiwan-listed ticker: explicit .TW/.TWO suffix, or a bare 4–6 digit code
 *  (the same heuristic quoteLookupKeys has always used). */
export function isTaiwanListedTicker(symbol: string): boolean {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) return false;
  if (normalized !== stripTaiwanMarketSuffix(normalized)) return true; // had .TW/.TWO
  return /^\d{4,6}$/.test(normalized);
}
```

Create `src/domain/marketSymbols.test.ts` (model after any small domain test,
e.g. `src/domain/todoRows.test.ts` structure): `2330` → true, `2330.TW` → true,
`00878.TW` → true, `6547.TWO` → true, `AAPL` → false, `VT` → false, `BRK.B` →
false, `""` → false. Also 2–3 characterization cases for `quoteLookupKeys`
(unchanged behavior — locks the shared heuristic).

**Verify**: `npx vitest run src/domain/marketSymbols.test.ts` → all pass.

### Step 2: Market-aware derivation

In `recurringInvestmentToDraft` (`repositories.ts:6479`), import
`isTaiwanListedTicker` and replace the quantity derivation:

```ts
const price = Math.max(0, rule.price || 0);
const taiwanListed = isTaiwanListedTicker(rule.ticker);
let quantity: number;
if (rule.mode === "fixedShares") {
  quantity = Math.max(0, rule.quantity || 0);
  if (taiwanListed && !Number.isInteger(quantity)) {
    throw new Error("台股定期定股的股數必須是整數，請先編輯規則。");
  }
} else {
  const raw = price > 0 ? rule.amount / price : 0;
  // 台股：整股向下取整（券商定期定額分配同款）；其他市場：向下取到小數 4 位
  // （美股券商 dollar-based 慣例：3–4 位、無條件捨去）。
  quantity = taiwanListed ? Math.floor(raw) : Math.floor(raw * 10_000) / 10_000;
}
if (!(price > 0) || !(quantity > 0)) {
  throw new Error(
    rule.mode === "fixedAmount" && price > 0
      ? "扣款金額不足以買進最小單位（台股 1 股），請提高金額或調整參考價格。"
      : "請先設定參考價格與金額／股數，才能記錄這期定期定額。",
  );
}
```

Notes: the amount-insufficient branch fires for BOTH markets (US: amount so
small that 4dp floors to 0 — same honest failure); the original message stays
for the price-unset/quantity-unset case. Keep every other field of the returned
draft byte-identical.

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: Dual-harness tests

Extend `repositories.recurring-investments.test.ts` (existing patterns):

1. TW fixedAmount floors: rule `2330.TW`, amount 3000, price 612 → posted
   record `quantity === 4` (not 4.901…), and the settlement cash leg reflects
   `4 × 612 + fee` (assert via the account-balance delta the file's existing
   post test asserts).
2. TW insufficient: amount 500, price 612 → post rejects with
   「扣款金額不足以買進最小單位」; NO record created, balance unchanged.
3. US fixedAmount keeps fractions at 4dp: `VOO`, amount 500, price 411.3 →
   `quantity === 1.2156` (floor of 1.21565…), not 1.21565….
4. TW fixedShares with integer quantity still posts (regression: existing
   behavior); TW fixedShares with `quantity: 0.5` rejects with 「必須是整數」.
5. Existing 8 tests pass unchanged — if any asserted a fractional TW quantity,
   STOP and report before "fixing" the assertion (it would mean the old suite
   encoded the bug; the reviewer decides the update).

**Verify**: `npm test -- recurring-investments` → all pass.

### Step 4: Gates

**Verify**: `npm run lint` → 0 errors / 761 warnings; `npm test` → all pass.

## Test plan

Steps 1 & 3 above. Reviewer feel-check (after 228 lands, dev server): post the
demo TW seed rule → the created 交易紀錄 row shows a whole-share quantity and a
cash total = shares × price + fee (compare against the rule's nominal amount —
it should be ≤ nominal, the 分配不足 gap).

## Done criteria

- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 errors / 761 warnings · `npm test` all pass
- [ ] `grep -n "isTaiwanListedTicker" src/domain/marketSymbols.ts src/data/repositories.ts` shows export + use
- [ ] New tests: ≥8 marketSymbols + ≥4 dual-harness recurring-investments cases
- [ ] `2330.TW` amount-3000/price-612 posts quantity 4; `VOO` 500/411.3 posts 1.2156
- [ ] No files outside scope modified

## STOP conditions

- Any EXISTING recurring-investments test asserts a fractional TW quantity
  (see step 3.5) — the old suite encoded the bug; report, don't silently edit.
- `recurringInvestmentToDraft` doesn't match the excerpt (drift).
- The settlement cash leg turns out NOT to be `quantity × price + fee` (i.e.
  it uses `rule.amount` directly somewhere) — that would mean the floor changes
  cash math elsewhere; report the actual flow before proceeding.

## Maintenance notes

- Plan 230's confirm dialog shows nominal per-period cash; once BOTH land, a
  small polish could show the TW-floored ACTUAL cash there (「實際約 NT$X，
  分配不足差額 NT$Y」) — deferred, note only.
- 零股 fee schedules differ from whole-lot fees at real brokers; Northstar's
  `fee` stays the rule's manual value — the per-account 手續費 autofill system
  (plan 033) deliberately does not reach the DCA post path (plan 228's
  regression test locks that).
- If a future market beyond TW needs integer lots (e.g. JP 100-share units),
  extend the predicate into a per-market lot-size map — today's two-way split
  is deliberately minimal.

## Sources (investigation, 2026-07-18)

- 台股定期定額最小單位 1 股、不足 1 股即下單失敗、券商整股分配（分配不足）:
  [Money101 定期定額攻略](https://www.money101.com.tw/blog/%E5%AE%9A%E6%9C%9F%E5%AE%9A%E9%A1%8D-%E5%AD%98%E8%82%A1-etf)、
  [市場先生 — 券商定期定額比較](https://rich01.com/dollar-cost-averaging-fee/)、
  [TWSE 定期定額投資](https://www.twse.com.tw/zh/products/system/ftfa-trading.html)
- 美股 dollar-based 小數股慣例（3dp 無條件捨去 / 3dp / 1/100,000）:
  [Fidelity Fractional Shares](https://www.fidelity.com/trading/fractional-shares)、
  [E*TRADE Fractional Shares](https://us.etrade.com/what-we-offer/investment-choices/fractional-shares)、
  [StockBrokers.com 2026 guide](https://www.stockbrokers.com/guides/fractional-shares-brokers)
