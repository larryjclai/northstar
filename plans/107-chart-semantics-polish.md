# Plan 107: 圖表語意收尾 — 悲觀情境不用紅色、FIRE 耗盡標註、scrim token、產業濾器去雜訊

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- src/components/NetWorthProjectionCard.tsx src/routes/GoalsRoute.tsx src/components/ui/dialog.tsx src/features/goals/GoalEditorSheet.tsx src/routes/HoldingEditModal.tsx src/routes/InvestmentsRoute.tsx src/styles/globals.css DESIGN.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW–MED（四個獨立小項，彼此無依賴；任何一項卡住可單獨跳過並回報）
- **Depends on**: none
- **Category**: tech-debt (visual semantics)
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

2026-07-02 全專案設計檢視的收尾批次，四個互不相依的小項，共同點是
「視覺語意誤導」：(A) 30 年淨值預測的「悲觀」情境用紅色 — 紅色在本 app 的
語意是虧損/錯誤，保守假設不是虧損；(B) 目標頁 FIRE 曲線衝高後跌到 0
（提領期資產耗盡）卻無任何標註，看起來像 bug；(C) 4 處 modal 背景用純黑
`bg-black/*`，違反「不用純黑、色彩帶品牌色相」的設計原則（偵測器 finding，
另 2 處 `hover:bg-black/5` 是誤報，勿動）；(D) 投資頁產業濾器在資料全「未知」
時仍顯示，形同雜訊。

## Current state

### A. 悲觀情境紅色（`src/components/NetWorthProjectionCard.tsx`）

```tsx
// NetWorthProjectionCard.tsx:191（悲觀線）
stroke="var(--ns-neg)"
// NetWorthProjectionCard.tsx:224-226（圖例）
<LegendDot color="var(--ns-neg)" dashed label={`悲觀 ${bearCagr.toFixed(1)}%`} />
<LegendDot color="var(--ns-accent)" label={`中性 ${returnPct.toFixed(1)}%`} />
<LegendDot color="var(--ns-pos)" dashed label={`樂觀 ${bullCagr.toFixed(1)}%`} />
```

可用 token：`--ns-chart-3`（琥珀，dark `#f0c050` / light `#d18a18`）—
中性警示色階，不承載虧損語意。

### B. FIRE 耗盡無標註（`src/routes/GoalsRoute.tsx`）

chartData（FIRE 分支，107 行）：

```tsx
if (isFire && projection) return projection.series.map((row) => ({ x: row.age, portfolio: row.endBalance }));
```

圖表（283–305 行）已有目標 ReferenceLine 的先例可模仿：

```tsx
// GoalsRoute.tsx:303-304
{stats.target > 0 ? (
  <ReferenceLine y={stats.target} stroke="var(--ns-border-strong)" strokeDasharray="4 4" label={{ value: "目標", position: "insideTopRight", fill: "var(--ns-fg-muted)", fontSize: 10 }} />
) : null}
```

### C. 純黑 scrim（4 個真實位置；行號 `479b6256`）

```tsx
// src/components/ui/dialog.tsx:32（COSS dialog backdrop）
"fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs …"
// src/features/goals/GoalEditorSheet.tsx:134
<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
// src/routes/HoldingEditModal.tsx:161（同款）
// src/routes/InvestmentsRoute.tsx:1536（同款，onClick={() => setEditingAsset(null)}）
```

**誤報勿動**：`InvestmentsRoute.tsx:1339`、`1448` 的 `hover:bg-black/5
dark:hover:bg-white/5` 是列 hover 效果，不是 scrim。

DESIGN.md §6.4 記載的 modal 模式含 `bg-black/40` — 改完後該節同步更新。

### D. 產業濾器（`src/routes/InvestmentsRoute.tsx:1315` 附近）

```tsx
<option value="all">所有產業</option>
```

實測 demo 模式：下拉只有「所有產業 / 未知」兩項（資產皆無產業分類），
濾器毫無過濾能力仍佔位。選項清單由持倉資產的 sector 欄位聚合而來
（該檔 60–70 行帶有 `searchSector` 路由參數處理）。

### 慣例

- 色彩 token 一律用 `var(--ns-*)`，不寫死色碼（DESIGN.md §7）。
- 主題 token 定義位置：`src/styles/globals.css` 的 dark 區塊與
  `[data-theme="light"]` 區塊 — 新 token 兩處都要定義。

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |
| Dev shell | `npm run dev`  | :5173（手動驗證）  |

## Scope

**In scope** (the only files you should modify):
- `src/components/NetWorthProjectionCard.tsx`
- `src/routes/GoalsRoute.tsx`（僅 FIRE 圖表區塊）
- `src/styles/globals.css`（新增 `--ns-scrim` token）
- `src/components/ui/dialog.tsx`、`src/features/goals/GoalEditorSheet.tsx`、
  `src/routes/HoldingEditModal.tsx`、`src/routes/InvestmentsRoute.tsx`
  （僅 scrim class 與產業濾器兩處）
- `DESIGN.md`（§6.4 modal 模式片段同步）

**Out of scope** (do NOT touch, even though they look related):
- `InvestmentsRoute.tsx:1339`、`1448` 的 hover 效果（偵測器誤報）。
- `AppShell.tsx` sidebar 收合動畫 — 先前已審定為刻意設計
  （plans/README.md rejected 清單），勿重提。
- Dashboard KPI 色籤與資產配置圓餅的對色 — 需要設計決策，本計劃不碰
  （已列 README deferred）。
- `projectRetirement` 與任何財務計算。

## Git workflow

- Branch: `fix/ai-chart-semantics-polish`
- Commit style: conventional commits，可一項一 commit，例：
  `fix(charts): amber for bear scenario, not loss-red`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1 (A): 悲觀線與圖例換琥珀

`NetWorthProjectionCard.tsx` 191 行 `stroke="var(--ns-neg)"` →
`stroke="var(--ns-chart-3)"`；224 行 LegendDot `color="var(--ns-neg)"` →
`color="var(--ns-chart-3)"`。檔內若還有悲觀線的漸層/tooltip 用到 `--ns-neg`
（`grep -n "ns-neg" src/components/NetWorthProjectionCard.tsx`），一併換。

**Verify**: `grep -n "ns-neg" src/components/NetWorthProjectionCard.tsx` → 無輸出；
dev shell 目視 Dashboard 30 年預測：悲觀線琥珀、中性 accent、樂觀綠。

### Step 2 (B): FIRE 耗盡標註

`GoalsRoute.tsx` 在 chartData 之後加一個 memo：

```tsx
// 提領期資產耗盡的年齡：曲線曾為正、之後首次 ≤ 0 的點（無則 null）。
const depletionX = useMemo(() => {
  let seenPositive = false;
  for (const p of chartData) {
    if (p.portfolio > 0) seenPositive = true;
    else if (seenPositive && p.portfolio <= 0) return p.x;
  }
  return null;
}, [chartData]);
```

在 AreaChart 內、既有目標 ReferenceLine（303 行）旁加：

```tsx
{depletionX != null ? (
  <ReferenceLine x={depletionX} stroke="var(--ns-warn)" strokeDasharray="4 4"
    label={{ value: "預估資產耗盡", position: "insideTopLeft", fill: "var(--ns-warn)", fontSize: 10 }} />
) : null}
```

注意：非 FIRE 目標的 chartData 沒有歸零段，`depletionX` 自然為 null，無需分支。

**Verify**: `npx tsc` → exit 0；dev shell → demo 模式 → 目標頁：曲線歸零處出現
琥珀虛線 +「預估資產耗盡」標籤；切換 保守/基準/樂觀 標註位置跟著動。

### Step 3 (C): scrim token

1. `globals.css`：dark 主題區塊加 `--ns-scrim: oklch(0.13 0.01 250 / 0.55);`、
   light 區塊加 `--ns-scrim: oklch(0.25 0.01 250 / 0.4);`（帶品牌色相 250 的
   深灰，非純黑）。
2. 三處 sheet（GoalEditorSheet:134、HoldingEditModal:161、InvestmentsRoute:1536）：
   className 移除 `bg-black/40`，同元素加
   `style={{ background: "var(--ns-scrim)" }}`（若已有 style 物件則併入）。
3. `dialog.tsx:32`：`bg-black/10` → 以 arbitrary value 走 token：
   `bg-(--ns-scrim)`（Tailwind v4 語法）— 若該寫法在本專案 Tailwind 設定下
   不生效，退回 style 物件方式。dialog 原本較淡（/10）且帶 blur：token 統一後
   若視覺過重，dialog 這處可用
   `background: "color-mix(in oklch, var(--ns-scrim) 30%, transparent)"`。
4. `DESIGN.md` §6.4 的範例片段把 `bg-black/40` 替換為 scrim 寫法，並在 §2 色彩
   章節記一行 `--ns-scrim` token。

**Verify**: `grep -rn "bg-black/40" src/` → 無輸出；
`grep -rn "bg-black/10" src/components/ui/dialog.tsx` → 無輸出；
dev shell 開任一 modal（投資 → 編輯持倉）：深淺色主題下 scrim 都不是死黑、
內容可讀。

### Step 4 (D): 產業濾器去雜訊

`InvestmentsRoute.tsx` 1315 行附近：找出產業選項的來源陣列（該 select 的
options 由持倉 sector 聚合）。加條件：當「去除 未知/空 後的產業數為 0」時
不渲染整個 select（回 null）。同時若 `searchSector` 路由參數指向已不存在的
sector，維持既有行為不另處理。

**Verify**: dev shell demo 模式 → 投資頁：產業下拉消失（demo 資產無產業資料）；
`npx tsc` → exit 0。若你找不到明確的選項來源陣列，觸發 STOP。

### Step 5: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。

## Test plan

- Step 2 的 `depletionX` 邏輯若被抽成純函式（建議放同檔頂部即可，不進 domain），
  可不加測試 — 行為由 dev-shell 目視驗收；其餘三項為樣式/條件渲染，不新增測試。
- 回歸：`npm test` 全綠。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `grep -rn "bg-black/40" src/` → 無輸出
- [ ] `grep -n "ns-neg" src/components/NetWorthProjectionCard.tsx` → 無輸出
- [ ] `grep -n "ns-scrim" src/styles/globals.css` → dark 與 light 各 1 處定義
- [ ] `grep -n "預估資產耗盡" src/routes/GoalsRoute.tsx` → 1 處
- [ ] `git status` 只含 in-scope 檔案
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 任何摘錄與現場不符（drift）。
- Step 3 的 dialog.tsx 是自 COSS/shadcn 產生器複製的檔案且有「勿手改」標記。
- Step 4 找不到產業選項的來源陣列，或該 select 同時承載其他功能（如 ETF 產業
  透視的入口）— 回報現況，勿硬改。
- 四項中任一項卡住：跳過該項、完成其餘、在回報中註明（本計劃允許部分完成）。

## Maintenance notes

- `--ns-scrim` 之後是所有新 modal/sheet 的正準背景 — DESIGN.md §6.4 已同步，
  新程式碼不應再出現 `bg-black/*` 作 scrim（Plan 102 的 lint 不管這個；
  若再犯可考慮加 eslint 規則禁 JSX className 含 `bg-black/4`）。
- 悲觀=琥珀的選擇依據：紅色保留給實際虧損（`--ns-neg`/`--ns-loss`）；
  若日後加更多情境（如「極端」），沿 chart-3/4/5 取色。
- Reviewer 檢查重點：淺色主題的 scrim 對比（內容後方的可讀性）、
  ReferenceLine 在 x 軸為年齡（數字）時的定位正確性。
