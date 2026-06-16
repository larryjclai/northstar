# Northstar — FinTech UX / Data-Viz / Product Gap Audit

> Read-only 審查，產出修正計畫，**未改動任何程式碼**。
> 對應 commit：`8b2302d1`　審查日期：2026-06-16
> 方法：先讀 `DESIGN.md` / `PRODUCT.md` / `docs/dashboard-analytics-plan.md` / `docs/coss-ui-migration-plan.md` / `plans/README.md`（既有 B-清單與已駁回項），再用 4 組平行 read-only agent 盤點各圖表頁，最後逐筆回讀程式碼驗證。
> 工具：`/improve`（審查框架 + 去重）＋ `/impeccable`（前端認知負荷 / 視覺層級 / 狀態完整性）。

**邊界**：財務計算語意（移動平均成本、XIRR、現金基礎淨值、capital-reduction 等）為 locked，本報告只評論「呈現方式」，不改「定義」。所有「新增 component」建議都已對照 COSS UI 遷移方向。

**去重標註**：【新】= 本次新發現；【漂移】= 與既有計畫/文件不一致；【既知】= 已在 B-清單/plans 內。

---

## 總結

1. **狀態完整性是全站系統性缺口（最大問題）。** 沒有任何資料頁檢查 query 的 `isLoading`/`isError`；所有頁面一律 `data ?? []` 先渲染空殼再「跳出」資料，且 router 無 error boundary、query 失敗完全靜默。對一個「要先建立信任」的理財 App，這是優先級最高的一類。

2. **Analytics 的「固定權重近似」caveat 沒有出現在 UI。** `dashboard-analytics-plan.md` §1 明文要求「在 UI 以註記說明」，但實際畫面零註記——報酬率與風險指標（波動/Sharpe/Sortino/最大回撤）都在沒有方法論說明下呈現。這是**計畫漂移 + 信任風險**，不是計算錯誤。

3. **圖表「同題多答」散落多處，缺乏單一權威視圖與 drill-down 串接。** 配置出現在 3 種圖（donut／treemap／類別 bar）、未實現損益出現在 3 個頁面、分類明細同時存在 tab 版與獨立 route 版，彼此不導引、不下鑽。

4. **認知負荷集中在 CashFlow 與 Analytics。** CashFlow 一頁塞 6 圖 + 7 張 KPI 卡、類別 bar 不設上限（全列出）；Analytics 風險指標把術語藏在 13px Info icon 後、sparkline 太小。重點不會「一眼看懂」。

5. **可行動性斷點。** 多個圖表看完不知下一步：圓餅切片不可點、CashFlow top-merchant 卡沒有 detail 連結、FIRE 退休收入加了卻不反映在曲線、目標進度沒有「超前/落後」狀態。

---

## 高優先級問題

### P1 — 狀態完整性：缺 loading / error state（全站系統性）【新】
- **位置**：`src/routes/*`（10+ 頁，皆同模式）；`src/routes/router.tsx`（無 error boundary）
- **問題**：全 routes 唯一的 `isPending` 在 `InvestmentsRoute.tsx:340`，且是 mutation（回補）；沒有任何 query 的 `isLoading`/skeleton。資料用 `data ?? []` fallback，初次載入渲染空圖表/0 值再突然跳出。query error 從不檢查（無 `isError`），失敗時畫面沉默。
- **影響**：冷啟動/慢同步時，使用者先看到「空的或 0 的財務畫面」，再看到數字跳動——對理財 App 是信任傷害；資料抓取失敗時完全無回饋，使用者以為「我沒有資料」。
- **建議修法**：(a) 新增共用 `Skeleton` 卡片骨架（COSS 層目前只有 `spinner`，無 skeleton）；資料頁在 query pending 時顯示骨架。(b) router 加 `errorComponent` + 卡片層級 error state（重試 CTA）。(c) 約定：所有 `useQuery` 消費點處理 loading/error 三態。
- **DS 解法**：需**新增 1 個 component（Skeleton）**＋ router error 區塊；其餘用既有 `EmptyState` + `Button`。與 COSS 遷移相容（Skeleton 是 COSS 缺的基礎件，值得補進 `components/coss/`）。

### P1 — Analytics 缺「固定權重近似」caveat（計畫漂移）【漂移】
- **位置**：`src/routes/InvestmentsAnalyticsTab.tsx`（期間報酬 hero ~499、TWR/XIRR ~571、風險 KPI 帶 ~762–815）；對照 `docs/dashboard-analytics-plan.md` §1「並在 UI 以註記說明」
- **問題**：grep 全檔無「固定/近似/權重/非時間加權」等註記字串。報酬與風險指標皆以「固定當前持股 × 歷史價」的回看近似計算，但畫面未告知；使用者期間中加碼/減碼會誤讀。
- **影響**：違反 PRODUCT.md 原則 #3「計算必須可解釋」；數字看似精確實為近似，是信任風險。
- **建議修法**：在 Analytics 區塊頂部或風險帶加一行 caveat（沿用既有 `MetricHelp`/Info tooltip pattern，並至少一處常駐文字）。文案 zh-TW。
- **DS 解法**：**完全用既有**（既有 Info/MetricHelp + caption 文字 token）。低成本。

### P1 — 風險指標術語無常駐說明、sparkline 過小【新】
- **位置**：`InvestmentsAnalyticsTab.tsx:762–815`（波動/Sortino/Sharpe/最大回撤），Info icon `size=13`（~1092），`Sparkline width=60`（~180）
- **問題**：Sortino/Sharpe 等術語的白話解釋藏在 13px hover icon 後（行動裝置無 hover），sparkline 60×26px 幾乎看不出趨勢。
- **影響**：目標用戶是「長期投資人、非交易員」（PRODUCT/.impeccable），術語門檻高卻不可發現 → 區塊變裝飾。
- **建議修法**：KPI 卡加一行常駐 micro-caption（「每單位下跌風險的超額報酬」），sparkline 放大或改用 KPI 下方迷你條；保留 Info 補充細節。
- **DS 解法**：用既有 token / caption；sparkline 尺寸調整。無需新 component。

### P2 — 分類明細頁重複：`CategoriesTab` vs `CategoriesRoute`【新】
- **位置**：`CashFlowRoute.tsx:1151`（tab 版 `CategoriesTab`）＋ `router.tsx:69`（獨立 route `/cash-flow/categories` → `CategoriesRoute`）
- **問題**：兩者都渲染近乎相同的「donut + 摘要卡 + 類別表」。兩份程式碼會各自漂移，且使用者依入口看到兩種版本（4 卡 vs 3 卡、互動行為不一致）。
- **影響**：維護重工 + 體驗不一致；可能其中一個已是孤兒路由。
- **建議修法**：先確認 `CategoriesRoute` 是否仍有入口連結；保留一個（建議 tab 版為輕量元件，獨立 route 作為 deep-link 容器復用同元件），刪除/合併另一個。
- **DS 解法**：用既有；屬重構不新增。

### P2 — CashFlow 類別 bar 不設上限（全部列出）【新】
- **位置**：`CashFlowRoute.tsx:1013` 起，資料源 `allCategorySpend`（map 全部類別）
- **問題**：類別多時 bar list 無限延長；而 `MerchantsTab` 已有「Top 5 + 其他」收斂模式，兩者不一致。
- **影響**：資訊密度失控，重點被稀釋。
- **建議修法**：套用「Top N + 其他」（與 merchants 一致），其餘可展開。
- **DS 解法**：用既有 div-bar pattern。

### P2 — 可行動性斷點（圓餅不可點 / 卡片無下鑽 / 圖不反映輸入）【新】
- **位置**：`MerchantsTab.tsx`（top-5 pie「其他」不可點，~47）、`CategoriesRoute.tsx` donut（不可導航，表格才可）、`CashFlowRoute.tsx:1143`（top-merchant 卡無 detail 連結）、`FIRECalculatorRoute.tsx:349–435`（退休收入項不影響曲線）
- **問題**：看完無下一步；圓餅/卡片缺 click-through，FIRE 收入輸入無視覺回饋。
- **影響**：drill-down 體驗破碎，使用者被困在概覽層；FIRE 收入區看似可調卻無感。
- **建議修法**：圓餅切片/卡片可點導向 detail route（與表格列一致）；FIRE 退休收入以堆疊層或第二軸反映在曲線。
- **DS 解法**：導航用既有（`Button render={<Link/>}` / recharts onClick）；FIRE 曲線疊加為中度開發。

### P2 — i18n：內容頁殘留英文 label（非 eyebrow）【新】
- **位置**：`DashboardRoute.tsx:953`(`Alpha`)、`:1036`(`Gainers`)、`:1037`(`Losers`)；`InvestmentsRoute.tsx:1268`(`Ticker`)；`CashFlowRoute.tsx:1082`(`Recent activity`)、`:1083`(`{n} events`)；`HoldingDetailRoute.tsx:302`(`Your position`)、`:179`(assetType fallback `"Asset"`)
- **問題**：zh-TW first App 的卡片標題/欄位/指標 label 殘留英文（已排除「英文 eyebrow」此一刻意慣例，例如 `Long-term progress` 不列入）。
- **影響**：與全站中文不一致，降低成品感。
- **建議修法**：改中文（`Alpha→超額報酬`、`Gainers/Losers→漲幅最大/跌幅最大`、`Ticker→代號`、`Recent activity→近期動態`、`Your position→你的部位`、fallback `Asset→資產`）。
- **DS 解法**：純文案。可走 `copy.csv` 流程。

### P2 — AccountsRoute：無搜尋/篩選、空狀態下淨值卡顯示「−0」【新】
- **位置**：`AccountsRoute.tsx`（帳戶列表 ~295–390 無 filter；balance 卡 ~248–265 無資料時仍渲染 `−0`）
- **問題**：帳戶多時無搜尋/型別篩選；零帳戶時資產負債卡顯示混淆的 `−0`。
- **影響**：管理多帳戶困難；空狀態觀感差。
- **建議修法**：加帳戶搜尋/型別篩選；空狀態隱藏 balance 卡或顯示引導。
- **DS 解法**：用既有 `CategoryFilter`/`AppSelect` 模式 + `EmptyState`。

---

## 圖表重複與合併建議

| 重複/同題 | 位置 | 建議 |
|---|---|---|
| 分類明細整頁重複 | `CategoriesTab` + `CategoriesRoute` | **合併**為單一元件，route 僅作 deep-link 容器（見 P2） |
| 資產配置 3 種表述、互不串接 | InvestmentsRoute donut(~901) / Analytics treemap(~1394) / sector bars(~863) | **保留各自層級但加 drill-down**：sector bar → 該類別持股；treemap 作主視圖，donut 降級為 dashboard 小卡 |
| 未實現損益顯示 ≥3 處 | InvestmentsRoute KPI(~381) / Analytics hero(~499) / HoldingDetail(~301) | 不必刪（情境不同），但**統一加 caveat**、確保口徑一致（見 P1 caveat） |
| Analytics 期間報酬 hero vs Portfolio-vs-Benchmark 線圖 | `InvestmentsAnalyticsTab.tsx:499` vs `:649` | hero 數字保留為摘要，線圖保留為比較；**確保同一數來源**避免使用者對不上 |
| 風險 4-KPI vs 滾動波動率圖 | `:762` vs `:1131` | 互補，**不合併**；但 KPI sparkline 已暗示趨勢，滾動圖可預設收合（目前已是 toggle，OK） |
| Dashboard 淨值變化% vs Portfolio Strip 報酬% | `DashboardRoute.tsx:572` vs `:951` | 易混淆，**加 label 區分**（「淨值」含現金負債、「投組報酬」僅持股） |

---

## 缺失功能清單

| 功能/狀態 | 現況 | 優先級 |
|---|---|---|
| Loading skeleton（資料頁三態） | 完全缺（僅 1 處 mutation pending） | **P1** |
| Query error UI + router error boundary | 完全缺，失敗靜默 | **P1** |
| Analytics 方法論 caveat（固定權重近似） | 計畫要求但 UI 缺 | **P1** |
| 風險指標常駐白話說明 | 藏在 13px hover icon | P2 |
| 圓餅/卡片 click-through 下鑽 | 多處缺 | P2 |
| 帳戶搜尋/篩選 | 缺 | P2 |
| 類別 bar Top-N 收斂 | 缺（全列出） | P2 |
| 目標進度「超前/落後」狀態 | 只有百分比 | P3 |
| FX 匯率變化方向/sparkline | 只有裸數字 | P3 |
| HoldingDetail「無未平倉/無交易」空訊息 | 靜默不渲染 | P3 |
| 明細頁 CSV/圖片匯出 | 按鈕 disabled（標「尚未」） | P3 |
| 類別/商家表欄位排序 | 預設排序、不可改 | P3 |
| KPI 卡視覺主次（收入/支出/儲蓄並列無重點） | 扁平等重 | P3 |
| FIRE 敏感度分析隨 slider 重算 | 目前為靜態估值，可能誤導 | P3 |

---

## 建議實作順序

務實路線，先低成本高影響：

**第一波（信任地基，低成本高影響）**
1. **P1 caveat**（純文案 + 既有 Info pattern）— 最快、直接修補信任與計畫漂移。
2. **P2 i18n 英文 label**（純文案，可走 copy.csv）— 零風險、立即提升成品感。
3. **P2 類別 bar Top-N**、**Dashboard 淨值/投組 label 區分** — 小改、降認知負荷。

**第二波（狀態完整性，中成本最高影響）**
4. **新增 `Skeleton` component**（補進 `components/coss/`，與 COSS 遷移相容）。
5. **router error boundary + 卡片 error state + query 三態**接入主要資料頁（Dashboard/Investments/CashFlow 先行）。

**第三波（重複收斂 + 可行動性）**
6. **合併 `CategoriesTab`/`CategoriesRoute`**（先確認孤兒路由）。
7. **圓餅/卡片 click-through**（導航既有，低成本）。
8. **風險 KPI 常駐 caption + sparkline 放大**、**配置圖 drill-down 串接**。

**第四波（增益，可排程）**
9. AccountsRoute 搜尋/篩選、空狀態淨值卡。
10. 目標進度狀態、FX 變化、明細空訊息、匯出、表格排序、FIRE 敏感度動態化。

---

## 已考慮但不列入（避免重複審查）
- **英文 eyebrow**（如 `Long-term progress`、`PORTFOLIO`）：DESIGN.md §3.5 明訂「英文 eyebrow + 中文 h1」為**刻意慣例**，非 bug。
- **Analytics 淺色可讀性 / HoldingDetail tooltip+markers**：已由 `plans/010`、`plans/011` 完成（DONE），不重列。
- **大量 zh-TW 硬字串**：投資頁刻意 zh-TW first（檔內註解佐證），非 i18n 遺漏；僅上列「英文 label」是真缺口。
