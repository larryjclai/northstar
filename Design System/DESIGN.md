# NorthStar — Design System 文件
> 最後更新：2026-06-08
> 本文件從 `northstar-tokens.css`、`northstar-shared.jsx`、`northstar-foundations.jsx` 及 `HANDOVER.md` 自動整理。

---

## 目錄

1. [品牌概覽](#1-品牌概覽)
2. [顏色系統](#2-顏色系統)
3. [字體系統](#3-字體系統)
4. [間距與圓角](#4-間距與圓角)
5. [密度變體](#5-密度變體)
6. [元件庫](#6-元件庫)
7. [圖示系統](#7-圖示系統)
8. [數據視覺化](#8-數據視覺化)
9. [數字格式規範](#9-數字格式規範)
10. [動態與動畫](#10-動態與動畫)
11. [頁面架構與路由](#11-頁面架構與路由)
12. [設計慣例](#12-設計慣例)
13. [待辦事項](#13-待辦事項)

---

## 1. 品牌概覽

**產品名稱**：NorthStar  
**產品定位**：個人財務管理 — 帳戶、現金流、投資組合、目標與 FIRE 試算的一站式介面  
**目標平台**：Desktop（主力）+ Mobile iOS（companion）  
**語言支援**：繁體中文為主，英文 labels 輔助（ticker、帳戶代號等）

### Logo

```jsx
<NSLogo size={22} />
// 星形 SVG + "Northstar" wordmark
// 顏色使用 --ns-accent (lime green)
```

---

## 2. 顏色系統

設計採用 **oklch()** 色彩空間，確保感知均勻性。預設 **Dark Mode**，Light Mode 透過 `[data-theme="light"]` 切換。

### 2.1 Dark Mode（預設）

| Token | 值 | 用途 |
|---|---|---|
| `--ns-bg` | `oklch(0.165 0.008 250)` | 畫布底色 |
| `--ns-bg-elev` | `oklch(0.198 0.008 250)` | 抬升表面（sidebar、header） |
| `--ns-bg-card` | `oklch(0.22 0.008 250)` | 卡片 |
| `--ns-bg-hover` | `oklch(0.255 0.008 250)` | Hover 狀態 |
| `--ns-border` | `oklch(0.285 0.008 250)` | 一般邊線 |
| `--ns-border-strong` | `oklch(0.38 0.008 250)` | 強調邊線 |
| `--ns-fg` | `oklch(0.97 0.005 250)` | 主要文字 |
| `--ns-fg-muted` | `oklch(0.68 0.008 250)` | 次要文字 |
| `--ns-fg-dim` | `oklch(0.5 0.008 250)` | 輔助文字、軸線標籤 |

### 2.2 Light Mode

冷調 off-white 畫布 + 純白浮起卡片（兩層拉開，卡片才浮得起來）。

| Token | 值 |
|---|---|
| `--ns-bg` | `oklch(0.972 0.006 250)` |
| `--ns-bg-elev` | `oklch(0.986 0.004 250)` |
| `--ns-bg-card` | `oklch(1 0 0)` |
| `--ns-bg-hover` | `oklch(0.948 0.008 250)` |
| `--ns-border` | `oklch(0.901 0.006 250)` |
| `--ns-border-strong` | `oklch(0.80 0.010 250)` |
| `--ns-fg` | `oklch(0.23 0.018 250)` |
| `--ns-fg-muted` | `oklch(0.48 0.014 250)` |
| `--ns-fg-dim` | `oklch(0.63 0.010 250)` |

### 2.3 Accent（品牌色）

| Theme | `--ns-accent` | `--ns-accent-fg` |
|---|---|---|
| Dark | `#9fe870`（lime green） | `#0a1a02` |
| Light | `#8ed34e`（保留 lime） | `#173708`（深綠字） |

Light mode 維持萊姆綠當「填色」、深綠當文字，與 Dark 同一套 accent/accent-fg 關係，品牌感不掉。

Soft variant：`color-mix(in srgb, var(--ns-accent) X%, transparent)`（Dark 18% / Light 30%）

### 2.4 語意色（Gain / Loss）

三組可透過 Tweaks 切換的盈虧配色：

| 組合 | `--ns-pos` (dark) | `--ns-neg` (dark) | `--ns-pos` (light) | `--ns-neg` (light) |
|---|---|---|---|---|
| **US** 綠漲紅跌（預設） | `#6ee49a` | `#ff7d6b` | `#0f7a40` | `#c62a1d` |
| **TW** 紅漲綠跌 | `#ff6363` | `#3fbf6c` | — | — |
| **Neutral** 藍/琥珀 | `#34c5b0` | `#f0a050` | — | — |

其他語意色：
- `--ns-warn`：Dark `#f0c050` / Light `#b07d10`
- `--ns-info`：Dark `#6fb3ff` / Light `#2563e8`

### 2.5 圖表系列色

| Token | Dark | Light |
|---|---|---|
| `--ns-chart-1` | `#9fe870` | `#5aa832` |
| `--ns-chart-2` | `#6fb3ff` | `#2f6fe0` |
| `--ns-chart-3` | `#f0c050` | `#c98f1f` |
| `--ns-chart-4` | `#d97a9c` | `#c44a82` |
| `--ns-chart-5` | `#a99cff` | `#6e58d8` |

### 2.6 陰影

| Token | 用途 |
|---|---|
| `--ns-shadow-1` | 卡片微浮（含 inset highlight） |
| `--ns-shadow-2` | Modal / 覆蓋層（60px blur，50% opacity dark） |

---

## 3. 字體系統

### 3.1 字族（Font Families）

| Token | 預設值 | 用途 |
|---|---|---|
| `--ns-font-display` | Space Grotesk, Noto Sans TC | 標題、品牌文字 |
| `--ns-font-ui` | Space Grotesk, Noto Sans TC | 介面文字 |
| `--ns-font-mono` | IBM Plex Mono, JetBrains Mono | 財務數字、程式碼、eyebrow |

### 3.2 字族變體（Tweaks）

透過 `[data-fonts]` attribute 切換：

| 值 | Display / UI | Mono |
|---|---|---|
| 預設 | Space Grotesk | IBM Plex Mono |
| `geist` | Geist | Geist Mono |
| `ibm` | IBM Plex Sans | IBM Plex Mono |
| `serif` | Newsreader | JetBrains Mono |

### 3.3 字級系統

| Token | 大小 | 用途 |
|---|---|---|
| `--ns-t-display-xl` | 56px | 超大標題 |
| `--ns-t-display` | 40px | 頁面主標題 |
| `--ns-t-title-1` | 28px | 區塊標題 |
| `--ns-t-title-2` | 22px | 小節標題 |
| `--ns-t-title-3` | 18px | 元件標題 |
| `--ns-t-body` | 15px | 正文 |
| `--ns-t-ui` | 14px | 介面標籤 |
| `--ns-t-caption` | 12px | 輔助說明 |

### 3.4 數字顯示尺寸（Mono）

| Class | 大小 | 字重 | Letter-spacing | 用途 |
|---|---|---|---|---|
| `.ns-num-xl` | 56px | 500 | -0.025em | 淨資產等主要數字 |
| `.ns-num-lg` | 40px | 500 | -0.02em | 次要大數字 |
| `.ns-num-md` | 28px | 500 | -0.015em | KPI 卡片數字 |
| `.ns-num-sm` | 16px | 500 | -0.005em | 表格金額 |

所有數字 class 均包含：`font-variant-numeric: tabular-nums lining-nums`

### 3.5 Eyebrow 標籤

```css
.ns-eyebrow {
  font-family: var(--ns-font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ns-fg-muted);
}
```

---

## 4. 間距與圓角

### 4.1 間距比例尺

| Token | 值 |
|---|---|
| `--ns-s-0` | 0px |
| `--ns-s-1` | 4px |
| `--ns-s-2` | 8px |
| `--ns-s-3` | 12px |
| `--ns-s-4` | 16px |
| `--ns-s-5` | 20px |
| `--ns-s-6` | 24px |
| `--ns-s-7` | 32px |
| `--ns-s-8` | 40px |
| `--ns-s-9` | 56px |
| `--ns-s-10` | 80px |

### 4.2 圓角

| Token | 值 | 用途 |
|---|---|---|
| `--ns-r-xs` | 6px | 小型標籤、chip |
| `--ns-r-sm` | 10px | 按鈕、輸入框 |
| `--ns-r-md` | 14px | 小卡片 |
| `--ns-r-lg` | 18px | 主卡片（`.ns-card`） |
| `--ns-r-xl` | 24px | Modal、大型面板 |
| `--ns-r-full` | 999px | 膠囊形 pill |

圓角變體（Tweaks）：

| `[data-radius]` | xs / sm / md / lg / xl |
|---|---|
| `sharp` | 2 / 3 / 4 / 6 / 8 px |
| 預設 | 6 / 10 / 14 / 18 / 24 px |
| `round` | 10 / 14 / 18 / 24 / 32 px |

---

## 5. 密度變體

透過 `[data-density]` 全域切換：

| 密度 | `--ns-row-h` | `--ns-pad-card` | `--ns-gap-card` |
|---|---|---|---|
| `loose` | 68px | 30px | 26px |
| 預設（medium） | 56px | 24px | 20px |
| `medium` | 52px | 20px | 16px |
| `tight` | 40px | 14px | 10px |

`tight` 額外縮小字體：`--ns-t-body: 13.5px`、`--ns-t-ui: 12.5px`

---

## 6. 元件庫

### 6.1 卡片（`.ns-card`）

```css
background: var(--ns-bg-card);
border: 1px solid var(--ns-border);
border-radius: var(--ns-r-lg);
padding: var(--ns-pad-card);
```

### 6.2 表面（`.ns-surface`）

較卡片更薄的浮起層（用於 sidebar section、sub-area）：

```css
background: var(--ns-bg-elev);
border: 1px solid var(--ns-border);
border-radius: var(--ns-r-md);
```

### 6.3 列（`.ns-row`）

```css
display: flex; align-items: center;
min-height: var(--ns-row-h);
padding: 0 var(--ns-s-5);
border-bottom: 1px solid var(--ns-border);
```

最後一個子元素自動移除底線（`:last-child { border-bottom: none }`）

### 6.4 按鈕（`.ns-btn`）

| Variant | Class | 說明 |
|---|---|---|
| 預設 | `.ns-btn` | 邊線 + 底色 bg-elev |
| 主要 | `.ns-btn.primary` | Accent 背景 |
| 幽靈 | `.ns-btn.ghost` | 無背景、無邊線、muted 文字 |
| 圖示 | `.ns-btn.icon` | 正方形 padding 8px |

所有按鈕：hover `bg-hover`、active `translateY(1px)`

### 6.5 Pills（`.ns-pill`）

```css
display: inline-flex; align-items: center; gap: 6px;
padding: 3px 9px; border-radius: var(--ns-r-full);
font-size: 11.5px; font-weight: 500;
```

| 修飾 class | 用途 |
|---|---|
| 預設 | 邊線 + 透明底 + muted 文字 |
| `.solid-accent` | Accent 底色 |
| `.solid-pos` | 盈利（正色 soft 底） |
| `.solid-neg` | 虧損（負色 soft 底） |

### 6.6 分段控制（`.ns-seg`）

```css
display: inline-flex; padding: 3px; gap: 2px;
background: var(--ns-bg-elev); border: 1px solid var(--ns-border);
border-radius: var(--ns-r-sm);
```

啟用狀態：`aria-selected="true"` → `bg-card` + `shadow-1`

### 6.7 輸入框（`.ns-input`）

```css
background: var(--ns-bg-elev);
border: 1px solid var(--ns-border);
padding: 10px 12px; border-radius: var(--ns-r-sm);
```

Focus：`border-color: --ns-accent` + `box-shadow: 0 0 0 3px --ns-accent-soft`

### 6.8 Sidebar 導航連結（`.ns-nav-link`）

```css
display: flex; align-items: center; gap: 11px;
padding: 9px 11px; border-radius: var(--ns-r-sm);
font-size: 13.5px; color: var(--ns-fg-muted);
```

啟用：`.active` → `bg-card` + `inset border`

### 6.9 KPI 卡片（`<NSKpi>`）

```jsx
<NSKpi
  label="淨資產"
  value="NT$8,452K"
  sub="HKD · USD · NTD"
  trend={2.34}        // 正數=漲，負數=跌，null=不顯示
  spark={nsSeries(20, 100)}  // 可選 sparkline 資料
/>
```

### 6.10 品牌識別元件

| 元件 | 說明 |
|---|---|
| `<NSLogo size={22}>` | 星形 + Wordmark |
| `<NSMark label="FD" color="#xxx" size={36}>` | 帳戶 / 持股方塊 icon |

---

## 7. 圖示系統

使用 `<NSIcon name="…" size={18} strokeWidth={1.6} />` 調用。

所有圖示均為 stroke-based SVG，`viewBox="0 0 20 20"`。

| name | 描述 | name | 描述 |
|---|---|---|---|
| `home` | 首頁 | `chart` | 折線圖 |
| `wallet` | 帳戶 | `coin` | 貨幣 |
| `target` | 目標 | `settings` | 設定齒輪 |
| `plus` | 新增 | `search` | 搜尋 |
| `filter` | 篩選 | `download` | 下載 |
| `upload` | 上傳 | `arrowUp/Down/Left/Right` | 方向箭頭 |
| `chevDown/Left/Right/Up` | 三角箭頭 | `refresh` | 重新整理 |
| `eye` | 查看 | `dots` | 更多 (⋯) |
| `bell` | 通知 | `star` | 星星 |
| `calendar` | 日曆 | `tag` | 標籤 |
| `transfer` | 轉帳 | `bank` | 銀行 |
| `pie` | 圓餅圖 | `swap` | 交換 |
| `sparkle` | 閃爍 | `check` | 勾選 |
| `lock` | 鎖 | `users` | 使用者群 |
| `backspace` | 退格 | `arrowLeft` | 返回（Mobile） |
| `chevLeft` | 返回三角 | — | — |

---

## 8. 數據視覺化

### 8.1 `<NSSparkline>` — 迷你折線圖

```jsx
<NSSparkline data={[…]} w={80} h={24} pos={true} fillOpacity={0.18} />
```

### 8.2 `<NSAreaChart>` — 互動區域圖

```jsx
<NSAreaChart
  data={[…]}          // 主系列
  secondary={[…]}     // 次要虛線（可選）
  w={720} h={280}
  color="var(--ns-accent)"
  yFormat={(v) => `NT$${v.toFixed(0)}`}
  xLabels={['1月','2月', …]}
/>
```

特性：hover 十字線 + tooltip、次要系列虛線、漸層填色

### 8.3 `<NSDonut>` — 甜甜圈圖（資產配置）

```jsx
<NSDonut
  data={[{ label: '台股', v: 45, color: 'var(--ns-chart-1)' }, …]}
  size={140} thickness={18}
/>
```

### 8.4 `<NSBars>` — 迷你長條圖（月度現金流）

```jsx
<NSBars data={[{ v: 72000 }, { v: -24000 }, …]} w={280} h={80} neutral={false} />
```

正值用 `--ns-pos`，負值用 `--ns-neg`；`neutral={true}` 全部用 chart-2 藍色

---

## 9. 數字格式規範

### 9.1 千分位

全站動態數字使用 `toLocaleString('zh-TW')`：

```js
// ✅ 正確
(47430).toLocaleString('zh-TW')  // → "47,430"

// ✅ 含小數
(1234.5).toLocaleString('zh-TW', { minimumFractionDigits: 2 })  // → "1,234.50"
```

### 9.2 正負符號

使用 MINUS SIGN（U+2212 `−`），不用 ASCII `-`：

```js
const sign = v >= 0 ? '+' : '−';
`${sign}NT$${Math.abs(v).toLocaleString('zh-TW')}`
```

### 9.3 `nsFmt()` 輔助函式

```js
nsFmt(v, { decimals=0, sign=false, prefix='', suffix='' })

// 範例
nsFmt(-47430, { prefix: 'NT$', sign: true })  // → '−NT$47,430'
nsFmt(2.345, { decimals: 2, sign: true })      // → '+2.35'
```

### 9.4 CSS 數字樣式

表格金額欄必須加上：

```jsx
style={{ fontVariantNumeric: 'tabular-nums lining-nums', textAlign: 'right' }}
```

---

## 10. 動態與動畫

| Token | 值 |
|---|---|
| `--ns-ease` | `cubic-bezier(.2,.7,.2,1)` |
| `--ns-dur-fast` | `120ms` |
| `--ns-dur` | `200ms` |

使用原則：
- 按鈕 hover/active 用 `--ns-dur-fast`
- Side sheet 滑出用 `--ns-dur`（200ms）
- 圖表 hover crosshair 不需 transition（即時）
- Bottom sheet（mobile）：`borderRadius: '20px 20px 0 0'`

---

## 11. 頁面架構與路由

### 11.1 Desktop 路由表

| 路由 key | 元件 | 檔案 |
|---|---|---|
| `dashboard` | `NSDesktopDashboardV2` | `northstar-dashboard2.jsx` |
| `holdings` | `NSDesktopHoldings` | `northstar-desktop.jsx` |
| `holding-detail` | `NSDesktopHoldingDetail` | `northstar-detail.jsx` |
| `inv-add` | `NSDesktopInvestAddSheet` | `northstar-desktop.jsx` |
| `holdings-txns` | `NSDesktopHoldingsTxns` | `northstar-holdings-txns.jsx` |
| `cashflow` | `NSDesktopCashFlow` | `northstar-desktop.jsx` |
| `cf-detail` | `NSDesktopCashFlowDetail` | `northstar-cashflow-detail.jsx` |
| `cf-new` | `NSDesktopNewTxSheet` | `northstar-desktop.jsx` |
| `merchant` | `NSDesktopMerchantDetail` | `northstar-merchant.jsx` |
| `cat-detail` | `NSDesktopCategoryDetail` | `northstar-category-detail.jsx` |
| `cat-mgmt` | `NSDesktopCategoryMgmt` | `northstar-desktop.jsx` |
| `recurring` | `NSDesktopRecurringRules` | `northstar-recurring.jsx` |
| `accounts` | `NSDesktopAccounts` | `northstar-desktop.jsx` |
| `acct-add` | `NSDesktopAddAccountFlow` | `northstar-acct-flow.jsx` |
| `goals` | `NSDesktopGoals` | `northstar-desktop.jsx` |
| `fire-calc` | `NSDesktopFireCalc` | `northstar-fire-calc.jsx` |
| `connect` | `NSDesktopConnect` | `northstar-desktop.jsx` |
| `settings` | `NSDesktopSettingsV2` | `northstar-settings-detail.jsx` |

### 11.2 Cash Flow Tab 結構（4 tabs）

```
Transactions  |  分類  |  Merchants  |  週期規則
```

- **Transactions**：每日分組的交易列表
- **分類**：Donut + 分類表格，點擊進 `cat-detail`
- **Merchants**：商家表格，點擊進 `merchant`
- **週期規則**：定期規則管理，點擊進 `RuleEditSheet`

### 11.3 Holdings Tab 結構（2 tabs）

```
Portfolio  |  Transactions
```

### 11.4 跨頁面互連

| 起點 | 終點 | 方式 |
|---|---|---|
| CF Detail 商家名 | Merchant Detail | "View →" 按鈕 |
| Cash Flow Merchants tab | Merchant Detail | 點擊商家列 |
| Cash Flow 分類 tab | Category Detail | 點擊分類列 |
| Merchant Detail Hero | Category Detail | "🚗 交通 分類 ›" 按鈕 |
| Category Detail Top Merchants | Merchant Detail | 點擊商家列 |

### 11.5 Mobile 畫面（iOS Frame）

| 元件 | 對應 desktop 路由 |
|---|---|
| `NSMobileHoldingsTxns` | `holdings-txns` |
| `NSMobileMerchantDetail` | `merchant` |
| `NSMobileCategoryDetail` | `cat-detail` |
| `NSMobileEditTxSheet` | Bottom sheet |

---

## 12. 設計慣例

### 12.1 文字層級輔助 class

```css
.muted  → color: --ns-fg-muted
.dim    → color: --ns-fg-dim
.pos    → color: --ns-pos
.neg    → color: --ns-neg
.mono   → font-family: --ns-font-mono, tabular-nums
.num    → font-family: --ns-font-mono, tabular-nums lining-nums
```

### 12.2 日期格式

```js
// 統一格式
'今天 · 5/27 (二)'
'昨天 · 5/26 (一)'
'5/25 (六)'
```

### 12.3 卡片 Hover 互動

需要點擊的卡片加上：

```jsx
style={{ cursor: 'pointer', transition: 'background 0.12s' }}
onMouseEnter={e => e.currentTarget.style.background = 'var(--ns-bg-hover)'}
onMouseLeave={e => e.currentTarget.style.background = 'var(--ns-bg-card)'}
```

### 12.4 刪除二次確認模式

所有破壞性操作使用 `confirmDelete` state，第一次點擊顯示確認訊息，第二次才執行刪除。

### 12.5 右對齊金額欄

所有表格的金額欄（qty / price / fee / total / 餘額）必須 `textAlign: 'right'`。

### 12.6 圖表軸線文字

所有 chart 的軸線標籤統一使用 `fontSize="11"`。

### 12.7 Search Input Pattern（Sidebar）

```jsx
<div style={{ position: 'relative' }}>
  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
    <NSIcon name="search" size={14}/>
  </span>
  <span className="dim mono" style={{ position: 'absolute', right: 10 }}>⌘K</span>
  <input className="ns-input" placeholder="Search…" style={{ paddingLeft: 32, paddingRight: 36 }}/>
</div>
```

### 12.8 進行中月份標示

月度長條圖中，當前進行中的月份使用**斜線填色**（`fill: url(#hatch)`），而非實色。

### 12.9 週期規則月化計算

```js
const monthlyAmt = r.freq === 'yearly'  ? r.amt / 12
                 : r.freq === 'bimonth' ? r.amt / 2
                 : r.amt;
```

---

## 13. 待辦事項

### Design TODO

- [ ] Mobile：Cash Flow 主頁 Merchants tab
- [ ] Mobile：Cash Flow 主頁 分類 tab
- [ ] Mobile：週期規則頁面
- [ ] Holdings Transactions：多選模式批次刪除
- [ ] Merchant：匯出 CSV 按鈕連動
- [ ] Category Detail：互連 Merchant 需傳入動態 `merchantId`（目前 hardcoded）
- [ ] 帳戶頁：個別帳戶 row → 帳戶詳情頁（未設計）
- [ ] FIFO lot breakdown：接真實 lot 資料（目前 mock）

### Engineering TODO

- [ ] `nsFmt()` 在所有元件中統一使用（部分仍用舊 `toLocaleString`）
- [ ] `allTxnsData`、`merchantMonthlyData`、`recurringData` 替換為 API 呼叫
- [ ] `freqLabel()` 移至 `northstar-shared.jsx` 共用
