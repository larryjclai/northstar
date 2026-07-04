# Plan 101: Route all money displays in Goals/FIRE/Settings through currency helpers (fix privacy-mask bypass)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- src/routes/GoalsRoute.tsx src/routes/FIRECalculatorRoute.tsx src/routes/settings/CategoriesSection.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (privacy)
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

Northstar 的「隱藏金額」（privacy mask）是核心隱私功能：開啟後所有經過
`src/domain/currency.ts` helpers 的金額都輸出 `＊＊＊＊＊＊`。但目標頁與 FIRE
計算機用手刻的 `NT$${(v / 1_000_000).toFixed(2)}M` 直接渲染金額，設定頁分類表用
`'NT$'+c.budget.toLocaleString()` 渲染預算 — 三處都**繞過遮罩**。實測（2026-07-02，
demo 模式）：開啟隱藏金額後，目標頁 hero 仍明文顯示 `NT$0.87M / NT$21M`。
同一修復也順帶解決數字語言不一致：全 app 慣例是中文「萬」壓縮
（`formatCompactNumber` → `1,305萬`），只有這幾處用英文 M 進位。

## Current state

- `src/routes/GoalsRoute.tsx` — 目標頁；hero 金額手刻 M 進位（198–199 行）：

```tsx
// GoalsRoute.tsx:196-206
{isFire ? (
  <>
    <span className="text-[40px]" style={{ fontWeight: 600, letterSpacing: -1 }}>NT${(currentValue / 1_000_000).toFixed(2)}M</span>
    <span className="text-sm" style={{ color: "var(--ns-fg-muted)" }}>/ NT${(stats.target / 1_000_000).toFixed(stats.target >= 10_000_000 ? 0 : 2)}M</span>
  </>
) : (
  <>
    <span className="text-[40px]" style={{ fontWeight: 600, letterSpacing: -1 }}>{selectedGoal.currency} {formatNumber(currentValue)}</span>
    <span className="text-sm" style={{ color: "var(--ns-fg-muted)" }}>/ {formatNumber(stats.target)}</span>
  </>
)}
```

- `src/routes/FIRECalculatorRoute.tsx` — FIRE 計算機；三種 FIRE 型態金額手刻（297、308、319 行）：

```tsx
// FIRECalculatorRoute.tsx:297
<div className="text-[15px]" style={{ fontWeight: 500 }}>NT${(fireTarget * 0.7 / 1000000).toFixed(2)}M</div>
// FIRECalculatorRoute.tsx:308
<div className="text-[15px]" style={{ fontWeight: 500 }}>NT${(fireTarget / 1000000).toFixed(2)}M</div>
// FIRECalculatorRoute.tsx:319
<div className="text-[15px]" style={{ fontWeight: 500 }}>NT${(fireTarget * 1.5 / 1000000).toFixed(2)}M</div>
```

- `src/routes/settings/CategoriesSection.tsx` — 設定→分類；預算欄手刻（229 行）：

```tsx
// CategoriesSection.tsx:229 (approximate column, inside the category row)
{c.budget?'NT$'+c.budget.toLocaleString():'—'}
```

- `src/domain/currency.ts` — 正準 helpers。相關 API（皆已內建遮罩，67–115 行）：
  - `formatCompactNumber(amount)` → `"1,305萬"`；遮罩時 `"＊＊＊＊＊＊"`
  - `formatCompactMoney(amount, currency)` → `"TWD 1,305萬"`；遮罩時 `"TWD ＊＊＊＊＊＊"`
  - `formatMoney(amount, currency)` → `"TWD 47,430"`（千分位全位數）

- 慣例（DESIGN.md §9）：「所有金額顯示必須走這些 helper（內建隱私遮罩支援）…
  自行手刻 toLocaleString 會漏掉遮罩，禁止繞過」。GoalsRoute 非-FIRE 分支
  （上方摘錄 else 側）就是正確寫法的同檔案範例。

## Commands you will need

| Purpose   | Command           | Expected on success |
|-----------|-------------------|---------------------|
| Typecheck | `npx tsc`         | exit 0, no output   |
| Tests     | `npm test`        | all pass            |
| Lint      | `npm run lint`    | exit 0              |
| Dev shell | `npm run dev`     | Vite on :5173（手動驗證用） |

## Scope

**In scope** (the only files you should modify):
- `src/routes/GoalsRoute.tsx`
- `src/routes/FIRECalculatorRoute.tsx`
- `src/routes/settings/CategoriesSection.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/domain/currency.ts` — helpers 已正確，不需改。
- `src/components/NumberField.tsx`、`src/hooks/useNumericField.ts`、
  `src/components/QuickAdd.tsx`、`src/routes/CashFlowRoute.tsx` 的
  `fmtAmountDisplay`（2703 行）— 這些 `toLocaleString` 是**輸入框編輯狀態**的
  格式化，不是金額展示，不受遮罩約束，勿改。
- `src/routes/FIRECalculatorRoute.tsx:421` 的 `toLocaleString` — 同上，輸入框編輯狀態。
- 任何財務計算邏輯（fireTarget、stats 的算法）。

## Git workflow

- Branch: `fix/ai-money-display-mask-bypass`（遵循 `.agentrules`：AI 工作一律開分支）
- Commit style: conventional commits，例：`fix(goals): route hero amounts through currency helpers`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: GoalsRoute hero 金額改走 helpers

在 `src/routes/GoalsRoute.tsx` 檔頭確認已 import（該檔已用 `formatNumber`，從
`../domain/currency` 補 `formatCompactMoney` 即可）。把 198–199 行改為：

```tsx
<span className="text-[40px]" style={{ fontWeight: 600, letterSpacing: -1 }}>{formatCompactMoney(currentValue, selectedGoal.currency)}</span>
<span className="text-sm" style={{ color: "var(--ns-fg-muted)" }}>/ {formatCompactNumber(stats.target)}</span>
```

（分母不重複幣別，保持「TWD 86.5萬 / 2,100萬」的閱讀節奏。）

**Verify**: `npx tsc` → exit 0；`grep -n "1_000_000" src/routes/GoalsRoute.tsx` → 無輸出。

### Step 2: FIRECalculatorRoute 三種 FIRE 型態金額改走 helpers

把 297、308、319 行的 `NT$${(…/1000000).toFixed(2)}M` 分別改為：

```tsx
{formatCompactMoney(fireTarget * 0.7, "TWD")}
{formatCompactMoney(fireTarget, "TWD")}
{formatCompactMoney(fireTarget * 1.5, "TWD")}
```

補 import。此檔其他 `NT$` 明文若同屬**展示**用途且手刻，一併走 helper；
**輸入框**（421 行）不動。

**Verify**: `npx tsc` → exit 0；`grep -n "1000000" src/routes/FIRECalculatorRoute.tsx` → 只剩非顯示用途（預期無輸出）。

### Step 3: CategoriesSection 預算欄改走 helper

229 行 `{c.budget?'NT$'+c.budget.toLocaleString():'—'}` 改為：

```tsx
{c.budget ? formatMoney(c.budget, "TWD") : '—'}
```

補 import `formatMoney`（from `../../domain/currency`）。

**Verify**: `npx tsc` → exit 0。

### Step 4: 全量驗證 + 手動遮罩檢查

`npm test`、`npm run lint` 全綠。然後 `npm run dev`，進 demo 模式
（設定 → 一般與備份 → 示範模式，或首頁引導），開啟側欄「隱藏金額」，確認：
目標頁 hero、FIRE 計算機三型態、設定→分類預算欄全部顯示 `＊＊＊＊＊＊`。

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。

## Test plan

- 顯示層 JSX 無現成元件測試基建，不新增元件測試；回歸防護由 Plan 102 的
  lint 規則承擔（本計劃是它的前置）。
- 確認 `src/domain/currency` 既有測試通過（`npm test`）。
- 手動驗證（Step 4）是本計劃的行為驗收。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -rn "1_000_000\|/ 1000000" src/routes/GoalsRoute.tsx src/routes/FIRECalculatorRoute.tsx` → 無輸出
- [ ] `grep -n "toLocaleString" src/routes/settings/CategoriesSection.tsx` → 無輸出
- [ ] `git status` 顯示僅 in-scope 檔案被修改
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 上述任一摘錄與現場程式碼不符（codebase 已漂移）。
- `formatCompactMoney` / `formatCompactNumber` 的輸出格式與計劃描述不符
  （例如沒有「萬」壓縮）— 表示 helper 語意變了，先回報。
- 修改後有測試失敗且與本次改動相關、兩次修復嘗試無效。
- 發現還有其他繞過遮罩的**金額展示**點 — 修完 in-scope 後回報清單，不要擴scope。

## Maintenance notes

- Plan 102 會加 eslint 規則禁止 `src/routes/**` 內的 `toLocaleString`，
  本計劃必須先landing，否則 lint 會在這三處爆。
- Reviewer 檢查重點：hero 視覺（40px 字級下 `TWD 86.5萬` 的排版是否協調）、
  遮罩開啟時三處全部變星號。
- 後續若有新頁面顯示金額，一律走 `domain/currency` helpers — 這是 DESIGN.md §9
  的既有規範。
