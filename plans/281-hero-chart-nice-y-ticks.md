# Plan 281: hero 趨勢圖的 Y 軸改用「整數級距」刻度（1.95萬 → 20萬）

> **Executor instructions**: 在 git worktree 的分支 `fix/ai-nice-y-ticks` 上工作。
> **第一件事**：`pwd` 確認在 worktree；接著
> **`git checkout -b fix/ai-nice-y-ticks main` 然後 `git log --oneline -3` 必須看到
> `adfd17db Merge branch 'feat/ai-hero-trend-chart' (plan 280)`** —— worktree 的預設
> 基準 commit 比 `main` 舊（280 派工時踩過這個坑），看不到就 STOP 回報。
> 逐步執行，每步跑完 verify 才往下走。遇到 STOP condition 就停下來回報，
> **不要自行發揮**。**不要**動 `plans/`（advisor 維護）。
>
> **Drift check**：
> ```bash
> git diff --stat adfd17db..HEAD -- src/routes/dashboardHeroTrend.ts src/routes/DashboardRoute.tsx
> ```
> 空輸出才往下走；有輸出就把下面的 excerpt 與實際程式碼逐字比對，對不上即 STOP。

## Status

- **Priority**: P3 · **Effort**: S · **Risk**: LOW（純呈現層，且改動集中在一支已被測試包住的純函式）
- **Depends on**: 280（已 reviewed+APPROVED 並 merge @ `adfd17db`）
- **Category**: UI / data-viz polish
- **Planned at**: commit `adfd17db`, 2026-07-31

## What and why

280 把總覽的淨值趨勢升級成主圖之後，Y 軸第一次被使用者看見 —— 然後就看見了這個：

```
72.77萬
51.95萬
26.95萬
 1.95萬
−23.05萬
```

**刻度不是整數。** 成因不是 bug，是 280 明文指定的 domain 數學：`buildHeroTrendMeta`
回傳 `[min − pad, max + pad]` 的**精確值**，Recharts 拿到一個明確的數字 domain 後
就在其間等分切刻度，於是刻度落在 `−23.05萬`、`1.95萬` 這種位置。舊版 Y 軸是 `hide`
的，所以這個行為一直存在、只是沒人看得到。

Operator 2026-07-31 指定要修。目標長相：

```
80萬
60萬
40萬
20萬
 0
```

也就是**先把上下界外擴到「漂亮級距」的整數倍**，再依那個級距產生刻度，並讓 domain
與刻度一致（否則最上/最下那格刻度會被裁掉）。

### 一個必須守住的反面案例（這是本計畫最容易做壞的地方）

「漂亮刻度」最常見的錯誤實作是**把下界一路抓到 0**。對這個 app 是災難：

真實案例（operator 的帳本量級）淨值 **13,061,349**，一個月內的波動大約 **±10 萬**。
若 Y 軸從 0 畫到 1400 萬，那條線會被壓成畫面正中央一條**完全水平**的直線 ——
280 剛把這張圖從「裝飾」救回「可讀」，這樣就又打回去了，而且更糟：使用者會以為
自己的淨值一整個月毫無變化。

**規則：級距是從「已 padding 的資料範圍」推出來的，只往外 snap 到最近的級距邊界，
永遠不強迫包含 0。** 上面的 `0 / 20萬 / …` 只是因為那份示範資料的範圍剛好跨過 0。

## Current state（在 `adfd17db` 實際讀過）

### `src/routes/dashboardHeroTrend.ts:35-72`（全檔 72 行，這是要改的部分）

```ts
export function buildHeroTrendMeta(
  points: HeroTrendPoint[],
  options?: { maxTicks?: number },
): HeroTrendMeta | null {
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = range > 0 ? range * 0.15 : Math.max(Math.abs(max) * 0.02, 1);
  const yDomain: [number, number] = [min - pad, max + pad];
  ...
  return { yDomain, startValue, endValue, change, ticks };
}
```

`HeroTrendMeta` 目前的形狀（`:10-20`）：

```ts
export interface HeroTrendMeta {
  /** [min, max] with proportional headroom so the line never touches the frame. */
  yDomain: [number, number];
  startValue: number;
  endValue: number;
  change: number;
  /** X-axis ticks: a de-duplicated subset of point.date, first and last always in. */
  ticks: string[];
}
```

注意 `ticks` 是 **X 軸**的（日期字串）。本計畫要新增的是 **Y 軸**的數字刻度，
**不要**把兩者混在同一個欄位。

### `src/routes/DashboardRoute.tsx:1762-1772`（消費端）

```tsx
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
```

X 軸在它上面（`:1753-1761`）已經是 `ticks={heroTrend.ticks}` 的寫法，**照抄那個模式**。

### 既有測試（`src/routes/dashboardHeroTrend.test.ts`，109 行，9 個 case）

已覆蓋：空/單點回 null、15% padding、水平序列 2% fallback、全零不塌成 `[0,0]`、
負淨值、X 軸刻度數量與頭尾、X 軸刻度去重、點數少於 maxTicks。
**這些既有 case 全部必須繼續過** —— 但注意其中兩個直接斷言 `yDomain` 的精確值
（`toBeCloseTo(100 - 15)` / `toBeCloseTo(200 + 15)`，以及水平序列的 `20_000`），
snap 到整數級距之後這些值**會改變**。這是預期中的行為變更：**你要更新那些斷言，
並在測試名稱裡說明新語意**，不是刪掉它們。

### 慣例

- 純函式 + 同名 `.test.ts`、interface 在最上面、函式帶 JSDoc —— 這個檔案本身就是範本。
- Y 軸刻度最後會餵給 `formatCompactNumber`（zh-TW 走 萬/億）。所以級距挑 10 的次方系列
  （1 / 2 / 2.5 / 5 × 10^k）就會自然變成「20萬 / 50萬 / 1億」這種讀得出來的數字。
- 不要引入新套件（d3-scale 之類）。這是 20 行以內的算術。

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors（799 既有 warnings） |
| Format | `npm run format:check` | exit 0 |
| 本計畫測試 | `npm test -- dashboardHeroTrend` | 全過 |
| 全測試 | `npm test` | **1521 + 新增數**，131+ 檔，零既有測試轉紅 |
| Build | `npm run build` | exit 0 |
| E2E | `npx playwright test` | 6/6 |

## Scope

**In scope**：
- `src/routes/dashboardHeroTrend.ts`
- `src/routes/dashboardHeroTrend.test.ts`
- `src/routes/DashboardRoute.tsx`（**只有** `:1762-1772` 那個 `<YAxis>`，加一個 prop）

**Out of scope（不要動）**：
- `trend` / `reconciledTrend` / `rangeView` / `longView` / `visibleTrend` / `momChange` /
  `momPct`（`DashboardRoute.tsx:598-718`）—— 財務數字來源，一行都不准碰。
- X 軸的 `ticks`（日期）邏輯與 `HeroTrendMeta.ticks` 欄位語意。
- 降級的「淨值趨勢」卡片（`DashboardRoute.tsx:1968` 那個 `<YAxis hide domain={["dataMin - 20000",
  "dataMax + 20000"]} />`）。它是**隱藏**的軸，看不見，改它沒有使用者價值，
  而且會擴大 diff。**刻意留著**。
- `.ns-hero-chart` / `.ns-chart-tip` CSS、tooltip 元件、隱私模式邏輯。

## Git workflow

- 分支：`fix/ai-nice-y-ticks`（已在前置步驟建立）
- Commit 例：`fix(ui): round the hero chart's Y axis to nice steps (plan 281)`
- **不要** push、不要開 PR。⚠️ **絕對不要 `git add -A`**，逐檔 `git add`。

## Steps

### Step 1: 在 `dashboardHeroTrend.ts` 加 nice-step 計算

新增一個**不匯出**的輔助函式與一個新的回傳欄位。

```ts
/**
 * The "nice" step for an axis: 1, 2, 2.5 or 5 × a power of ten — the sequence
 * that reads cleanly once formatCompactNumber turns it into 萬/億 (20萬, 50萬,
 * 1億). Derived from the span the data actually occupies, never from zero.
 */
function niceStep(span: number, targetTicks: number): number {
  const raw = span / Math.max(1, targetTicks - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}
```

在 `HeroTrendMeta` 加欄位（**放在 `yDomain` 旁邊，並更新它的 JSDoc**）：

```ts
  /** Y-axis tick values, on a nice step; yDomain is snapped to match them so
   *  the outermost ticks are never clipped. Pass straight to <YAxis ticks>. */
  yTicks: number[];
```

`buildHeroTrendMeta` 內，把現有 `yDomain` 的計算改成：先照舊算出 padded 上下界，
**再**外擴 snap 到級距邊界，最後由級距產生刻度。

```ts
  const paddedMin = min - pad;
  const paddedMax = max + pad;
  const step = niceStep(paddedMax - paddedMin, options?.yTickCount ?? 5);
  const niceMin = Math.floor(paddedMin / step) * step;
  const niceMax = Math.ceil(paddedMax / step) * step;
  const yDomain: [number, number] = [niceMin, niceMax];

  const yTicks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    // Kill float dust (0.1 + 0.2 style) so ticks land on exact multiples.
    yTicks.push(Math.round(v / step) * step);
  }
```

新增 option `yTickCount?: number`（預設 5）到 `options` 型別。

**硬性要求，會被測試檢查**：
1. `yDomain[0] === yTicks[0]` 且 `yDomain[1] === yTicks[yTicks.length - 1]`。
2. `yTicks` 每個值都是 `step` 的整數倍（容許 1e-6 浮點誤差）。
3. `yDomain[0] <= min` 且 `yDomain[1] >= max`（資料一定畫得進去）。
4. **不得強迫包含 0**：見下方 Step 2 的「大數字小波動」case。
5. `yTicks.length` 在 3–8 之間（避免退化成 2 根或爆出 20 根）。

**Verify**：
```bash
npx tsc --noEmit
```
→ exit 0（此時 `DashboardRoute.tsx` 還沒接線，但新欄位只是多出來，不會壞型別）。

### Step 2: 更新既有測試 + 新增 nice-tick 測試

在 `src/routes/dashboardHeroTrend.test.ts`：

**(a) 更新兩個現在會失敗的既有 case**（這是預期的行為變更，不是回歸）：
- `"two normal points (100 → 200) → ..."`：`yDomain` 不再是 `[85, 215]`。改成斷言
  **性質**而非精確值 —— `yDomain[0] <= 100`、`yDomain[1] >= 200`、且兩端都等於
  `yTicks` 的頭尾。順手把測試名稱裡的「15% padded yDomain」改成反映新語意。
- `"flat series (all 1,000,000) → ..."`：同樣改成斷言性質（domain 跨過 1,000,000、
  頭尾對齊 yTicks），不要再斷言 `20_000` 這個精確 pad。

**(b) 新增這 6 個 case**：

1. **整數級距**：`0 → 800_000` 的序列 → `yTicks` 每個都是 `step` 的整數倍，
   且 `yTicks` 至少包含一個「整齊」的值（例如全部 `% 100_000 === 0`）。
2. **⚠️ 大數字小波動（本計畫的核心 case）**：起點 `13_000_000`、終點 `13_100_000`
   （±10 萬波動在 1300 萬的量級上）→
   - `yDomain[0]` **必須 > 12_000_000**（證明沒有一路抓到 0）
   - `yDomain[1] - yDomain[0]` **必須 < 資料 range 的 4 倍**（證明線不會被壓平）
3. **負淨值**：`-500_000 → -300_000` → domain 兩端都是負的整數級距，資料在內。
4. **跨零**：`-50_000 → 120_000` → domain 涵蓋兩者，刻度落在級距倍數上。
5. **全零序列**：仍然不塌成 `[0, 0]`，且 `yTicks.length >= 3`。
6. **刻度數量帶**：對上述每個 case 斷言 `3 <= yTicks.length <= 8`。

**Verify**：
```bash
npm test -- dashboardHeroTrend
```
→ 全過。回報**新的總數**（舊 9 + 新增）。

### Step 3: 接到 `<YAxis>`

`src/routes/DashboardRoute.tsx:1762-1772`，只加一個 prop（其餘一字不改）：

```tsx
                  <YAxis
                    domain={heroTrend.yDomain}
                    ticks={heroTrend.yTicks}
                    tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }}
                    ...
```

**Verify**：
```bash
grep -n "ticks={heroTrend.yTicks}" src/routes/DashboardRoute.tsx   # → 1 命中
git diff --stat main..HEAD -- src/routes/DashboardRoute.tsx        # → 1 檔，約 +1 −0
npx tsc --noEmit && npm run lint && npm run format:check
```

### Step 4: 實際看一眼

```bash
npm run dev
```
空資料庫時總覽是空狀態，按「載入示範資料」灌 demo（結束會還原，不動真實資料）。確認：

1. Y 軸刻度變成整齊的數字（`20萬 / 40萬 / …` 這種），不再是 `1.95萬 / 26.95萬`。
2. **線沒有被壓平** —— 走勢的起伏幅度看起來與改動前相當。
3. 最上與最下那格刻度**沒有被裁掉**。
4. 切 1D / 1M / All，每個區間的刻度都是整齊的、線都填得滿。
5. ⌘⇧H 隱私模式下 Y 軸仍然整條消失。

⚠️ 若 browser preview 把本 app 渲染成 0 高度／`visibilityState: "hidden"`，**照實說哪幾項
沒驗到**，不要注入 DOM 或偽造截圖。（280 的執行者發現 `left_click_drag` 能送出真實
pointer 事件、單純 `hover` 不行；本計畫的檢查項不需要 hover，所以應該不受影響。）
另外 `preview_start` 可能從**主 checkout** 而不是你的 worktree 啟動 dev server ——
280 踩過；若畫面看起來像舊版，用 `npm run dev -- --port 5174` 在 worktree 內自己起。

### Step 5: 全套閘門

```bash
npx tsc --noEmit && npm run lint && npm run format:check && npm test && npm run build
npx playwright test
```

## Test plan

- 既有 9 個 case：2 個更新斷言（見 Step 2a）、7 個原封不動全過。
- 新增 6 個 case（Step 2b），其中 **#2「大數字小波動」是本計畫的守門測試** ——
  它擋住「Y 軸從 0 開始把線壓平」這個最可能的做壞方式。
- 不新增 e2e：Y 軸刻度值是純函式的輸出，unit test 就能鎖死；e2e 只會重複驗一次。

## Done criteria

- [ ] `grep -n "yTicks" src/routes/dashboardHeroTrend.ts` → interface 欄位 + 計算 + return 皆在
- [ ] `grep -n "ticks={heroTrend.yTicks}" src/routes/DashboardRoute.tsx` → 1 命中
- [ ] `git diff adfd17db..HEAD -- src/routes/DashboardRoute.tsx | grep -cE "^[+-]"` → **≤ 6**
      （只該多一行 prop；超過代表動了不該動的東西）
- [ ] `git diff adfd17db..HEAD -- src/routes/DashboardRoute.tsx | grep -E "^[+-].*(reconciledTrend =|rangeView =|longView =|visibleTrend =|momChange =|momPct =)"` → 空
- [ ] `npx tsc --noEmit` / `npm run lint`(0 errors) / `npm run format:check` / `npm run build` 全 exit 0
- [ ] `npm test` → 1521 + 新增數，**零既有測試轉紅**（`dashboardHeroTrend` 以外的檔案數字不變）
- [ ] `npx playwright test` → 6/6
- [ ] Step 4 的 5 項逐項回報（含沒驗到的與原因）
- [ ] `git status` 只有 in-scope 3 檔；沒有 node_modules

## STOP conditions

- Excerpt 與實際程式碼對不上（drift）。
- 你發現要達成需求得改 `visibleTrend` 或上游任何 memo —— **紅線**，回報。
- 「大數字小波動」測試（Step 2b #2）過不了，而你想放寬它的門檻才能過 ——
  **那條測試就是本計畫的目的**，放寬等於做白工。回報你算出來的實際 domain 與 range。
- Y 軸刻度變成 3 根以下或 8 根以上，且你需要特例才能塞回範圍。
- 既有 9 個測試裡，除了 Step 2a 明確授權的那 2 個之外，有任何一個轉紅。

## Maintenance notes

- `niceStep` 的 1/2/2.5/5 系列是為 zh-TW 的 萬/億 讀法挑的。若之後 X 軸或其他圖也要
  整數刻度，把它抽成共用 util 再說，現在只有一個消費者。
- **審查重點**：(1) domain 頭尾是否真的等於 `yTicks` 頭尾（不等就會裁掉刻度）；
  (2)「大數字小波動」case 的斷言有沒有被放寬；(3) `DashboardRoute.tsx` 的 diff 是不是
  真的只有一行。
- **刻意沒做**：刻度數量沒有隨圖高變化（桌機 240px 與手機 160px 都用 5 根目標值）。
  手機上 5 根刻度略密但仍可讀；要做成響應式得把視窗寬度餵進純函式，代價不成比例。
  若 operator 之後嫌手機太密，那是獨立的一份小改。
