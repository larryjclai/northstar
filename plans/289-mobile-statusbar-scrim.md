# Plan 289: iOS 狀態列遮罩 — 捲動內容不再與時鐘／電量重疊

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/components/AppShell.tsx src/styles/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

iOS 上 app 內容延伸到整個螢幕，`.ns-app-main` 只用 `paddingTop: env(safe-area-inset-top)` 把**初始版面**推到狀態列下方（AppShell.tsx:496–507）。頁面一捲動，內容就直接滑進狀態列區域，跟系統時鐘、電量圖示疊在一起——使用者截圖：設定頁捲動後「應用程式更新」標題與「19:49」重疊、「立即備份」按鈕撞上電量圖示，完全不可讀。

有 `.ns-page-chrome`（sticky 工具列，plan 283/284）的頁面只保護 chrome 以下；chrome 與視窗頂之間的 notch 區、以及完全沒有 chrome 的頁面（設定、帳戶等）都會露出。正確做法是原生 app 慣例：在狀態列高度畫一條固定的遮罩（scrim），讓捲動內容從它底下通過。**遮罩是靜態的**——不隨捲動變形，符合 repo「頁首禁止捲動兩態變形」的既定決策。

## Current state

- `src/components/AppShell.tsx` — app 外殼。`<main>` 在 line 498–508：

```tsx
      <main
        key={privacyMode ? "privacy-on" : "privacy-off"}
        data-privacy-anim={hasToggledPrivacy ? "" : undefined}
        className="ns-app-main pb-20 lg:pb-0 min-w-0"
        style={{ paddingTop: "env(safe-area-inset-top)", overflowX: "clip" }}
      >
```

  行動版底部 dock 在 line 601–604（`.ns-mobile-dock fixed inset-x-0 bottom-0 … z-index 40`）——是「固定 app chrome 元素」的既有範例。
- `src/styles/globals.css` — 頂端邊緣契約（plan 284）在 line 694–732：
  - `html { --ns-sticky-top: env(safe-area-inset-top, 0px); }`（line 715）
  - `html[data-native-glass] { --ns-sticky-top: calc(28px + env(safe-area-inset-top, 0px)); }`（line 716，macOS 桌面用；**macOS 已有** `.ns-titlebar-drag` 28px 條，此計畫不要動它）
  - `.ns-page-chrome` sticky 在 `top: calc(var(--ns-sticky-top) + var(--ns-demo-banner-h))`、`z-index: 25`、`background: var(--ns-bg)`（line 725–732）。
- z-index 地圖：page chrome 25、demo banner 30、titlebar-drag 30、mobile dock 40、FAB 40、sidebar 1100、modals 50–1000。
- 樣式優先序（AGENTS.md）：靜態樣式寫成 `ns-*` class，不寫 inline。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass（含 `src/styles/designTokens.test.ts`） |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/styles/globals.css`（新增 `.ns-statusbar-scrim` class）
- `src/components/AppShell.tsx`（渲染該元素）

**Out of scope**:
- `.ns-page-chrome` / 頂端邊緣契約的既有規則 — 不改語意，只是在它之上補一條遮罩。
- macOS `data-native-glass` 的 titlebar 處理 — 桌機已有自己的 28px drag 條；scrim 在 `safe-area-inset-top = 0` 的環境高度為 0，自然無作用，不需要平台分支。
- `src-tauri/` 的任何設定。

## Git workflow

- Branch: `fix/ai-statusbar-scrim`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 新增 CSS class

`src/styles/globals.css`，加在頂端邊緣契約區塊（line ~732 `.ns-page-chrome` 規則之後）：

```css
/* ── Status-bar scrim ─────────────────────────────────────────────────────
   iOS：內容捲動時會滑進狀態列（時鐘／電量）底下，疊字不可讀。這條固定遮罩
   蓋住 safe-area 頂端高度，讓內容從它底下通過。靜態、不隨捲動變形（no-morph
   決策）。桌機與 Android 無 top inset → 高度 0，自然不渲染任何可見物。
   z-index 45：高於 page chrome(25)／demo banner(30)／FAB(40)，低於 modals。 */
.ns-statusbar-scrim {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: env(safe-area-inset-top, 0px);
  background: var(--ns-bg);
  z-index: 45;
  pointer-events: none;
}
```

**Verify**: `npm test -- designTokens` → pass（此檔的 token 檢測套件對新規則無新 var 引用，不應受影響）。

### Step 2: AppShell 渲染

`src/components/AppShell.tsx`：在 `<main>` 之前（demo banner 判斷之外、與 `.ns-titlebar-drag` 同層級的位置）加：

```tsx
      {/* iOS status-bar scrim — see globals.css .ns-statusbar-scrim */}
      <div className="ns-statusbar-scrim" aria-hidden="true" />
```

放在 JSX 中現有 fixed 元素（如 mobile dock）附近皆可；`position: fixed` 不受插入位置影響。

**Verify**: `npm run build` exit 0。

### Step 3: 驗證

1. 瀏覽器 390×844 視口（無 safe-area 模擬時 `env()` 為 0）：確認無任何視覺變化、無新增可見元素（`getBoundingClientRect().height === 0`）。
2. 有 iOS Simulator 環境時（`docs/ios-mobile-plan.md` SOP）：開設定頁往下捲，狀態列底下應是實色底、內容不再與時鐘重疊。無 Simulator 環境則以 DevTools 強制 `--ns-statusbar-scrim` 高度 54px 目測行為，並在 PR 註明「真機/模擬器驗證待 operator」。
3. `npm run test:e2e` 全綠（桌面視口下 scrim 高度 0，sticky-chrome spec 不應受影響）。

## Test plan

- 新 e2e 斷言（可併入既有 mobile spec）：桌面視口下 `.ns-statusbar-scrim` 存在且高度 0——防止未來有人給它固定高度污染桌機。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0
- [ ] `npm test` exit 0（designTokens suite 含在內）；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -c "ns-statusbar-scrim" src/styles/globals.css src/components/AppShell.tsx` → 各至少 1
- [ ] 桌面視口 scrim 高度 0（無視覺回歸）
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 現狀摘錄與 live code 不符。
- `designTokens.test.ts` 因新 CSS 失敗且原因不是 trivial 的宣告位置問題（該 suite 對 token 宣告方式有特殊規則，見 globals.css:709–714 註解）——回報而非繞過。
- 發現 demo banner（sticky, z 30）與 scrim 在 iOS 上的層疊互動異常（banner 應從 scrim 底下通過；若 banner 被要求「顯示在狀態列區」則是設計問題，回報）。
- 有人（或你）想把 scrim 做成捲動漸變／毛玻璃隨捲動出現——紅線：頁首禁止捲動兩態變形，遮罩必須靜態。

## Maintenance notes

- 若未來 iOS 版導入毛玻璃材質（`.ns-glass` 已存在于 dock/sidebar），scrim 的 `background` 可以換成同款材質，但**必須保持靜態**。
- Reviewer 盯：z-index 45 的選擇——需在 FAB(40) 之上（FAB 捲動時不該探進狀態列）而在 modal scrim（50+）之下（全螢幕 modal 自帶處理）。
