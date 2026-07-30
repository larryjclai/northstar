# Plan 280: 總覽淨值趨勢升級為 hero 主圖（軸標籤 + hover 顯示數值）

> **Executor instructions**: 在 git worktree 的分支 `feat/ai-hero-trend-chart` 上工作。
> **不要改主 checkout**。每個 session 第一個指令：`pwd`。逐步執行，每步跑完該步的
> verify 指令並確認預期結果才往下走。遇到 STOP condition 就停下來回報，**不要自行發揮**。
> **不要**更新 `plans/README.md`（advisor 會維護）。
>
> **Drift check（第一件事）**：
> ```bash
> git diff --stat b7bfd7a1..HEAD -- src/routes/DashboardRoute.tsx src/styles/globals.css
> ```
> 若有變動，先把「現況」的 excerpt 與實際程式碼逐字比對；對不上就是 STOP condition。
> 以**內容**定位，不要只信行號（plan 270 用 Prettier 重排過整個 `src/`）。

## Status

- **Priority**: P2 · **Effort**: M · **Risk**: LOW-MED（純呈現層；風險在「別動到財務數字」）
- **Depends on**: **279 —— 已 reviewed+APPROVED 並 merge @ `b7bfd7a1`（2026-07-30）**。
  它動的是頁面外框（`DashboardRoute.tsx:1255` 一帶），本計畫動 `:1694-1738` 的 hero 卡內部；
  相依已解除，而且卡片在寬螢幕上變寬了，這張圖現在吃得到空間。
- **Category**: UI / data-viz
- **Planned at**: commit `27e3c8e1`, 2026-07-30 · **行號已於 `b7bfd7a1` 刷新**（plan 279 已 merge，
  兩個 in-scope 檔案的行號整體位移；程式碼內容本身未變，excerpt 仍逐字相符）

## What and why

Operator 回報：**「總覽的趨勢圖現在有點雞肋，希望趨勢圖的重要性變高，而且希望有 label
和 hover 可以出現數值。」**

現況確實如此，而且是可以量的：總覽 hero 卡右上角那張淨值趨勢圖是 **300×64 px**，
`XAxis` 完全沒有（連 `hide` 都沒宣告）、`YAxis hide`、**沒有 `Tooltip`**、沒有 grid、
沒有任何數字。它旁邊還坐著 8 段期間切換（1D…All）與「長期視角」開關——**使用者能控制
七種區間，卻看不到任何一個區間的數值**。它現在的功能只到「線是往上還是往下」，
而那個資訊 hero 數字旁邊的變動 Badge 早就講完了。所以它是純裝飾。

同時，真正完整的那張圖（含 `XAxis` 標籤與 `Tooltip`）躺在 **預設隱藏**的「淨值趨勢」
卡片裡（`DashboardRoute.tsx:1875-1954`，plan 164 Direction A 把它降級了）。也就是說
功能是有的，只是放在使用者預設看不到的地方。

Operator 已拍板（2026-07-30）：**升級成 hero 卡內的主圖**，不新增卡片。落地後：

- 圖橫跨整張 hero 卡（桌機 240px 高、平板 190、手機 160），排在 hero 數字與 pulse strip 之間
- **X 軸日期刻度 + Y 軸金額刻度**（compact 萬/億）
- **hover 十字虛線 + active dot + tooltip**：日期、當日淨值、以及**相對於所選區間起點的變化**
- 區間起點畫一條 dashed reference line 並標上起點金額，讓「漲了多少」有視覺基準
- 期間切換（1D…All）與「長期視角」留在卡片右上角原位，不動

`docs/ux-chart-audit.md`（2026-06-16 審查）已經記過同一類問題的兩筆——
「Analytics 風險 KPI 的 sparkline 60×26px 幾乎看不出趨勢 → 區塊變裝飾」，以及
「Dashboard 淨值變化% 與 Portfolio Strip 報酬% 易混淆，加 label 區分」。本計畫是同一條
判斷在總覽 hero 上的落地：**圖要能被讀出數字，不然就只是裝飾**。

### 不可違反的既有不變量（改壞會是財務信任問題，不只是版面問題）

1. **圖的最後一點必須等於 hero 大數字**（plan-032 invariant）。`reconciledTrend`
   （`DashboardRoute.tsx:642-654`）刻意把「今天」那一點對齊 headline，因為 headline 用即時報價、
   趨勢用每日收盤。**本計畫不准碰 `trend` / `reconciledTrend` / `rangeView` / `longView`
   任何一行**，只消費 `visibleTrend`。
2. **淨值變動是「市場表現」數字，走 gain/loss 色軸（紅漲綠跌），不是 pos/neg 色軸。**
   見 `DashboardRoute.tsx:1656-1657` 的註解與它下面那個 `<Badge variant={momChange >= 0 ?
   "gain" : "loss"}>`。tooltip 裡的變化數字必須用 `.gain` / `.loss`，**不可**用 `.pos` / `.neg`。
3. **隱私模式（隱藏金額 ⌘⇧H）必須遮住圖上的金額。** `formatMoney` / `formatNumber` /
   `formatCompactNumber`（`src/domain/currency.ts:191-234`）都會在遮罩開啟時回
   `＊＊＊＊＊＊`。tooltip 走這些 formatter 所以自動安全；**但 Y 軸刻度會變成一排
   `＊＊＊＊＊＊`，很醜也沒資訊**——遮罩開啟時要把 Y 軸整條隱藏（步驟 4）。

## Current state（excerpt 在 `27e3c8e1` 實際讀過；行號已在 `b7bfd7a1` 重新核對）

### 要換掉的那段（`src/routes/DashboardRoute.tsx:1694-1738`）

```tsx
            {/* Period control + long-view toggle above a small sparkline — only
                for netWorth (drives the trend chart, still used by the demoted
                淨值趨勢 card too). */}
            {activeMetric.key === "netWorth" && reconciledTrend.length > 1 ? (
              <div className="flex flex-col items-end gap-2" style={{ flexShrink: 0 }}>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <div className="ns-hscroll" style={{ maxWidth: "100%" }}>
                    <SegmentedControl
                      value={stripPeriod}
                      onChange={setStripPeriod}
                      options={STRIP_PERIODS.map((v) => ({ value: v, label: v }))}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={longViewMode ? "default" : "outline"}
                    onClick={toggleLongViewMode}
                    aria-pressed={longViewMode}
                    title="長期視角：以移動平均淡化每日波動"
                  >
                    長期視角
                  </Button>
                </div>
                <div style={{ width: 300, maxWidth: "100%", height: 64 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={visibleTrend}>
                      <defs>
                        <linearGradient id="netWorthMini" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <YAxis hide domain={["dataMin - 20000", "dataMax + 20000"]} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="var(--ns-accent)"
                        fill="url(#netWorthMini)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
          </div>
```

最後那個 `</div>` 是 hero header row（開在 `:1541`）的收尾。緊接在它之後是
「No meaningful trend yet」提示（`:1741-1765`）與 `<PulseStrip cells={pulseCells} />`（`:1769`）。

### 資料形狀（不要重新推導，這裡是實測結果）

`visibleTrend` 的每個點是：

```ts
{ date: string; value: number; iso: string }
// date = formatDay(iso) → zh-TW「7/30」格式（DashboardRoute.tsx:3008-3012）
// iso  = "YYYY-MM-DD"
// value = 該日淨值（primaryCurrency）
```

來源鏈：`trend`（`:598`）→ `reconciledTrend`（`:647`，末點對齊 headline）→
`rangeView`（`:660`，依 `stripPeriod` 切窗並在窗首補一個 carry-forward 合成點）→
`longView`（`:701`，長期視角開啟時走移動平均）→ `visibleTrend = longView.points`（`:712`）。

已知的兩個資料特性，實作必須容忍：

- **`date` 可能重複**：`rangeView` 在窗首補的合成點若與第一個真實點同日，兩點的 `date`
  字串相同（`1D` 區間又會走 `reconciledTrend.slice(-2)`，可能兩點同日）。X 軸 ticks
  必須去重，否則 Recharts 會畫出重複刻度。
- **`value` 可以是負的**（負債大於資產時淨值為負），也可以完全水平（每點同值）。
  Y 軸 domain 的計算不能假設 `min < max` 或 `value > 0`。

### 現況 Y 軸 domain 是個真缺陷（順手修掉）

現在兩張圖都寫 `domain={["dataMin - 20000", "dataMax + 20000"]}`——**固定 ±20000**。
對 13,061,349 的淨值（operator 實際數量級）那個 padding 只有 0.15%，線會貼著上下框；
對一個 5 萬元的新帳本，同一個 20000 會把整條線壓成一條中線。改成**按資料範圍比例**
計算（步驟 1），這是可測的純函式。

### 慣例（照著做）

- **這個 repo 的圖表模板就在 `src/routes/GoalsRoute.tsx:532-597`** —— `CartesianGrid`
  `strokeDasharray="3 3" stroke="var(--ns-border)" vertical={false}`、軸用
  `tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }} tickLine={false} axisLine={false}`、
  `YAxis width={52} tickFormatter={(v) => formatCompactNumber(Number(v))}`、
  `Tooltip contentStyle` 用 `var(--ns-bg-elev)` + `var(--ns-border)` + radius 8、
  `ReferenceLine` 帶 `label={{ value, position, fill, fontSize: 10 }}`。**照抄這套視覺語彙。**
- 純函式抽成 route 旁的同名檔案 + `.test.ts`，例：`src/routes/holdingDetailToday.ts` /
  `holdingDetailToday.test.ts`（interface 在最上面、函式帶說明 JSDoc、測試用
  `describe`/`it` + 具名 helper 造資料）。**本計畫的新 helper 照這個模式。**
- 樣式優先序（`AGENTS.md`）：靜態樣式用 `ns-*` class，inline `style` **只**放動態值。
  所以圖的高度/邊距寫成 `.ns-hero-chart` class，不寫 inline。
- **mobile 判斷一律用 `max-width` 寬度查詢**，不要用 `pointer: coarse`（Tauri WKWebView
  會謊報 `coarse: true`；plans 244/245 的教訓）。
- 這個檔案的 UI 文案是**硬寫的 zh-TW**（例：「長期視角」、「近 1 個月」），只有 3 處用
  `t(...)`。新增文案照樣硬寫 zh-TW，**不要**去跑 `npm run copy:import`／改 `copy.csv`。

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0（0 errors） |
| Format | `npm run format:check` | exit 0 |
| 新測試 | `npm test -- dashboardHeroTrend` | 新增的 case 全過 |
| 全測試 | `npm test` | 1512 + 新增數 全過（baseline 130 檔 / 1512） |
| E2E | `npx playwright test` | 全過（`smoke.spec.ts` 覆蓋總覽空狀態） |
| Build | `npm run build` | exit 0 |
| 手感驗證 | `npm run dev` → http://127.0.0.1:5173 | 見步驟 6 |

## Scope

**In scope**：

- `src/routes/dashboardHeroTrend.ts`（新建）
- `src/routes/dashboardHeroTrend.test.ts`（新建）
- `src/routes/DashboardRoute.tsx`（只改 hero 卡的 `:1694-1738` 區塊、加 import、
  在檔案下半部加一個 tooltip 元件）
- `src/styles/globals.css`（新增 `.ns-hero-chart` 與 `.ns-chart-tip` 兩個 class）

**Out of scope（不要動）**：

- `trend` / `reconciledTrend` / `rangeView` / `longView` / `visibleTrend` /
  `momChange` / `momPct`（`DashboardRoute.tsx:598-714`）——**一行都不要改**。
  本計畫是呈現層，任何對這幾個 memo 的修改都會動到使用者看到的財務數字。
- 降級的「淨值趨勢」卡片（`:1875-1954`）與 `DASHBOARD_CARDS`／`DIRECTION_A_HIDDEN_CARDS`
  清單。那張卡除了圖還裝著 `PortfolioStrip` 與 投資/現金/其他/負債 四張 KPI，
  動它得先幫那些內容找新家——不在本計畫內。它預設隱藏，重複不影響預設畫面。
- `SegmentedControl` / `stripPeriod` / `longViewMode` 的行為與位置（只是不再被
  sparkline 那層 wrapper 包住，控制項本身與 handler 不變）。
- 其他任何路由的圖表。
- 隱私遮罩機制本身（`src/domain/currency.ts`）。

## Git workflow

- 分支：`feat/ai-hero-trend-chart`
- Commit 例：`feat(ui): promote the overview net-worth trend to a labelled hero chart (plan 280)`
- **不要** push、不要開 PR、不要 merge。
- ⚠️ **絕對不要 `git add -A`**（plan 278 的 `node_modules` symlink 事故）。逐檔 `git add`。

## Steps

### Step 1: 抽出純函式 `dashboardHeroTrend.ts`

新建 `src/routes/dashboardHeroTrend.ts`。這支檔案只做「圖的刻度與範圍」這件可測的事，
不 import React、不 import recharts。

```ts
export interface HeroTrendPoint {
  /** Display label already formatted by formatDay (e.g. "7/30"); the X category. */
  date: string;
  value: number;
  /** YYYY-MM-DD. */
  iso: string;
}

export interface HeroTrendMeta {
  /** [min, max] with proportional headroom so the line never touches the frame. */
  yDomain: [number, number];
  /** First point's value = the baseline the hero delta is measured from. */
  startValue: number;
  /** Last point's value — equals the hero headline number (plan-032 invariant). */
  endValue: number;
  /** endValue − startValue. */
  change: number;
  /** X-axis ticks: a de-duplicated subset of point.date, first and last always in. */
  ticks: string[];
}

/**
 * Chart geometry for the Overview hero net-worth trend.
 *
 * Y domain: padded by 15% of the visible range so the line sits inside the
 * frame. A flat series has zero range, so it falls back to 2% of the magnitude
 * (and a 1-unit floor at zero) — never a fixed absolute pad, which is what the
 * old `dataMin - 20000` did: invisible on a 13M portfolio, dominant on a 50k one.
 * Works for negative net worth (liabilities > assets) — the pad is applied to
 * min/max, not to |value|.
 *
 * Returns null when there is nothing to draw (fewer than 2 points); the caller
 * renders the "not enough data yet" hint instead.
 */
export function buildHeroTrendMeta(
  points: HeroTrendPoint[],
  options?: { maxTicks?: number },
): HeroTrendMeta | null {
  // maxTicks default 6; guard maxTicks < 2.
  // ticks: evenly spaced indices across points, always including 0 and n-1,
  //        mapped to point.date, then de-duplicated preserving order
  //        (duplicate labels are expected — see "資料形狀" in plan 280).
}
```

實作要求（逐條，都有對應測試）：

1. `points.length < 2` → `null`。
2. `min = Math.min(...values)`、`max = Math.max(...values)`、`range = max - min`。
3. `pad = range > 0 ? range * 0.15 : Math.max(Math.abs(max) * 0.02, 1)`。
4. `yDomain = [min - pad, max + pad]`；必須保證 `yDomain[0] < yDomain[1]`。
5. `startValue = points[0].value`、`endValue = points[points.length - 1].value`、
   `change = endValue - startValue`。
6. `ticks`：取 `Math.min(maxTicks, points.length)` 個**均勻分布**的 index（含頭尾），
   映成 `date`，**依序去重**。回傳的每個字串都必須真的出現在 `points` 的 `date` 裡
   （Recharts 的 category 軸只認實際存在的類別值）。

**Verify**：
```bash
npx tsc --noEmit
```
→ exit 0（此步只新增檔案，還沒接線）。

### Step 2: 寫 `dashboardHeroTrend.test.ts`

新建 `src/routes/dashboardHeroTrend.test.ts`，結構照 `src/routes/holdingDetailToday.test.ts`
（`import { describe, expect, it } from "vitest";` + 一個造資料的具名 helper）。

必須覆蓋這 7 個 case：

1. 空陣列 → `null`；單點 → `null`。
2. 兩點正常序列（100 → 200）→ `startValue 100` / `endValue 200` / `change 100`；
   `yDomain` 為 `[100 - 15, 200 + 15]`。
3. **完全水平序列**（三點都是 1_000_000）→ `range === 0` 走 fallback，
   `yDomain[0] < 1_000_000 < yDomain[1]`，且 pad 為 20_000（2%）。
4. **全零序列**（三點都是 0）→ 不可回傳 `[0, 0]`（除以零/退化 domain），
   `yDomain[0] < 0 < yDomain[1]`（1 單位地板）。
5. **負淨值**（−500_000 → −300_000）→ `yDomain[0] < -500_000` 且 `yDomain[1] > -300_000`，
   `change === 200_000`。
6. **ticks 數量**：30 點、`maxTicks: 6` → `ticks.length === 6`，`ticks[0]` 是第一點的
   `date`、最後一個是末點的 `date`，且每個 tick 都存在於輸入的 `date` 集合中。
7. **ticks 去重**：5 個點但 `date` 全部是 `"7/30"` → `ticks` 長度為 1（不是 5，也不報錯）。
   另加一個「點數 < maxTicks」的 case（3 點、maxTicks 6 → 3 個 tick，無重複）。

**Verify**：
```bash
npm test -- dashboardHeroTrend
```
→ 全過。記下新增的測試數量（回報時要寫）。

### Step 3: 加兩個 CSS class

在 `src/styles/globals.css` 的 dashboard 區塊附近（`.ns-dash-row1` / `.ns-dash-kpi-stack`
那一帶，現況 `:898-913`）加：

```css
/* Hero net-worth chart (plan 280) — promoted from a 300×64 decorative
   sparkline to the hero card's main chart. Tall enough to read a trend,
   short enough that the pulse strip stays visible on a laptop. Width queries
   only — WKWebView misreports `pointer: coarse` (plans 244/245). */
.ns-hero-chart {
  width: 100%;
  height: 240px;
  margin: 6px 0 16px;
}
@media (max-width: 1023px) {
  .ns-hero-chart { height: 190px; }
}
@media (max-width: 639px) {
  .ns-hero-chart { height: 160px; margin: 2px 0 12px; }
}

/* Custom chart tooltip body — same surface as the recharts `contentStyle`
   used elsewhere (see GoalsRoute), extracted so a multi-line tooltip can be
   rendered as real markup instead of a formatter string. */
.ns-chart-tip {
  background: var(--ns-bg-elev);
  border: 1px solid var(--ns-border);
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: var(--ns-shadow-strong);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
```

陰影 token 已核對：這個檔案**只有** `--ns-shadow-1` / `--ns-shadow-2` 與它們的語意別名
`--ns-shadow` / `--ns-shadow-strong`（`globals.css:151-152, 169-170`，深色主題在 `:207-226`
與 `:263-264` 覆寫）。用 `var(--ns-shadow-strong)`，**不要**自己寫死 rgba，也不要用
`--ns-shadow-lg` / `--ns-shadow-xl`（**那兩個不存在**——`AppShell.tsx:537` 引用了
`--ns-shadow-xl`，是個既有的無效引用，不在本計畫範圍內，別順手修）。

**Verify**：
```bash
grep -n "ns-hero-chart\|ns-chart-tip" src/styles/globals.css
grep -n "\-\-ns-shadow-strong:" src/styles/globals.css
```
→ 兩個 class 都在；`--ns-shadow-strong` 有定義（至少 2 處：淺色與深色主題）。

### Step 4: 換掉 hero 卡裡的 sparkline

在 `src/routes/DashboardRoute.tsx`：

**(a) import**（照該檔既有的 import 風格加，不要重排既有 import）：

- 從 `"recharts"` 的既有 import 補上 `CartesianGrid`、`ReferenceLine`
  （`Area`/`AreaChart`/`Tooltip`/`XAxis`/`YAxis`/`ResponsiveContainer` 已在，`:4-14`）
- 從 `"../domain"` 的既有 import 補上 `formatCompactNumber`
  （`formatMoney` / `formatCompactMoney` / `formatNumber` 已在 `:54-56`；
  `domain/index.ts` 有 `export * from "./currency"` 所以走 barrel 即可）
- 新增 `import { buildHeroTrendMeta } from "./dashboardHeroTrend";`

**(b) 讀隱私狀態**：在 `longViewMode` 那一行（`:188`）附近加

```tsx
  const privacyMode = useUiPreferences((state) => state.privacyMode);
```

**用 store selector，不要**在 render 裡呼叫 `isPrivacyMaskOn()`——那是模組全域讀取，
`react-hooks/purity`（plan 274 剛清乾淨的規則）會亮。

**(c) 算 meta**：在 `const visibleTrend = longView.points;`（`:712`）之後加

```tsx
  // Chart geometry only — pure, tested in dashboardHeroTrend.test.ts. Does not
  // touch any value: the series itself stays exactly as longView produced it.
  const heroTrend = useMemo(() => buildHeroTrendMeta(visibleTrend), [visibleTrend]);
```

**(d) 把「現況」那整段（`:1694-1738`）換成**：控制項留在 header row 右側、圖搬到
header row **之後**。也就是那段變成只剩控制項：

```tsx
            {/* Period control + long-view toggle. The chart itself moved below
                the header row (plan 280) so it can span the card's full width. */}
            {activeMetric.key === "netWorth" && reconciledTrend.length > 1 ? (
              <div className="flex items-center gap-2 flex-wrap justify-end" style={{ flexShrink: 0 }}>
                <div className="ns-hscroll" style={{ maxWidth: "100%" }}>
                  <SegmentedControl
                    value={stripPeriod}
                    onChange={setStripPeriod}
                    options={STRIP_PERIODS.map((v) => ({ value: v, label: v }))}
                  />
                </div>
                <Button
                  size="sm"
                  variant={longViewMode ? "default" : "outline"}
                  onClick={toggleLongViewMode}
                  aria-pressed={longViewMode}
                  title="長期視角：以移動平均淡化每日波動"
                >
                  長期視角
                </Button>
              </div>
            ) : null}
          </div>
```

然後**在那個 `</div>`（header row 收尾）之後、`{/* No meaningful trend yet … */}`
之前**插入圖：

```tsx
          {/* ── Net-worth trend: the hero card's main chart (plan 280) ──
              Was a 300×64 sparkline with no axes and no tooltip — seven period
              buttons and no readable number. Now: labelled axes, hover readout,
              and a dashed baseline at the selected window's starting value.
              Draws `visibleTrend` untouched, so the last point still equals the
              headline above it (plan-032 invariant). */}
          {activeMetric.key === "netWorth" && heroTrend ? (
            <div
              className="ns-hero-chart"
              role="img"
              aria-label={`淨值趨勢 ${STRIP_PERIOD_LABELS[stripPeriod]}：${formatMoney(
                heroTrend.startValue,
                primaryCurrency,
              )} 到 ${formatMoney(heroTrend.endValue, primaryCurrency)}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visibleTrend} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="netWorthHero" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--ns-accent)" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="var(--ns-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ns-border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    ticks={heroTrend.ticks}
                    tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={heroTrend.yDomain}
                    tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v) => formatCompactNumber(Number(v))}
                    // Privacy mode masks every amount to ＊＊＊＊＊＊; a whole
                    // column of those is noise, so drop the axis instead.
                    hide={privacyMode}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--ns-border-strong)", strokeDasharray: "3 3" }}
                    content={
                      <HeroTrendTooltip
                        currency={primaryCurrency}
                        startValue={heroTrend.startValue}
                      />
                    }
                  />
                  <ReferenceLine
                    y={heroTrend.startValue}
                    stroke="var(--ns-border-strong)"
                    strokeDasharray="4 4"
                    label={{
                      value: `起點 ${formatCompactMoney(heroTrend.startValue, primaryCurrency)}`,
                      position: "insideTopLeft",
                      fill: "var(--ns-fg-muted)",
                      fontSize: 10,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--ns-accent)"
                    fill="url(#netWorthHero)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{
                      r: 4,
                      fill: "var(--ns-accent)",
                      stroke: "var(--ns-bg-elev)",
                      strokeWidth: 2,
                    }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
```

注意兩點：
- 條件從 `reconciledTrend.length > 1` 換成 `heroTrend`（非 null 即代表 ≥2 點），
  兩者等價但後者順便幫 TS 收掉 null。
- gradient id 用 `netWorthHero`（新的）。舊的 `netWorthMini` 隨 sparkline 一起消失；
  降級卡片用的 `netWorthTrendFull` **不要動**。

**Verify**：
```bash
grep -n "netWorthMini" src/routes/DashboardRoute.tsx        # → 零命中
grep -n "netWorthHero\|netWorthTrendFull" src/routes/DashboardRoute.tsx  # → 各 1
npx tsc --noEmit
```

### Step 5: 加 `HeroTrendTooltip` 元件

在 `DashboardRoute.tsx` 檔案下半部的區域元件旁（`PulseStrip` 在 `:2332`、
`KpiCard` 在 `:2382`）新增一個 module-scope 函式元件：

```tsx
/** Hover readout for the hero net-worth chart (plan 280): the day, that day's
 *  net worth, and the change against the selected window's starting value.
 *  The delta is a market-performance number, so it uses the gain/loss axis
 *  (.gain/.loss → 紅漲綠跌), never .pos/.neg — same rule as the hero badge. */
function HeroTrendTooltip({
  active,
  payload,
  currency,
  startValue,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { iso?: string; value?: number } }>;
  currency: string;
  startValue: number;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point || typeof point.value !== "number") return null;
  const delta = point.value - startValue;
  return (
    <div className="ns-chart-tip">
      <div className="text-caption muted mono">{point.iso ?? ""}</div>
      <div className="num" style={{ fontWeight: 600 }}>
        {formatMoney(point.value, currency)}
      </div>
      <div className={`text-caption num ${delta >= 0 ? "gain" : "loss"}`}>
        {delta >= 0 ? "+" : "−"}
        {formatNumber(Math.abs(delta))}
      </div>
    </div>
  );
}
```

`active` / `payload` 由 Recharts 在 clone `content` element 時注入，所以呼叫端只傳
`currency` 與 `startValue`（見步驟 4 的用法）。若 TS 對 `content={<HeroTrendTooltip … />}`
抱怨缺少 `active`/`payload`，那正是為什麼這兩個 prop 宣告為 optional——**不要**改成
`content={(props) => …}` 之外的變體去繞過，也不要加 `as any`。

**Verify**：
```bash
npx tsc --noEmit && npm run lint && npm run format:check
```
→ 全部 exit 0（lint 0 errors）。

### Step 6: 手感驗證（誠實回報，不要美化）

```bash
npm run dev
```

開 http://127.0.0.1:5173/ 。空資料庫時總覽會顯示空狀態，按「載入示範資料」灌入 demo
（`enterDemoMode`，會在結束時還原，不會動到真實資料）。逐項確認並回報：

1. 圖橫跨整張 hero 卡，X 軸看得到日期、Y 軸看得到金額（萬/億）。
2. 滑鼠移過去出現虛線十字 + 圓點 + tooltip，tooltip 三行：日期、淨值、變化。
3. 切 1D / 1W / 1M / All，圖與軸都跟著換；圖的**最後一點與上面 hero 大數字一致**。
4. 開「長期視角」線變平滑，末點數字不變。
5. 按 ⌘⇧H（隱私模式）→ Y 軸整條消失、tooltip 金額變 `＊＊＊＊＊＊`（不是數字外洩）。
6. 視窗縮到 ~800px 與 ~390px 寬：圖變矮、不溢出、期間切換仍可橫向捲（`ns-hscroll`）。
7. 手機寬度下用觸控拖曳看 tooltip 是否出現。**Recharts 的觸控 tooltip 若沒反應，
   照實回報「touch 不觸發」即可，不要自己加手勢層**——軸標籤與起點基準線已經把
   數值講出來了，這不是阻塞項。

⚠️ **plan 278 的已知環境限制**：executor 的 browser pane 對本 app 可能渲染成 0 高度
viewport 且 `visibilityState: "hidden"`。若你遇到這個情況，**明說「視覺驗證未完成，
需 operator 實機一瞥」**，並且**不要**用手動注入 DOM/假造狀態的截圖充當證據。

### Step 7: 全套閘門

```bash
npx tsc --noEmit && npm run lint && npm run format:check && npm test && npm run build
npx playwright test
```
→ 全部 exit 0。`npm test` 應為 1512 + 本計畫新增數。

## Test plan

- **新增** `src/routes/dashboardHeroTrend.test.ts`，7 組 case（步驟 2 已逐條列出）：
  空/單點、正常兩點、水平序列、全零序列、負淨值、ticks 數量與頭尾、ticks 去重與少點。
  結構照 `src/routes/holdingDetailToday.test.ts`。
- **不為 JSX 寫測試**：這個 route 是 3000+ 行、沒有既有 render harness，且 jsdom 不做
  真實 layout（Recharts 的 `ResponsiveContainer` 在 jsdom 量到 0 寬會什麼都不畫）。
  硬寫只會產生假綠燈。可測的部分已經全部推到 `dashboardHeroTrend.ts`。
- **既有 e2e 必須全過**：`src/test/e2e/smoke.spec.ts` 斷言總覽空狀態文字
  「先建立第一個帳戶，Northstar 會開始計算總覽。」——那條路徑（`reconciledTrend.length
  <= 1`）本計畫沒有改，但條件式重排過，所以要實跑確認沒被誤刪。

## Done criteria

全部必須成立：

- [ ] `grep -n "netWorthMini" src/routes/DashboardRoute.tsx` → 零命中（舊 sparkline 已移除）
- [ ] `grep -c "width: 300\|height: 64" src/routes/DashboardRoute.tsx` → 零命中
- [ ] `grep -n "ns-hero-chart" src/routes/DashboardRoute.tsx src/styles/globals.css` → 各 1+
- [ ] `git diff b7bfd7a1..HEAD -- src/routes/DashboardRoute.tsx | grep -E "^[+-].*(reconciledTrend =|rangeView =|longView =|visibleTrend =|momChange =|momPct =)"`
      → **零輸出**（證明沒有動到任何財務數字的來源）
- [ ] `grep -n "netWorthTrendFull" src/routes/DashboardRoute.tsx` → 仍存在 1 處（降級卡片未被誤改）
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm run lint` exit 0（0 errors；`react-hooks/purity` 與 `refs` 仍為 0）
- [ ] `npm run format:check` exit 0
- [ ] `npm test` exit 0，測試數 = 1512 + 新增數，**無既有測試轉紅**
- [ ] `npx playwright test` 全過
- [ ] `npm run build` exit 0
- [ ] 步驟 6 的 7 項手感檢查逐項回報（含「做不到」的項目與原因）
- [ ] `git status` 只有 in-scope 的 2 個修改 + 2 個新檔；**沒有 node_modules**

## STOP conditions

停下來回報，不要自行發揮：

- 任何「現況」excerpt 與實際程式碼對不上（drift）。
- 你發現要達成需求得修改 `trend` / `reconciledTrend` / `rangeView` / `longView`
  其中任何一個——**那是紅線**。回報你想改什麼、為什麼，讓 operator 判斷。
- 圖的最後一點與 hero 大數字**不一致**（步驟 6 第 3 項）。這代表 plan-032 的
  invariant 被破壞了，不是視覺問題，是財務信任問題。
- 隱私模式下圖上仍看得到任何真實金額（軸、tooltip、基準線 label 任一處）。
- `npm test` 有既有測試轉紅，或 lint 出現新的 `react-hooks/purity` / `refs` 命中。
- Recharts 的 `content={<HeroTrendTooltip … />}` 型別接不上，且需要 `as any` /
  `@ts-expect-error` 才能過 —— 回報實際型別錯誤訊息，不要塞逃生口。
- 圖在寬螢幕或窄螢幕下把 hero 卡撐出水平捲軸。

## Maintenance notes

- **重複的那張圖**：降級的「淨值趨勢」卡片（`:1875-1954`，預設隱藏）畫的是同一條
  `visibleTrend`。使用者從「版面」把它打開就會在總覽看到兩張同樣的線。刻意不處理：
  那張卡還裝著 `PortfolioStrip` 與四張資產 KPI，要退場得先幫它們找新家。
  **下一份計畫的候選**：把那張卡拆成「資產組成」卡（保留 strip + KPI、去掉圖）。
- **審查重點**：(1) `git diff` 有沒有碰到 `:598-714` 那段 memo 鏈（一行都不該碰）；
  (2) tooltip 的變化數字用的是 `.gain/.loss` 而不是 `.pos/.neg`；
  (3) 隱私模式下 Y 軸真的整條消失，而不是只把 formatter 換掉。
- **未來會互動的改動**：若之後在總覽加入「多幣別切換」或「帳本比較」，`buildHeroTrendMeta`
  的 `yDomain` 是單序列假設——多序列時要改成吃 min/max across series。
- **刻意沒做**：X 軸沒有做「按區間換格式」（1D 顯示時刻、5Y 顯示年月）。`visibleTrend`
  的 `date` 已經是 `formatDay` 產出的 `M/D` 字串，要換格式得改資料層的 `formatDay`
  或在圖層改吃 `iso`——超出「加 label 與 hover」的範圍，若 operator 之後嫌 5Y 的軸太密，
  再單獨開一份。
