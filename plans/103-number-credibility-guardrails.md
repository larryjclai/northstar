# Plan 103: Guard absurd numbers — XIRR annualization annotation, hero % baseline floor, hero never truncates

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- src/routes/InvestmentsAnalyticsTab.tsx src/routes/DashboardRoute.tsx src/domain/dashboardSummary.ts src/domain/dashboardSummary.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED（改到 Dashboard hero 顯示邏輯，回歸面廣）
- **Depends on**: none（與 101/102 無程式碼交集…除了 DashboardRoute 極小機率的行號位移）
- **Category**: bug (comprehension / trust)
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

財務 app 的信任建立在數字可信上。2026-07-02 以示範資料實測發現三個「數字正確、
但呈現方式摧毀信任」的問題：

1. 分析分頁顯示「年化 XIRR **+5579.7%**」— 31 天的紀錄被年化成天文數字。
   `XIRR_MIN_DAYS = 30` 的 gate 只擋 <30 天，擋不住 30–365 天的年化爆表。
2. Dashboard hero 顯示「+735,993 · **570.24%**」— 淨值序列的起點接近零時，
   百分比變化無意義（且淨值含入金，% 本來就偏高估）。
3. Hero 淨值在中等寬度被 `text-overflow: ellipsis` 截斷成「TWD 86...」—
   全 app 最重要的數字不可讀。

## Current state

### A. XIRR 顯示（`src/routes/InvestmentsAnalyticsTab.tsx`）

計算 memo（295–315 行）— gate 在 310 行，span 算完即丟，沒傳給顯示層：

```tsx
// InvestmentsAnalyticsTab.tsx:308-315
    if (allCashflows.length === 0) return { xirr: null, gated: true };
    const span = cashflowSpanDays(allCashflows, end);
    if (span < XIRR_MIN_DAYS) return { xirr: null, gated: true };
    const lastValue = fullSeriesResult.series.length > 0 ? fullSeriesResult.series[fullSeriesResult.series.length - 1].value : 0;
    const terminal = { date: end, amount: lastValue };
    const xirr = calculateXirr(allCashflows, terminal);
    return { xirr, gated: false };
  }, [records, end, fullSeriesResult]);
```

顯示區塊（620–644 行）：

```tsx
// InvestmentsAnalyticsTab.tsx:623-635
          {[
            {
              l: "期間 TWR",
              sub: "剔除進出金影響",
              v: twrResult.twrPct,
              help: "時間加權報酬：衡量持倉本身的表現，不受你加碼/減碼時點影響。",
            },
            {
              l: "年化 XIRR",
              sub: "全期間 · 考慮金流時間",
              v: xirrResult.gated ? null : xirrResult.xirr != null ? xirrResult.xirr * 100 : null,
              help: "金額加權年化報酬：涵蓋你有紀錄以來的所有金流，不隨上方期間切換而改變，反映實際的資金成果。",
            },
          ].map((s, i) => (
```

相關 domain（**不要改**）：`src/domain/portfolioMetrics.ts` —
`XIRR_MIN_DAYS = 30`（247 行）、`cashflowSpanDays(cashflows, asOf)`（253 行）、
`calculateXirr`（270 行）。

### B. Hero 百分比（`src/routes/DashboardRoute.tsx`）

兩個 memo 各自算 `pct`，皆只防 `startValue !== 0`：

```tsx
// DashboardRoute.tsx:419-423 (rangeView)
    const startValue = points[0].value;
    const endValue = points[points.length - 1].value;
    const change = endValue - startValue;
    const pct = startValue !== 0 ? (change / Math.abs(startValue)) * 100 : 0;
    return { points, change, pct };
```

```tsx
// DashboardRoute.tsx:434-439 (longView)
    const smoothed = smoothTrend(rangeView.points, { window: LONG_VIEW_WINDOW });
    const startValue = smoothed[0].value;
    const endValue = smoothed[smoothed.length - 1].value;
    const change = endValue - startValue;
    const pct = startValue !== 0 ? (change / Math.abs(startValue)) * 100 : 0;
    return { points: smoothed, change, pct };
```

（399–402 行的 `All` 分支還有第三處同型 `pct` 計算，一併處理。）

顯示（Badge，865–872 行）：

```tsx
// DashboardRoute.tsx:867-871
<Badge variant={momChange >= 0 ? "success" : "error"} className="gap-1 rounded-full px-2">
  {momChange >= 0 ? <ArrowUp size={11} weight="bold" /> : <ArrowDown size={11} weight="bold" />}
  <span className="num">{momChange >= 0 ? "+" : "−"}{formatNumber(Math.abs(momChange))} · {Math.abs(momPct).toFixed(2)}%</span>
</Badge>
```

### C. Hero 截斷（`src/routes/DashboardRoute.tsx:855-863`）

```tsx
<div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
  <span style={{
    fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums lining-nums",
    fontSize: "clamp(28px, 4vw, 56px)", letterSpacing: "-0.025em", fontWeight: 600,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
    flexShrink: 1,
  }}>
    {activeMetric.display}
  </span>
```

父容器已有 `flexWrap: "wrap"` — 問題出在 span 自己 `flexShrink: 1` + ellipsis，
被同列的 Badge 擠壓時先被截斷而不是換行。

### 慣例

- 財務語意已鎖定（AGENTS.md invariant 1）：**不改任何計算**，只改顯示與註解。
- domain 函式加測試的範本：`src/domain/dashboardSummary.test.ts`（既有檔）。
- 警示色 token：`var(--ns-warn)`。

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `npx tsc`                            | exit 0              |
| Tests     | `npm test`                           | all pass            |
| 單檔測試  | `npx vitest run src/domain/dashboardSummary.test.ts` | pass |
| Lint      | `npm run lint`                       | exit 0              |
| Dev shell | `npm run dev`                        | :5173（手動驗證）  |

## Scope

**In scope** (the only files you should modify):
- `src/routes/InvestmentsAnalyticsTab.tsx`
- `src/routes/DashboardRoute.tsx`
- `src/domain/dashboardSummary.ts`（新增一個純函式）
- `src/domain/dashboardSummary.test.ts`（新增測試）

**Out of scope** (do NOT touch, even though they look related):
- `src/domain/portfolioMetrics.ts` — `XIRR_MIN_DAYS`、`calculateXirr`、
  `cashflowSpanDays` 的語意是鎖定的財務決策，不改。
- `src/domain/portfolioAnalytics.ts`（`MIN_ANALYTICS_DAYS`）— 風險指標的 gating
  已有揭露文案，本計劃不動。
- TWR 的計算與顯示。
- 圖表本身（AreaChart 等）。

## Git workflow

- Branch: `fix/ai-number-credibility`
- Commit style: conventional commits，例：`fix(analytics): annotate short-span XIRR annualization`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: domain — 新增 `changePctWithFloor`

在 `src/domain/dashboardSummary.ts` 新增（照該檔既有 JSDoc 風格）：

```ts
/**
 * Percent change guarded for tiny baselines. Returns null when the start
 * value is too small (|start| < floorRatio × |end|) for a percentage to be
 * meaningful — e.g. a fresh ledger whose net worth starts near zero would
 * otherwise show +570% for a month of ordinary deposits.
 */
export function changePctWithFloor(
  start: number,
  end: number,
  floorRatio = 0.2,
): number | null {
  if (start === 0) return null;
  if (Math.abs(start) < Math.abs(end) * floorRatio) return null;
  return ((end - start) / Math.abs(start)) * 100;
}
```

**Verify**: `npx tsc` → exit 0。

### Step 2: domain 測試

在 `src/domain/dashboardSummary.test.ts` 加一組 `describe("changePctWithFloor")`，
照檔內既有 describe/it 結構，至少涵蓋：

- 正常基期：`changePctWithFloor(100, 110)` → `10`（誤差 1e-9）
- 下跌：`changePctWithFloor(100, 90)` → `-10`
- 零基期：`changePctWithFloor(0, 500)` → `null`
- 基期過小：`changePctWithFloor(1000, 865000)` → `null`
- 剛好在門檻上：`changePctWithFloor(200, 1000)` → 非 null（0.2 × 1000 = 200，
  `<` 不含等於）
- 負基期（負淨值）：`changePctWithFloor(-1000, -900)` → `10`

**Verify**: `npx vitest run src/domain/dashboardSummary.test.ts` → 全 pass。

### Step 3: DashboardRoute 三處 pct 換用新函式

`import { changePctWithFloor } from "../domain/dashboardSummary";`（併入既有
dashboardSummary import）。三處（402、422、438 行）改為：

```ts
const pct = changePctWithFloor(startValue, endValue);
```

（`All` 分支的 `first`/`last` 同樣替換。）`rangeView`/`longView` 的回傳型別
變成 `pct: number | null`；沿著 `momPct` 修 TypeScript 錯誤到顯示層為止。

**Verify**: `npx tsc` → exit 0。

### Step 4: Badge 顯示容忍 null

865–872 行的 Badge：`momPct` 為 null 時只顯示金額差，不顯示「· xx.xx%」：

```tsx
<span className="num">
  {momChange >= 0 ? "+" : "−"}{formatNumber(Math.abs(momChange))}
  {momPct != null ? <> · {Math.abs(momPct).toFixed(2)}%</> : null}
</span>
```

檔內若還有其他讀 `momPct`/`rangeView.pct` 的地方（`grep -n "momPct\|\.pct" src/routes/DashboardRoute.tsx`），
逐一讓它容忍 null（顯示 `—` 或省略），**不要**用 `?? 0` 掩蓋。

**Verify**: `npx tsc` → exit 0；`npm test` → pass。

### Step 5: Hero 不再截斷

856–863 行的 span 樣式：移除 `overflow: "hidden", textOverflow: "ellipsis",
whiteSpace: "nowrap", maxWidth: "100%"`，把 `flexShrink: 1` 改為 `flexShrink: 0`，
並加 `whiteSpace: "nowrap"`（數字本身不折行，靠父層 flexWrap 讓 Badge 掉到下一行）。

**Verify**: `npm run dev` → 進 demo 模式，視窗調到約 800px 寬：hero 顯示完整
`TWD 865,061`（不出現「…」），Badge 換行到數字下方。375px 寬同樣完整。

### Step 6: XIRR 短跨度註解

`InvestmentsAnalyticsTab.tsx`：

1. 295–315 行的 memo 回傳值加 `spanDays`：`return { xirr, gated: false, spanDays: span }`
   （gated 分支回傳 `spanDays: null` 或實際 span，型別一致即可）。
2. 623–635 行的陣列元素改為動態 `sub` 與新增 `subTone`：XIRR 那項在
   `xirrResult.spanDays != null && xirrResult.spanDays < 365` 時
   `sub: \`年化自 ${xirrResult.spanDays} 天紀錄推算，僅供參考\``、`subTone: "warn"`；
   否則維持 `sub: "全期間 · 考慮金流時間"`。
3. 渲染 `sub` 的元素（map 內；找 `{s.sub}`）在 `s.subTone === "warn"` 時
   `color: "var(--ns-warn)"`。

**不改** 310 行的 `span < XIRR_MIN_DAYS` gate 行為。

**Verify**: `npx tsc` → exit 0；`npm run dev` → demo 模式 → 投資 → 分析：
XIRR 卡顯示大數字 + 橘色「年化自 N 天紀錄推算，僅供參考」副標。

## Test plan

- 新測試：Step 2 的 `changePctWithFloor` 六個 case（範本：同檔既有 describe）。
- 回歸：`npm test` 全綠 — 特別留意 `dashboardSummary.test.ts` 既有測試不受影響。
- 手動：Step 5、Step 6 的 dev-shell 驗證（demo 模式資料跨度約 31 天，恰好落在
  警示區間，能直接看到效果）。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc` exits 0
- [ ] `npm test` exits 0，含 ≥6 個新的 `changePctWithFloor` 測試
- [ ] `npm run lint` exits 0
- [ ] `grep -n "textOverflow" src/routes/DashboardRoute.tsx` 在 hero 區（850–870 行帶）無輸出
- [ ] `grep -n "spanDays" src/routes/InvestmentsAnalyticsTab.tsx` ≥2 處（memo 回傳 + 顯示）
- [ ] `git status` 只含 in-scope 檔案
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 摘錄與現場不符（drift）。
- `momPct`/`.pct` 的 null 傳播牽出超過 DashboardRoute 單檔的型別錯誤
  （代表 pct 被別的模組消費 — 回報消費點清單）。
- 你發現自己在改 `portfolioMetrics.ts` 或任何計算公式 — 那是越界，收手回報。
- Step 5 改完後 hero 在 1440px 桌面反而換行或版面破壞。

## Maintenance notes

- `floorRatio = 0.2` 是產品判斷（基期小於期末 20% 時 % 不可信），不是數學常數；
  若之後有使用者反映「% 不見了」，調整入口就在這一個參數。
- 未來若 hero 支援更大金額（億級），`clamp(28px, 4vw, 56px)` + `flexShrink: 0`
  可能在 375px 溢出 — 屆時的正解是 compact 格式 fallback（`formatCompactMoney`），
  不是恢復 ellipsis。
- XIRR 註解的 365 天門檻：跨度滿一年後年化即有意義，與 `XIRR_MIN_DAYS`（可算門檻）
  是兩層不同的東西 — reviewer 別把它們合併。
