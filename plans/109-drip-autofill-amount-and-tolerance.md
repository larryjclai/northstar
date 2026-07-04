# Plan 109: 股息再投入（DRIP）— 金額自動帶入 + 驗證容差放寬到券商捨入等級

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- src/routes/InvestmentsAddSheet.tsx src/data/repositories.ts src/data/repositories.investments.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition。（Plan 108 會先動 AddSheet 的
> decimals props — 該 diff 屬預期，不算 drift。）

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED（動到 DRIP 驗證語意 — 財務入帳的守門檢查）
- **Depends on**: plans/108-investment-input-decimal-precision.md（同檔；
  且輸入截斷本身就是本 bug 的放大器 — 108 先修）
- **Category**: bug
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

使用者 key 券商真實的 DRIP 數字（股數、價格都照對帳單）卻被
「股利金額不足以買進該股數」擋下 — 因為驗證用 `1e-6` 的 epsilon 要求
`股利金額 A ≥ 股數 Q × 價格 P`，而券商把零股股數四捨五入到 4–6 位後，
`Q × P` 常常比 A 多出零點幾元。差 0.0001 也不給記。
兩個修法並行：(1) DRIP 模式下金額**自動帶入 Q × P**（使用者本來就多半想記
「全額再投入」）；(2) 驗證容差從 1e-6 放寬到券商捨入等級，超出容差才擋。

## Current state

### 驗證有兩份（同一條規則、同一個 epsilon）

UI 預檢（`src/routes/InvestmentsAddSheet.tsx:320-326`）：

```tsx
// 股息再投入 (DRIP): record a linked cashDividend + reinvestment buy at once.
if (side === "dividend" && dividendMode === "drip") {
  if (transactionForm.quantity <= 0) throw new Error("請輸入再投入股數。");
  if (transactionForm.price <= 0) throw new Error("請輸入再投入價格。");
  if (dripDividendAmount + 0.000001 < transactionForm.quantity * transactionForm.price) {
    throw new Error("股利金額不足以買進該股數（請確認金額 ≥ 股數 × 價格）。");
  }
```

Repository 共用驗證（`src/data/repositories.ts:5190-5197`，記憶體 repo
`createDividendReinvestment` @1035 與 SQLite override @2497 都走它）：

```ts
/** Shared DRIP-draft validation (Q > 0, P > 0, A ≥ Q × P). */
function validateDividendReinvestment(input: DividendReinvestmentDraft) {
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const price = Math.max(0, Number(input.price) || 0);
  const dividendAmount = Math.max(0, Number(input.dividendAmount) || 0);
  if (!(quantity > 0)) throw new Error("請輸入再投入股數。");
  if (!(price > 0)) throw new Error("請輸入再投入價格。");
  if (dividendAmount + 0.000001 < quantity * price) throw new Error("股利金額不足以買進該股數（請確認金額 ≥ 股數 × 價格）。");
}
```

### 入帳方式（`src/data/repositories.ts:5159-5187`，理解用，不改）

`dividendReinvestmentLegs` 拆兩腿：`cashDividend`（price = A）+ `buy`
（price = P, quantity = Q）。A 與 Q×P 的差額反映在現金 — 容差因此必須有界，
不能無上限放寬。

### UI 的 auto-fill 範式（同檔可抄）

`InvestmentsAddSheet.tsx:762-768` 的手續費欄用 `feeTouchedRef` 追蹤
「使用者是否手動改過」，未碰過就自動帶入試算值：

```tsx
onChange={(fee) => {
  feeTouchedRef.current = true;
  setTransactionForm({ ...transactionForm, fee });
}}
```

DRIP 金額欄（676 行）：`<NumberField … value={dripDividendAmount}
onChange={setDripDividendAmount} decimals={2} …/>`，股數/價格欄在 681/685 行。

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `npx tsc`                                            | exit 0              |
| 相關測試  | `npx vitest run src/data/repositories.investments.test.ts` | all pass      |
| 全部測試  | `npm test`                                           | all pass            |
| Lint      | `npm run lint`                                       | exit 0              |
| Dev shell | `npm run dev`                                        | :5173（手動驗證）  |

## Scope

**In scope** (the only files you should modify):
- `src/data/repositories.ts`（僅 `validateDividendReinvestment` 一個函式）
- `src/routes/InvestmentsAddSheet.tsx`（僅 DRIP 分支：預檢 + auto-fill）
- `src/data/repositories.investments.test.ts`（加測試）

**Out of scope** (do NOT touch, even though they look related):
- `dividendReinvestmentLegs` — 入帳拆腿邏輯是鎖定的財務語意，**絕對不改**。
- 移動平均成本、股利統計等任何下游計算。
- 現金股利/配股（非 DRIP）分支。

## Git workflow

- Branch: `fix/ai-drip-autofill-tolerance`
- Commit style: `fix(investments): auto-fill DRIP amount; relax match tolerance`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: repository 容差

`validateDividendReinvestment` 的最後一個 if 改為：

```ts
  // 容差：券商把零股股數捨入到 4–6 位後，Q×P 可能比實際股利多出幾毫到幾元。
  // 允許 Q×P 超出 A 至多 max(1 元, A 的 0.1%)；差額仍會如實入帳（cash 差額有界）。
  const tolerance = Math.max(1, dividendAmount * 0.001);
  if (dividendAmount + tolerance < quantity * price) {
    throw new Error("股利金額與股數 × 價格差距過大（請確認三個數字，或留空金額讓系統自動帶入）。");
  }
```

JSDoc 的 `A ≥ Q × P` 同步改為 `A ≥ Q × P − tolerance`。

**Verify**: `npx tsc` → exit 0。

### Step 2: repository 測試

在 `src/data/repositories.investments.test.ts` 找到既有 DRIP 測試
（`grep -n "einvest" src/data/repositories.investments.test.ts` 定位），照其
結構加三個 case：

- **容差內通過**：A=3500、Q=3.3558、P=1043（Q×P=3500.0994，超出 0.0994 < 4.5）
  → 建立成功，兩腿都在。
- **容差邊界拒絕**：A=3500、Q=4、P=1000（Q×P=4000，超出 500 > 4.5）→ throw，
  訊息含「差距過大」。
- **小額幣別**：A=35、Q=1.4287、P=24.5（Q×P=35.00315，超出 0.00315 < 1）→ 成功。

**Verify**: `npx vitest run src/data/repositories.investments.test.ts` → 全 pass。

### Step 3: UI 預檢對齊 + auto-fill

`InvestmentsAddSheet.tsx`：

1. **刪掉** 324–326 行的金額預檢 if（qty/price > 0 的兩行預檢保留 — 訊息更早
   更準）。金額檢查交給 repository 驗證；mutation 失敗時 catch 已用
   `setMessage(errorMessage(…))` 顯示 repo 的錯誤訊息（313–310 行模式），行為
   不變但單一事實來源。
2. **auto-fill**：仿 `feeTouchedRef` 模式加 `dripAmountTouchedRef`。
   金額欄（676）onChange 時標記 touched；股數（681）/價格（685）onChange 時，
   若 `!dripAmountTouchedRef.current`，把 `dripDividendAmount` 設為
   `Math.round(quantity * price * 100) / 100`。切出 DRIP 模式或關閉 sheet 時
   重置 touched flag（跟 feeTouchedRef 的重置點一致，grep `feeTouchedRef.current = false`）。
3. 金額欄 label 下加一行 caption（既有 caption 樣式照 689 行那條）：
   `未修改時自動帶入 股數 × 價格。`

**Verify**: `npx tsc` → exit 0；`npm run dev` → 投資 → 新增交易 → 股利 →
股息再投入：輸入股數 3.3558、價格 1043 → 金額自動變 3500.10；手動改金額後
再改股數 → 金額不再被覆寫；金額 3500 + 上述股價數字 → 可送出成功。

### Step 4: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。

## Test plan

- Step 2 的三個 repository case（容差內 / 邊界外 / 小額幣別）。
- 既有 DRIP 測試必須全數保持綠燈 — 若有測試斷言舊錯誤訊息
  「股利金額不足以買進該股數」，更新為新訊息。
- 手動：Step 3 的 auto-fill 三段流程。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `grep -n "0.000001" src/data/repositories.ts src/routes/InvestmentsAddSheet.tsx` → 無輸出
- [ ] `grep -c "dripAmountTouchedRef" src/routes/InvestmentsAddSheet.tsx` ≥ 3（宣告 + set + 判斷）
- [ ] 新增 3 個 DRIP 容差測試存在且通過
- [ ] `git status` 只含 in-scope 檔案
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 記憶體 repo（repositories.ts:1035）與 SQLite override（:2497）有**任一個
  沒有**呼叫共用的 `validateDividendReinvestment`（先
  `grep -n "validateDividendReinvestment" src/data/repositories.ts` 確認兩個
  呼叫點）— 有第二份驗證邏輯的話回報，不要改兩份。
- 你發現自己想動 `dividendReinvestmentLegs` 或成本計算 — 越界，收手。
- 既有測試斷言 A 與 Q×P 的**相等性**（不只訊息）且改容差後大面積翻紅 —
  代表容差與某個下游不變量衝突，回報清單。

## Maintenance notes

- 容差 `max(1, 0.1%·A)` 是產品判斷：擋 typo、放過券商捨入。若使用者反映
  仍被擋（外幣高價股 + 極小股利），調這一處即可 — UI 已無第二份檢查。
- 差額如實入帳（cash 會差 ≤ tolerance）— 對帳頁若日後做「零頭沖銷」功能，
  這裡是零頭的來源之一。
- Reviewer 檢查重點：UI 預檢刪除後，repo 錯誤訊息確實浮到表單的 message 區
  （不是無聲失敗）；auto-fill 不會在「編輯既有交易」時覆寫已存值
  （DRIP 編輯模式在 662 行被 `!isEditingTransaction` 排除 — 確認仍然如此）。
