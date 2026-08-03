# Plan 290: 快速記帳 FAB 只在總覽與記帳頁顯示

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/components/AppShell.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03
- **Operator decision**: 2026-08-03 operator 選定「只在總覽＋記帳頁顯示」（三選一：route-scope／全域保留＋留白／移除）。

## Why this matters

「快速記帳」FAB（綠色 + 圓鈕）目前在**所有** mobile 路由固定顯示（`lg:hidden`、z-index 40）。
Operator 實機截圖顯示它蓋住了投資分析頁的「回補歷史」按鈕與設定頁同步衝突中心的
「採用遠端」按鈕——都是可點擊的功能元件。FAB 的功能是快速記一筆支出，在投資／設定頁
本來就不對題。Route-scope 到總覽（`/`）與記帳（`/cash-flow…`）後，遮擋問題在其他頁面
直接消失，記帳動線不受影響。

## Current state

- `src/components/AppShell.tsx` — app 外殼，FAB 在 line 540–560：

```tsx
      {/* ── Mobile Quick Add FAB ── */}
      <button
        type="button"
        onClick={() => setQuickAddOpen(true)}
        aria-label="快速記帳"
        // `flex` lives in className (not inline style) so the responsive
        // `lg:hidden` can actually win on desktop — an inline `display:flex`
        // would override it and leak the FAB onto the desktop layout.
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] flex items-center justify-center lg:hidden"
```

- Router 是 TanStack Router；AppShell 目前 import `{ Link, Outlet, useNavigate }`
  （line 17），**尚未**讀取 location。TanStack Router 提供 `useLocation()`。
- 路由路徑（`src/routes/` 對應）：總覽 `/`、記帳 `/cash-flow`（其下有分類／商家
  detail 子路徑）。導覽定義見 AppShell.tsx:80–86（`navItems`）。
- 鍵盤捷徑 `useQuickAddShortcut`（line 185）與 QuickAdd overlay 本身**不在此計畫範圍**
  ——捷徑在任何頁面仍可開啟 QuickAdd，只有 FAB 這顆按鈕收斂顯示範圍。

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
- `src/components/AppShell.tsx`

**Out of scope**:
- `src/components/QuickAdd.tsx`（overlay 本身；plan 292 處理它的手機版面）
- `src/state/quickAdd.ts`、鍵盤捷徑——全域開啟能力保留
- 底部導覽、其他 fixed 元素

## Git workflow

- Branch: `fix/ai-scope-quickadd-fab`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits（例 `fix(shell): scope quick-add FAB to dashboard and cash-flow`）；推分支開 PR，不 push main。

## Steps

### Step 1: 取得目前路徑

AppShell.tsx line 17 的 import 加 `useLocation`：

```tsx
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
```

`AppShell()` 內（例如 line 130 附近其他 hooks 旁）：

```tsx
  const { pathname } = useLocation();
  // FAB 的功能是快速「記帳」，只在記帳語境（總覽、記帳）顯示，
  // 避免在投資/設定頁蓋住可點擊內容（operator 決策 2026-08-03）。
  const showQuickAddFab = pathname === "/" || pathname.startsWith("/cash-flow");
```

**Verify**: `npm run build` → exit 0。

### Step 2: 條件渲染 FAB

line 540 的 `<button …>`（整顆 FAB）包成：

```tsx
      {showQuickAddFab ? (
        <button … />
      ) : null}
```

按鈕內容一字不改。

**Verify**: `npm run dev` + 390px 視口：`/`（總覽）與 `/cash-flow`（記帳）FAB 顯示；
`/investments`、`/settings`、`/accounts` FAB 不存在（DOM 查 `aria-label="快速記帳"` 無結果）。
桌機 1280px：所有頁面照舊無 FAB（`lg:hidden` 行為不變）。

## Test plan

- e2e（併入本批 mobile spec 或參考 `src/test/e2e/sticky-chrome.spec.ts` 新建）：
  390×844 下斷言 `/investments` 無 `[aria-label="快速記帳"]`、`/cash-flow` 有。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] 390px：投資/設定/帳戶頁無 FAB；總覽/記帳有
- [ ] `git status` 只有 AppShell.tsx（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- FAB 摘錄與 live code 不符。
- `useLocation` 在 AppShell 觸發整殼過度重渲染疑慮（TanStack Router 的 useLocation 是
  fine-grained selector，正常不會）——若 profiler 顯示每次捲動重渲染，改用
  `useRouterState({ select: (s) => s.location.pathname })` 再驗一次；仍異常則 STOP 回報。
- 發現記帳子路徑不是 `/cash-flow` 前綴（先 `grep -rn "createRoute\|path:" src/routes` 確認），
  比對後仍不確定就 STOP。

## Maintenance notes

- 未來若新增「投資快速下單」類 FAB，應沿用同一條件渲染模式，而不是把這顆 FAB 改回全域。
- Reviewer 盯：條件必須包住整顆 button，不能只 `display:none`（螢幕閱讀器仍會停留）。
