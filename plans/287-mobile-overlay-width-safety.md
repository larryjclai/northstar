# Plan 287: 修復兩個在手機上超出視窗寬度的固定寬度 overlay（配對 dialog、交易詳情 drawer）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/routes/settings/ConnectSection.tsx src/components/TransactionDetailPanel.tsx src/components/ModalShell.tsx src/styles/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

在 iPhone（邏輯寬度 ~393pt）上，兩個 overlay 的固定像素寬度大於視窗寬度，內容左右被裁切、文字不完整、按鈕被切掉一半：

1. **Connect 同步的「新增裝置／加入現有裝置」配對 dialog**：`Card` 固定 `width: 480`，置中後左右各溢出約 44px。使用者實測截圖顯示標題變成「入現有裝置」（「加」被裁掉）、說明文字兩側都被切。這是雙機配對（sync onboarding）的核心流程，手機上幾乎不可用。
2. **交易詳情右側 drawer**（`TransactionDetailPanel`）：固定 `width: 460` 靠右釘住，在 393pt 手機上左緣超出視窗約 67px，drawer 左側內容被裁。

修好之後這兩個 overlay 在手機上以 bottom-sheet 呈現（app 內既有的行動裝置 modal 慣例，plan 159/244 建立），桌機行為完全不變。

## Current state

- `src/routes/settings/ConnectSection.tsx` — Connect 同步設定區塊；`AddDeviceDialog` 元件在檔尾（~line 1940–2373）。
- `src/components/TransactionDetailPanel.tsx` — 記帳交易詳情 drawer；ModalShell call site 在 line 148–167。
- `src/components/ModalShell.tsx` — 共用 dialog 外殼。重點機制（**不要改這個檔**）：
  - `mobilePresentation="bottom-sheet"` 在視窗 `(max-width: 1023px)` 時把 panel 切換成 `.ns-sheet-bottom`（全寬、釘底、可拖曳關閉）。
  - sheet 模式啟動時會**自動剝除 call site `panelStyle` 的定位 key**（`position/top/right/bottom/left/width`，見 `PANEL_POSITION_KEYS`，ModalShell.tsx:18、334–339）——但只剝 `panelStyle`，**管不到 children 裡自帶的固定寬度**。
  - 判斷手機一律用 `max-width: 1023px`，**絕不可用 `(pointer: coarse)`**（Tauri WKWebView 在桌機誤報 coarse——repo 紅線，plans 244/245）。

ConnectSection.tsx:1979–1987（現狀）：

```tsx
    <ModalShell
      variant="center"
      title={mode === "show" ? "加入現有裝置" : "新增裝置"}
      onClose={onClose}
      style={{ zIndex: 200 }}
    >
      {(dismiss) => (
        <Card style={{ width: 480, padding: 0, overflow: "hidden" }}>
```

TransactionDetailPanel.tsx:148–166（現狀）：

```tsx
    <ModalShell
      variant="sheet"
      title="交易詳情"
      onClose={onClose}
      style={{ zIndex: 998 }}
      panelStyle={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 460,
        background: "var(--ns-bg-elev)",
        borderLeft: "1px solid var(--ns-border)",
        zIndex: 999,
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--ns-shadow-2)",
      }}
    >
```

既有的「已遷移」範例可對照：`src/components/CategoryManagementDrawer.tsx`（同樣是右側 drawer + `mobilePresentation="bottom-sheet"`）、`src/routes/InvestmentsAddSheet.tsx`。

`.ns-sheet-bottom` 的 CSS（globals.css:396–406）已含 `max-height: min(92dvh, 100%)`、`overflow: hidden`、`padding-bottom: env(safe-area-inset-bottom)`、圓角與拖曳把手，不需要新 CSS。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `npm install`        | exit 0              |
| Typecheck + build | `npm run build` | exit 0（tsc 無錯誤） |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors（warnings 可存在，不得新增） |
| Format    | `npm run format:check` | All matched files use Prettier code style! |

## Scope

**In scope**（只能改這些檔）:
- `src/routes/settings/ConnectSection.tsx`
- `src/components/TransactionDetailPanel.tsx`

**Out of scope**（看起來相關但不要碰）:
- `src/components/ModalShell.tsx` — 機制已正確，兩處都是 call site 沒接。
- `src/styles/globals.css` — 不需要新 CSS。
- 其他尚未遷移 `mobilePresentation` 的 ModalShell call site（GoalEditorSheet、ReconcileRoute、CashFlowRoute 等）——它們用 `maxWidth` 或 `.ns-modal-panel`（`min(420px, 96vw)`），不會溢出，遷移它們是另一件事。
- UI 文案 — 不改任何字串（copy.csv 工作流，不在此計畫）。

## Git workflow

- Branch: `fix/ai-mobile-overlay-width`（repo 慣例：AI 修 bug 用 `fix/ai-<name>`，見 `.agentrules`）
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Commit style：conventional commits，例如 `fix(connect): pairing dialog fits mobile viewport`（參考 `git log --oneline -10`）。
- 推分支、開 PR，**不要**直接 push main、不要自行 merge。

## Steps

### Step 1: 配對 dialog — 寬度上限 + 手機 bottom-sheet

`src/routes/settings/ConnectSection.tsx` 的 `AddDeviceDialog`（line ~1979）：

1. `ModalShell` 加上 `mobilePresentation="bottom-sheet"`。
2. `Card` 的 `width: 480` 改為 `width: "min(480px, 100%)"`（sheet 模式剝的是 panelStyle，這個寬度在 child Card 上，必須自己改；桌機維持 480px 不變）。

目標形狀：

```tsx
    <ModalShell
      variant="center"
      mobilePresentation="bottom-sheet"
      title={mode === "show" ? "加入現有裝置" : "新增裝置"}
      onClose={onClose}
      style={{ zIndex: 200 }}
    >
      {(dismiss) => (
        <Card style={{ width: "min(480px, 100%)", padding: 0, overflow: "hidden" }}>
```

**Verify**: `npm run build` → exit 0。

### Step 2: 交易詳情 drawer — 手機 bottom-sheet

`src/components/TransactionDetailPanel.tsx:149`：`ModalShell` 加上 `mobilePresentation="bottom-sheet"`。`panelStyle` **保持原樣**——sheet 模式會自動剝掉 `position/top/right/bottom/width`，桌機 drawer 行為不變；留下的 `display:flex; flexDirection:column` 與 `.ns-sheet-bottom` 相容（內文 `overflow: auto` 的捲動區在 line 183，於 sheet 內一樣成立）。

**Verify**: `npm run build` → exit 0；`npm test` → all pass。

### Step 3: 手機視口驗證（Playwright 或 vite dev + 瀏覽器工具）

啟動 `npm run dev`，以 390×844 視口驗證：

1. 設定 → Connect 同步 → 新增裝置：dialog 以 bottom-sheet 呈現，標題「加入現有裝置」完整可見，`複製配對碼` 按鈕完整可點。斷言：dialog panel 的 `getBoundingClientRect()` 满足 `left >= 0 && right <= window.innerWidth`。
2. 記帳 → 點任一筆交易：詳情以 bottom-sheet 呈現，同樣斷言 bounding box 不超出視窗。
3. 桌機視口（1280×800）重測同兩處：配對 dialog 仍為置中 480px 卡片；交易詳情仍為右側 460px drawer（`right: 0`、`width: 460`）。

若寫成臨時 Playwright 檔驗證：**除 port 外，設定須與 `playwright.config.ts` 逐項相同**（repo 教訓），驗完刪除臨時檔。

**Verify**: 上述三點皆成立；`npm run test:e2e` → all pass（既有 e2e 不得回歸）。

## Test plan

- 在 `src/components/ModalShell.test.tsx` 已涵蓋 sheet 模式剝除 positional keys 的行為（line ~249–312），不需重複。
- 新增（擇一，優先前者）：
  - e2e：`src/test/e2e/` 下新增 mobile-overlay spec（參考 `src/test/e2e/sticky-chrome.spec.ts` 的結構），390×844 視口開啟配對 dialog 與交易詳情，斷言 panel bounding box 在視窗內。
  - 或 vitest：斷言 AddDeviceDialog 的 Card style 不含固定 `width: 480`（字串斷言價值低，優先 e2e）。
- Verification: `npm test` 與 `npm run test:e2e` 全綠。

## Done criteria

Machine-checkable，全部成立：

- [ ] `npm run build` exit 0
- [ ] `npm test` exit 0
- [ ] `npm run lint` 0 errors 且 warnings 數不高於基準（現為 799）
- [ ] `npm run format:check` 通過
- [ ] `grep -n "width: 480" src/routes/settings/ConnectSection.tsx` → 無結果
- [ ] `grep -c "mobilePresentation" src/components/TransactionDetailPanel.tsx` → `1`
- [ ] `git status` 顯示只有 in-scope 檔案（+ 新測試檔、plans/README.md）被改
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

Stop and report back（不要即興發揮）if:

- ConnectSection.tsx:1987 或 TransactionDetailPanel.tsx:154 的現狀與上面摘錄不符（代碼已漂移）。
- 加上 `mobilePresentation` 後，TransactionDetailPanel 在手機 sheet 模式出現內容無法捲動或高度塌陷——這代表其內部 flex 結構與 `.ns-sheet-bottom` 衝突，屬 ModalShell 相容性問題，超出本計畫。
- 任何修法看起來需要動 `ModalShell.tsx` 或 `globals.css`。
- 發現以 `(pointer: coarse)` 判斷手機的誘惑——紅線，一律 `max-width: 1023px`。

## Maintenance notes

- 尚有 ~10 個 ModalShell call site 未接 `mobilePresentation`（用 `maxWidth`/`.ns-modal-panel`，不溢出但手機體驗非 native sheet）——是既定的漸進遷移（plan 159/244），逐個接上即可，勿一次大改。
- Reviewer 應盯：桌機（1024+）兩個 overlay 的呈現 pixel-identical；配對 dialog 內 QR code（160px）在 sheet 模式的置中不受影響。
