# NorthStar — 工程師 Handover 文件
> 更新日期：2026-05-29  
> 這份文件記錄最近兩輪設計迭代新增 / 修改的所有區塊，讓工程師不需要重讀全部 prototype。

---

## 檔案總覽

| 檔案 | 性質 | 說明 |
|---|---|---|
| `northstar-holdings-txns.jsx` | **新增** | Holdings 的 Transactions tab + Edit sheet |
| `northstar-merchant.jsx` | **新增** | Cash Flow → Merchant 詳情頁 |
| `northstar-mobile-extra.jsx` | **新增** | Mobile: Holdings Transactions + Edit bottom sheet + Merchant 詳情 |
| `northstar-desktop.jsx` | **修改** | Holdings 加 tab bar；CashFlow 加 Merchants tab；Accounts 新增帳戶按鈕連線 |
| `northstar-cashflow-detail.jsx` | **修改** | 商家欄加「View →」按鈕導向 merchant 頁 |
| `northstar-prototype.jsx` | **修改** | 路由加入 `holdings-txns` 和 `merchant` |
| `northstar-app.jsx` | **修改** | Design Canvas 加入 5 個新 artboard |
| `index.html` | **修改** | 加入兩個 `<script>` 載入新 jsx 檔 |

---

## 1. Holdings → Transactions Tab

### 入口
**Desktop**：Holdings 頁面 header 下方新增 `Portfolio | Transactions` tab bar  
路由 key：`holdings-txns` → `NSDesktopHoldingsTxns`

**Mobile**：`NSMobileHoldingsTxns`（iOS frame 內，同樣的 tab bar）

### 元件：`NSDesktopHoldingsTxns`（`northstar-holdings-txns.jsx`）
- **資料源**：`allTxnsData`（同檔頂部，15 筆 mock data，含 stock/ETF/crypto）
- **篩選 bar**：資產類別 × 交易類型 × ticker 搜尋
- **摘要 strip**：Records / Total bought / Total sold / Dividends 四格
- **月分組**：`groupTxnsByMonth()` 工具函式，每月 header 顯示小計
- **表格欄位**：Date / Asset / Type badge / Qty / Price / Fee / Total / Account / chevron
- 點任一列 → `selectedTx` state → 右側滑出 `NSInvestEditSheet`

### 元件：`NSInvestEditSheet`（同檔）
Edit sheet 功能：
- BUY / SELL / DIV / SPLIT tab 切換
- 日期、帳戶、數量、價格、手續費、備註欄位
- **FIFO 影響預覽**（BUY/SELL 時展開）：
  - BUY：顯示既有 lots + 新 lot，計算新 avg cost basis
  - SELL：顯示消耗的 FIFO lot + 已實現 P/L
- **Batch account toggle**（`BatchToggle` sub-component）：
  - 開啟後出現 checkbox list，可選多個帳戶同步建立相同交易
  - 儲存時提示「將在 N 個帳戶各新增一筆」
- Danger Zone：二次確認刪除（`confirmDelete` state）

### Mobile Edit Sheet：`NSMobileEditTxSheet`
- Bottom sheet 樣式（`borderRadius: '20px 20px 0 0'`）
- 同樣有 FIFO strip（3 格：Subtotal / +Fee / Total）
- 刪除二次確認

---

## 2. Cash Flow → Merchants Tab

### 入口
**Desktop**：Cash Flow 頁面 header 下方新增 `Transactions | Merchants` tab bar  
state：`cfTab`（`'transactions'` | `'merchants'`）

### Merchants tab 內容（`northstar-desktop.jsx` `NSDesktopCashFlow`）
- 3 格摘要：Top merchant / Most frequent / Auto-rules active
- 商家表格欄：Merchant / Category / Visits YTD / Spending YTD / Auto-rule 指示燈 / chevron
- 點任一列 → `onNavigate('merchant')`

### 元件：`NSDesktopMerchantDetail`（`northstar-merchant.jsx`）
Merchant 頁面專屬 widgets（**非重用 holding-detail 介面**）：

| Widget | 位置 | 說明 |
|---|---|---|
| Hero + breadcrumb | 頂部 | Mark + 商家名 + category pills + 麵包屑 |
| **Spending trend** | 左側主卡 | 6 月長條圖，hover 顯示月金額 & 次數；進行中月份用斜線填色 |
| **Stats card** | 右側 | Total visits / avg per visit / avg per month / last visit / accounts used |
| **Day-of-week widget** | 右側 | 7 日小長條，峰值日 accent 色 |
| **Auto-categorization rule** | 全寬 | 可開關 toggle + inline 編輯「含 UBER → 交通 › 計程車」 |
| Transaction list | 全寬 | 含 sub-filter（UberX / Uber Eats），點列進入 cf-detail |
| Related merchants | 底部 | 同分類商家卡片，可繼續點擊 |

### Mobile Merchant 頁：`NSMobileMerchantDetail`（`northstar-mobile-extra.jsx`）
- nav header（含返回鍵、rename、more）
- KPI strip 3 格
- 月消費 mini bars
- DoW 分佈 + 自動分類 toggle 並排 grid
- Transaction list（最多顯示 6 筆，有「查看全部」）

---

## 3. Cash Flow Detail → View Merchant

### 修改位置：`northstar-cashflow-detail.jsx`
- 商家欄（`editingMerchant` 區塊）：非編輯狀態時，若商家名有值，顯示 `View →` 小按鈕
- 點擊 `View →` → `onNavigate('merchant')`

---

## 4. Accounts → 新增帳戶 Flow

### 修改位置：`northstar-desktop.jsx` `NSDesktopAccounts`
- 右上角「新增帳戶」primary button 加上 `onClick={() => onNavigate('acct-add')}`
- 目標：`NSDesktopAddAccountFlow`（已在 `northstar-acct-flow.jsx`，4 步驟 side sheet）
- 路由 key：`acct-add`（`northstar-prototype.jsx` 已存在）

---

## 5. Prototype 路由表（完整）

```js
// northstar-prototype.jsx
const screens = {
  dashboard:        NSDesktopDashboardV2,
  holdings:         NSDesktopHoldings,           // Portfolio tab
  'holding-detail': NSDesktopHoldingDetail,       // 個股詳情
  'inv-add':        NSDesktopInvestAddSheet,      // Buy/Sell sheet
  'holdings-txns':  NSDesktopHoldingsTxns,       // ★ 新增
  cashflow:         NSDesktopCashFlow,            // Transactions | Merchants tabs
  'cf-detail':      NSDesktopCashFlowDetail,      // 交易詳情 + 商家 View→
  merchant:         NSDesktopMerchantDetail,      // ★ 新增
  'cf-new':         NSDesktopNewTxSheet,
  'cat-mgmt':       NSDesktopCategoryMgmt,
  accounts:         NSDesktopAccounts,            // 新增帳戶 → acct-add
  'acct-add':       NSDesktopAddAccountFlow,      // 4-step sheet
  goals:            NSDesktopGoals,
  'fire-calc':      NSDesktopFireCalc,
  connect:          NSDesktopConnect,
  settings:         NSDesktopSettingsV2,
};
```

---

## 6. Design Canvas Artboard 清單（新增）

| Artboard ID | Label | 元件 |
|---|---|---|
| `d-holdings-txns` | Holdings · All Transactions tab | `NSDesktopHoldingsTxns` |
| `d-merchant` | Cash Flow · Merchant detail | `NSDesktopMerchantDetail` |
| `m-holdings-txns` | Holdings · Transactions tab (mobile) | `NSMobileHoldingsTxns` |
| `m-merchant` | Cash Flow · Merchant detail (mobile) | `NSMobileMerchantDetail` |

---

## 7. 資料結構備忘

### `allTxnsData`（`northstar-holdings-txns.jsx`）
```js
{
  id, date,       // 'YYYY-MM-DD'
  asset,          // ticker symbol
  assetName,      // 顯示名
  assetClass,     // 'stock' | 'etf' | 'crypto'
  side,           // 'BUY' | 'SELL' | 'DIV' | 'SPLIT'
  qty, price,     // 數量 & 單價
  total,          // 總金額 (qty × price)
  fee,            // 手續費
  acc,            // 帳戶名
  color,          // chart color token
}
```

### `merchantMonthlyData` / `merchantTxns` / `dowBreakdown`（`northstar-merchant.jsx`）
三個 mock data arrays，`NSMobileMerchantDetail` 和 `NSDesktopMerchantDetail` 共用。  
若日後抽成 API，這三個對應：`GET /merchants/:id/monthly-stats`、`GET /merchants/:id/transactions`、`GET /merchants/:id/dow-stats`

---

---

## 9. 第二輪迭代：Cash Flow 分析系統整合

### 9.1 Cash Flow 3-tab 重組

**修改位置**：`northstar-desktop.jsx` → `NSDesktopCashFlow`

Tab 由 2 個改為 3 個：
```
Transactions  →  (不變)
分類           →  ★ 新增 (分析用，非設定)
Merchants     →  (不變，往右移)
```

State: `cfTab: 'transactions' | 'categories' | 'merchants'`

**同時移除**頂部工具列的「分類」按鈕（已被 tab 取代）。  
分類管理（CRUD）入口改至：分類 tab 右上角齒輪 → `onNavigate('cat-mgmt')`

---

### 9.2 分類 Tab 內容（`NSDesktopCashFlow` 內部）

`cfTab === 'categories'` 時渲染：

| 區塊 | 說明 |
|---|---|
| Summary strip (3 格) | 最大支出分類 / 交易最多分類 / 未分類筆數 |
| 左欄：`NSDonut` | 各分類佔比甜甜圈 + 顏色 legend |
| 右欄：分類表格 | icon+name / 筆數 / YTD / 佔比 badge / Top merchant |
| 點擊任一 row | → `onNavigate('cat-detail')` |
| 齒輪 icon | → `onNavigate('cat-mgmt')` |

分類 mock data 定義在 `NSDesktopCashFlow` 函式內：`cfCats` array（6 筆：食物/交通/訂閱/雜貨/居家/其他）

---

### 9.3 Category Detail 頁面

**新增檔案**：`northstar-category-detail.jsx`  
**路由 key**：`cat-detail` → `NSDesktopCategoryDetail`

#### 頁面佈局

```
[Breadcrumb: Cash Flow → 分類 → 交通]
[Hero: emoji + 分類名 + sub-cat pills + 管理分類 / Export buttons]
[KPI strip: YTD 總支出 / 交易筆數 / 月均支出 / 佔總支出%]

[Grid 1.55fr | 1fr]
  Left:
    Monthly trend bars（6 個月，進行中月份斜線填色）
    Sub-category breakdown（水平進度條，4 個子分類）
  Right:
    Stats card（每筆均消 / 最高單月 / YTD vs 去年 / 使用帳戶數）
    Day-of-week 分布圖
    Top merchants in this category（可點擊 → merchant）★ 商家互連

[全寬 Transaction list]
  Sub-cat filter pills（全部 / 計程車 / 大眾運輸 / 外送 / 其他）
  點擊任一筆 → cf-detail
```

#### 獨有 widgets（與 Merchant detail 的差異）

| Widget | Category Detail | Merchant Detail |
|---|---|---|
| Sub-cat breakdown bars | ✓ **獨有** | — |
| Top merchants list（可互連）| ✓ **獨有** | — |
| DoW 分布 | ✓ 共用 | ✓ 共用 |
| Monthly trend bars | ✓ 共用 | ✓ 共用 |
| Auto-rule toggle | — | ✓ **獨有** |
| Related merchants | — | ✓ **獨有** |

---

### 9.4 雙向互連

| 來源 | 目標 | 方式 |
|---|---|---|
| Category Detail → Top merchants | Merchant Detail | 點 merchant row → `onNavigate('merchant')` |
| Merchant Detail → 所屬分類 | Category Detail | Hero pills 區的「🚗 交通 分類 →」小按鈕 → `onNavigate('cat-detail')` |

**修改位置（Merchant → Category）**：`northstar-merchant.jsx`  
Hero 中原有 `<span className="ns-pill"><span>交通</span></span>` 改為  
`<button onClick={() => onNavigate('cat-detail')}>🚗 交通 分類 ›</button>`

---

### 9.5 Mobile Category Detail

**元件**：`NSMobileCategoryDetail`（`northstar-category-detail.jsx` 底部）

佈局：
- Nav header（返回 + 齒輪 → cat-mgmt）
- KPI 3 格
- 月趨勢 mini bars
- 子分類水平條 + DoW（2 欄 grid）
- Top merchants 清單（可點 → merchant）
- Transaction list（sub-cat filter pills 可橫向捲動）

---

### 9.6 更新後路由表

```js
const screens = {
  ...
  cashflow:     NSDesktopCashFlow,   // ← tab 由 2 改為 3，Transactions | 分類 | Merchants
  merchant:     NSDesktopMerchantDetail,  // ← Hero 加「查看分類」互連按鈕
  'cat-detail': NSDesktopCategoryDetail,  // ★ 新增
  'cat-mgmt':   NSDesktopCategoryMgmt,   // (不變，從分類 tab 齒輪進入)
  ...
};
```

---

### 9.7 新增 Artboards

| Artboard ID | Label | 元件 |
|---|---|---|
| `d-cat-detail` | Cash Flow · Category detail | `NSDesktopCategoryDetail` |
| `m-cat-detail` | Cash Flow · Category detail (mobile) | `NSMobileCategoryDetail` |

---

## 10. 已知 TODO（設計未完成項）

- [ ] Mobile: Cash Flow 主頁的 Merchants tab（目前只有 desktop）
- [ ] Mobile: Cash Flow 主頁的 分類 tab
- [ ] Holdings Transactions：多選模式批次刪除（checkbox 多選 → 刪除）
- [ ] Merchant: 匯出 CSV 按鈕尚未連動
- [ ] Category Detail：互連回 Merchant 的 `onNavigate` 目前為 hardcoded `'merchant'`，正式需傳入 merchantId
- [ ] FIFO lot breakdown 目前為 hardcoded mock，需接真實 lot 資料
- [ ] 帳戶頁：點擊個別帳戶 row → 帳戶詳情頁（尚未設計）

---

## 11. 自動更新（Tauri Updater）發佈設定

「設定 → 一般 → 應用程式更新」的「檢查更新」按鈕已接上 `@tauri-apps/plugin-updater`。
程式碼（plugin 註冊、capability、UI）皆已就緒，但**要實際發佈更新還需要下列一次性設定**：

1. 產生簽章金鑰：`npm run tauri signer generate -- -w ~/.tauri/northstar.key`
   （私鑰請妥善保存，**切勿** commit 進 repo）
2. 在 `src-tauri/tauri.conf.json` 補上 updater 設定：
   ```json
   "plugins": {
     "updater": {
       "pubkey": "<上一步產生的公鑰>",
       "endpoints": ["https://github.com/larryjclai/northstar/releases/latest/download/latest.json"]
     }
   },
   "bundle": { "createUpdaterArtifacts": true }
   ```
   （目前刻意未填，避免空 pubkey 造成啟動問題。）
3. CI / 本機打包時設定環境變數：
   `TAURI_SIGNING_PRIVATE_KEY`（私鑰內容）、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`（若有）。
4. 每次發佈：`npm run tauri build`，將產生的 `latest.json` 與簽章檔上傳到對應的 release。

完成後「檢查更新」即會抓取 latest.json、下載、驗章、安裝並重啟。
在未設定前，按鈕會優雅顯示「目前無法檢查更新…」；在瀏覽器（非桌面）則顯示「僅在桌面版可用」。
