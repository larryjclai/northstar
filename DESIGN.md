# NorthStar — Design System 文件
> 最後更新：2026-06-10
> 本文件描述 **實際 app**（`src/`）的設計系統。正準來源：`src/styles/globals.css`（tokens 與 utility classes）、`src/styles/fonts.css`（字體載入）、`src/components/coss/`（元件庫）。
> 早期 prototype（`Design System/` 資料夾）僅供歷史參考，與本文件不同步。

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
13. [已知缺口與待辦](#13-已知缺口與待辦)

---

## 1. 品牌概覽

**產品名稱**：NorthStar
**產品定位**：個人財務管理 — 帳戶、現金流、投資組合、目標與 FIRE 試算的一站式介面
**目標平台**：Desktop（Tauri，主力）+ Mobile iOS（companion）
**語言支援**：繁體中文為主，英文 labels 輔助（ticker、eyebrow、帳戶代號等）

### 品牌識別

Wordmark 在 `AppShell.tsx` sidebar：app icon 圖檔 + "Northstar" 文字。
文字使用 `--ns-font-brand`（Space Grotesk 600）— **這是 Space Grotesk 在 app 中唯一的使用處**，不得用於其他 UI 文字。

---

## 2. 顏色系統

採用 **oklch()** 色彩空間。預設跟隨系統（`prefers-color-scheme`），可透過 `[data-theme="light|dark"]` 強制指定。

### 2.1 Dark Mode

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

| Token | 值 |
|---|---|
| `--ns-bg` | `oklch(0.985 0.005 250)` |
| `--ns-bg-elev` | `oklch(0.998 0 0)` |
| `--ns-bg-card` | `oklch(0.998 0 0)` |
| `--ns-bg-hover` | `oklch(0.965 0.005 250)` |
| `--ns-border` | `oklch(0.91 0.005 250)` |
| `--ns-border-strong` | `oklch(0.82 0.008 250)` |
| `--ns-fg` | `oklch(0.2 0.01 250)` |
| `--ns-fg-muted` | `oklch(0.45 0.01 250)` |
| `--ns-fg-dim` | `oklch(0.6 0.008 250)` |

### 2.3 Accent（品牌色）

| Theme | `--ns-accent` | `--ns-accent-fg` | `--ns-accent-soft` |
|---|---|---|---|
| Dark | `#9fe870`（lime green） | `#0a1a02` | accent 18% mix |
| Light | `#5fb83a` | `#ffffff` | accent 14% mix |

### 2.4 語意色（Gain / Loss）

目前僅實作 **US 綠漲紅跌** 一組（TW 紅漲綠跌、Neutral 為待辦，見 §13）：

| Token | Dark | Light |
|---|---|---|
| `--ns-pos` | `#6ee49a` | `#157040` |
| `--ns-neg` | `#ff7d6b` | `#c22a1e` |
| `--ns-warn` | `#f0c050` | `#c98a18` |
| `--ns-info` | `#6fb3ff` | `#2c6df0` |

各有 `-soft` 變體（12–16% color-mix）。

### 2.5 圖表系列色

| Token | Dark | Light |
|---|---|---|
| `--ns-chart-1` | `#9fe870` | `#5fb83a` |
| `--ns-chart-2` | `#6fb3ff` | `#2c6df0` |
| `--ns-chart-3` | `#f0c050` | `#d18a18` |
| `--ns-chart-4` | `#d97a9c` | `#c44a82` |
| `--ns-chart-5` | `#a99cff` | `#6e58d8` |

### 2.6 陰影

| Token | 用途 |
|---|---|
| `--ns-shadow-1` | 卡片微浮（含 inset highlight） |
| `--ns-shadow-2` | Modal / 覆蓋層 |

### 2.7 語意別名與 COSS bridge

`globals.css` 把 ns-* tokens 映射到兩組別名，**新程式碼優先用 ns-* 原始 token**：

- 語意別名：`--ns-surface`、`--ns-surface-strong`、`--ns-positive`、`--ns-danger`、`--ns-warning-soft`…
- COSS UI / shadcn bridge：`--background`、`--primary`、`--destructive`、`--ring`、`--chart-1..5`、`--sidebar-*`… — COSS 元件透過這層自動跟隨主題，不需 per-component `dark:` variants。

---

## 3. 字體系統

**IBM Plex 家族統一**（2026-06 決定）：UI 文字與標題用 Plex Sans、繁體中文用同 DNA 的 Plex Sans TC、密集數據用 Plex Mono。Space Grotesk 只保留在品牌 wordmark。

### 3.1 字族 Tokens

| Token | 值 | 用途 |
|---|---|---|
| `--ns-font-display` | IBM Plex Sans + Sans TC | 標題 |
| `--ns-font-ui` | IBM Plex Sans + Sans TC | 介面文字、內文 |
| `--ns-font-mono` | IBM Plex Mono | 表格金額、時間戳、圖表軸線、eyebrow |
| `--ns-font-num` | IBM Plex Sans + Sans TC | Hero 大數字（搭配 tabular-nums，見 §3.4） |
| `--ns-font-brand` | Space Grotesk | **僅限 wordmark** |

分工原則：**核心數據用 Mono**（交易金額、記帳數字、時間、圖表數據）；**展示型大數字用 Sans tabular**（淨資產 hero、KPI）；**文字介面用 Sans**。

### 3.2 字體載入

全部打包進 app bundle（`src/styles/fonts.css`），**不使用 CDN**，離線首次渲染即正確：

| 字體 | 來源 | 字重 |
|---|---|---|
| IBM Plex Sans | `@fontsource/ibm-plex-sans` | 400 / 500 / 600 / 700 |
| IBM Plex Sans TC | `@ibm/plex-sans-tc`（complete woff2，約 2.4MB/字重） | 400 / 500 / 600 |
| IBM Plex Mono | `@fontsource/ibm-plex-mono` | 400 / 500 |
| Space Grotesk | `@fontsource/space-grotesk` | 600 |

新增字重前先確認 bundle 體積影響（TC 每字重 +2.4MB）。

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

### 3.4 數字顯示尺寸（`.ns-num-*`）

| Class | 大小 | 字重 | Letter-spacing |
|---|---|---|---|
| `.ns-num-xl` | 56px | 600 | -0.025em |
| `.ns-num-lg` | 40px | 600 | -0.02em |
| `.ns-num-md` | 28px | 600 | -0.015em |
| `.ns-num-sm` | 16px | 600 | -0.005em |

使用 `--ns-font-num` 並包含 `font-variant-numeric: tabular-nums lining-nums`。
IBM Plex 的數字預設即為 tabular（等寬對齊），mono 與 sans 兩者皆然。

### 3.5 Eyebrow 標籤（`.ns-eyebrow`）

```css
font-family: var(--ns-font-mono);
font-size: 11px;
letter-spacing: 0.12em;
text-transform: uppercase;
color: var(--ns-fg-muted);
```

慣例：頁首使用「英文 eyebrow + 中文 h1」（例：`LONG-TERM PROGRESS` / `目標・FIRE`）。

---

## 4. 間距與圓角

### 4.1 間距比例尺

| Token | 值 | Token | 值 |
|---|---|---|---|
| `--ns-s-0` | 0px | `--ns-s-6` | 24px |
| `--ns-s-1` | 4px | `--ns-s-7` | 32px |
| `--ns-s-2` | 8px | `--ns-s-8` | 40px |
| `--ns-s-3` | 12px | `--ns-s-9` | 56px |
| `--ns-s-4` | 16px | `--ns-s-10` | 80px |
| `--ns-s-5` | 20px | | |

### 4.2 圓角

| Token | 預設 | `[data-radius="sharp"]` | `[data-radius="round"]` |
|---|---|---|---|
| `--ns-r-xs` | 6px | 2px | 10px |
| `--ns-r-sm` | 10px | 3px | 14px |
| `--ns-r-md` | 14px | 4px | 18px |
| `--ns-r-lg` | 18px | 6px | 24px |
| `--ns-r-xl` | 24px | 8px | 32px |
| `--ns-r-full` | 999px | — | — |

COSS bridge：`--radius: var(--ns-r-sm)`。

---

## 5. 密度變體

CSS 透過 `[data-density]` 切換（**注意：目前沒有 UI 入口設定此屬性**，僅 CSS 就緒）：

| 密度 | `--ns-row-h` | `--ns-pad-card` | `--ns-gap-card` |
|---|---|---|---|
| `loose` | 64px | 28px | 24px |
| 預設 | 56px | 24px | 20px |
| `medium` | 52px | 20px | 16px |
| `tight` | 40px | 14px | 10px |

`tight` 額外縮小字體：`--ns-t-body: 13.5px`、`--ns-t-ui: 12.5px`

---

## 6. 元件庫

元件分三層，**優先順序由上而下**：

### 6.1 COSS UI 元件（`src/components/coss/`）

Base UI + Tailwind v4 的受控元件，透過 §2.7 的 bridge tokens 自動跟隨主題：

| 元件 | 重點 API |
|---|---|
| `Button` | variant: `default` / `outline` / `ghost` / `secondary` / `link` / `destructive` / `destructive-outline`；size: `xs` / `sm` / `default` / `lg` / `xl` / `icon-*`；`render={<Link …/>}` 可變身路由連結 |
| `Card` | 卡片容器 |
| `Badge` | 圓角 pill 標籤，搭配 soft 底色 |
| `Input` / `Field` / `Label` / `Checkbox` / `Select` / `Separator` / `Spinner` / `Toggle` / `ToggleGroup` | 表單與基礎元件 |

### 6.2 App 共用元件（`src/components/`）

| 元件 | 用途 |
|---|---|
| `Field` / `TextInput` / `SelectInput` / `TextAreaInput` | 簡單表單欄位（label + input） |
| `NumberField` | 千分位數字輸入（預設 class `ns-input mono`） |
| `AppSelect` | 可搜尋下拉選單 |
| `SegmentedControl` | 分段切換 |
| `DateTimeField` / `DateScopeControl` | 日期輸入與範圍切換 |
| `AccountFilter` / `CategoryFilter` / `TickerSearchField` | 領域篩選器 |
| `EmptyState` / `StatusText` / `Metric` / `ActionButton` | 狀態與展示 |
| `Toast`（`useToast`） | 操作回饋，成功/失敗訊息 |
| `QuickAdd` | 全域快速記帳（右下浮動 +） |
| `GlobalSearch` | ⌘K 指令面板 |
| `AssetLogo` / `IconPicker` | 識別圖示 |

### 6.3 ns- Utility Classes（`globals.css`）

仍在使用的全域 class：

| Class | 用途 |
|---|---|
| `.ns-surface` | 薄抬升層（bg-elev + border + r-md） |
| `.ns-row` | 列表列（min-height row-h、底線、`:last-child` 去線） |
| `.ns-input` | 原生輸入框樣式（focus ring 用 accent） |
| `.ns-nav-link` | Sidebar 導航連結（`.active` 反白） |
| `.ns-eyebrow` | §3.5 |
| `.ns-num-xl/lg/md/sm` | §3.4 |
| `.muted` / `.dim` / `.pos` / `.neg` / `.mono` / `.num` | 文字層級輔助 |

另有大量頁面層級 class（`.ns-dash-*`、`.ns-invest-*`、`.ns-detail-*`、`.ns-settings-*`…）為各路由的版型專用。

### 6.4 Modal / Sheet 模式

無共用 Dialog 元件；慣例為 fixed overlay（參考 `HoldingEditModal.tsx`、`GoalEditorSheet.tsx`）：

```jsx
<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
  <div className="w-full max-w-lg rounded-lg border shadow-xl"
       style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}
       onClick={(e) => e.stopPropagation()}>
    {/* header(border-b) / 內容(max-h-[70vh] overflow-y-auto) / footer(border-t) */}
  </div>
</div>
```

手機（窄幅）時 `items-end` 自然形成 bottom sheet。

---

## 7. 圖示系統

使用 **Phosphor Icons**（`@phosphor-icons/react`）：

```jsx
import { Star, Target, Trash, PencilSimple } from "@phosphor-icons/react";
<Star size={14} weight="fill" color="var(--ns-pos)" />
```

慣例：
- 一般 UI 圖示 `size={13–16}`、列表/卡片圖示 `size={18–26}`
- `weight="fill"` 用於強調狀態（達成、警告）、`weight="bold"` 用於按鈕內的 + 號
- 顏色一律用 ns token，不寫死色碼

---

## 8. 數據視覺化

使用 **Recharts**（`AreaChart`、`BarChart`、`PieChart`…），統一樣式慣例：

```jsx
<CartesianGrid strokeDasharray="3 3" stroke="var(--ns-border)" vertical={false} />
<XAxis tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
<YAxis tick={{ fill: "var(--ns-fg-muted)", fontSize: 11 }} tickLine={false} axisLine={false}
       tickFormatter={(v) => formatCompactNumber(Number(v))} />
<Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }}
         itemStyle={{ color: "var(--ns-fg)" }} labelStyle={{ color: "var(--ns-fg-muted)" }} />
```

- 軸線標籤固定 `fontSize: 11`
- 面積圖漸層：主色 20% → 0（`<linearGradient>`）
- 目標/基準線用 `<ReferenceLine>` + `--ns-border-strong` 虛線
- 系列色依序取 `--ns-chart-1..5`；盈虧語意用 `--ns-pos` / `--ns-neg`
- 動畫關閉（`isAnimationActive={false}`），hover 即時響應

---

## 9. 數字格式規範

正準實作在 `src/domain/currency.ts`，**所有金額顯示必須走這些 helper**（內建隱私遮罩支援）：

| Helper | 行為 | 範例 |
|---|---|---|
| `formatNumber(v, opts?)` | `toLocaleString("zh-TW")`，預設 0 小數 | `47,430` |
| `formatMoney(v, ccy)` | 幣別 + 千分位 | `TWD 47,430` |
| `formatSignedMoney(v, ccy)` | 正負號前綴 | `+TWD 1,200` |
| `formatCompactNumber(v)` | 中文壓縮單位 | `1,305萬` |
| `formatCompactMoney(v, ccy)` | 壓縮 + 幣別 | — |
| `formatPercent(v, digits?)` | 百分比 | `27.4%` |
| `formatQuantity(v)` / `formatPrice(v)` | 股數 / 價格精度 | — |

規則：
- **隱私遮罩**：`setPrivacyMaskOn(true)` 後所有 helper 輸出遮罩字串 — 自行手刻 `toLocaleString` 會漏掉遮罩，禁止繞過
- 表格金額欄必須 `textAlign: 'right'` + `tabular-nums`（`.num` class 或 inline `fontVariantNumeric`）
- 提領率（withdrawalRate）以**小數**儲存（0.04 = 4%），顯示時轉換；目標金額推導一律用 `resolveTargetAmount()`（`domain/fireGoal.ts`）

---

## 10. 動態與動畫

| Token | 值 |
|---|---|
| `--ns-ease` | `cubic-bezier(.2,.7,.2,1)` |
| `--ns-dur-fast` | `120ms` |
| `--ns-dur` | `200ms` |

使用原則：
- 按鈕 hover/active 用 `--ns-dur-fast`
- Sheet / 面板滑出用 `--ns-dur`
- 圖表 hover 不加 transition（即時）

---

## 11. 頁面架構與路由

TanStack Router（`src/routes/router.tsx`），lazy route + `manualChunks` code-splitting：

| 路由 | 元件 | 說明 |
|---|---|---|
| `/` | `DashboardRoute` | 總覽（KPI、近期帳單、資產配置、目標、匯率、最近交易） |
| `/investments` | `InvestmentsRoute` | 投資組合（含投資分析 tab） |
| `/holdings/$ticker` | `HoldingDetailRoute` | 個股明細 |
| `/transactions` | `TransactionsRoute` | 交易列表 |
| `/cash-flow` | `CashFlowRoute` | 現金流總覽 |
| `/cash-flow/categories` | `CategoriesRoute` | 分類管理 |
| `/cash-flow/categories/$categoryName` | `CategoryDetailRoute` | 分類明細 |
| `/cash-flow/merchants/$merchantName` | `MerchantDetailRoute` | 商家明細 |
| `/cash-flow/reconcile/$accountId` | `ReconcileRoute` | 對帳 |
| `/accounts` | `AccountsRoute` | 帳戶管理（建立精靈） |
| `/goals` | `GoalsRoute` | 目標（FIRE + 自訂目標、`GoalEditorSheet`） |
| `/goals/fire` | `FIRECalculatorRoute` | FIRE 計算機（`?id=` 編輯既有目標） |
| `/settings` | `SettingsRoute` | 設定（含 Connect 同步、Recovery Kit、備份） |

導航：Desktop 為左側 sidebar（`.ns-nav-link`）；窄幅為底部 tab bar + 「更多」。

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

### 12.2 刪除二次確認

所有破壞性操作使用 inline 兩段式確認（第一次點擊顯示「確定刪除？」+「取消」，第二次才執行）。
**`window.confirm` 在 Tauri webview 是 no-op，禁止使用。**
參考實作：`RecurringRulesTab`、`SettingsRoute`（裝置移除）、`GoalsRoute`。

### 12.3 右對齊金額欄

所有表格的金額欄（qty / price / fee / total / 餘額）必須 `textAlign: 'right'`。

### 12.4 卡片 Hover 互動

可點擊的卡片/列加 `cursor: pointer` + hover 背景 `--ns-bg-hover`（transition 用 `--ns-dur-fast`）。

### 12.5 Toast 回饋

每個 mutation 成功/失敗都要 `toast.success()` / `toast.error()`，訊息用繁體中文。

### 12.6 空狀態

用置中 icon（accent-soft 圓角方塊）+ 標題 + 說明 + 主要 CTA（參考 `GoalsRoute` 空狀態、`EmptyState` 元件）。

### 12.7 週期規則月化計算

```js
const monthlyAmt = r.freq === 'yearly'  ? r.amt / 12
                 : r.freq === 'bimonth' ? r.amt / 2
                 : r.amt;
```

---

## 13. 已知缺口與待辦

| 項目 | 狀態 |
|---|---|
| 負號統一用 U+2212 `−`（取代 ASCII `-`） | 未實作 — 應加進 `currency.ts` helpers |
| TW 紅漲綠跌 / Neutral 盈虧配色切換 | 未實作 — tokens 與設定 UI 都缺 |
| `[data-density]` / `[data-radius]` 設定 UI | CSS 就緒，無使用者入口 |
| Recovery Kit「輸入備援碼還原」UI | `restoreFromRecoveryKit()` 存在但無入口 |
| 自訂目標帳戶權重（`accountShareMap` 比例 < 100%） | 資料模型支援，編輯器目前固定 100% |
