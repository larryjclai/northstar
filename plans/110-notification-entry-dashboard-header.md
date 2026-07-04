# Plan 110: 通知入口移到總覽右上角（Wealthfolio 式鈴鐺，面板向下展開）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: 先跑前置檢查（Step 0），再
> `git diff --stat 1d17856f..HEAD -- src/components/NotificationCenter.tsx src/components/AppShell.tsx src/routes/DashboardRoute.tsx`
> 本計劃寫於 main `479b6256` + 未合併分支 `1d17856f`（plan 097）之上 —
> 097 合併後的狀態才是本計劃的基線。

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED（改全域元件位置；面板定位邏輯要轉向）
- **Depends on**: **operator 先合併 `fix/ai-sidebar-titlebar-notification`（plan 097）**；
  與 plan 106 同檔（DashboardRoute 頁首）— 先 106 後 110，或以 grep 對位
- **Category**: dx/ux (feature relocation)
- **Planned at**: commit `479b6256`（+ 097 branch `1d17856f`）, 2026-07-02

## Why this matters

通知中心目前掛在 sidebar 底部，有三個問題：(1) 使用者回報面板「版面被吃掉」
（097 已修：面板改 position:fixed 錨定觸發鈕 — 但該分支尚未合併，使用者
看到的還是舊行為）；(2) sidebar 在手機寬度整個隱藏（`hidden lg:flex`），
行動裝置**完全沒有**通知入口；(3) 操作者明確要求比照 Wealthfolio：
入口放在總覽右上角、點擊展開。本計劃把觸發鈕搬到 Dashboard 頁首動作列
最右側（鈴鐺 icon + 未讀 badge），面板從按鈕下方向左展開。

## Current state

（以下摘錄為 main `479b6256`；097 合併後 NotificationCenter 的面板改為
`position: fixed` + `anchorRect = buttonRef.getBoundingClientRect()` 錨定 —
以合併後的實際程式碼為準。）

- `src/components/NotificationCenter.tsx` — 自含元件：資料（提醒 + 已讀狀態）、
  觸發鈕、面板、外點關閉都在裡面。現有簽名與觸發鈕（9、48–67 行）：

```tsx
export function NotificationCenter({ collapsed }: { collapsed: boolean }) {
  …
  return (
    <div style={{ position: "relative" }}>
      <button ref={buttonRef} … className="ns-nav-link"
        style={{ width: "100%", justifyContent: collapsed ? "center" : "flex-start", … }}>
        <Bell size={16} weight={count > 0 ? "fill" : "duotone"} … />
        {!collapsed && <span style={{ flex: 1 }}>通知</span>}
        {count > 0 && (<span aria-label={`${count} 則未讀提醒`} …>
```

- `src/components/AppShell.tsx:291` — 唯一使用點，在 sidebar 底部：

```tsx
<NotificationCenter collapsed={collapsed} />
```

- `src/routes/DashboardRoute.tsx:772-796` — 頁首動作列（AccountFilter +
  更新行情 + 版面；plan 106 會把後兩顆在手機併列）：

```tsx
<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
  <AccountFilter … />
  <Button variant="outline" className="h-9 shrink-0 sm:h-9" …>…更新行情</Button>
  {hasAnyData ? (<Popover>…版面…</Popover>) : null}
</div>
```

- Icon 按鈕慣例：coss `Button` 有 `size: icon-*` 變體（DESIGN.md §6.1）；
  「版面」的 PopoverTrigger `render={<Button variant="outline" …/>}` 是同列
  按鈕的樣式範本。

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| 前置檢查  | `git merge-base --is-ancestor 1d17856f HEAD && echo MERGED` | `MERGED` |
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |
| Dev shell | `npm run dev`  | :5173（手動驗證核心） |

## Scope

**In scope** (the only files you should modify):
- `src/components/NotificationCenter.tsx`
- `src/components/AppShell.tsx`（僅移除 291 行的使用與 import）
- `src/routes/DashboardRoute.tsx`（僅頁首動作列加觸發）

**Out of scope** (do NOT touch, even though they look related):
- `src/domain/reminderNotifications.ts` — 提醒的產生邏輯不動。
- `uiPreferences` 的已讀狀態結構。
- 手機底部 tab bar — 不在那裡加入口。
- 其他路由的頁首（先只做總覽；見 Maintenance notes）。

## Git workflow

- Branch: `fix/ai-notification-header-entry`
- Commit style: `feat(dashboard): move notification center to header bell`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: 前置檢查

`git merge-base --is-ancestor 1d17856f HEAD && echo MERGED` → 必須輸出 `MERGED`。
不是 → **STOP**：回報「plan 097 branch `fix/ai-sidebar-titlebar-notification`
尚未合併，本計劃基線不成立；請 operator 先合併」。

### Step 1: NotificationCenter 改成 header 形態

1. 簽名 `{ collapsed: boolean }` → 無 props（或保留可選 props 但不再需要
   collapsed）。
2. 觸發鈕改 icon-only：外觀對齊頁首其他按鈕（`Button variant="outline"` 的
   h-9 風格，或沿用現 button 元素改 className）— `Bell` size 16 + 未讀
   badge（現有 badge span 保留，改為絕對定位在按鈕右上角）。`title`/
   `aria-label`「通知中心」保留。
3. 面板定位：以 097 合併後的 anchorRect 邏輯為基礎，改為**從按鈕下方、
   右緣對齊**展開：`top: rect.bottom + 8`、`right: window.innerWidth - rect.right`
   （不再是 sidebar 底部的向上/向右開）。手機（<640px）時面板寬度
   `min(340px, calc(100vw - 32px))`。
4. 移除所有 `collapsed` 分支。

**Verify**: `npx tsc` → exit 0；`grep -n "collapsed" src/components/NotificationCenter.tsx` → 無輸出。

### Step 2: AppShell 移除舊入口

刪 291 行 `<NotificationCenter collapsed={collapsed} />` 與檔頭 import。
sidebar 底部其餘（隱藏金額、Local-first 說明）不動。

**Verify**: `grep -n "NotificationCenter" src/components/AppShell.tsx` → 無輸出；
`npx tsc` → exit 0。

### Step 3: Dashboard 頁首加入口

在頁首動作列（grep「更新行情」定位）最右側加 `<NotificationCenter />` —
若 plan 106 已 landing，放在按鈕列 wrapper 內的最後；未 landing 則直接放在
版面 Popover 之後。

**Verify**: `npm run dev` →
- 1440px：鈴鐺在右上、有未讀時顯示 badge；點開面板向下展開、右緣對齊、
  不被任何容器裁切；外點關閉。
- 375px：鈴鐺在頁首可及；面板不超出視窗。
- sidebar 底部不再有通知按鈕。

### Step 4: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。

## Test plan

- `reminderNotifications` domain 已有測試，不動。
- 元件層無既有測試基建，不新增；行為驗收靠 Step 3 的三點手動清單。
- 回歸重點：`npm test` 全綠 + AppShell 在 lg 斷點上下都正常渲染。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Step 0 輸出 `MERGED`
- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `grep -rn "NotificationCenter" src/components/AppShell.tsx` → 無輸出
- [ ] `grep -c "NotificationCenter" src/routes/DashboardRoute.tsx` ≥ 2（import + 使用）
- [ ] `git status` 只含 in-scope 檔案
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 0 失敗（097 未合併）。
- 097 合併後的 NotificationCenter 面板定位與「anchorRect + position:fixed」
  描述不符（另一套實作）— 回報實際結構。
- 面板在頁首下方展開時與 demo banner / 資料健康 banner 重疊遮擋且無法用
  z-index 解 — 回報截圖級描述。
- 你想順手在其他路由頁首也加鈴鐺 — 越界（見 Maintenance notes）。

## Maintenance notes

- **取捨已知**：入口只在總覽（預設著陸頁）。其他路由要看通知得先回總覽。
  若之後想全域可及，正解是抽一個跨路由的 header 條或回到 sidebar —
  屆時 NotificationCenter 已是免 props 的自含元件，搬移成本低。
- 手機從「沒有入口」變成「總覽頁首有入口」— 是新能力，release note 值得提。
- Reviewer 檢查重點：面板的 fixed 定位在視窗 resize 後是否重算（097 的
  實作在開啟時快照 rect、resize 時關閉 — 確認搬位後這個防呆仍在）。
