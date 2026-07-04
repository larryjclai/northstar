# Plan 106: 手機版 Dashboard — 頁首按鈕收斂成一列 + 時間切換條加捲動提示

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- src/routes/DashboardRoute.tsx src/styles/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED（純視覺改動，但 `.ns-hscroll` 是共用 class，影響所有使用點）
- **Depends on**: none（DashboardRoute 與 Plan 103 同檔不同區塊；後執行者以 grep 對位）
- **Category**: bug (mobile UX)
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

375px 寬（iPhone 尺寸）實測（2026-07-02）：Dashboard 頁首的「所有帳戶」「更新行情」
「版面」三顆控制各佔一整列，使用者要滑過近 1/4 屏才看到淨值 hero；淨值卡的
1D–All 時間切換條可橫向捲動（plan 084 已加 `.ns-hscroll`），但 scrollbar 被隱藏、
右緣「All」被硬切，**沒有任何視覺線索顯示還能捲**。

## Current state

- 頁首動作區（`src/routes/DashboardRoute.tsx:772-796`，Tailwind 響應式）：

```tsx
<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
  <AccountFilter accounts={accountRows} value={selectedAccount} onChange={setSelectedAccount} style={{ maxWidth: "none" }} />
  <Button variant="outline" className="h-9 shrink-0 sm:h-9" onClick={refreshMarket} … >
    <ArrowsClockwise size={14} />{refreshingMarket ? "更新中" : "更新行情"}
  </Button>
  {hasAnyData ? (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="h-9 shrink-0 sm:h-9" />}>
        <SquaresFour size={14} />版面
      </PopoverTrigger>
      <PopoverContent align="end" style={{ width: 220, padding: 8 }}> … </PopoverContent>
    </Popover>
  ) : null}
</div>
```

  手機（<640px）時 `flex-col` 讓三個子項各佔一列、各自全寬。

- 時間切換條（`src/routes/DashboardRoute.tsx:894-902`）：

```tsx
<div className="ns-hscroll" style={{ maxWidth: "100%" }}>
  <SegmentedControl value={stripPeriod} onChange={setStripPeriod}
    options={STRIP_PERIODS.map((v) => ({ value: v, label: v }))} />
</div>
```

- `.ns-hscroll`（`src/styles/globals.css:1547-1548`，**共用 class**）：

```css
.ns-hscroll { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.ns-hscroll::-webkit-scrollbar { display: none; }
```

  使用點盤點：`grep -rn "ns-hscroll" src/` — 改 CSS 前先跑，所有使用點都會
  吃到新樣式。

- 相關慣例：Tailwind 斷點 `sm:` = 640px；設計 token 過渡用
  `--ns-dur-fast`；漸層遮罩不可用純黑（DESIGN.md 色彩原則）。

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |
| Dev shell | `npm run dev`  | :5173（手動驗證核心） |

## Scope

**In scope** (the only files you should modify):
- `src/routes/DashboardRoute.tsx`（僅 772–796 頁首動作區）
- `src/styles/globals.css`（僅 `.ns-hscroll` 區塊）

**Out of scope** (do NOT touch, even though they look related):
- `SegmentedControl` 元件本身。
- `AccountFilter` 元件內部。
- 底部 tab bar 與 FAB（QuickAdd）。
- 其他路由的頁首。

## Git workflow

- Branch: `fix/ai-mobile-dash-header`
- Commit style: `fix(dashboard): compact mobile header actions; hscroll affordance`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: 兩顆按鈕在手機併一列

把「更新行情」Button 和「版面」Popover 包進一個共用容器，手機時兩顆各半寬、
桌面維持原樣。目標結構：

```tsx
<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
  <AccountFilter … />
  <div className="flex w-full gap-2 sm:contents">
    <Button variant="outline" className="h-9 flex-1 sm:flex-none shrink-0" … >…更新行情</Button>
    {hasAnyData ? (
      <Popover>
        <PopoverTrigger render={<Button variant="outline" className="h-9 flex-1 sm:flex-none shrink-0" />}>…版面</PopoverTrigger>
        …
      </Popover>
    ) : null}
  </div>
</div>
```

要點：外層 wrapper 用 `sm:contents`，桌面時等同不存在（版面零變化）；
兩顆按鈕加 `flex-1 sm:flex-none`。

**Verify**: `npx tsc` → exit 0。`npm run dev` → 375px 寬：AccountFilter 一列 +
兩顆按鈕同一列；1440px 寬：與改動前相同的一列排開。

### Step 2: `.ns-hscroll` 右緣淡出提示

`globals.css:1547` 區塊改為：

```css
.ns-hscroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.ns-hscroll::-webkit-scrollbar { display: none; }
/* 可捲提示：右緣 16px 淡出。內容不溢出時由 @supports 的 scroll-driven 版本
   蓋掉是未來優化；目前為常駐淡出，代價是捲到底時最後一項略淡。 */
.ns-hscroll {
  mask-image: linear-gradient(to right, black calc(100% - 16px), transparent);
  -webkit-mask-image: linear-gradient(to right, black calc(100% - 16px), transparent);
}
```

**Verify**: `npm run dev` → 375px：時間條右緣呈淡出、暗示可捲；捲到最右時
「All」仍可完整讀（淡出只吃到邊緣 16px）。1440px：時間條不溢出，右緣淡出
不影響可讀性（最後一顆 segment 距右緣 >16px 則視覺無感）。

### Step 3: 檢查其他 `.ns-hscroll` 使用點

`grep -rn "ns-hscroll" src/` 列出全部使用點，在 dev shell 逐一目視（該 class
的使用點都是橫向條狀 UI）。若任何使用點的**最右內容貼齊容器右緣且被淡出遮到
不可讀**，該點改用新增的 `ns-hscroll--nofade` 修飾 class（在 globals.css 加
`.ns-hscroll--nofade { mask-image: none; -webkit-mask-image: none; }`）。

**Verify**: 每個使用點目視過、無不可讀狀況（或已加 nofade）。

### Step 4: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。

## Test plan

- 純視覺改動，無新測試；回歸由 `npm test` + 手動雙尺寸目視承擔。
- 手動核對清單（375px / 1440px 各一輪）：頁首列數、時間條淡出、
  時間條可捲到 All、桌面版面與改動前一致。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `grep -n "sm:contents" src/routes/DashboardRoute.tsx` → 1 處（頁首動作區）
- [ ] `grep -n "mask-image" src/styles/globals.css` → `.ns-hscroll` 區塊內出現
- [ ] `git status` 只含 in-scope 檔案
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 頁首摘錄與現場不符（drift；Plan 103 同檔先行時以 grep「更新行情」重新定位，
  結構不同才 STOP）。
- `sm:contents` 導致桌面版面改變（Popover 定位異常等）— 回報，別改用其他 hack。
- Step 3 發現超過 3 個使用點需要 nofade — 代表常駐淡出策略不適合這個 codebase，
  回報並建議改為 scroll-driven 方案，不要自行實作。

## Maintenance notes

- 淡出是**常駐**的（純 CSS 無法偵測「還能捲」）— 已知取捨。未來瀏覽器基線
  允許時，正解是 CSS scroll-driven animations（`animation-timeline: scroll()`）
  做動態雙側淡出。
- 若之後頁首再加第三顆按鈕，`flex-1` 會讓三顆擠同列 — 屆時改成
  icon-only 或收進「更多」選單。
- Reviewer 檢查重點：Tauri WKWebView 上 `mask-image` 需要 `-webkit-` 前綴
  （兩行都要在）。
