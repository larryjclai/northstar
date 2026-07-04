# Plan 104: Settings 分類表的「已消費」接上真實資料（目前寫死 0）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- src/routes/settings/CategoriesSection.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

設定 → 分類的表格有「已消費 / 預算 / 使用量」三欄，但已消費被寫死為 0
（含一行自首的註解），於是每個分類永遠顯示 NT$0、預算進度條永遠空。
同一時間記帳頁對同月份顯示餐飲 NT$316、居住 NT$18,500 — 兩頁互相矛盾，
使用者會懷疑其中一邊的資料壞了。正準的分類消費聚合函式已存在
（`categoryPeriodSpend`），接上即可。

## Current state

- `src/routes/settings/CategoriesSection.tsx` — 設定分頁的分類管理；mock 在
  204 行附近：

```tsx
// CategoriesSection.tsx:204-206
const spent = 0; // Mock spent for now, usually computed from ledger
const over = c.budget && spent > c.budget;
const pct  = c.budget ? Math.min(spent / c.budget, 1) : 0;
```

  該檔已 import `useFinanceData`（第 10 行，`from "../../data/hooks"`），
  但 `SettingsCategories` 元件內尚未呼叫。元件簽名：

```tsx
// CategoriesSection.tsx:53
export function SettingsCategories({ form, setForm, submit, t, renameCategory }: SettingsTabProps & { … }) {
```

- 正準聚合：`src/domain/categorySpend.ts:32`

```ts
export function categoryPeriodSpend(
  rows: LedgerTransaction[],
  dateRange: ResolvedDateScope,
  primaryCurrency: string,
  toPrimary: (row: LedgerTransaction) => number | null,
): CategoryPeriodSpend
// 回傳 .categories: Array<{ name, amount, count }>（降冪）、.total、.missingFxPairs
```

- **照抄這個呼叫端範本**（`src/routes/CategoriesRoute.tsx:19-54`）：

```tsx
const { ledger, settings, dailyFxRates, … } = useFinanceData();
const ledgerRows = ledger.data ?? [];
const fxHistory = dailyFxRates.data ?? [];
const dateRange = useMemo(() => resolveDateScope(dateScope, timezone), [dateScope, timezone]);
// toPrimary: pass row.amount (positive for refunds, negative for expenses).
const toPrimaryFn = useMemo(
  () => (row: (typeof ledgerRows)[number]) =>
    convertCurrency(row.amount, row.currency, primaryCurrency, appSettings, { dailyRates: fxHistory, asOfDate: row.date }),
  [primaryCurrency, appSettings, fxHistory],
);
const periodSpend = useMemo(
  () => categoryPeriodSpend(ledgerRows, dateRange, primaryCurrency, toPrimaryFn),
  [ledgerRows, dateRange, primaryCurrency, toPrimaryFn],
);
```

  `resolveDateScope`、`convertCurrency`、timezone 的來源也照 CategoriesRoute
  檔頭的 import 與取值方式。日期範圍固定用**本月**（CategoriesRoute 的
  dateScope 預設即本月 — 沿用其建構方式，如
  `resolveDateScope({ preset: "month", … })`；以 CategoriesRoute 實際寫法為準）。

- 顯示慣例：金額走 `formatMoney(v, "TWD")`（`src/domain/currency.ts`）。
  若 Plan 101 已 landing，229 行的預算欄已是 `formatMoney` — 已消費欄照同款。

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |
| Dev shell | `npm run dev`  | :5173（手動驗證）  |

## Scope

**In scope** (the only files you should modify):
- `src/routes/settings/CategoriesSection.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/domain/categorySpend.ts` — 聚合語意鎖定，不改。
- `src/routes/CategoriesRoute.tsx`、`src/routes/CategoriesTab.tsx` — 只是範本。
- 「使用量」欄與子分類展開邏輯。

## Git workflow

- Branch: `fix/ai-settings-category-spent`
- Commit style: `fix(settings): compute real category spend in categories table`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: 在 SettingsCategories 內建立本月 periodSpend

照「Current state」的範本，在元件頂部（既有 useState 之後）呼叫
`useFinanceData()` 並建立 `toPrimaryFn` + 本月 `periodSpend`，再做一個查表 Map：

```tsx
const spentByCategory = useMemo(
  () => new Map(periodSpend.categories.map((c) => [c.name, c.amount])),
  [periodSpend],
);
```

**Verify**: `npx tsc` → exit 0。

### Step 2: 替換 mock

204 行改為：

```tsx
const spent = spentByCategory.get(c.name) ?? 0;
```

刪掉 `// Mock spent for now` 註解。`over`/`pct` 保持原樣（它們已依 spent 計算）。
已消費欄若目前是手排字串，改走 `formatMoney(spent, "TWD")`。

**Verify**: `npx tsc` → exit 0；`grep -n "Mock spent" src/routes/settings/CategoriesSection.tsx` → 無輸出。

### Step 3: 全量驗證 + 對帳

`npm test`、`npm run lint`。然後 `npm run dev` → demo 模式：設定 → 分類的
「已消費」需與記帳頁同月「分類支出」一致（demo 資料：餐飲 NT$316、居住 NT$18,500；
若 demo 資料已改版，兩頁**彼此一致**即為通過）。

**Verify**: `npm test` → all pass；兩頁數字一致。

## Test plan

- `categoryPeriodSpend` 已有完整測試（`src/domain/categorySpend.test.ts`），
  本計劃只是接線，不新增 domain 測試。
- 手動對帳（Step 3）是行為驗收：同月、同分類、兩頁同值。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "const spent = 0" src/routes/settings/CategoriesSection.tsx` → 無輸出
- [ ] `git status` 只含 `src/routes/settings/CategoriesSection.tsx`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `SettingsCategories` 拿不到 `useFinanceData` 所需的 Provider（渲染時 hook 報錯）
  — 代表設定頁資料流跟 CategoriesRoute 不同，回報實際錯誤。
- 兩頁數字對不上且差異不是 FX/四捨五入級別 — 別硬調，回報差異樣本。
- 你想順手改「使用量」欄或子分類邏輯 — 越界，收手。

## Maintenance notes

- 這裡的「已消費」是**本月、cash-basis、settled-only、不含轉帳**（繼承
  `categoryPeriodSpend` 語意）— 若之後設定頁想顯示其他期間，改 dateScope
  的建構即可，別另起爐灶。
- Reviewer 檢查重點：Map 查表 key 是分類名（`c.name`）— 若分類支援改名，
  改名後當月數字歸屬正確與否取決於 ledger rows 的 category 欄位是否同步改名
  （`renameCategory` prop 已存在，通常會）。
