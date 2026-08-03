# Plan 284: 頂端邊緣契約 + 凝縮式頁首（取代 283）

> **⚠️ 2026-08-02：Phase B 的「凝縮式」已被靜態單列 toolbar 取代（PR #29）。**
> Operator 實際使用後否決捲動兩態變形：「如果要合併成同一行，不如一開始就是同一行」。
> 現行版型：eyebrow + 大標題移出 chrome、自然捲走；chrome 只剩單列 toolbar
> （`.ns-page-toolbar`，分頁左＋動作右），釘住前後形狀不變。**Phase A（頂端邊緣契約）
> 與 Phase B 的高度預算／1024 寬度契約仍然有效**，由改寫後的 `sticky-chrome.spec.ts`
> 續守（新增 no-morph 不變量：pinned 高度 == 靜止高度）。這份文件其餘內容保留作為
> 量測數據與決策脈絡的紀錄，**凝縮式的實作段落不要再照做**。

> **Supersedes plan 283.** 283 的方案是「把頁首整塊釘住」。用 `/impeccable` 在真實 dev server 上
> 量測之後，那個方案在手機上要吃掉 **30.3% 的視窗高度**，而且會**放大一個已經存在的線上 bug**。
> 這份計畫換一個做法，並且**先修那個 bug**。283 的技術細節（sticky 偏移的三個遮擋來源、
> z-index 階梯、`overflow: clip` 的風險）仍然成立，已整併進來。

> **Executor instructions**: 在 git worktree 的分支 `feat/ai-top-edge-contract` 上工作。
> **第一件事**：`pwd` 確認在 worktree；接著 `git checkout -b feat/ai-top-edge-contract main`
> 然後 `git log --oneline -3`，第一行必須是 `3f69a867 Merge branch 'fix/ai-dependabot-highs'`。
> 看不到就 STOP 回報。逐步執行，每步跑完 verify 才往下走。遇到 STOP condition 就停下來回報，
> **不要自行發揮**。**不要**動 `plans/`（advisor 維護）。
>
> **這份計畫分兩階段，Phase A 可以獨立出貨。** 若時間或信心只夠做一半，做完 Phase A 就回報，
> 不要把 Phase B 做到一半。
>
> **Drift check**（進 Step 1 之前跑）：
> ```bash
> git diff --stat 3f69a867..HEAD -- src/styles/globals.css src/components/AppShell.tsx src/routes/CashFlowRoute.tsx src/routes/InvestmentsRoute.tsx src/routes/InvestmentsAnalyticsTab.tsx
> ```
> 空輸出才往下走；有輸出就把下面每一段 excerpt 與實際程式碼逐字比對，對不上即 STOP。

## Status

- **Priority**: P2（Phase A 含一個線上 bug 修復）· **Effort**: M · **Risk**: MEDIUM
- **Depends on**: 279（`--ns-page-gutter` / `.ns-page`，已 merge）
- **Supersedes**: 283（標記為 SUPERSEDED，不要執行）
- **Category**: UI / layout / bug fix
- **Planned at**: commit `3f69a867`, 2026-07-31
- **Requested by**: operator, 2026-07-31（原始需求）+ operator 指定用 `/impeccable` 重新調查

## 調查結果：真正的問題不是「頁首沒有釘住」

Operator 的需求是「捲到交易紀錄中段時還能直接新增交易」。但在真實 dev server 上量測之後，
浮出來的是一個更根本的問題：**這個 app 沒有「誰擁有畫面頂端」的規則，而且已經有一個受害者。**

### 已證實的線上 bug：投資 → 分析 的區塊導覽列在示範模式下完全不可點擊

`InvestmentsAnalyticsTab.tsx:779-785` 的區塊導覽列（報酬 / 貢獻 / 風險 / 股利 / 集中度）是
`position: sticky; top: 0; z-index: 20`。示範模式橫幅（`AppShell.tsx:491-501`）是
`position: sticky; top: 0; z-index: 30`。**兩者都釘在 `top: 0`。**

在 1440×900、`/investments` → 分析、`scrollY = 420` 實測（不是推論，是 `getBoundingClientRect()`
加 `document.elementFromPoint()` 的命中測試）：

```
nav    : top 0 → bottom 46   z-index 20
banner : top 0 → bottom 47   z-index 30
垂直重疊 : 46px  ← 導覽列高度的 100%
elementFromPoint(nav 中心點) → SPAN.flex-1 min-w-0 muted truncate
nav.contains(hit) → false        banner.contains(hit) → true
```

也就是說：**那條導覽列今天在示範模式下被橫幅完全蓋住、點不到**，而它是一個
**4,294px 高**的分頁的主要導覽。截圖上看得見文字疊在一起（「示範模式 報酬 你的資料已安全保存…貢獻…風險」）。

這個 bug 跟 operator 的需求無關 —— 但它證明了：**在沒有偏移契約的情況下再加一層 sticky，
只會製造第二個同樣的 bug。** 所以契約要先建立。

### 量測數據：把頁首整塊釘住的實際代價（示範資料，2026-07-31 dev server）

| 量測項 | 1440×900 | 1024×768 | 390×780 |
|---|---|---|---|
| 記帳 頁首列 | 64px | 64px | **168px（換行成 3 列）** |
| 記帳 分頁列 | 46px | 46px | 46px |
| **記帳 chrome 合計** | 132px（**14.7%**） | 132px（**17.2%**） | **236px（30.3%）** |
| 投資 頁首列 | 64px | — | 114px |
| **投資 chrome 合計** | 130px（14.4%） | — | 180px（**23.1%**） |
| 示範橫幅 | 47px | 47px | 47px |
| 手機底部 dock | — | — | 57.5px |
| 手機 Quick-Add FAB | — | — | 52px |

**手機的數字是關鍵。** 390×780 上，283 的方案會讓固定 chrome 吃掉 236px；加上示範橫幅 47px
與底部 dock 57.5px，實際可讀內容只剩 **439px = 56% 的螢幕**。而且 `記一筆` 在那個 3 列換行的
版面裡是**孤零零地佔滿第 3 列右側**（截圖可見），左邊一整片空白 —— 這是一個獨立於 sticky
議題的既有版面缺陷。

同時：手機**已經有兩個更快的新增入口**（52px 的 Quick-Add FAB + 底部 dock），桌機側欄
**也已經有常駐的「快速記帳 ⌘N」**。所以「把整個頁首釘住」在手機上是拿 30% 的螢幕換一個
已經有替代路徑的按鈕。

283 的處理方式是「手機只釘分頁列」—— 用一個斷點分岔迴避問題。**這份計畫改成解決問題本身。**

## 設計主張（spatial thesis）

> **頂端固定的東西，應該只保留「捲動中仍然需要」的部分，而不是把靜止狀態的版面整塊搬上去。**

拆成兩件事：

### Phase A — 頂端邊緣契約（獨立可出貨，含 bug 修復）

建立 `--ns-sticky-top`：一個全站共用的「頂端還剩多少空間」變數，把三個既有遮擋來源收斂成一個數字：

1. **iOS 瀏海** → `env(safe-area-inset-top)`。注意 `.ns-app-main` 的 `paddingTop: env(...)`
   對 sticky **無效** —— sticky 偏移相對 viewport，`top: 0` 就是貼在動態島底下。
2. **macOS 疊加標題列** → `.ns-titlebar-drag` 是 `position: fixed; height: 28px; z-index: 30`
   （`globals.css:647`）。**`--ns-titlebar-inset` 是 40px，那是 sidebar 的內距預留，不是遮擋高度，
   兩者不可互換。**
3. **示範模式橫幅** → 47px，但**會換行**，所以必須 runtime 量測成 `--ns-demo-banner-h`。

然後讓**現有的兩個 sticky 元素**（示範橫幅、分析導覽列）都改用這個契約 —— 上面那個
100% 重疊的 bug 就是這樣修好的。

**Phase A 就算 Phase B 全部取消也應該出貨。**

### Phase B — 凝縮式頁首（condensing chrome）

捲動時，頁首**不是原樣釘住，而是換一個型態**：

```
靜止（scrollY = 0）                          釘住（已捲動）
┌──────────────────────────────┐          ┌──────────────────────────────┐
│ 2026 / 07                    │  eyebrow │ 記帳  交易 分類 商家 週期規則   [日期][篩選][＋] │ ~52px
│ 記帳          [日期][篩選][記一筆] │  h1 42px └──────────────────────────────┘
│                              │  = 64px
│ 交易 分類 商家 週期規則         │  = 46px
└──────────────────────────────┘  合計 132px
```

- **桌機代價從 132px 降到約 52px（−61%）**，手機從 236px 降到約 90–98px（兩列：標題+動作 / 分頁）。
- **不需要斷點分岔** —— 同一個行為在每個寬度都成立，這是它比 283 好的主要理由。
- 順帶修掉手機頁首換行成 3 列、`記一筆` 孤懸的既有版面缺陷。
- 這是原生平台的標準模式（iOS large title → inline title），符合 Operate mode
  「earned familiarity，工具應該消失在任務裡」的原則。

**寬度約束（已量測，實作時要驗）**：1440 的內容欄寬 1136px，凝縮列需要
標題 ~64 + 分頁 320（記帳）/ 352（投資）+ 動作 416（記帳）/ ~284（投資）≈ **800px** → 寬鬆。
**1024 的內容欄只有 720px**，800 > 720 → 該寬度**必須**讓分頁列沿用它既有的
`overflow-x: auto` 橫向捲動，或讓日期控制凝縮。**不要**讓它換行 —— 換行就等於白做。

## Files in scope

**新增**
- `src/hooks/useStickyChrome.ts`
- `src/test/e2e/sticky-chrome.spec.ts`

**修改（Phase A）**
- `src/styles/globals.css`
- `src/components/AppShell.tsx`
- `src/routes/InvestmentsAnalyticsTab.tsx`

**修改（Phase B）**
- `src/routes/CashFlowRoute.tsx`
- `src/routes/InvestmentsRoute.tsx`

## Files explicitly OUT of scope

| 檔案 | 為什麼不碰 |
|---|---|
| `DashboardRoute` / `AccountsRoute` / `GoalsRoute` / `SettingsRoute` / `ReconcileRoute` / `AnnualReportRoute` | Operator 只點名記帳與投資。**不要順手全站套用** |
| `MerchantDetailRoute` / `CategoryDetailRoute` | 用 `.ns-detail-page`，另一套版面契約 |
| AppShell 的 sidebar / dock / FAB | 已是 sticky/fixed，不要動 |
| 頁首裡任何按鈕的**功能** | 這是版面計畫。`記一筆` / `篩選` / `新增交易` / `更新報價` / ⋯ 的行為一行都不要改 |

## 專案慣例（照抄，不要自創）

1. **樣式優先序**（AGENTS.md §12.8 / DESIGN.md §12.8）：(1) COSS 元件；(2) `ns-*` class 與
   Tailwind utilities；(3) inline `style={{}}` **僅限動態值**。固定/凝縮行為是**靜態樣式** →
   必須寫在 `globals.css` 的 `ns-*` class 裡。唯一允許 inline 的是「量到的高度寫成 CSS 變數」。
2. **`.ns-scroll-edge` + `data-stuck`**（`globals.css:684-692`）是既有的「釘住時才顯示分隔線」
   機制，直接用，不要自己寫 box-shadow。
3. **偵測釘住用 IntersectionObserver sentinel**，不要用 `window.scrollY > 0` ——
   `InvestmentsAnalyticsTab.tsx:690-712` 的註解解釋了原因，而 `.ns-page pt-6` 讓頁首距頂 24px，
   正是那個情形。
4. **手機判斷只能用 `min/max-width` 媒體查詢，禁用 `pointer: coarse`**
   —— Tauri WKWebView 在桌機也回報 coarse（plans 244/245 踩過兩次）。
5. **標題慣例**（DESIGN.md §3.5）：靜止態維持「eyebrow + 中文 h1」。凝縮態才降級成單行小標題。
6. **動效**（DESIGN.md §10）：`--ns-dur` 200ms / `--ns-ease`。凝縮過渡用這組 token，
   **不要**自己寫 duration。`prefers-reduced-motion` 已由 `globals.css:695-712` 的全域規則覆蓋。

---

# Phase A — 頂端邊緣契約

## Step A1 — CSS：`--ns-sticky-top`

在 `src/styles/globals.css` 的 `.ns-scroll-edge` 定義正下方（現在的第 692 行之後）加入：

```css
/* ── Top-edge contract (plan 284) ──────────────────────────────────────────
   Where the topmost pinned element may sit. Three things already occupy the
   viewport's top edge and every sticky element must clear all of them:
     1. iOS notch / Dynamic Island  → env(safe-area-inset-top). The
        `padding-top` on .ns-app-main does NOT help: sticky offsets resolve
        against the viewport, not against an ancestor's padding.
     2. macOS overlay title bar     → the 28px fixed .ns-titlebar-drag strip.
        NOT --ns-titlebar-inset (40px) — that sizes sidebar padding, not the
        strip, and using it here overshoots by 12px.
     3. the demo-mode banner        → measured at runtime by AppShell into
        --ns-demo-banner-h, because it wraps at narrow widths (47px at 390px
        and at 1440px today, but that is data, not a constant).

   Anything pinned below the page chrome adds --ns-page-chrome-h on top.

   Both -h vars are overwritten at runtime by inline styles, but MUST still be
   declared here: src/styles/designTokens.test.ts counts a token as "defined"
   only from a CSS declaration or a plain quoted key in a TSX style object
   (`collectDefinedTokens`, designTokens.test.ts:49-58) — a computed key like
   `["--ns-x" as string]:` does not match, so without these lines every var()
   below reads as a reference to an undefined token and that suite fails. */
html { --ns-sticky-top: env(safe-area-inset-top, 0px); }
html[data-native-glass] { --ns-sticky-top: calc(28px + env(safe-area-inset-top, 0px)); }
.ns-app-shell {
  --ns-demo-banner-h: 0px;
  --ns-page-chrome-h: 0px;
}
```

**Verify**：
```bash
grep -n "ns-sticky-top" src/styles/globals.css      # 期望 >= 2
npx vitest run src/styles/designTokens.test.ts
```
預期全綠。**若轉紅**，讀 `collectDefinedTokens` 的兩條 regex 把定義寫成它認得的形狀，
**不要**把新 token 加進 `KNOWN_FALLBACK_ONLY_TOKENS`（該清單註解寫明 "Shrink this list; do not grow it"）。

## Step A2 — AppShell：量測橫幅，並讓橫幅自己守約

`src/components/AppShell.tsx`，在 `bannerStuck` state（第 142-150 行）**正下方**加入：

```tsx
  // The banner wraps at narrow widths, so its height can't be a constant —
  // every sticky element below it offsets by this measured value.
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

（`useRef` / `useEffect` / `useState` 已在第 20 行匯入。）

shell 根元素（第 174-181 行的 `style`）追加：

```tsx
        // Consumed by the sticky contract — see globals.css.
        ["--ns-demo-banner-h" as string]: `${bannerHeight}px`,
```

橫幅本身（第 491-501 行）：加 `ref={bannerRef}`，並把 `top: 0` 改成
`top: "var(--ns-sticky-top)"`。

**Verify**：
```bash
npx tsc --noEmit && npm run lint
```
預期：tsc 0、lint **0 errors**（799 個既有 warning 不動）。

**STOP condition**：若 TypeScript 拒絕 `["--ns-demo-banner-h" as string]`，
先 `grep -rn '"--ns-' src/ --include="*.tsx"` 找既有寫法照抄；找不到就 STOP，**不要用 `as any` 繞過**。

## Step A3 — 修好分析導覽列（本計畫的 bug 修復）

`src/routes/InvestmentsAnalyticsTab.tsx:779-785`，把 `top-0` 拿掉改用契約：

```tsx
      <nav
        className="ns-scroll-edge sticky z-20 flex items-center gap-1 -mb-2 overflow-x-auto"
        data-stuck={navStuck}
        style={{
          padding: "8px 0",
          background: "var(--ns-bg)",
          // plan 284: clear the notch / macOS strip / demo banner, and (once
          // Phase B lands) the condensed page chrome above.
          top: "calc(var(--ns-sticky-top) + var(--ns-demo-banner-h) + var(--ns-page-chrome-h))",
        }}
      >
```

**Verify（這一步必須用瀏覽器實測，因為它修的是一個只有渲染才看得見的 bug）**：
用 preview 工具起 dev server（**不要用 Bash 跑 `npm run dev`**），進示範模式，
`/investments` → 分析，捲到 `scrollY = 420`，然後跑這段命中測試並**把輸出貼進回報**：

```js
(() => {
  const nav = document.querySelector('nav.ns-scroll-edge');
  const banner = document.querySelector('main.ns-app-main > div');
  const r = e => e.getBoundingClientRect();
  const n = r(nav), b = r(banner);
  const hit = document.elementFromPoint(n.left + n.width / 2, n.top + n.height / 2);
  return {
    navTop: +n.top.toFixed(1), bannerBottom: +b.bottom.toFixed(1),
    verticalOverlapPx: +Math.max(0, Math.min(n.bottom, b.bottom) - Math.max(n.top, b.top)).toFixed(1),
    hitIsInsideNav: nav.contains(hit),
  };
})()
```

**通過判準**：`verticalOverlapPx === 0` 且 `hitIsInsideNav === true`。
（修改前的基準值是 `verticalOverlapPx: 46`、`hitIsInsideNav: false` —— 先在**改動前**跑一次
記錄基準，再跑改動後的，兩組數字都要回報。）

**Phase A 到此可獨立出貨。** 跑完整套閘門（Step 5）後回報，再決定要不要繼續 Phase B。

---

# Phase B — 凝縮式頁首

## Step B1 — `useStickyChrome` hook

建立 `src/hooks/useStickyChrome.ts`：

```ts
import { useEffect, useRef, useState } from "react";

/**
 * Wiring for a condensing page header (plan 284).
 *
 *   sentinelRef — a 1px out-of-flow marker rendered *just before* the chrome.
 *                 Its own position never changes, so "sentinel left the
 *                 viewport" is exactly "the chrome is now pinned". A plain
 *                 `scrollY > 0` check would be wrong: `.ns-page pt-6` puts the
 *                 chrome 24px down the page, so it would condense before it
 *                 actually sticks (same reasoning as the analytics nav's
 *                 sentinel, InvestmentsAnalyticsTab.tsx:690-712).
 *   chromeRef   — measured into --ns-page-chrome-h so descendants (the
 *                 analytics section nav, the desktop side columns) can pin
 *                 below the chrome instead of behind it.
 *   condensed   — drives both `data-stuck` (the .ns-scroll-edge hairline) and
 *                 the condensed layout state.
 *
 * Height is reported in both states on purpose: it is read by descendants that
 * only pin while scrolled, which is exactly when the condensed height is the
 * current one.
 */
export function useStickyChrome() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const [condensed, setCondensed] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setCondensed(!entry.isIntersecting), {
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

  return { sentinelRef, chromeRef, condensed, height };
}
```

> **已知且可接受的不精確**：sentinel 用預設的 viewport root，所以在 macOS（28px）或示範模式
> （47px）下，凝縮會比實際釘住晚那幾十 px 才觸發。**不要**為此把 CSS 變數讀回 JS 算 `rootMargin`
> —— 代價遠大於收益。

## Step B2 — CSS：凝縮式 chrome

接在 Step A1 的區塊之後：

```css
/* The pinned page chrome. Bleeds into the page gutter so content scrolling
   underneath is covered edge to edge — a gutter-width strip of moving content
   beside an opaque bar reads as a rendering bug. */
.ns-page-chrome {
  position: sticky;
  top: calc(var(--ns-sticky-top) + var(--ns-demo-banner-h));
  z-index: 25;
  background: var(--ns-bg);
  margin-inline: calc(var(--ns-page-gutter) * -1);
  padding-inline: var(--ns-page-gutter);
  transition:
    padding-block var(--ns-dur) var(--ns-ease),
    background-color var(--ns-dur) var(--ns-ease);
}
/* Condensed: the eyebrow and the display-size h1 give way to a single inline
   title, and the tab strip moves onto the same row as the actions. Measured
   cost drops from 132px to ~52px on desktop; on a 390px phone the header stops
   wrapping to three rows (168px) and settles at two (~90px). */
.ns-page-chrome[data-condensed="true"] .ns-page-chrome-eyebrow { display: none; }
.ns-page-chrome[data-condensed="true"] .ns-page-chrome-title {
  font-size: var(--ns-t-title-3);
  line-height: 1.2;
}
@media (min-width: 1024px) {
  .ns-page-chrome[data-condensed="true"] .ns-page-chrome-row {
    display: flex;
    align-items: center;
    gap: var(--ns-s-4);
  }
  /* The tab strip keeps its own overflow-x:auto: at 1024 the content column is
     720px and the condensed row wants ~800px, so the tabs must scroll rather
     than wrap. Wrapping here would defeat the whole point. */
}
@media (prefers-reduced-motion: reduce) {
  .ns-page-chrome { transition: none; }
}
```

`@media print` 區塊（現在的第 2154 行 `.ns-app-shell { display: block !important; }` 附近）加：

```css
  .ns-page-chrome { position: static !important; }
```

> 上面的 class 名稱與結構是**方向**，不是逐字規格。實作時以「凝縮後 ≤ 56px、
> 1024 不換行、靜止態外觀與現在**逐像素相同**」三條為準；達成的寫法可以不同。
> **靜止態的外觀不准變** —— 這是 refinement，不是 redesign。

## Step B3 — 兩條路由套用

兩條路由的做法相同：

1. `const chrome = useStickyChrome();`
2. 根元素加 `style={{ ["--ns-page-chrome-h" as string]: `${chrome.height}px` }}`
3. 在 chrome 之前放 sentinel：
   ```tsx
   <div ref={chrome.sentinelRef} aria-hidden="true" style={{ position: "absolute", width: 1, height: 1 }} />
   ```
4. 把「頁首列 + 分頁列」（投資還要含中間的 `statusMessage` 區塊，否則它會夾在固定 chrome
   與內容之間穿幫）包進：
   ```tsx
   <div ref={chrome.chromeRef} className="ns-page-chrome ns-scroll-edge"
        data-condensed={chrome.condensed} data-stuck={chrome.condensed}>
   ```
5. eyebrow 加 `ns-page-chrome-eyebrow`，`<h1>` 加 `ns-page-chrome-title`，
   頁首列本身加 `ns-page-chrome-row`。

具體位置：
- `CashFlowRoute.tsx:1912-2075`（根 `.ns-page pt-6 pb-28 sm:pb-[120px]`；eyebrow 是
  `<div className="text-xs ns-field-label">{periodLabel}</div>`；分頁列是
  `<div className="flex mb-6 overflow-x-auto">`）
- `InvestmentsRoute.tsx:552-651`（根 `.ns-invest-page ns-page pt-6 pb-[120px]`；eyebrow 是
  `<div className="text-xs ns-field-label">投資組合</div>`；分頁列是 `.ns-page-tabs`）

被 chrome 蓋住的兩個側欄改用契約（移除硬編的 `lg:top-5` / `lg:top-4`，改 inline 動態 top）：
- `CashFlowRoute.tsx:2535` → `+ 20px`
- `InvestmentsRoute.tsx:916` → `+ 16px`
```tsx
  style={{ top: `calc(var(--ns-sticky-top) + var(--ns-demo-banner-h) + ${chrome.height}px + 20px)` }}
```
（`top` 對 `position: static` 的元素無效，所以 `<1024px` 不需要額外判斷。）

**Verify**：
```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

**STOP condition**：`.ns-invest-page` 有 `overflow-x: clip`（`globals.css:1403-1407`）。
理論上 `clip` 不建立 scroll container，sticky 仍相對 viewport 定位 —— 示範橫幅在
`main.ns-app-main` 的 `overflowX: "clip"` 底下正常運作，是既有的活體證明。
但若實測顯示**投資的 chrome 不會釘住而記帳的會**，那就是這裡出問題：**STOP 回報，
不要靠拿掉 `overflow-x: clip` 繞過**（那是 iOS webview 橫向溢出的防線）。

---

## Step 4 — e2e 迴歸測試

建立 `src/test/e2e/sticky-chrome.spec.ts`，以 `src/test/e2e/page-width.spec.ts` 為範本
（照抄它的 `addInitScript` 關掉 onboarding）。路徑已對照 `router.tsx:58,81` 查證：
投資是 `/investments`，記帳是 **`/cash-flow`（有連字號）**。

要涵蓋的三件事：

1. **桌機 1440×900**：兩條路由捲動 1200px 後，`.ns-page-chrome` 的 `boundingBox().y`
   落在 `[0, 4]`，且**高度比捲動前小**（凝縮生效的機器判準）。
2. **桌機 1440×900**：凝縮後高度 **≤ 56px**（這是這份計畫相對 283 的核心價值，
   必須被測試釘住，否則日後有人加個按鈕就悄悄回到 132px）。
3. **手機 390×780**：捲動後 `.ns-page-chrome` 高度 **≤ 100px**（283 的方案是 236px）。

**STOP condition**：若示範資料讓頁面不足 1200px 而捲不動，**不要**把捲動距離改小到失去意義 ——
先確認 `document.body.scrollHeight > 1500`，不足就種資料或 STOP 回報。

**Verify**：
```bash
npm run test:e2e
```
預期：既有 6 個 + 新增 3 個以上通過。

## Step 5 — 全套閘門

```bash
npm run format
npx tsc --noEmit
npm run lint
npm test
npm run build
npm run test:e2e
node /Users/juicheng/.agents/skills/impeccable/scripts/detect.mjs --json --scope layout \
  src/routes/CashFlowRoute.tsx src/routes/InvestmentsRoute.tsx \
  src/routes/InvestmentsAnalyticsTab.tsx src/components/AppShell.tsx src/styles/globals.css
```

判準：`tsc` 0；`lint` **0 errors**（799 個既有 warning 不動）；`vitest` **檔案數與測試數與
baseline 完全相同**（這份計畫不改邏輯）；`build` 0；`playwright` 全過；
**detector 回傳 `[]`**（改動前的基準也是 `[]`，已實測）。

**先記錄 baseline**：切分支後、動任何程式碼前跑 `npm test 2>&1 | tail -5` 與
`npm run test:e2e 2>&1 | tail -5`。

## Step 6 — 瀏覽器實測（必做，逐項回報實際數字）

用 preview 工具起 dev server。**每一項都要回報量到的數字，不要只寫「正常」。**

| # | 情境 | 通過判準 |
|---|---|---|
| 1 | 1440×900 記帳，捲到底 | chrome 高度 ≤ 56px；`記一筆` / `篩選` / 日期 / 四個分頁全程可點 |
| 2 | 1440×900 記帳 | 靜止態外觀與 `main` **逐像素相同**（截圖對比；這是 refinement） |
| 3 | 1440×900 | 捲動時內容不從 chrome 底下透出，**包含左右 gutter**（`margin-inline` 負值的用意） |
| 4 | **1024×768 記帳** | 凝縮列**不換行**；分頁列橫向可捲（內容欄僅 720px，這是最緊的一格） |
| 5 | 1440×900 投資 → 分析 | Step A3 的命中測試：`verticalOverlapPx === 0`、`hitIsInsideNav === true`，且區塊導覽列釘在 chrome **正下方** |
| 6 | 1440×900 投資 → 持倉 | 右側欄上緣不被 chrome 吃掉 |
| 7 | 390×780 記帳 | 凝縮後 chrome ≤ 100px（基準：283 方案 236px、現況靜止 236px）；分頁可點 |
| 8 | 示範模式 1440 | 橫幅在最上、chrome 緊貼其下，**不重疊也沒有空隙** |
| 9 | 篩選 popover（已釘住時開啟） | 浮層在 chrome **之上**（portal z-90），未被 sticky 的 stacking context 裁切 |
| 10 | 深色 / 淺色 | chrome 背景與頁面底色一致（`--ns-bg`），無色差邊 |
| 11 | `prefers-reduced-motion` | 凝縮無過渡動畫 |

截圖：1、2（對比）、4、5、7。

> **macOS 原生視窗（`data-native-glass`）的 28px 偏移**只有 Tauri app 內才會出現，
> 瀏覽器 preview 驗不到。**不要**為此跑 `npm run tauri dev`（要編 Rust，很慢）。
> 在回報裡註明「macOS 拖曳條偏移未實測，僅由 CSS 保證」。

## Done criteria（機器可驗）

```bash
# Phase A
grep -c "ns-sticky-top" src/styles/globals.css                      # >= 2
grep -n "top: 0," src/components/AppShell.tsx                       # 0 命中（橫幅已改用契約）
grep -n "sticky top-0" src/routes/InvestmentsAnalyticsTab.tsx       # 0 命中

# Phase B
grep -c "ns-page-chrome" src/styles/globals.css                     # >= 4（含 print）
grep -n "lg:top-5" src/routes/CashFlowRoute.tsx                     # 0 命中
grep -n "lg:top-4" src/routes/InvestmentsRoute.tsx                  # 0 命中
grep -rn 'position: "sticky"' src/routes/CashFlowRoute.tsx src/routes/InvestmentsRoute.tsx   # 0 命中（靜態樣式不寫 inline）

# 禁用的手機判斷法
grep -rn "pointer: *coarse" src/styles/globals.css src/hooks/useStickyChrome.ts   # 0 命中

# 範圍乾淨
git diff --stat 3f69a867..HEAD -- src/routes/DashboardRoute.tsx src/routes/AccountsRoute.tsx src/routes/GoalsRoute.tsx src/routes/SettingsRoute.tsx src/routes/ReconcileRoute.tsx src/routes/AnnualReportRoute.tsx   # 空輸出

# 全套閘門（見 Step 5）
```

## Test plan

| 新測試 | 檔案 | 範本 |
|---|---|---|
| 桌機兩條路由捲動後仍釘住且**高度變小** | `src/test/e2e/sticky-chrome.spec.ts` | `page-width.spec.ts` |
| 桌機凝縮高度 ≤ 56px（防日後回胖） | 同上 | 同上 |
| 手機凝縮高度 ≤ 100px | 同上 | 同上 |

不新增 vitest 單元測試：`useStickyChrome` 全靠 IntersectionObserver / ResizeObserver，
jsdom 兩者都要 polyfill，測出來的東西不會比 e2e 有價值。

## STOP conditions

1. **投資 chrome 不會釘住而記帳的會** → `.ns-invest-page` 的 `overflow-x: clip` 是嫌疑犯。
   回報，**不要**拿掉那條規則。
2. **1024×768 凝縮列換行** → 這代表方案在最緊的桌機寬度不成立。回報實際需要的寬度，
   由 advisor 決定是縮日期控制還是降級成兩列。**不要**自行改成兩列了事。
3. **`designTokens.test.ts` 轉紅** → 見 Step A1。
4. **任何既有單元測試轉紅** → 這份計畫不改邏輯，轉紅代表動到不該動的東西。
5. **靜止態外觀改變** → 這是 refinement，靜止態必須逐像素不變。
6. **你想把 chrome 套到 in-scope 之外的路由** → 回報，不要順手做。

## Maintenance note

- **`--ns-sticky-top` 是全站「頂端還剩多少空間」的單一真相。** 日後任何釘在頂端的新東西
  （離線提示、更新提示列）必須 (a) `top: var(--ns-sticky-top)`，且 (b) 把自己的高度量成變數
  讓下游累加。Review 檢查點：`grep -rn "top: 0" src/components/AppShell.tsx` 保持 0 命中。
- **`--ns-titlebar-inset` (40px) ≠ 拖曳條高度 (28px)。** 前者是 sidebar 內距預留，後者是實際遮擋。
  這份計畫用後者；用錯會多出 12px 空隙。
- **z-index 階梯**：page chrome 25、分析導覽列 20、示範橫幅 30、macOS 拖曳條 30、
  popover portal 90、overlay/modal 998–1000、sidebar 1100。新頁面級固定元素落在 20–29。
- **凝縮高度 ≤ 56px 是被 e2e 測試釘住的契約，不是巧合。** 想在頁首加按鈕的人，
  請先確認凝縮態仍然過關 —— 那條測試存在的理由就是擋住「一次加一個按鈕，一年後回到 132px」。
- **這份計畫刻意沒有做的事**：`/cash-flow` 的 `交易` 分頁把交易列表放在約 970px 之下
  （前面是現金流圖 416px + 分類/商家 288px）。凝縮頁首讓「捲動時仍能新增」成立，
  但**沒有縮短「找到交易列表」的距離**。若 operator 之後反映後者，那是資訊架構議題
  （分頁預設順序 / 圖表可折疊），要另開計畫，不要在這份裡順手改。
