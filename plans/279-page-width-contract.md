# Plan 279: 全站頁面寬度契約 —— `.ns-page` + `--ns-page-max: 1920px`（桌機大螢幕不再留死白）

> **Executor instructions**: 在 git worktree 的分支 `fix/ai-page-width` 上工作。
> **不要改主 checkout**。每個 session 第一個指令：`pwd`。逐步執行，每步跑完
> 該步的 verify 指令並確認預期結果才往下走。遇到 STOP condition 就停下來回報，
> **不要自行發揮**。**不要**更新 `plans/README.md`（advisor 會維護）。
>
> **Drift check（第一件事）**：
> ```bash
> git diff --stat 27e3c8e1..HEAD -- src/styles/globals.css src/routes/DashboardRoute.tsx src/routes/CashFlowRoute.tsx src/routes/AccountsRoute.tsx src/routes/GoalsRoute.tsx src/routes/InvestmentsRoute.tsx src/routes/AnnualReportRoute.tsx
> ```
> 若任何 in-scope 檔案有變動，先把下面「現況」的 excerpt 與實際程式碼逐字比對；
> 對不上就當作 STOP condition。**注意**：plan 270 用 Prettier 重排過整個 `src/`，
> 所以請以**內容**定位，不要只信行號。

## Status

- **Priority**: P2 · **Effort**: S · **Risk**: LOW（純版面寬度，無資料/計算變更）
- **Depends on**: 無
- **Category**: UI / layout
- **Planned at**: commit `27e3c8e1`, 2026-07-30

## What and why

Operator 回報：**「右側內容在筆電小螢幕確實滿版，但在桌機大螢幕就沒有滿版了。」**

原因已定位，不是猜測：**每一個頂層路由都各自寫死 `maxWidth: 1180` 並 `margin: 0 auto`**
（共 8 處 inline/utility，外加 `.ns-detail-page` 一處 CSS）。側邊欄固定 240px，所以：

| 視窗寬 | 可用寬（減側邊欄） | 內容實際寬 | 左右死白（單邊） |
| --- | --- | --- | --- |
| 1440（13–14" 筆電） | 1200 | 1180 | 10px（看不出來） |
| 1512（14" MBP 全螢幕） | 1272 | 1180 | 46px |
| 1920 | 1680 | 1180 | 250px |
| 2560（27" 螢幕） | 2320 | 1180 | **570px** |

也就是說 1180 這個上限**只在視窗 > 1420px 時才會咬到**——正好就是 operator 抱怨的那個區間。
筆電看起來滿版不是巧合，是因為上限根本沒生效。

Operator 已拍板（2026-07-30）：**滿版，但設 1920px 天花板**。理由：27" 2560 螢幕實務上等於
邊到邊填滿；4K/5K 則不會出現一列表格橫跨 2500px、hero 數字與說明文字一行拉太長的可讀性崩壞。

順帶修掉一個真正的技術債：這個寬度目前是 **9 份檔案裡的 9 個魔術數字**，改一次要改九處。
本計畫把它收斂成一個 token + 一個 class，之後再調只需改一行。

**注意：有四個路由本來就沒有上限**（`FIRECalculatorRoute`、`HoldingDetailRoute`、
`ReconcileRoute`、`CategoriesRoute` 都只有 padding、沒有 `max-width`）。它們今天就是
滿版在跑，是「拿掉上限不會炸」的現成證據；**這四個檔案不在本計畫範圍內，不要動**。

## Current state（皆在 `27e3c8e1` 實際讀過）

### 要改的 9 個點

| # | 檔案 | 現況 |
| --- | --- | --- |
| 1 | `src/styles/globals.css:950-954` | `.ns-detail-page { max-width: 1180px; margin: 0 auto; padding: 24px 32px 120px; }` |
| 2 | `src/routes/DashboardRoute.tsx:1258-1262` | 頁面外框 |
| 3 | `src/routes/GoalsRoute.tsx:254-257` | 頁面外框 |
| 4 | `src/routes/AccountsRoute.tsx:486-489` | 頁面外框 |
| 5 | `src/routes/CashFlowRoute.tsx:1878` | loading skeleton 外框 |
| 6 | `src/routes/CashFlowRoute.tsx:1914` | 頁面外框 |
| 7 | `src/routes/InvestmentsRoute.tsx:517-520` | loading skeleton 外框 |
| 8 | `src/routes/InvestmentsRoute.tsx:556-559` | 頁面外框 |
| 9 | `src/routes/AnnualReportRoute.tsx:152-156` + `183-187` | loading + 頁面外框（同檔兩處） |

逐字 excerpt：

```css
/* src/styles/globals.css:949-954 */
/* ── Detail pages: cash-flow category / merchant ── */
.ns-detail-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 24px 32px 120px;
}
```

```tsx
/* src/routes/DashboardRoute.tsx:1258-1262 —— GoalsRoute.tsx:254-257 與
   AccountsRoute.tsx:486-489 是逐字相同的三胞胎 */
  return (
    <div
      className="px-4 pt-6 pb-28 sm:px-8 sm:pb-[120px]"
      style={{ maxWidth: 1180, margin: "0 auto" }}
    >
```

```tsx
/* src/routes/CashFlowRoute.tsx:1878（loading）與 1914（本體） */
      <div className="grid gap-5 p-1 max-w-[1180px] mx-auto">
...
    <div className="px-4 pt-6 pb-28 sm:px-8 sm:pb-[120px] max-w-[1180px] mx-auto">
```

```tsx
/* src/routes/InvestmentsRoute.tsx:517-520（loading） */
      <div
        className="grid gap-5 p-1"
        style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}
      >
/* src/routes/InvestmentsRoute.tsx:556-559（本體） */
    <div
      className="ns-invest-page"
      style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}
    >
```

```tsx
/* src/routes/AnnualReportRoute.tsx:152-156（loading）與 183-187（本體） */
      <div
        className="grid gap-5"
        style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}
      >
...
    <div
      className="ns-annual-report"
      style={{ padding: "24px 32px 120px", maxWidth: 1180, margin: "0 auto" }}
    >
```

### 三個必須知道的既有規則（不要碰，但會互動）

1. **`@media (max-width: 900px)` 內有兩條 `!important` padding**（`globals.css:1723-1743`）：
   ```css
   .ns-invest-page { padding: 18px 16px 110px !important; }
   .ns-detail-page { padding: 18px 16px 110px; }
   ```
   `!important` 宣告會贏過**非** `!important` 的 inline style，所以投資頁今天在 ≤900px
   就是 18/16/110（不是 inline 的 24/32/120）。改完後行為相同——這條規則仍然贏。**保持原樣。**

2. **列印覆蓋**（`globals.css:2108-2116`）：
   ```css
   .ns-app-main { padding: 0 !important; }
   .ns-annual-report { max-width: none !important; margin: 0 !important; padding: 0 !important; }
   ```
   年度報表列印時靠這條把上限拿掉。它是 `!important`，會贏過新加的 `.ns-page`，
   **前提是那個元素同時保留 `ns-annual-report` class**（步驟 6 會保留）。

3. **Tailwind v4 layer 順序**：`globals.css:1` 是 `@import "tailwindcss"`，Tailwind 的
   utilities 進 `@layer utilities`；`globals.css` 其餘規則是**未分層（unlayered）**的，
   而未分層樣式一律贏過任何 layered 樣式。所以 `.ns-page { padding-inline: … }` 會贏過
   `px-4 sm:px-8`。本計畫仍然要求把那些 utility 拿掉（單一來源、不依賴 layer 直覺），
   但這也意味著萬一漏拿一個，結果仍然正確——不會靜默壞掉。

### 慣例（照著做）

- `AGENTS.md` 樣式撰寫優先序：**(1) COSS 元件 →(2) `ns-*` utility class 與 Tailwind
  utilities →(3) inline `style={{}}` 僅限動態值**。靜態寬度／padding 屬於 (2)，所以本計畫
  把 inline 靜態值搬進 class，方向與規範一致。
- 重複 3 次以上的靜態 inline 模式應抽成共用 class（例：`.ns-field-label`）——`maxWidth: 1180`
  出現 9 次，正是這條規則的教科書案例。
- 新 class 命名跟現有的一致：`.ns-detail-page` / `.ns-invest-page` / `.ns-app-main` → `.ns-page`。
  已確認 `.ns-page` 未被使用（`globals.css` 只有 `.ns-page-tabs`，不同 selector）。

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0（warnings 可接受，errors 不行） |
| Format | `npm run format:check` | exit 0（只掃 `src/**/*.{ts,tsx}`，CSS 不在內） |
| Unit tests | `npm test` | 130 檔 / 1512 全過（baseline @ `27e3c8e1`） |
| E2E | `npx playwright test src/test/e2e/page-width.spec.ts` | 新增的 2 個 test 全過 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope（只能動這些）**：

- `src/styles/globals.css`
- `src/routes/DashboardRoute.tsx`
- `src/routes/GoalsRoute.tsx`
- `src/routes/AccountsRoute.tsx`
- `src/routes/CashFlowRoute.tsx`
- `src/routes/InvestmentsRoute.tsx`
- `src/routes/AnnualReportRoute.tsx`
- `src/test/e2e/page-width.spec.ts`（新建）

**Out of scope（看起來相關，但不要動）**：

- `src/routes/FIRECalculatorRoute.tsx`、`HoldingDetailRoute.tsx`、`ReconcileRoute.tsx`、
  `CategoriesRoute.tsx` —— 它們本來就沒有 `max-width`，已經是滿版。加 `.ns-page` 只會
  把它們**縮小**到 1920，那不是本計畫的目的。
- `src/routes/SettingsRoute.tsx` / `.ns-settings-layout` —— 那是 `220px + 1fr` 的
  full-height grid，寬度模型完全不同，硬套 `.ns-page` 會拆掉它的滾動容器。
- `.ns-invest-page` / `.ns-detail-page` 在 `@media (max-width: 900px)` 內的 padding 規則。
- 列印區塊（`globals.css` 尾端 `@media print`）。
- 任何卡片內部的 grid（`.ns-dash-row2/3`、`.ns-dash-kpi-stack` 等都是 `auto-fit`，
  變寬時自己會長出更多欄，這是預期行為，**不要**去調它們的 `minmax`）。
- 任何金額、計算、query。本計畫零邏輯變更。

## Git workflow

- 分支：`fix/ai-page-width`（`.agentrules` §2：AI 工作一律開分支）
- Commit 訊息照 repo 慣例（conventional commits），例如：
  `fix(ui): one page-width contract, 1920 ceiling instead of 1180 (plan 279)`
- **不要** push、不要開 PR、不要 merge 到 main —— 交回 operator 決定。
- ⚠️ **絕對不要 `git add -A`**：plan 278 那次事故就是把 worktree 的 `node_modules`
  symlink 收進版控，merge 後覆蓋掉主 checkout 的真實目錄。**逐檔 `git add`。**

## Steps

### Step 1: 加 token 與 `.ns-page` class

在 `src/styles/globals.css` 的 `:root` 區塊，**緊接在 Spacing scale 之後**（現況
`--ns-s-8: 40px;   --ns-s-9: 56px; --ns-s-10: 80px;` 那行下面）插入：

```css
  /* Page shell width contract (plan 279) — consumed by .ns-page below.
     1180 used to be hard-coded in 9 places; it only ever bound above ~1420px
     viewport (240px sidebar + 1180), which is exactly where operators reported
     dead gutters. 1920 is the readability ceiling: a 27" (2560) display now
     fills edge to edge, 4K/5K stops before a table row spans 2500px. */
  --ns-page-max: 1920px;
  --ns-page-gutter: 32px;
```

然後把 `.ns-detail-page` 那一段（`globals.css:949-954`）改成：

```css
/* ── Page shell: the single width + gutter contract for top-level routes ──
   Every capped route wraps its content in .ns-page. Vertical padding stays
   with each route (they differ); only the horizontal gutter and the width
   ceiling live here. */
.ns-page {
  width: 100%;
  max-width: var(--ns-page-max);
  margin-inline: auto;
  padding-inline: var(--ns-page-gutter);
}
/* Phones: match the 16px the routes previously got from Tailwind `px-4`. */
@media (max-width: 639px) {
  :root { --ns-page-gutter: 16px; }
}
/* Wide desktop: a little more breathing room now that content reaches 1920. */
@media (min-width: 1600px) {
  :root { --ns-page-gutter: 48px; }
}

/* ── Detail pages: cash-flow category / merchant ── */
.ns-detail-page {
  max-width: var(--ns-page-max);
  margin: 0 auto;
  padding: 24px var(--ns-page-gutter) 120px;
}
```

**Verify**：
```bash
grep -n "ns-page-max\|ns-page-gutter\|^\.ns-page {" src/styles/globals.css
```
→ 應看到 `:root` 內的兩個 token 定義、兩個 media query 覆寫、`.ns-page {`，
以及 `.ns-detail-page` 內兩處 `var(--ns-page-*)`。

### Step 2: 三胞胎路由（Dashboard / Goals / Accounts）

這三處的外框逐字相同。每一處都改成：

```tsx
  return (
    <div className="ns-page pt-6 pb-28 sm:pb-[120px]">
```

也就是：加 `ns-page`、**拿掉 `px-4` 與 `sm:px-8`**（水平 padding 現在由 token 提供）、
**整個 `style={{ maxWidth: 1180, margin: "0 auto" }}` 刪除**。垂直 padding（`pt-6 pb-28
sm:pb-[120px]`）原封不動。

**Verify**：
```bash
grep -n "ns-page" src/routes/DashboardRoute.tsx src/routes/GoalsRoute.tsx src/routes/AccountsRoute.tsx
grep -n "1180" src/routes/DashboardRoute.tsx src/routes/GoalsRoute.tsx src/routes/AccountsRoute.tsx
```
→ 第一條各 1 命中；第二條**零命中**。

### Step 3: CashFlowRoute（兩處）

- `:1878`（loading）：`<div className="grid gap-5 p-1 max-w-[1180px] mx-auto">`
  → `<div className="ns-page grid gap-5 py-1">`
  （`p-1` 的水平 4px 換成頁面 gutter，讓 skeleton 與載入後的內容左緣對齊；垂直保留 `py-1`。）
- `:1914`（本體）：`<div className="px-4 pt-6 pb-28 sm:px-8 sm:pb-[120px] max-w-[1180px] mx-auto">`
  → `<div className="ns-page pt-6 pb-28 sm:pb-[120px]">`

**Verify**：
```bash
grep -cn "ns-page" src/routes/CashFlowRoute.tsx   # → 2
grep -n "1180" src/routes/CashFlowRoute.tsx        # → 零命中
```

### Step 4: InvestmentsRoute（兩處）

- `:517-520`（loading）→
  ```tsx
      <div className="ns-page grid gap-5 pt-6 pb-[120px]">
  ```
- `:556-559`（本體）→
  ```tsx
      <div className="ns-invest-page ns-page pt-6 pb-[120px]">
  ```
  **`ns-invest-page` 必須留著** —— 它帶 `min-width: 0; width: 100%; overflow-x: clip`
  以及 ≤900px 的 `!important` padding；拿掉會讓投資頁的水平溢出保護消失。

`pt-6` = 24px、`pb-[120px]` = 120px，與原本 inline 的 `24px … 120px` 等值；水平 32px 改由
gutter 提供（≤639px 變 16px，是與其他頁一致的改善；≤900px 仍由既有 `!important` 規則吃掉）。

**Verify**：
```bash
grep -n "ns-page\b" src/routes/InvestmentsRoute.tsx   # → 2 處
grep -n "1180" src/routes/InvestmentsRoute.tsx         # → 零命中
```

### Step 5: AnnualReportRoute（兩處）

- `:152-156`（loading）→ `<div className="ns-page grid gap-5 pt-6 pb-[120px]">`
- `:183-187`（本體）→ `<div className="ns-annual-report ns-page pt-6 pb-[120px]">`
  **`ns-annual-report` 必須留在第一位且保留** —— 列印覆蓋（`globals.css:2112-2116`）
  是靠這個 class 的 `!important` 把寬度限制拿掉的。

**Verify**：
```bash
grep -n "ns-page\b" src/routes/AnnualReportRoute.tsx   # → 2 處
grep -n "1180" src/routes/AnnualReportRoute.tsx         # → 零命中
grep -rn "1180" src/ | grep -v "\.test\."               # → 全 repo 零命中
```

### Step 6: 加 e2e 寬度斷言

新建 `src/test/e2e/page-width.spec.ts`。這是本計畫唯一能自動化的判準——「有沒有滿版」
用眼睛看很主觀，用 bounding box 量很客觀。

```ts
import { expect, test } from "@playwright/test";

// The overview renders its empty state without any data or network, so these
// two cases need no fixtures — they measure the page shell, not the content.
async function pageShellWidth(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
  await page.goto("/");
  const shell = await page.locator(".ns-page").first().boundingBox();
  expect(shell).not.toBeNull();
  return shell!.width;
}

test.describe("wide desktop", () => {
  test.use({ viewport: { width: 2560, height: 1440 }, isMobile: false, hasTouch: false });

  test("content grows to the 1920 ceiling instead of sitting at 1180", async ({ page }) => {
    const width = await pageShellWidth(page);
    expect(width).toBeGreaterThan(1900);
    expect(width).toBeLessThanOrEqual(1920);
  });
});

test.describe("laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  // Below the ceiling the shell must fill its column exactly — no gutters, and
  // no regression from the old 1180 behaviour (which was already full-bleed here).
  test("fills the main column edge to edge", async ({ page }) => {
    const width = await pageShellWidth(page);
    const main = await page.locator("main.ns-app-main").boundingBox();
    expect(main).not.toBeNull();
    expect(Math.abs(width - main!.width)).toBeLessThanOrEqual(1);
  });
});
```

`isMobile: false` / `hasTouch: false` 是為了讓 `playwright.config.ts` 裡的 `mobile`
（iPhone 15）project 跑到這支 spec 時，也是在量桌機視窗，而不是量 iPhone。

**Verify**：
```bash
npx playwright test src/test/e2e/page-width.spec.ts
```
→ 2 個 test（× 2 projects = 4 個結果）全過。

### Step 7: 全套閘門

```bash
npx tsc --noEmit && npm run lint && npm run format:check && npm test && npm run build
```
→ 全部 exit 0；`npm test` 仍是 130 檔 / 1512 過（本計畫不新增 unit test，數字不該變）。

**Verify**：把上面的實際輸出貼進回報。

## Test plan

- **不新增 unit test**：這一批改動沒有任何可測的純函式，寬度是 CSS 行為。硬寫 jsdom
  測試只會測到 jsdom 的 layout stub（它不做真實 layout），是假綠燈。
- **新增 e2e**（step 6）：`src/test/e2e/page-width.spec.ts`，2 個 case——
  2560 視窗封頂在 1920、1280 視窗貼齊主欄。結構照 `src/test/e2e/smoke.spec.ts`
  （同樣用 `addInitScript` 關掉 onboarding overlay；不需要它的 network stub，
  因為本 spec 不斷言 console error）。
- **既有 e2e 不能壞**：`smoke.spec.ts` 斷言總覽空狀態文字「先建立第一個帳戶，Northstar
  會開始計算總覽。」與 `/cash-flow` 的月份切換按鈕，兩者都在本計畫動到的外框內。
  跑 `npx playwright test` 全套確認。

## Done criteria

全部必須成立：

- [ ] `grep -rn "maxWidth: 1180\|max-w-\[1180px\]" src/` → 零命中
      （**修正 2026-07-30**：原本這裡還有一條「`grep -rn "1180" src/` 零命中」——
      那條寫壞了，因為 Step 1 自己要求的 CSS 註解與 Step 6 的 test 名稱都包含字串
      「1180」。判準要斷言**魔術數字用法**為 0，不是斷言字串不存在。）
- [ ] `grep -c "ns-page\"\|ns-page " src/routes/*.tsx` 合計 9 處套用（Dashboard 1、Goals 1、
      Accounts 1、CashFlow 2、Investments 2、AnnualReport 2）。
      **不要用 `ns-page\b`** —— `\b` 在 `-` 之前成立，會把既有的 `ns-page-tabs` 也算進來
      （`InvestmentsRoute.tsx:620`），得到 10。
- [ ] `src/routes/InvestmentsRoute.tsx` 本體外框仍含 `ns-invest-page`；
      `src/routes/AnnualReportRoute.tsx` 本體外框仍含 `ns-annual-report`
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm run lint` exit 0（0 errors）
- [ ] `npm run format:check` exit 0
- [ ] `npm test` exit 0，130 檔 / 1512 過（與 baseline 相同）
- [ ] `npx playwright test` 全過，含新增的 `page-width.spec.ts`
- [ ] `npm run build` exit 0
- [ ] `git status` 顯示只有 in-scope 的 7 個檔案被改 + 1 個新檔；**沒有 node_modules**

## STOP conditions

停下來回報，不要自行發揮：

- 任何一處「現況」excerpt 與實際程式碼對不上（drift）。
- `npm test` 的通過數不是 1512，或有任何既有測試轉紅——本計畫不該影響任何 unit test。
- `page-width.spec.ts` 在 2560 視窗量到的寬度 **> 1920 或 < 1900**：前者代表 token
  沒生效或被別的規則蓋掉，後者代表有你沒發現的第二個上限/padding 來源。回報實際數字，
  不要用「調整期望值」讓測試變綠。
- 年度報表列印預覽（`⌘P` 或 print CSS）在改動後出現左右留白或內容被裁切——代表
  `ns-annual-report` 的 `!important` 覆蓋鏈斷了。
- 你發現任何路由的內容在寬螢幕下**橫向溢出**（出現水平捲軸）。這代表某個內部元素有
  固定寬度假設，屬於本計畫沒預期到的耦合：回報是哪個元素，不要順手改它。

## Maintenance notes

- 之後要調整全站寬度或 gutter，改 `globals.css` 的 `--ns-page-max` / `--ns-page-gutter`
  一處即可，**不要**再回到路由裡寫死數字。新增頂層路由時直接掛 `.ns-page`。
- **審查重點**：(1) `ns-invest-page` 與 `ns-annual-report` 兩個 class 有沒有被誤刪
  （前者掉了會失去 `overflow-x: clip`，後者掉了會壞列印）；(2) 有沒有人順手把
  out-of-scope 那四個「本來就滿版」的路由也套上 `.ns-page`（那會讓它們變窄，是回歸）。
- **刻意留到之後的**：
  - 內容變寬後，`.ns-dash-row2/3`（`auto-fit, minmax(360px|240px, 1fr)`）在 1920 下會
    長出比現在更多的欄。這是 `auto-fit` 的正確行為，但**版面節奏是否還好看需要人眼判斷**，
    不在本計畫內。若 operator 覺得欄太多太瘦，那是另一份「寬螢幕版面節奏」計畫。
  - 持倉表在 1920 下每欄會變寬。表格本身用的是自己的 grid template，功能上沒問題，
    但欄寬比例可能值得重新分配——同樣另案。
  - `SettingsRoute` 的 `220px + 1fr` full-height grid 仍是第二套寬度模型。統一它需要
    改動滾動容器結構，風險不成比例，刻意不做。
