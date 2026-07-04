# Plan 117: 更新通知 — 預設不顯示更新內容（展開才看）+ markdown 渲染

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If a STOP condition
> occurs, stop and report — do not improvise. Commit per the git workflow.
> Update the status row in `plans/README.md` unless a reviewer maintains it.
>
> **Drift check (run first)**: `git diff --stat 4c22f478..HEAD -- src/components/AppShell.tsx src/components/Toast.tsx src/components/MarkdownText.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED（動 Toast 元件 API + 更新提示流程）
- **Depends on**: plan 116（沿用 `MarkdownText`；若 116 未做，本計劃依下方 spec 自建，二者 spec 相同）
- **Category**: ux
- **Planned at**: commit `4c22f478`, 2026-07-04

## Why this matters

「有新版本可下載」的提示目前把整段 changelog 塞進 toast 的 `description`（截 140 字），
而且是**原始文字**——所以使用者看到 `### Added - **年度報稅明細**…` 這種未解析的
markdown（見操作者截圖）。操作者要：(1) **預設不要顯示更新內容**，展開才出現；
(2) markdown 要正確解析（`**粗體**` 顯示成粗體）。markdown 渲染與 plan 116 的 AI
摘要共用同一個 `MarkdownText`。

## Current state

- `src/components/AppShell.tsx` — `useAutoUpdateCheck`（約 555–563 行）目前把 changelog
  塞進 description：

  ```tsx
  const notes = update.body?.trim();
  toast.info(`有新版本可下載 · v${update.version}`, {
    durationMs: 0,
    description: notes
      ? (notes.length > 140 ? `${notes.slice(0, 140)}…` : notes)
      : "已備妥一個新版本，更新後即可使用最新功能。",
    action: { label: "立即更新", onClick: () => void runInstall(update.version, () => update.downloadAndInstall()) },
  });
  ```

- `src/components/Toast.tsx` — `ToastDescriptor`（16 行附近）：`description?: string`（**只吃字串**，
  173 行 `<div …>{toast.description}</div>` 純文字渲染）、`action?: { label; onClick }`（單一動作）。
  無展開機制、不吃 JSX。

- `src/components/MarkdownText.tsx` — plan 116 建立的共用 markdown 渲染元件（`**bold**`/
  `### 標題`/`- 清單`/段落）。若尚未存在，本計劃依「Appendix: MarkdownText spec」自建（同 116）。

## Commands you will need

| Purpose   | Command        | Expected |
|-----------|----------------|----------|
| Install   | `npm ci`       | exit 0   |
| Typecheck | `npx tsc`      | exit 0   |
| Tests     | `npm test`     | all pass |
| Lint      | `npm run lint` | exit 0   |

## Scope

**In scope**:
- `src/components/Toast.tsx`（新增可選的「展開內容」能力）
- `src/components/AppShell.tsx`（更新提示改為不預顯 changelog、可展開）
- `src/components/MarkdownText.tsx`（若 116 未做則自建 + 測試）

**Out of scope**:
- 更新的下載/安裝流程（`runInstall`）、`@tauri-apps/plugin-updater` 呼叫。
- 設定 → 應用程式更新（ConnectSection 的手動 checker）——不在此改。
- AI 摘要（plan 116）。

## Git workflow

- Branch: `feat/ai-updater-notes-collapse`
- Commit style: conventional commits
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0（若需要）: 確保 `MarkdownText` 存在

`test -f src/components/MarkdownText.tsx`。不存在就依本檔末「Appendix: MarkdownText
spec」建立元件 + 測試（與 plan 116 相同）。存在則直接 import 使用。

**Verify**: `npx tsc` → exit 0。

### Step 1: Toast 支援可展開的 details

在 `ToastDescriptor` 加一個可選欄位（string，markdown）：

```ts
/** Optional collapsible detail body (markdown). Hidden until the user expands. */
details?: string;
```

在 Toast 渲染（`description` 那塊附近）：當 `toast.details` 存在時，加一個
「更新內容 ▾ / ▴」toggle（`useState` 記展開），展開時在 toast 內用
`<MarkdownText text={toast.details} className="mt-1 text-xs" style={{ maxHeight: 200, overflowY: "auto" }} />`
渲染。收合時不顯示任何 changelog 文字。toggle 樣式對齊 toast 內既有小字（`text-xs`、
muted）。**description 與 details 互斥用途**：description 給一句話狀態，details 給可展開全文。

**Verify**: `npx tsc` → exit 0；`npm run lint` → exit 0。

### Step 2: 更新提示改為不預顯 changelog

`AppShell.tsx` 的 `toast.info("有新版本可下載…")` 改為：
- `description`：固定一句話「更新後即可使用最新功能。」（**不再**放 changelog 節選）。
- `details`：`update.body?.trim()`（完整 changelog，交給 Toast 的展開 + MarkdownText）。
- `action`：維持「立即更新」。

```tsx
const notes = update.body?.trim();
toast.info(`有新版本可下載 · v${update.version}`, {
  durationMs: 0,
  description: "更新後即可使用最新功能。",
  details: notes || undefined,
  action: { label: "立即更新", onClick: () => void runInstall(update.version, () => update.downloadAndInstall()) },
});
```

移除舊的 140 字截斷邏輯。

**Verify**: `npx tsc` → exit 0；`grep -n "slice(0, 140)" src/components/AppShell.tsx` → 無輸出。

### Step 3: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。
互動驗證（toast 預設只有標題+一句+立即更新；點「更新內容 ▾」才展開、且粗體/標題
正確渲染）—— 桌面環境需真的觸發 updater 才看得到，deferred to reviewer/operator；
reviewer 可用一次性 `toast.info("測試", { details: "### Added\\n- **粗體**測試" })` 注入驗證。

## Test plan

- 若本計劃自建 MarkdownText：加其單元測試（見 Appendix / plan 116 Step 2）。
- Toast 的展開行為無既有測試基建，靠 reviewer 注入式驗證；`npm test` 保持全綠。

## Done criteria

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `ToastDescriptor` 有 `details?: string`，Toast 有展開 toggle 用 MarkdownText 渲染
- [ ] `grep -n "slice(0, 140)" src/components/AppShell.tsx` → 無輸出
- [ ] 更新 toast 的 `description` 不含 changelog；`details` 帶 `update.body`
- [ ] `git status` 只含 in-scope 檔案
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- 摘錄與現場不符（drift）。
- Toast 元件結構與描述差異大到 `details` 無處掛（回報實際結構）。
- 你發現自己想動下載/安裝流程或 ConnectSection —— 越界，收手。

## Appendix: MarkdownText spec（僅在 plan 116 尚未建立時自建，內容需與 116 一致）

`src/components/MarkdownText.tsx` — 輕量、無依賴的 markdown 子集渲染：
- API：`export function MarkdownText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }): JSX.Element`
- 逐行：`### `/`## ` → 標題節點；`- `/`* ` → `<li>`（連續收成 `<ul>`）；空行分段；其餘 `<p>`。
- inline：`**…**` 成對 → `<strong>`，未成對當純文字（不吞後續）。
- 不解析連結/圖片/程式碼；用語意標籤 + 既有 class，不新增 inline style。
- 測試（`MarkdownText.test.tsx`）：`**你好**`→strong；`收入 **6,060** 元`→含 strong「6,060」；`### 標題`→標題不含 `###`；`- a\n- b`→兩 li；未成對 `**`→原樣。

## Maintenance notes

- Toast 的 `details` 是通用能力：未來任何需要「一句話 + 可展開全文」的通知都能用。
- markdown 一律走 `MarkdownText`，不要在 toast/其它處散寫解析。
- Reviewer 檢查重點：toast 預設不洩漏 changelog（沉浸/精簡）、展開後 markdown 正確、
  收合狀態高度不撐爆、`durationMs:0` 的 sticky 行為不變。
