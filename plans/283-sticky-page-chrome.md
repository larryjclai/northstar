# Plan 283: 記帳／投資的頁首與分頁列固定（sticky page chrome）

> # ⛔ SUPERSEDED — 不要執行這份計畫
>
> **由 [plan 284](284-top-edge-contract-and-condensing-chrome.md) 取代**（2026-07-31，
> operator 指定用 `/impeccable` 重新調查後）。在真實 dev server 上量測推翻了本計畫的核心假設：
>
> - 「把頁首整塊釘住」在 390×780 要吃掉 **236px = 視窗高度的 30.3%**，所以本計畫才需要
>   一個「手機只釘分頁列」的斷點分岔。284 改用**凝縮式頁首**，桌機 132px → 約 52px、
>   手機 236px → 約 90px，**不需要斷點分岔**。
> - 更重要的是：量測過程中找到一個**已經在線上的 bug** —— 投資 → 分析的區塊導覽列
>   （`sticky; top:0; z:20`）與示範模式橫幅（`sticky; top:0; z:30`）**垂直重疊 46px（100%）**，
>   `document.elementFromPoint()` 命中的是橫幅。示範模式下那條導覽列**完全不可點擊**。
>   本計畫會在那之上再疊一層 sticky；284 把「修好它」變成獨立可出貨的 Phase A。
>
> 本計畫的技術細節（三個遮擋來源、z-index 階梯、`overflow: clip` 風險、designTokens 陷阱）
> **仍然正確**，已整併進 284。保留此檔僅供對照，**不要派工**。

> **Executor instructions**: 在 git worktree 的分支 `feat/ai-sticky-page-chrome` 上工作。
> **第一件事**：`pwd` 確認在 worktree；接著 `git checkout -b feat/ai-sticky-page-chrome main`
> 然後 `git log --oneline -3`，第一行必須是 `f62b3c0b Merge branch 'fix/ai-dependabot-highs'`。
> 看不到就 STOP 回報（worktree 的預設基準 commit 可能比 `main` 舊 —— 280 派工時踩過這個坑）。
> 逐步執行，每步跑完 verify 才往下走。遇到 STOP condition 就停下來回報，**不要自行發揮**。
> **不要**動 `plans/`（advisor 維護）。
>
> **Drift check**（進 Step 1 之前跑）：
> ```bash
> git diff --stat f62b3c0b..HEAD -- src/styles/globals.css src/components/AppShell.tsx src/routes/CashFlowRoute.tsx src/routes/InvestmentsRoute.tsx src/routes/InvestmentsAnalyticsTab.tsx
> ```
> 空輸出才往下走；有輸出就把下面每一段 excerpt 與實際程式碼逐字比對，對不上即 STOP。

## Status

- **Priority**: P3 · **Effort**: M · **Risk**: MEDIUM（動到全站共用的 layout / z-index / 安全區堆疊，錯了會在特定平台才炸）
- **Depends on**: 279（`--ns-page-gutter` / `.ns-page`，已 merge）
- **Category**: UI / layout
- **Planned at**: commit `f62b3c0b`, 2026-07-31
- **Requested by**: operator, 2026-07-31

## What and why

Operator 的原話：

> 記帳和投資的上面的新增交易和 tab 好像改成凍結會比較方便，因為我往下找交易紀錄的時候，
> 還是可以很快速的新增交易，不用再自己滾回最上面。

兩條路由的頁首都是**純靜態流內元素**，往下捲就消失：

`src/routes/CashFlowRoute.tsx:1912-2075` —— 根元素 `.ns-page pt-6 pb-28 sm:pb-[120px]`，
接一個 header `<div className="flex items-end justify-between gap-4 mb-[22px] flex-wrap">`
（含 `記一筆` / `篩選` / 日期選擇），再接分頁列
`<div className="flex mb-6 overflow-x-auto" style={{ borderBottom: ... }}>`（交易 / 分類 / 商家 / 週期規則）。

`src/routes/InvestmentsRoute.tsx:552-651` —— 根元素 `.ns-invest-page ns-page pt-6 pb-[120px]`，
header `<div className="ns-invest-header flex items-end justify-between mb-0">`
（含 `新增交易` / `更新報價` / ⋯），中間一個條件式 `statusMessage`，再接
`<div className="ns-page-tabs" style={{ ... marginTop: 20, marginBottom: 22 }}>`（持倉 / 交易紀錄 / 定期定額 / 分析）。

交易列表動輒數百列，捲到中段要新增一筆就得整段捲回頂端。把「頁首 + 分頁列」釘住即可。

### 這件事沒有看起來那麼單純 —— 四個必須處理的既有互動

**1. 示範模式橫幅已經佔了 `top: 0`。** `src/components/AppShell.tsx:491-501`：

```tsx
        {demoActive ? (
          <div
            className="ns-scroll-edge flex items-center gap-3 text-body py-2 px-4 accent"
            data-stuck={bannerStuck}
            style={{
              background: "var(--ns-accent-soft)",
              position: "sticky",
              top: 0,
              zIndex: 30,
            }}
          >
```

它是 `z-index: 30`。若頁首也釘在 `top: 0`，示範模式下兩者會**完全重疊**，而且橫幅贏。
頁首必須釘在**橫幅下緣**，也就是要知道橫幅的高度（它會隨視窗寬度換行而變）。

**2. macOS 有一條 28px 的固定拖曳條蓋在最上緣。** `src/styles/globals.css:646-648`：

```css
.ns-titlebar-drag { display: none; }
html[data-native-glass] .ns-titlebar-drag { display: block; position: fixed; top: 0; left: 0; right: 0; height: 28px; z-index: 30; }
html[data-native-glass] .ns-app-main { padding-top: 28px; }
```

`top: 0` 的 sticky 元素會鑽到這條 `position: fixed` 的拖曳條底下。
（順帶一提：**現在的示範模式橫幅就有這個 bug**——它也是 `top: 0`。這份計畫會一併修好，
因為堆疊要正確就必須讓兩者用同一個基準。）

**3. iOS 有瀏海。** `src/components/AppShell.tsx:489` 給 `main` 上了
`paddingTop: "env(safe-area-inset-top)"`。但 sticky 的偏移是相對於 **viewport**，
不是相對於那層 padding —— `top: 0` 在 iPhone 上就是「貼在瀏海底下的動態島區域」。

**4. 已經有三個 sticky 元素會被新頁首蓋住。**

| 位置 | 現況 | 被蓋住的後果 |
|---|---|---|
| `src/routes/InvestmentsAnalyticsTab.tsx:780` | `sticky top-0 z-20`（分析分頁的區塊導覽列） | **就在同一條路由上**。釘住後它會滑到頁首底下、完全看不見 |
| `src/routes/CashFlowRoute.tsx:2535` | `lg:sticky lg:top-5`（右欄「固定收支 / 未結清」） | 桌機捲動時上緣被頁首吃掉 |
| `src/routes/InvestmentsRoute.tsx:916` | `lg:sticky lg:top-4`（持倉的側欄） | 同上 |

這三處都要改成「頁首高度 + 既有間距」。

### 設計決定：手機只釘分頁列，不釘整個頁首

Operator 給的兩張截圖都是寬版桌機。在 `<1024px` 的手機上，頁首會換行成
兩到三列（`flex-wrap` + `ns-invest-header-actions` 的 `flex-wrap`），釘住整塊等於
在 ~700px 高的視窗裡永久吃掉 ~200px —— 那比原本的問題更糟。

而且手機**已經有兩個更快的新增入口**：全域的 Quick-Add FAB（`AppShell.tsx` 的
`.ns-app-shell > button`）與底部 dock。所以：

- **≥1024px**：頁首 + 分頁列整塊釘住。
- **<1024px**：只有分頁列釘住（切換分頁仍然免捲動），頁首照常捲走。

斷點用 **`1024px`（Tailwind `lg`）**，而且**只能用 `max-width` / `min-width` 媒體查詢**。
**絕對不要用 `pointer: coarse` 判斷手機** —— Tauri 的 WKWebView 在桌機也回報
`pointer: coarse = true`，這個坑在 plans 244/245 踩過兩次。

若你認為這個決定不對 → 實作完照做的版本，然後在回報裡說明理由，**不要自行改成兩邊都釘**。

## Files in scope

**新增**
- `src/hooks/useStickyChrome.ts`

**修改**
- `src/styles/globals.css`
- `src/components/AppShell.tsx`
- `src/routes/CashFlowRoute.tsx`
- `src/routes/InvestmentsRoute.tsx`
- `src/routes/InvestmentsAnalyticsTab.tsx`
- `src/test/e2e/sticky-chrome.spec.ts`（新增測試檔）

## Files explicitly OUT of scope — 看起來相關但不要碰

| 檔案 | 為什麼不碰 |
|---|---|
| `src/routes/DashboardRoute.tsx`、`AccountsRoute.tsx`、`GoalsRoute.tsx`、`SettingsRoute.tsx`、`ReconcileRoute.tsx`、`AnnualReportRoute.tsx` | Operator 只點名記帳與投資。其他路由沒有分頁列，也沒有「捲很遠」的清單。**不要順手全站套用** |
| `src/routes/MerchantDetailRoute.tsx`、`CategoryDetailRoute.tsx` | 用的是 `.ns-detail-page`，另一套版面契約 |
| `src/components/AppShell.tsx` 的 sidebar / dock / FAB | 已經是 sticky/fixed，不要動 |
| `@media print` 區塊（`globals.css:2140+`） | 列印會把 `.ns-app-main` 的 overflow 改掉；新的 sticky 元素在列印時**必須**退回 static —— 這件事由 Step 1 的 print 覆寫處理，其餘列印規則不要碰 |

## 專案慣例（照抄，不要自創）

1. **樣式優先序**（AGENTS.md）：(1) COSS 元件；(2) `ns-*` utility class 與 Tailwind；
   (3) inline `style={{}}` **僅限動態值**。這份計畫的固定行為是**靜態樣式** →
   必須是 `globals.css` 裡的 `ns-*` class，**不可以**寫成 inline `position: "sticky"`。
   （唯一允許的 inline 是把量到的高度寫成 CSS 變數 —— 那是動態值。）
2. **「釘住時才顯示分隔線」用既有的 `.ns-scroll-edge` + `data-stuck` 機制**
   （`globals.css:684-692`），不要自己寫 box-shadow。
3. **偵測「是否已釘住」用 IntersectionObserver sentinel**，不要用 `window.scrollY > 0` ——
   `InvestmentsAnalyticsTab.tsx:690-712` 的註解解釋了為什麼：元素不在 scrollY 0 的位置時，
   `scrollY > 0` 會在它還在頁面中段時就把邊框點亮。這兩個頁首在 `.ns-page pt-6`
   底下（距頂 24px），正是那個情形。

---

## Step 1 — CSS：sticky chrome 的偏移契約

**做什麼**：把「頁面固定元素該釘在哪」變成一個全站共用的 CSS 變數，之後所有 sticky 都以它為基準。

在 `src/styles/globals.css` 的 **`.ns-scroll-edge` 定義正下方**（現在的第 692 行之後）加入：

```css
/* ── Sticky page chrome (plan 283) ─────────────────────────────────────────
   Where the topmost pinned element may sit. Three things already occupy the
   viewport's top edge and every sticky element must clear all of them:
     1. iOS notch / Dynamic Island  → env(safe-area-inset-top)
     2. macOS overlay title bar     → the 28px fixed .ns-titlebar-drag strip
        (NOT --ns-titlebar-inset, which is 40px and sizes sidebar padding,
        not the strip)
     3. the demo-mode banner        → measured at runtime by AppShell into
        --ns-demo-banner-h, because it wraps at narrow widths
   Anything that pins itself uses `top: var(--ns-sticky-top)`, and anything
   pinned *below* the page chrome adds --ns-page-chrome-h on top of that. */
html { --ns-sticky-top: env(safe-area-inset-top, 0px); }
html[data-native-glass] { --ns-sticky-top: calc(28px + env(safe-area-inset-top, 0px)); }
/* Both are overwritten at runtime by an inline style (AppShell measures the
   banner, each route measures its own chrome). They MUST still be declared
   here: src/styles/designTokens.test.ts only counts a token as "defined" when
   it appears as a CSS declaration or as a plain quoted key in a TSX style
   object — a computed key like `["--ns-x" as string]:` does not match its
   regex, so without these two lines every `var()` below would read as a
   reference to an undefined token and fail that suite. */
.ns-app-shell {
  --ns-demo-banner-h: 0px;
  --ns-page-chrome-h: 0px;
}

/* The pinned block itself. Bleeds into the page gutter so content scrolling
   underneath is covered edge to edge (a gutter-width strip of moving content
   beside an opaque header reads as a rendering bug). */
.ns-page-chrome,
.ns-page-chrome-tabs {
  top: calc(var(--ns-sticky-top, 0px) + var(--ns-demo-banner-h, 0px));
  z-index: 25;
}
@media (min-width: 1024px) {
  .ns-page-chrome {
    position: sticky;
    background: var(--ns-bg);
    margin-inline: calc(var(--ns-page-gutter) * -1);
    padding-inline: var(--ns-page-gutter);
  }
}
/* Phones/tablets: pinning the whole header would eat ~200px of a ~700px
   viewport once the action row wraps, and Quick-Add is already one tap away
   via the FAB. Pin only the tab strip. Breakpoint is width-based on purpose:
   Tauri's WKWebView reports pointer:coarse on desktop too (plans 244/245). */
@media (max-width: 1023px) {
  .ns-page-chrome-tabs {
    position: sticky;
    background: var(--ns-bg);
    margin-inline: calc(var(--ns-page-gutter) * -1);
    padding-inline: var(--ns-page-gutter);
  }
}
```

再到 `@media print` 區塊（現在的第 2154 行 `.ns-app-shell { display: block !important; }` 附近）
加一條，確保列印時不會有元素被釘住而重複出現：

```css
  .ns-page-chrome,
  .ns-page-chrome-tabs {
    position: static !important;
  }
```

**Verify**：
```bash
grep -n "ns-page-chrome" src/styles/globals.css   # 期望 >= 5 命中（含 print）
npx vitest run src/styles/designTokens.test.ts
```
預期：designTokens 測試仍全綠。**若它轉紅**，幾乎一定是上面那三個新 token 有哪個沒被
它認成「已定義」—— 讀 `collectDefinedTokens` 的兩條 regex（`designTokens.test.ts:49-58`）
把定義寫成它認得的形狀，**不要**把新 token 加進 `KNOWN_FALLBACK_ONLY_TOKENS`
（那份清單的註解寫明「Shrink this list; do not grow it」）。改不動就 STOP 回報。

---

## Step 2 — AppShell：量測示範橫幅，並讓它自己也守偏移契約

**做什麼**：填 `--ns-demo-banner-h`，並修掉橫幅目前 `top: 0` 鑽到 macOS 拖曳條底下的既有 bug
（不修的話，頁首會被推到橫幅下方、但橫幅本身位置錯了，堆疊仍然對不上）。

在 `src/components/AppShell.tsx` 的 `bannerStuck` state（第 142-150 行）**正下方**加入量測：

```tsx
  // The banner wraps at narrow widths, so its height can't be a constant —
  // every sticky page chrome below it offsets by this measured value.
  const bannerRef = useRef<HTMLDivElement>(null);
  const [bannerHeight, setBannerHeight] = useState(0);
  useEffect(() => {
    const el = bannerRef.current;
    if (!el) {
      setBannerHeight(0);
      return;
    }
    const measure = () => setBannerHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [demoActive]);
```

（`useRef` / `useEffect` / `useState` 這個檔案已經匯入了，確認一下就好。）

把量到的值掛到 shell 根元素（第 174-181 行的 `style`，**在既有的兩個屬性之後**追加）：

```tsx
        // Consumed by .ns-page-chrome / .ns-page-chrome-tabs — see globals.css.
        ["--ns-demo-banner-h" as string]: `${bannerHeight}px`,
```

橫幅本身（第 491-501 行）：加 `ref={bannerRef}`，並把 `top: 0` 改成
`top: "var(--ns-sticky-top, 0px)"`。

**Verify**：
```bash
npx tsc --noEmit && npm run lint
```
預期：tsc 0、lint **0 errors**（799 個既有 warning 不動）。

**STOP condition**：若 TypeScript 拒絕 `["--ns-demo-banner-h" as string]` 這個寫法，
先在 repo 裡找既有的 CSS 變數 inline 寫法照抄（`grep -rn '"--ns-' src/ --include="*.tsx"`）；
找不到範例就 STOP 回報，不要用 `as any` 繞過。

---

## Step 3 — `useStickyChrome` hook

**做什麼**：一支同時解決「量頁首高度」與「是否已釘住」的 hook，兩條路由共用。

建立 `src/hooks/useStickyChrome.ts`：

```ts
import { useEffect, useRef, useState } from "react";

/**
 * Wiring for a pinned page header (plan 283). Returns three things a route
 * needs and would otherwise duplicate:
 *
 *   sentinelRef — a 1px out-of-flow marker rendered *just before* the chrome.
 *                 Its own position never changes, so "sentinel left the
 *                 viewport" is exactly "the chrome is now pinned". A plain
 *                 `scrollY > 0` check would be wrong here: `.ns-page pt-6`
 *                 puts the chrome 24px down the page, so the border would
 *                 light up before it actually sticks (same reasoning as
 *                 InvestmentsAnalyticsTab's nav sentinel).
 *   chromeRef   — measured so descendants can pin *below* the chrome via
 *                 --ns-page-chrome-h.
 *   stuck       — feed to `data-stuck` alongside the `.ns-scroll-edge` class.
 *
 * The measured height is intentionally reported even when the chrome is not
 * currently sticky (phones pin only the tab strip): the CSS var is read inside
 * `lg:` utilities that are themselves breakpoint-gated, so a stale value on the
 * other side of the breakpoint is never consumed.
 */
export function useStickyChrome() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, chromeRef, stuck, height };
}
```

> **已知且可接受的不精確**：sentinel 用預設的 viewport root，所以在 macOS（28px 拖曳條）
> 或示範模式下，「已釘住」會比實際晚 `--ns-sticky-top + --ns-demo-banner-h` 個像素才判定。
> 那只影響分隔線點亮的時機，不影響定位。**不要**為此加 `rootMargin` 的動態計算 ——
> 那需要把 CSS 變數讀回 JS，得不償失。

**Verify**：
```bash
npx tsc --noEmit
```

---

## Step 4 — 記帳路由

在 `src/routes/CashFlowRoute.tsx` 的元件內加 `const chrome = useStickyChrome();`
（放在其他 hook 附近，import 從 `"../hooks/useStickyChrome"`）。

第 1912-2075 行的結構改成：把 header `<div>` 與分頁列 `<div>` **一起包進**一層新的 wrapper：

```tsx
    <div className="ns-page pt-6 pb-28 sm:pb-[120px]">
      {/* Sticky chrome sentinel — out of flow so it can't shift layout; its
          static position is what tells us the chrome above has pinned. */}
      <div
        ref={chrome.sentinelRef}
        aria-hidden="true"
        style={{ position: "absolute", width: 1, height: 1 }}
      />
      <div ref={chrome.chromeRef} className="ns-page-chrome ns-scroll-edge" data-stuck={chrome.stuck}>
        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-[22px] flex-wrap">
          ... 原封不動 ...
        </div>

        <div
          className="ns-page-chrome-tabs ns-scroll-edge flex mb-6 overflow-x-auto"
          data-stuck={chrome.stuck}
          style={{ borderBottom: "1px solid var(--ns-border)" }}
        >
          ... 原封不動 ...
        </div>
      </div>
```

**注意事項**：
- header 與分頁列的**內容一行都不要改**。只是多包一層 + 分頁列多兩個 class 與 `data-stuck`。
- 分頁列原本的 `mb-6` 留在原處。wrapper **不要**加 margin —— 加了會在釘住時出現一條透明縫。
- `.ns-scroll-edge` 只加 `border-bottom` 的顏色過渡，分頁列已經有自己的 `borderBottom`
  inline style。**兩者會衝突**：inline 的 border 永遠可見，`.ns-scroll-edge` 的
  `border-bottom: 1px solid transparent` 會被 inline 蓋掉。所以**分頁列不要加
  `.ns-scroll-edge` 與 `data-stuck`** —— 它本來就有線。修正上面的片段：分頁列只加
  `ns-page-chrome-tabs`，class 寫成 `"ns-page-chrome-tabs flex mb-6 overflow-x-auto"`。
  `.ns-scroll-edge` + `data-stuck` **只掛在 wrapper 上**。

接著修被蓋住的側欄（第 2535 行）：

```tsx
            <div className="flex flex-col gap-5 lg:sticky self-start">
```
並加上動態 top（**這是動態值，允許 inline**）：
```tsx
              style={{ top: `calc(var(--ns-sticky-top, 0px) + var(--ns-demo-banner-h, 0px) + ${chrome.height}px + 20px)` }}
```
（`20px` 就是原本的 `lg:top-5`。移除 `lg:top-5` class，避免兩者打架。）

> ⚠️ inline `top` 在 `<1024px` 也會套用，但那裡 `position` 是 `static`，`top` 對 static
> 元素無效 —— 所以不需要額外的斷點判斷。

**Verify**：
```bash
npx tsc --noEmit && npm run lint && npm test
```

---

## Step 5 — 投資路由 + 分析分頁

`src/routes/InvestmentsRoute.tsx`：同樣加 `const chrome = useStickyChrome();`，
把第 553-651 行的 header、`statusMessage` 區塊、分頁列**三者一起**包進
`ns-page-chrome ns-scroll-edge` 的 wrapper（`statusMessage` 要一起包，否則它會夾在
釘住的頁首與內容之間、跟著捲動而穿過頁首）。分頁列加 `ns-page-chrome-tabs`
到它既有的 `className="ns-page-tabs"` 上（變成 `"ns-page-tabs ns-page-chrome-tabs"`）。

sentinel 一樣放在 wrapper 之前。

側欄（第 916 行）：移除 `lg:top-4`，改成與 Step 4 相同的 inline `top`
（`+ 16px` 對應原本的 `lg:top-4`）。

`src/routes/InvestmentsAnalyticsTab.tsx` 第 779-785 行的區塊導覽列：
把 `sticky top-0 z-20` 的 `top-0` 拿掉，改用 inline top：

```tsx
      <nav
        className="ns-scroll-edge sticky z-20 flex items-center gap-1 -mb-2 overflow-x-auto"
        data-stuck={navStuck}
        style={{
          padding: "8px 0",
          background: "var(--ns-bg)",
          top: "calc(var(--ns-sticky-top, 0px) + var(--ns-demo-banner-h, 0px) + var(--ns-page-chrome-h, 0px))",
        }}
      >
```

要讓 `--ns-page-chrome-h` 在這裡讀得到，`InvestmentsRoute` 的根元素要把量到的高度寫成變數
（`.ns-page-chrome` 的 wrapper 是 sticky，變數掛在**根元素**才涵蓋所有子樹）：

```tsx
    <div
      className="ns-invest-page ns-page pt-6 pb-[120px]"
      style={{ ["--ns-page-chrome-h" as string]: `${chrome.height}px` }}
    >
```

> `z-20 < z-25`，所以分析導覽列會**滑到頁首底下**而不是壓在上面 —— 這是正確的層級關係，
> 不要把它調到 25 以上。

**Verify**：
```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

**STOP condition**：`.ns-invest-page` 有 `overflow-x: clip`（`globals.css:1403-1407`）。
理論上 `clip` 不建立 scroll container，sticky 仍相對 viewport 定位（示範模式橫幅在
`main.ns-app-main` 的 `overflowX: "clip"` 底下就是這樣運作的，是既有的活體證明）。
但若 Step 7 的瀏覽器實測顯示**投資頁首完全不會釘住而記帳的會**，那就是這裡出問題 ——
**STOP 回報，不要靠把 `overflow-x: clip` 拿掉來繞過**（那條是 iOS webview 橫向溢出的防線）。

---

## Step 6 — e2e 迴歸測試

建立 `src/test/e2e/sticky-chrome.spec.ts`。以 `src/test/e2e/page-width.spec.ts` 為範本
（照抄它的 `addInitScript` 關掉 onboarding 的做法）。

```ts
import { expect, test } from "@playwright/test";

async function openRoute(page: import("@playwright/test").Page, path: string) {
  await page.addInitScript(() => {
    window.localStorage.setItem("northstar.onboarding.dismissed.v1", "1");
  });
  await page.goto(path);
  await page.locator(".ns-page-chrome").first().waitFor();
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  for (const path of ["/cash-flow", "/investments"]) {
    test(`page chrome stays pinned while scrolling ${path}`, async ({ page }) => {
      await openRoute(page, path);
      const chrome = page.locator(".ns-page-chrome").first();
      const before = (await chrome.boundingBox())!;
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(200);
      const after = (await chrome.boundingBox())!;
      // Pinned: it moved *up* to the top edge and then stopped there.
      expect(after.y).toBeLessThanOrEqual(before.y);
      expect(after.y).toBeGreaterThanOrEqual(0);
      expect(after.y).toBeLessThanOrEqual(4);
      // And it is still on screen at its full height.
      expect(after.height).toBeCloseTo(before.height, 0);
    });
  }
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });

  test("only the tab strip pins on phones", async ({ page }) => {
    await openRoute(page, "/cash-flow");
    const chrome = page.locator(".ns-page-chrome").first();
    const tabs = page.locator(".ns-page-chrome-tabs").first();
    const chromeBefore = (await chrome.boundingBox())!;
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(200);
    const chromeAfter = await chrome.boundingBox();
    const tabsAfter = (await tabs.boundingBox())!;
    // Header scrolled away (either off-screen entirely, or well above origin).
    expect(chromeAfter === null || chromeAfter.y < chromeBefore.y - 100).toBe(true);
    // Tab strip is pinned at the top.
    expect(tabsAfter.y).toBeGreaterThanOrEqual(0);
    expect(tabsAfter.y).toBeLessThanOrEqual(4);
  });
});
```

路徑已對照 `src/routes/router.tsx:58,81` 查證：投資是 `/investments`，記帳是
**`/cash-flow`（有連字號）**，不是 `/cashflow`。

**Verify**：
```bash
npm run test:e2e
```
預期：既有 6 個 + 新增 3 個 = 9 個通過。

**STOP condition**：若因為沒有資料而頁面高度不足 1200px 導致捲不動，
**不要**把捲動距離改小到失去意義 —— 改成在 `openRoute` 之後先確認
`document.body.scrollHeight > 1500`，不足就用 `page.addInitScript` 種資料，
或 STOP 回報讓 advisor 決定。

---

## Step 7 — 瀏覽器實測（必做）

用 preview 工具起 dev server（**不要用 Bash 跑 `npm run dev`**）。逐項驗證並回報實際觀察：

1. **1440×900 記帳**：捲到底，`記一筆` / `篩選` / 日期選擇 / 四個分頁**全程可見**。
   點 `記一筆` 能開抽屜（確認 sticky 沒有攔截點擊）。
2. **1440×900 記帳**：釘住時頁首下緣出現分隔線（`.ns-scroll-edge` 的 `data-stuck="true"`），
   捲回頂端線消失。
3. **背景不透明**：捲動時交易列**不會**從頁首底下透出來，**包括左右 gutter 區域**
   （這是 `margin-inline` 負值那段的用意）。
4. **1440×900 投資 → 分析**：頁首釘住，且區塊導覽列釘在**頁首正下方**、不重疊、不被遮住。
   點導覽列的任一區塊仍能捲到該區塊（`scrollIntoView`）。
5. **1440×900 投資 → 持倉**：右側欄捲動時上緣**不被頁首吃掉**。
6. **390×780 記帳**：頁首捲走、分頁列釘住；點分頁能切換。
7. **示範模式**（設定 → 一般 → 進入示範模式）於 1440 寬：橫幅在最上、頁首緊貼其下、
   **兩者不重疊也沒有空隙**。
8. **篩選 popover**：在已釘住的狀態下打開，浮層**在頁首之上**（popover 是 z-90 portal），
   而且不會被 sticky 的 stacking context 裁掉。
9. **深色 / 淺色**：兩種主題下頁首背景都與頁面底色一致（`--ns-bg`），沒有色差邊。

截圖 1、4、6、7 四項。

> **macOS 原生視窗（`data-native-glass`）的 28px 拖曳條**只有在 Tauri app 裡才會出現，
> 瀏覽器 preview 驗不到。**不要**為了驗它去跑 `npm run tauri dev`（那會編譯 Rust、很慢）。
> 在回報裡註明「macOS 拖曳條的 28px 偏移未實測，僅由 CSS 保證」——由 advisor 決定要不要補驗。

---

## Done criteria（機器可驗）

```bash
# 1. CSS 契約存在（含 print 覆寫）
grep -c "ns-page-chrome" src/styles/globals.css        # 期望 >= 5
grep -c "ns-sticky-top" src/styles/globals.css         # 期望 >= 3

# 2. 沒有把 sticky 寫成 inline（AGENTS.md 的樣式優先序）
grep -rn 'position: "sticky"' src/routes/CashFlowRoute.tsx src/routes/InvestmentsRoute.tsx   # 期望 0 命中

# 3. 三個被蓋住的 sticky 都改用偏移，不再是硬編 top
grep -n "lg:top-5" src/routes/CashFlowRoute.tsx        # 期望 0 命中
grep -n "lg:top-4" src/routes/InvestmentsRoute.tsx     # 期望 0 命中
grep -n "sticky top-0" src/routes/InvestmentsAnalyticsTab.tsx   # 期望 0 命中

# 4. 沒有用 pointer:coarse 判斷手機（plans 244/245 的教訓）
grep -rn "pointer: coarse\|pointer:coarse" src/styles/globals.css src/hooks/useStickyChrome.ts   # 期望 0 命中

# 5. 範圍乾淨：不該碰的路由零改動
git diff --stat f62b3c0b..HEAD -- src/routes/DashboardRoute.tsx src/routes/AccountsRoute.tsx src/routes/GoalsRoute.tsx src/routes/SettingsRoute.tsx src/routes/ReconcileRoute.tsx src/routes/AnnualReportRoute.tsx   # 期望空輸出

# 6. 全套閘門
npx tsc --noEmit && npm run lint && npm test && npm run build && npm run test:e2e
```

閘門的判準：
- `tsc` exit 0
- `lint` **0 errors**（799 個既有 warning 不動）
- `vitest` 檔案數與測試數**與 baseline 完全相同**（這份計畫不改邏輯，不該有任何單元測試變動）
- `build` exit 0
- `playwright` **9/9**（既有 6 + 新增 3）

**先記錄 baseline**：切分支後、動任何程式碼前跑 `npm test 2>&1 | tail -5` 與
`npm run test:e2e 2>&1 | tail -5`，把數字記下來。

## Test plan

| 新測試 | 檔案 | 跟隨的既有範本 |
|---|---|---|
| 桌機：記帳／投資頁首捲動後仍釘在頂端 | `src/test/e2e/sticky-chrome.spec.ts` | `src/test/e2e/page-width.spec.ts`（boundingBox 量測 + onboarding init script） |
| 手機：只有分頁列釘住 | 同上 | 同上 |

不新增 vitest 單元測試 —— 這份計畫沒有可獨立測試的純邏輯
（`useStickyChrome` 全靠 IntersectionObserver / ResizeObserver，jsdom 兩者都要 polyfill，
測出來的東西不會比 e2e 有價值）。

## STOP conditions（遇到就停下來回報）

1. **投資頁首完全不會釘住而記帳的會** → `.ns-invest-page` 的 `overflow-x: clip` 是嫌疑犯。
   回報，**不要**拿掉那條規則（見 Step 5）。
2. **`designTokens.test.ts` 因為新 CSS 變數轉紅** → 讀它的斷言、照規則登記，改不動就回報。
3. **既有單元測試有任何一個轉紅** → 這份計畫理論上不可能讓單元測試變動，轉紅代表你改到了
   不該改的東西。
4. **你判斷需要動 `AppShell` 的 sidebar / dock / FAB** → 回報。
5. **你想把 sticky 套到 in-scope 之外的路由** → 回報，不要順手做。

## Maintenance note

- **`--ns-sticky-top` 現在是全站「頂端還剩多少空間」的單一真相。** 日後若再加任何
  固定在頂端的東西（例如離線提示條、更新提示列），它必須 (a) 用 `top: var(--ns-sticky-top)`，
  且 (b) 把自己的高度量進一個變數、讓下游元素累加 —— 就像示範模式橫幅這次做的一樣。
  Review 的檢查點：`grep -rn "top: 0" src/components/AppShell.tsx` 應該保持 0 命中。
- **`--ns-titlebar-inset` (40px) 與拖曳條高度 (28px) 是兩個不同的數字**，不要互換。
  前者是 sidebar 的內距預留，後者是實際遮擋高度。這份計畫用的是後者。
- **z-index 階梯**：sticky chrome = 25，分析導覽列 = 20，示範橫幅 = 30，
  macOS 拖曳條 = 30，popover portal = 90，overlay/modal = 998–1000，sidebar = 1100。
  新增任何頁面級固定元素請落在 20–29 之間。
- **手機只釘分頁列是一個產品決定，不是技術限制。** 若 operator 之後反映手機也想要整塊釘住，
  改法是把 `@media (max-width: 1023px)` 那塊換成與桌機相同的規則——但先量一次
  釘住後剩餘的可視高度再決定。
