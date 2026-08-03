# Plan 296: 持倉明細頁手機版 — 表格改局部橫捲、今日三格收合、gutter 接契約

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/routes/HoldingDetailRoute.tsx src/styles/globals.css`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

持倉明細頁在手機上有三張固定欄位表格（稅務批次 FIFO、交易紀錄、手動價格紀錄），
每格都是不可斷行的 mono 數字（日期、價格、損益）。grid `fr` 軌道的自動最小值是
min-content，三張表的最小寬度（~340–455px）都超過 390px 手機的內容寬（~282px）。
因為頁根是 `h-full overflow-auto`，結果是**整頁**（含麵包屑、hero 卡）跟著橫向捲動
——比單表捲動更糟的閱讀體驗。另外「今日／現價／昨收」三格 strip 每格只剩 ~69px 內容
寬，22px 的百分比數字會撞到分隔線；頁根硬編碼 32px gutter 又比契約多燒 16px/側。

## Current state

- `src/routes/HoldingDetailRoute.tsx`：
  - 頁根（line 391）：

```tsx
    <div className="h-full overflow-auto" style={{ padding: "24px 32px 100px" }}>
```

  - 今日三格（line 625–657）：`<div className="grid grid-cols-3">`，每格
    `padding: "16px 20px"` + `borderRight`，第一格 22px 百分比 + 副行，二三格現價/昨收。
  - 稅務批次表（header line 911–915、rows line 932–936）：
    `gridTemplateColumns: "1fr 0.7fr 0.9fr 0.9fr 1.1fr 1fr"`、`padding: "14px 22px"`。
  - 交易紀錄 rows（line 995–999）：`"100px 80px 0.7fr 0.9fr 0.9fr 1fr 1fr"`（同構的
    header 在附近，一併處理——先向上找同 template 的 header div）。
  - 手動價格紀錄 rows（line 559–563）：`"110px 1fr 1.2fr auto"`。
- 既有工具：`.ns-hscroll`（globals.css:2107–2119，overflow-x auto + 隱藏卷軸 + 右緣
  淡出）；`--ns-page-gutter`（`.ns-page` 契約，手機 16px）。
- 樣式優先序：靜態樣式抽 `ns-*` class；手機判斷 `max-width: 1023px`。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/routes/HoldingDetailRoute.tsx`
- `src/styles/globals.css`（如需新 class）

**Out of scope**:
- 任何損益/FIFO 計算。
- `HoldingDetailRoute.test.ts`（若斷言不涉版面則不動；涉及則同步更新並在 PR 說明）。
- 手動價格快照的 DatePicker（plan 294）。

## Git workflow

- Branch: `fix/ai-holding-detail-mobile`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 頁根 gutter 接契約

line 391 改為使用 gutter 變數（動態值不涉及，直接换 class 或 inline var）：

```tsx
    <div className="h-full overflow-auto" style={{ padding: "24px var(--ns-page-gutter, 32px) 100px" }}>
```

先確認 `--ns-page-gutter` 在非 `.ns-page` 節點也解析（它定義在哪個選擇器上——
`grep -n "ns-page-gutter" src/styles/globals.css`；若只定義於 `.ns-page`，把頁根改掛
`.ns-page` class 並保留自身縱向 padding，比照 CashFlowRoute:1950 的用法）。

**Verify**: 1280px 視覺不變（桌機 gutter 值相同）；390px 兩側留白變 16px。

### Step 2: 三張表包 `.ns-hscroll`

對每張表（FIFO header+rows、交易紀錄 header+rows、價格紀錄 rows 容器）：

1. 把「header + 所有 rows」包進共同的 `<div className="ns-hscroll">`（表格整組同捲，
   header 與 rows 不可分開捲）。
2. 內層加 `style={{ minWidth: 480 }}`（FIFO/交易紀錄）或 `minWidth: 360`（價格紀錄）
   ——給 grid 一個明確的最小排版寬，超出容器時由 wrapper 捲動。
3. 確認包裹後桌機（容器 > minWidth）無捲動、逐像素等價。

**Verify**: 390px：三張表各自可橫捲、**頁面本身**不橫捲
（`document.documentElement.scrollWidth <= window.innerWidth`，且頁根
`scrollLeft` 恆 0）；1280px：無變化。

### Step 3: 今日三格收合

line 625 改 `className="grid grid-cols-1 sm:grid-cols-3"`；堆疊時分隔線方向要換：
兩個 `borderRight: "1px solid var(--ns-border)"`（line 629、647）改為由 class 控制
（新 `ns-holding-daychange-cell`：桌機 border-right、`max-width: 639px` 時
border-bottom）。第一格的背景色 tint 保留。

**Verify**: 390px：三格上下堆疊、數字完整、分隔線水平；≥640px：三格橫排、與改前一致。

## Test plan

- e2e：390×844 開任一持倉明細（示範模式資料即可），斷言
  `document.documentElement.scrollWidth <= window.innerWidth`、三個 `.ns-hscroll`
  wrapper 存在且首個 `scrollWidth > clientWidth`（表格確實在內部捲）。
- 若 `HoldingDetailRoute.test.ts` 是純邏輯測試（vitest node），不受影響——先跑確認。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -c "ns-hscroll" src/routes/HoldingDetailRoute.tsx` → ≥3
- [ ] `grep -n 'padding: "24px 32px 100px"' src/routes/HoldingDetailRoute.tsx` → 無結果
- [ ] 390px：頁面不橫捲、表格內部橫捲、今日三格堆疊
- [ ] 1280px：逐像素等價（截圖比對）
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 摘錄與 live code 不符（行號 ±30 內先重新定位；同構 template 找不到唯一對應就 STOP）。
- `.ns-hscroll` 的右緣淡出 mask 與表格 sticky 元素（若有）互相干擾。
- 交易紀錄表的 header 與 rows 不在同一個可包裹的父節點下（結構需要重排超過包一層 div
  的程度）——回報結構，不要重寫整段。

## Maintenance notes

- 未來新增欄位時把 minWidth 同步調大即可；不要回到「整頁橫捲」。
- Reviewer 盯：`.ns-hscroll` 的 mask 在表格右緣的觀感；`grid-cols-1` 堆疊後今日格的
  tint 背景是否仍只在第一格。
