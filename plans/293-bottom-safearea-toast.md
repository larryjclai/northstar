# Plan 293: 底部 safe-area 補課 — 記帳 drawer 儲存鈕避開 home indicator、Toast 不再蓋住底部導覽

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/routes/CashFlowRoute.tsx src/components/Toast.tsx`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

兩個獨立的小洞，都在「每天用」的路徑上：

1. **記帳新增/編輯 drawer 的「儲存交易」按鈕**：drawer 是手刻 overlay（非 ModalShell），
   手機上全寬貼底，footer 只有 `padding: "14px 24px"`、沒有 `env(safe-area-inset-bottom)`。
   iPhone 的 34px home indicator 手勢帶蓋住按鈕下半截，點擊會被系統滑回主畫面手勢吃掉
   ——app 最常用的送出動作間歇性沒反應。
2. **Toast**：手機 viewport 是 `fixed inset-x-0 bottom-4 z-[60]`，正好壓在底部導覽 dock
   （z-index 40、~55px + safe-area）上，而且 toast 本體 `pointer-events-auto w-full
   max-w-md`——每次存檔/刪除跳的 toast 在顯示期間讓五個導覽分頁全部點不到。

## Current state

- `src/routes/CashFlowRoute.tsx` — 記帳頁（含新增/編輯 drawer）。
  - Drawer panel（line 4076–4087）：手刻 `absolute right-0 top-0 bottom-0 flex flex-col`、
    `width: "min(500px, 100%)"`——手機上即全螢幕高、貼底。
  - Footer（line 5241–5245）：

```tsx
        {/* Footer */}
        <div
          className="flex gap-2"
          style={{ padding: "14px 24px", borderTop: "1px solid var(--ns-border)" }}
        >
```

- `src/components/Toast.tsx` — toast viewport（line 228–233）：

```tsx
    <div
      data-testid="toast-viewport"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end sm:px-0"
```

  toast 本體（line 415）：`className="ns-toast pointer-events-auto w-full max-w-md …"`。
- 正確前例：FAB 位移 `bottom-[calc(5rem+env(safe-area-inset-bottom))]`
  （`src/components/AppShell.tsx:547`）；`.ns-sheet-bottom` 的
  `padding-bottom: env(safe-area-inset-bottom)`（globals.css:404）。
- 底部 dock：`AppShell.tsx:601-604`，`fixed inset-x-0 bottom-0`、z-index 40。

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
- `src/routes/CashFlowRoute.tsx`（只動 line ~5244 的 footer padding 一處）
- `src/components/Toast.tsx`（只動 viewport 定位 className）

**Out of scope**:
- 把記帳 drawer 遷到 ModalShell（另案；本計畫是最小修）。
- Toast 的動畫、佇列、暫停邏輯。
- AppShell、globals.css。

## Git workflow

- Branch: `fix/ai-bottom-safearea`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: Drawer footer 加 safe-area

CashFlowRoute.tsx line 5244：

```tsx
          style={{
            padding: "14px 24px calc(14px + env(safe-area-inset-bottom, 0px))",
            borderTop: "1px solid var(--ns-border)",
          }}
```

桌機 `env()` 為 0，逐像素不變。

**Verify**: `npm run build` exit 0。

### Step 2: Toast viewport 移到 dock 上方

Toast.tsx line 230 的 className，把手機分支 `bottom-4` 改為 dock 上方（沿用 FAB 的
表達式），桌機 `sm:` 分支不動：

```
pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end sm:px-0
```

注意：`sm:bottom-6` 必須仍能覆寫新的 arbitrary value（同為 bottom 屬性、`sm:` 有
media query 加權——會覆寫；驗證步驟確認）。

**Verify**: `npm run dev`，390px：觸發一個 toast（例如存一筆交易），toast 底緣在 dock
頂緣之上（`toast.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top`）；
五個導覽項在 toast 顯示期間可點。1280px：toast 仍在右下 `bottom-6`，與改前一致。

## Test plan

- 既有 Toast 測試（若有 `Toast.test.tsx`）不應受影響——只改 className。
- e2e：390×844 存一筆交易後，斷言 `[data-testid="toast-viewport"]` 的 bottom ≤ dock top。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -c "env(safe-area-inset-bottom" src/routes/CashFlowRoute.tsx` → ≥1
- [ ] `grep -n "bottom-4" src/components/Toast.tsx` → 無結果（viewport 該行）
- [ ] 390px：toast 不與 dock 重疊；儲存鈕整顆在手勢帶上方
- [ ] 1280px：toast 位置與改前一致
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 摘錄與 live code 不符（特別是 footer 行號漂移——以「`儲存交易` 按鈕所在 footer」重新
  定位，找不到唯一對應就 STOP）。
- Toast 新位置與 Quick-Add FAB（同一表達式、right-4）在總覽/記帳頁重疊——實測若 toast
  寬度蓋到 FAB，改 `bottom-[calc(5rem+env(safe-area-inset-bottom)+8px)]` 仍不行就 STOP
  回報，讓 operator 選 toast 改頂部或 FAB 讓位。

## Maintenance notes

- 記帳 drawer 終究應遷 ModalShell + bottom-sheet（享有 `.ns-sheet-bottom` 的 safe-area
  與拖曳關閉）；本計畫的 padding 修正在那之後自然retire。
- plan 292 的 `useKeyboardInset` hook 落地後，此 footer 也可接鍵盤避讓（追加案）。
- Reviewer 盯：toast 在「無 dock 的桌機」與「有 dock 的手機」兩個分支的斷點都是
  `sm`（640px），而 dock 的斷點是 `lg`（1024px）——640–1023px 區間 toast 走桌機分支
  （右下角）但 dock 仍在；右下角不與 dock 重疊（dock 全寬但 toast 在其上方 24px？
  否——`sm:bottom-6` 是 24px，會壓在 dock 上）。**實測 768px 視口**：若 toast 壓 dock，
  把手機分支斷點從 `sm:` 改 `lg:` 一併修正（同檔同行，屬 in scope）。
