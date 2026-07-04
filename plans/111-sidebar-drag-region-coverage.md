# Plan 111: macOS 視窗拖曳 — sidebar 頂部整區可拖（logo、文字、留白全覆蓋）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 479b6256..HEAD -- src/components/AppShell.tsx src/styles/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition。（若 operator 已合併 plan 097
> 分支 `1d17856f`，AppShell 的 aside padding 與 globals.css 會多出
> `--ns-titlebar-inset` — 該 diff 屬預期基線，不算 drift。）

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW（macOS-only 行為；非 macOS 無 `data-native-glass`，全部 no-op）
- **Depends on**: 建議 operator 先合併 097（間距修正）；本計劃程式碼上獨立，
  `var(--ns-titlebar-inset, 0px)` 的 fallback 讓兩種基線都能跑
- **Category**: bug (macOS shell)
- **Planned at**: commit `479b6256`, 2026-07-02

## Why this matters

操作者回報：sidebar 上方抓不動視窗（對照 Wealthfolio：整個 sidebar 頂部
都能拖）。查證出兩個成因：

1. **`data-tauri-drag-region` 不會傳遞給子元素** — 屬性只對掛在元素本身的
   mousedown 生效。sidebar 頂部 strip 有掛，但視覺主體（logo 圖、
   「Northstar」字）是子元素，抓它們不會拖。AppShell.tsx:160 的註解說
   「Interactive children (buttons) are excluded automatically」— 對，但
   **非互動子元素也同樣沒被涵蓋**，這是註解沒說的部分。
2. **頂部整條 drag strip 被 sidebar 蓋住** — `.ns-titlebar-drag` 是
   `z-index: 30`，sidebar `<aside>` 是 `z-index: 1100`，所以視窗頂部 28px
   的拖曳帶只在主內容區有效，sidebar 欄位上方那段無效。

## Current state

- `src/components/AppShell.tsx:139` — 全寬拖曳帶（plan 094 加的）：

```tsx
<div data-tauri-drag-region className="ns-titlebar-drag" aria-hidden="true" />
```

- `src/styles/globals.css:447-449` — 只在 macOS（`data-native-glass`）顯示：

```css
.ns-titlebar-drag { display: none; }
html[data-native-glass] .ns-titlebar-drag { display: block; position: fixed; top: 0; left: 0; right: 0; height: 28px; z-index: 30; }
html[data-native-glass] .ns-app-main { padding-top: 28px; }
```

- `src/components/AppShell.tsx:141-158` — aside：`z-index: 1100`、
  `overflow: hidden`（097 合併後 padding 改為
  `calc(16px|22px + var(--ns-titlebar-inset, 0px)) …`）。

- `src/components/AppShell.tsx:164-198` — 兩個頂部 strip（collapsed /
  expanded），strip 本身有 drag-region、子元素沒有：

```tsx
{collapsed ? (
  <div data-tauri-drag-region style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 0 16px" }}>
    <img src={appIconUrl} alt="" style={{ width: 26, height: 26, borderRadius: 7 }} />
    <button type="button" onClick={toggleSidebarCollapsed} …><CaretRight size={14} /></button>
  </div>
) : (
  <div data-tauri-drag-region style={{ padding: "0 8px 16px", display: "flex", alignItems: "center", gap: 9, justifyContent: "space-between" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <img src={appIconUrl} alt="" style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0 }} />
      <span className="text-[15px]" style={{ fontFamily: "var(--ns-font-brand)", … }}>Northstar</span>
    </div>
    <button type="button" onClick={toggleSidebarCollapsed} …><CaretLeft size={14} /></button>
  </div>
)}
```

- 前例：plan 094 已授權 capability `core:window:allow-start-dragging`
  （`src-tauri/capabilities/desktop.json`，已在 main）— 本計劃純前端，
  不需要動 Tauri 設定。

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |
| macOS 實測 | `npm run tauri dev`（僅 operator/macOS 環境） | 拖曳生效 |

## Scope

**In scope** (the only files you should modify):
- `src/components/AppShell.tsx`（僅兩個頂部 strip 與 aside 內新增一個拖曳補丁元素）
- `src/styles/globals.css`（僅新增 `.ns-sidebar-drag-cap` 規則）

**Out of scope** (do NOT touch, even though they look related):
- `.ns-titlebar-drag` 的 `z-index: 30` — **不要調高**。調到 sidebar 之上
  （>1100）會讓視窗頂部 28px 在 modal/命令面板上方也變成拖曳帶，吃掉點擊。
- `src-tauri/capabilities/*` — 094 已就緒。
- sidebar 的 padding / `--ns-titlebar-inset` — 那是 097 的（未合併）修正。
- aside 的 `transition: width …`（index rejected 清單：刻意設計）。

## Git workflow

- Branch: `fix/ai-sidebar-drag-coverage`
- Commit style: `fix(shell): make sidebar header fully draggable on macOS`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: 非互動子元素補 drag-region

在兩個 strip 的**非互動**子元素上加 `data-tauri-drag-region`：
collapsed 分支的 `<img>`；expanded 分支的 `<img>`、`<span>Northstar</span>`
與包它們的 inner `<div>`。**兩顆 collapse button 不加**（要保持可點）。
同步把 160–163 行的註解修正為：drag-region 不會傳遞給子元素，所以每個
非互動子元素都要自己掛。

**Verify**: `grep -c "data-tauri-drag-region" src/components/AppShell.tsx` →
比改前多 4（改前先數一次記下）。

### Step 2: sidebar 頂部留白補拖曳蓋板

aside 的頂部 padding 區（logo strip 之上，097 合併後含 40px 的紅綠燈退讓）
不屬於任何 drag-region。在 aside 內第一個子元素位置加：

```tsx
{/* macOS：sidebar 頂部留白的拖曳蓋板 — .ns-titlebar-drag(z:30) 被
    aside(z:1100) 蓋住，補一塊在 aside 內。非 macOS display:none。 */}
<div data-tauri-drag-region className="ns-sidebar-drag-cap" aria-hidden="true" />
```

`globals.css` 在 `.ns-titlebar-drag` 規則旁加（沿用同一 gating 慣例）：

```css
.ns-sidebar-drag-cap { display: none; }
html[data-native-glass] .ns-sidebar-drag-cap {
  display: block;
  position: absolute;
  top: 0; left: 0; right: 0;
  height: calc(var(--ns-titlebar-inset, 0px) + 22px);
  z-index: 1;
}
```

注意 aside 需要定位上下文：aside 是 `sticky`（已是 positioned element），
`position: absolute` 的蓋板會以它為基準 — 不需額外改動。蓋板 z-index 1
低於 sidebar 內容的互動元素預設堆疊？**不是** — absolute 元素會蓋住之後的
static 兄弟。因此高度必須只涵蓋留白：`--ns-titlebar-inset`（097 後 = 40px）
+ 22px 上 padding 的一部分。若實測蓋到 logo strip 頂部造成 collapse 按鈕
上緣不可點，把 `+ 22px` 降為 `+ 12px`。

**Verify**: `npx tsc` → exit 0；`npm run dev`（瀏覽器 dev shell 無
`data-native-glass`）→ sidebar 頂部外觀與行為零變化（蓋板 display:none）。

### Step 3: 全量驗證 + operator 實測清單

`npm test`、`npm run lint`。macOS 實測（headless 做不了，交 operator）：
`npm run tauri dev` →
1. 抓 logo 圖 / 「Northstar」字 / logo 左右留白 → 視窗跟著動。
2. 抓 sidebar 最頂部（紅綠燈同一水平帶的空白）→ 視窗跟著動。
3. collapse 按鈕、搜尋框、⌘K、nav 連結全部仍可正常點。
4. 收合 sidebar 後（64px 寬）重複 1–3。

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。

## Test plan

- 無單元測試可寫（Tauri 原生拖曳行為）；驗收 = Step 3 的 4 點 macOS 清單
  （記入 README status 欄「pending operator macOS eyeball」，比照 079/097 慣例）。
- 回歸：dev shell（非 macOS 路徑）sidebar 零變化。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `grep -c "ns-sidebar-drag-cap" src/components/AppShell.tsx` → 1；
      `grep -c "ns-sidebar-drag-cap" src/styles/globals.css` → 2（base + gated）
- [ ] Step 1 的 drag-region 計數 +4
- [ ] `git status` 只含 in-scope 檔案
- [ ] `plans/README.md` status row updated（註明 macOS 實測待 operator）

## STOP conditions

Stop and report back (do not improvise) if:

- 摘錄與現場不符且不是 097 合併造成的預期差異。
- 你想改 `.ns-titlebar-drag` 的 z-index 來「一次解決」— 明確禁止（會吃掉
  modal 頂部點擊），收手。
- 蓋板無論怎麼調高度都會擋到互動元素 — 回報各斷點的實測值。

## Maintenance notes

- 根本教訓寫進註解了：`data-tauri-drag-region` 是 per-element 的。之後任何
  新的 titlebar 級 UI（例如未來的全域 header）都要逐元素掛。
- 097 合併前執行本計劃也安全（`var(--ns-titlebar-inset, 0px)` fallback = 0，
  蓋板退化成 22px 高的 padding 蓋板）；但**間距**問題仍要靠合併 097 解。
- Reviewer 檢查重點：收合狀態（64px）下蓋板不遮 collapse 按鈕；
  非 macOS（Windows/Linux 打包版）零視覺與行為變化。
