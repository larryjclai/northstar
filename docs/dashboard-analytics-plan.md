# Dashboard 圖表強化 + 投資「分析」分頁 — 執行計劃

對應設計稿：`Design System/northstar-dashboard2.jsx`、`Design System/northstar-analytics.jsx`
（即附件 `Northstar app _ clickable.html`、`Holdings _ Analytics tab _.html`）

## 0. 已拍板的決策

| 決策 | 結論 |
| --- | --- |
| Benchmark 資料來源 | 預設 `0050.TW`，可在設定調整；進 Analytics 時自動回補其歷史收盤 |
| Analytics 範圍 | 完整 4 區塊（KPI 風險帶 / Portfolio vs Benchmark / 配置漂移 / 滾動波動率） |
| Dashboard Strip | 淨值圖加期間選擇器；strip 顯示「投資組合報酬 vs benchmark / Alpha」 |
| 資料不足處理 | Gate + 提示回補（與既有 XIRR gating 行為一致） |

## 1. 設計原則 / 重用

- **圖表**：一律用既有的 `recharts`（面積、堆疊面積、線圖）＋既有的 div-bar pattern（Top Movers / 預算條）。不引入新套件。
- **版面**：用 COSS UI 的 `Card` / `Button` / `Badge` / `SegmentedControl`。
- **資料地基**：重用 `InvestmentsRoute.tsx` 內現成但未使用的 `buildPerformanceTrend()`（產生「投資市值的歷史序列」），把它抽到 domain 層成為共用引擎，Dashboard 與 Analytics 共享。
- **正確性標注**：`buildPerformanceTrend` 使用「當前持股數 × 歷史價」＝固定權重回看視圖，非真正時間加權報酬。所有衍生的風險指標沿用此近似，並在 UI 以註記說明。

## 2. 資料層

### 2.1 Benchmark ticker 偏好
- 存於 `src/state/uiPreferences`（zustand + localStorage），新增 `benchmarkTicker`（預設 `"0050.TW"`）。
  - 理由：避免動到已同步的 `settings` 表（migration + sync schema，見記憶中的 sync gotchas）。
- 設定頁（`SettingsRoute`）新增一個輸入框：「投資 benchmark 指標」，用既有 `TickerSearchField`。

### 2.2 Benchmark 歷史回補
- 進入 Analytics 分頁時，若 `dailyPrices` 沒有 benchmark ticker 的足量資料 → 用既有 `useRefreshDailyPrices().mutateAsync({ tickers:[benchmark], range:"1y" })` 回補（dailyPrices 以 ticker 為鍵，不需是持股）。
- 失敗或無資料 → 隱藏 benchmark 線與 Alpha，只畫 portfolio。

## 3. 新增 domain 模組：`src/domain/portfolioAnalytics.ts`（純函式 + 測試）

把 `buildPerformanceTrend` 的核心移入並擴充。對外輸出：

| 函式 | 用途 |
| --- | --- |
| `buildPortfolioValueSeries(...)` | 由 dailyPrices/manual snapshots 算出每日投資市值序列（重構自 buildPerformanceTrend） |
| `toReturnSeries(values)` | 市值序列 → 日報酬序列 |
| `cumulativeReturn(values)` | 期間累積報酬 %（給 strip / Portfolio vs Benchmark） |
| `annualizedVolatility(returns)` | 年化波動率（σ×√252） |
| `sharpeRatio(returns, rf)` | Sharpe（rf 預設 2.5% 常數） |
| `sortinoRatio(returns, rf)` | Sortino（下檔 σ） |
| `maxDrawdown(values)` | 最大回撤 % + 起訖日 + 是否已恢復 |
| `rollingVolatility(returns, window=30)` | 30 日滾動年化波動序列 |
| `allocationDriftSeries(...)` | 各資產類別市值佔比隨時間（堆疊面積用） |
| `topMovers(quotes, assets)` | 由 `quote.changePercent` 取當日漲跌幅排序（最佳→最差） |
| `MIN_ANALYTICS_DAYS` | 風險指標 gating 門檻（比照 `XIRR_MIN_DAYS=30`） |

- 對應單元測試 `portfolioAnalytics.test.ts`：固定輸入驗證 vol / Sharpe / Sortino / maxDrawdown / cumulativeReturn 數值，及 gating 邊界。

## 4. Dashboard 變更（`src/routes/DashboardRoute.tsx`）

1. **淨值圖期間選擇器**：加 `SegmentedControl` `1W/1M/3M/YTD/1Y`，裁切 `trend` 區間（淨值圖本身仍畫淨值）。
2. **Portfolio Strip**（淨值卡底部，3 格）：用 `buildPortfolioValueSeries` 算「投資組合」在選定期間的累積報酬、benchmark 報酬、Alpha；綁定同一期間選擇器。資料不足 → 顯示「—」＋小提示。
3. **Top Movers 卡**（Row 3，現有 配置/目標/匯率 旁新增第 4 欄，`ns-dash-row3` 改 4 欄）：`topMovers()` 真實當日漲跌幅，div diverging bar，點擊 → `/holdings/$ticker`。空狀態：提示「更新報價」。

## 5. 投資「分析」分頁（`src/routes/InvestmentsRoute.tsx`）

1. tab 由 3 → 4：`持倉 / 交易紀錄 / 定期定額 / 分析`。
2. 新建 `src/routes/InvestmentsAnalyticsTab.tsx`，4 區塊：
   - **風險 KPI 帶**（4 卡）：年化波動 / Sortino / Sharpe / 最大回撤，各帶 recharts 迷你 sparkline。期間切換重算。
   - **Portfolio vs Benchmark**：recharts 面積圖（portfolio 累積報酬 vs benchmark），上方 3 格摘要（Portfolio / Benchmark / Alpha）＋期間 `3M/6M/YTD/1Y/ALL`。
   - **資產配置漂移**：recharts 堆疊面積（`allocationDriftSeries`，依類別；之後可加 by region）。
   - **30 日滾動波動率**：recharts 線/面積圖（`rollingVolatility`），含當前/均值/峰值摘要與閾值線。
3. 廢棄 / 吸收現有未用的 `PerformanceTab`（改用共用引擎）。
4. 每區塊 gating：歷史資料 < `MIN_ANALYTICS_DAYS` → `EmptyState` ＋「回補 1Y 歷史股價」CTA（重用既有回補函式）。

## 6. i18n / 樣式

- 文案 zh-TW first（沿用「英文 eyebrow + 中文標題」慣例）。
- 顏色用 `--ns-chart-*`、`--ns-pos/neg/accent` token；mono 數字 `var(--ns-font-mono)` + `tabular-nums`。

## 7. 階段與檔案

**Phase 1 — domain 引擎**：`portfolioAnalytics.ts` ＋ 測試（先綠）。
**Phase 2 — Dashboard**：期間選擇器 + Portfolio Strip + Top Movers。
**Phase 3 — Analytics 分頁**：新 tab + 4 區塊 + gating + benchmark 回補。
**Phase 4 — 設定**：benchmark ticker 偏好 + 設定頁輸入。
**Phase 5 — 驗證**：`npm run build` / 測試 / preview 截圖（含淺色/深色、手機 RWD card-stack）。

新增：`src/domain/portfolioAnalytics.ts`、`portfolioAnalytics.test.ts`、`src/routes/InvestmentsAnalyticsTab.tsx`
修改：`DashboardRoute.tsx`、`InvestmentsRoute.tsx`、`SettingsRoute.tsx`、`uiPreferences`、`src/styles`（grid 欄數）

## 8. 風險 / 待觀察

- 固定權重近似（非時間加權）— 已標注。
- benchmark 回補增加一次 Yahoo 查詢；失敗則優雅降級。
- 滾動波動率需要連續每日資料；缺口以「最近收盤」前補（沿用 `latestPriceOnOrBefore`）。
