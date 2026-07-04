# Plan 108: 投資輸入支援小數點後 5 位（價格/股數不再被輸入框截斷）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- src/routes/InvestmentsAddSheet.tsx src/routes/HoldingDetailRoute.tsx src/components/NumberField.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none（與 109 同檔 — 先做本計劃，109 的行號以 grep 對位）
- **Category**: bug
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

使用者 key 券商對帳單上的真實數字（例如美股 DRIP 的成交價 `524.63125`、
零股股數 `3.14159`）時，新增交易表單的價格欄只收 2 位小數、股數欄只收 4 位 —
輸入被靜默截斷，存進 ledger 的就是錯的數字，後續均價/損益全部跟著偏。
顯示層（`formatPrice`/`formatQuantity`，`src/domain/currency.ts:149-170`）本來
就支援到 6 位小數（trailing zeros 自動省略，B18 精度政策），瓶頸只在輸入端。
操作者要求：輸入至少到小數點後 5 位。

## Current state

- `src/components/NumberField.tsx` — 千分位數字輸入元件；`decimals` prop
  控制顯示與輸入的最大小數位（第 7、27、41 行）。元件本身健康，不用改。
- `src/routes/InvestmentsAddSheet.tsx` — 新增/編輯交易表單。`decimals` 全清單
  （行號 @ `479b6256`）與處置：

| 行 | 欄位 | 現值 | 處置 |
|---|---|---|---|
| 634 | 拆股比例 | 4 | **不動**（比例，非券商價） |
| 667 | 買/賣股數 | 4 | → **5** |
| 676 | DRIP 股利金額 | 2 | **不動**（金額） |
| 681 | DRIP 再投入股數 | 4 | → **5** |
| 685 | DRIP 再投入價格 | 2 | → **5** |
| 697 | 股利金額（現金股利模式，欄位名為 price） | 2 | **不動**（金額） |
| 710 | 配股/減資股數 | 4 | → **5** |
| 714 | 配股價格欄 | 2 | → **5** |
| 748 | 買/賣股數（另一分支） | 4 | → **5** |
| 752 | 買/賣價格 | 2 | → **5** |
| 768 | 手續費 | 2 | **不動**（金額） |

  判斷準則：**股數與每股價格 → 5；金額（總額、股利、費用）→ 維持 2**。
  行號僅供定位，以每行的欄位 label（摘錄自現場 `<label>` 文字）為準。

- `src/routes/HoldingDetailRoute.tsx:429` — 個股價格圖 tooltip 釘死 2 位：

```tsx
formatter={(v) => [typeof v === "number" ? v.toFixed(2) : v, "price"]}
```

  改走 `formatPrice(v)`（該檔若未 import，自 `../domain/currency` 補）。

- 其他表單查證過**不需要改**：`HoldingEditModal.tsx:292` 用原生
  `type="number"`（無截斷）；`InvestmentImportWizard` / `ManualPriceImportWizard`
  無 `decimals` prop。

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |
| Dev shell | `npm run dev`  | :5173（手動驗證）  |

## Scope

**In scope** (the only files you should modify):
- `src/routes/InvestmentsAddSheet.tsx`（僅上表標「→ 5」的 `decimals` prop）
- `src/routes/HoldingDetailRoute.tsx`（僅 429 行 tooltip formatter）

**Out of scope** (do NOT touch, even though they look related):
- `src/components/NumberField.tsx` — 元件行為正確。
- `src/domain/currency.ts` — 顯示精度政策（B18）已定，最大 6 位，不動。
- 金額類欄位（634/676/697/768）— 見上表。
- 資料庫 schema / 儲存精度 — number 直存，無截斷問題。

## Git workflow

- Branch: `fix/ai-investment-input-precision`
- Commit style: `fix(investments): accept 5 decimal places for price/quantity input`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: 改 7 處 `decimals`

按上表把 667、681、685、710、714、748、752 的 `decimals={4}`/`decimals={2}`
改為 `decimals={5}`。改之前逐行核對欄位 label 是否與表格一致。

**Verify**: `grep -c "decimals={5}" src/routes/InvestmentsAddSheet.tsx` → `7`；
`grep -n "decimals={" src/routes/InvestmentsAddSheet.tsx` → 634 仍為 4、
676/697/768 仍為 2。

### Step 2: tooltip 改走 formatPrice

`HoldingDetailRoute.tsx:429` 的 `v.toFixed(2)` → `formatPrice(v)`（保持
formatter 的 tuple 形狀不變）。

**Verify**: `grep -n "toFixed(2)" src/routes/HoldingDetailRoute.tsx` → 無輸出；
`npx tsc` → exit 0。

### Step 3: 全量 + 手動驗證

`npm run dev` → 投資 → 新增交易：價格欄輸入 `524.63125` → 顯示完整 5 位不被
截斷；存檔後持倉表均價、交易紀錄的價格顯示完整（顯示層 `formatPrice` 支援
到 6 位，應直接正確）。

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。

## Test plan

- `NumberField` 已有測試（`src/components/NumberField.test.tsx`）；在其中補
  一個 case：`decimals={5}` 時輸入 `1.23456` 顯示/回傳不截斷（模仿檔內既有
  it 的寫法）。
- 回歸：`npm test` 全綠。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `grep -c "decimals={5}" src/routes/InvestmentsAddSheet.tsx` → 7
- [ ] `grep -n "toFixed(2)" src/routes/HoldingDetailRoute.tsx` → 無輸出
- [ ] NumberField 新增 decimals=5 測試存在且通過
- [ ] `git status` 只含 in-scope 檔案（+ NumberField.test.tsx）
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 任一行的欄位 label 與上表不符（drift 或我誤判欄位語意）。
- `NumberField` 在 `decimals={5}` 下有捨入 bug（測試寫不綠）— 回報，
  不要在 AddSheet 裡繞。
- 你發現儲存路徑（`normalizeTransactionDraft` 等）另有捨入 — 回報位置，
  那是本計劃沒掃到的第二個截斷點，需要加開計劃。

## Maintenance notes

- 精度政策現況：輸入 5 位、顯示最多 6 位（B18）。若未來要支援加密貨幣
  （8 位），輸入與顯示要一起調，並重新審 `tabular-nums` 對齊。
- Plan 109（DRIP）會動同檔的 676 附近 — 先做本計劃可少一次 drift。
- Reviewer 檢查重點：只有「股數/每股價」升到 5 位，金額欄沒被誤改。
