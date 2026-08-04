# Plan 291: FIRE 計算機手機版 — 側欄與結果區改為單欄堆疊，結果不再寬度歸零

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/routes/FIRECalculatorRoute.tsx src/styles/globals.css`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

FIRE 計算機在手機上**整個結果區看不到**：頁根是 `overflow-hidden` + `height: 100vh`，
內容列是不換行 flex，左側滑桿欄 `shrink-0` 固定 340px。在 390px 視口，扣掉硬編碼的
40px 左右 padding 後只剩 310px——比 340px 的不可壓縮側欄還窄，右側 `flex-1 min-w-0`
的結果區（四張指標卡、投影圖表、FIRE 類型卡）解析成 **0px 寬**，又被 `overflow-hidden`
硬裁，沒有任何捲動逃生口。手機使用者只看得到滑桿，看不到任何計算結果。

## Current state

- `src/routes/FIRECalculatorRoute.tsx` — 整頁元件。
- 頁根（line 258–261）：

```tsx
    <div
      className="flex flex-col overflow-hidden"
      style={{ padding: "32px 40px 100px", minHeight: "100vh", height: "100vh" }}
    >
```

- 內容列與側欄（line 297–299）：

```tsx
      <div className="flex flex-1" style={{ gap: 24, minHeight: 0 }}>
        {/* Left Sidebar: Sliders */}
        <div className="flex flex-col shrink-0 gap-4 overflow-y-auto pr-2" style={{ width: 340 }}>
```

- 結果區（line 402–404）：

```tsx
        <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto">
          {/* Top 4 Cards */}
          <div className="flex gap-4">
```

  （四張 `MetricCard` 排一列、不換行——手機單欄後也需要換行。）
- 其他收入編輯器的三欄輸入（line 716–718）：

```tsx
              <div
                className="gap-2"
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}
              >
```

- 頁面留白契約：`.ns-page` 用 `--ns-page-gutter`（globals.css，`@media (max-width: 639px)`
  時 16px）。本頁硬編碼 `32px 40px`，手機每側多燒 24px。
- 手機判斷紅線：一律 `max-width` media query，**絕不用 `(pointer: coarse)`**。
- 樣式優先序（AGENTS.md）：靜態樣式抽 `ns-*` class，不寫 inline。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |
| e2e       | `npm run test:e2e`   | all pass            |

## Scope

**In scope**:
- `src/routes/FIRECalculatorRoute.tsx`
- `src/styles/globals.css`（新增 `.ns-fire-*` class）

**Out of scope**:
- 任何 FIRE 計算邏輯（`projection`、`fireTarget` 等）——本計畫零數學改動。
- `src/routes/GoalsRoute.tsx`（返回目標的來源頁）。
- 圖表元件內部。

## Git workflow

- Branch: `fix/ai-fire-mobile-collapse`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 抽出版面 class

globals.css 新增（放在其他頁面級 `ns-*` class 附近，並比照鄰近註解風格）：

```css
/* FIRE calculator：桌機 = 固定側欄 + 結果區雙欄、各自捲動；手機（<1024）
   = 整頁單欄自然捲動。結果區寬度歸零的根因是 340px shrink-0 側欄 +
   overflow-hidden 頁根，收合時兩者都要解除。 */
.ns-fire-page { padding: 32px 40px 100px; min-height: 100vh; height: 100vh; }
.ns-fire-body { display: flex; flex: 1; gap: 24px; min-height: 0; }
.ns-fire-sidebar { display: flex; flex-direction: column; flex-shrink: 0; gap: 16px; overflow-y: auto; padding-right: 8px; width: 340px; }
.ns-fire-main { flex: 1; display: flex; flex-direction: column; gap: 16px; min-width: 0; overflow-y: auto; }
.ns-fire-cards { display: flex; gap: 16px; }
@media (max-width: 1023px) {
  .ns-fire-page { height: auto; min-height: 100dvh; overflow: visible; padding: 24px var(--ns-page-gutter, 16px) 100px; }
  .ns-fire-body { flex-direction: column; }
  .ns-fire-sidebar { width: 100%; overflow-y: visible; padding-right: 0; }
  .ns-fire-main { overflow-y: visible; }
  .ns-fire-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); }
}
```

### Step 2: 套 class、移除 inline 版面

FIRECalculatorRoute.tsx：
- line 258–261 頁根 → `className="ns-fire-page flex flex-col overflow-hidden"`，移除 inline `padding/minHeight/height`。注意 `overflow-hidden` 留在 className，桌機行為不變；手機由 `.ns-fire-page` 的 `overflow: visible` 覆寫（media query 內的 class 規則 specificity 足以蓋過 Tailwind utility 時才可行——**若蓋不過**，把 `overflow-hidden` 也移入 `.ns-fire-page` 桌機規則，JSX 不留該 utility）。
- line 297 → `className="ns-fire-body"`，移除 inline `gap/minHeight` 與 `flex flex-1`。
- line 299 → `className="ns-fire-sidebar"`，移除 inline `width: 340` 與原 utilities。
- line 402 → `className="ns-fire-main"`。
- line 404 → `className="ns-fire-cards"`。
- line 716–718 三欄輸入 → `gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))"`
  或抽 `.ns-fire-income-grid`（手機收 1–2 欄，桌機 3 欄）。

**Verify**: `npm run build` exit 0；`npm run lint` 0 errors。

### Step 3: 視口驗證

`npm run dev`：
1. 390×844：頁面單欄、整頁縱向捲動；四張指標卡與圖表**可見且寬度 > 300px**
   （`document.querySelector('.ns-fire-main').getBoundingClientRect().width > 300`）；
   無橫向溢出（`document.documentElement.scrollWidth <= window.innerWidth`）。
2. 1280×800：雙欄、側欄 340px、兩側各自捲動——與改前逐像素等價（比對截圖）。
3. 768×1024（平板，<1024 走手機版）：單欄正常。

**Verify**: 三個視口皆符合；`npm test`、`npm run test:e2e` 全綠。

## Test plan

- e2e：390×844 開 `/goals/fire`（實際路徑先以 `grep -rn "fire" src/routes` 確認），斷言
  `.ns-fire-main` 寬度 > 300 且 `scrollWidth <= innerWidth`；1280 斷言側欄 340px。
- 模式參考 `src/test/e2e/sticky-chrome.spec.ts`；臨時 config 除 port 外須與
  `playwright.config.ts` 逐項相同。
- Verification: `npm test` + `npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -n "width: 340" src/routes/FIRECalculatorRoute.tsx` → 無結果
- [ ] 390px：結果區可見（寬 > 300px）、整頁可縱向捲動、無橫向溢出
- [ ] 1280px：與改前視覺等價
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 摘錄與 live code 不符。
- 桌機雙欄「各自捲動」行為在改 class 後壞掉（例如整頁開始捲動）且一次修正後仍壞
  ——桌機的 100vh + 內部捲動是刻意設計，不能犧牲。
- 發現圖表在單欄下高度塌陷或 `minHeight: 350` 不足以維持可讀，需要動圖表元件內部。
- 手機規則蓋不過 Tailwind utility 且移動 `overflow-hidden` 之後桌機行為改變。

## Maintenance notes

- 之後若 FIRE 頁加入新的結果卡片，放進 `.ns-fire-cards`（auto-fit 自動收合）即可。
- Reviewer 盯：`height: 100vh → auto` 在手機的底部 100px padding 是否讓 FAB／dock 不再
  蓋住最後一張卡（plan 290 已把 FAB 移出此頁，dock 仍在）。
