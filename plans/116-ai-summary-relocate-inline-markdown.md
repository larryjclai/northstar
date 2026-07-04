# Plan 116: AI 本月摘要 — 移到問候語下方、去卡片化、渲染 markdown（沉浸式）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If a STOP condition
> occurs, stop and report — do not improvise. Commit per the git workflow.
> Update the status row in `plans/README.md` unless a reviewer maintains it.
>
> **Drift check (run first)**: `git diff --stat 4c22f478..HEAD -- src/routes/DashboardRoute.tsx src/components/Toast.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED（動 Dashboard 版面 + 新增共用元件）
- **Depends on**: none（本計劃建立共用 `MarkdownText`；plan 117 會沿用它）
- **Category**: ux / direction
- **Planned at**: commit `4c22f478`, 2026-07-04

## Why this matters

「本月摘要（裝置端 AI）」目前以一張卡片掛在總覽頁**最底部**，操作者覺得位置怪、
有「刻意冒出來」的違和感、沉浸感不足。他要：(1) 移到問候語（早安/午安/晚安）
**下方**；(2) **不要卡片式**，融入頁面；(3) 更簡短；(4) 內文的 **粗體** markdown
要正確渲染（現在顯示原始 `**6,060**` 而非粗體）。

markdown 沒解析是因為裝置端模型無視 prompt 的「不要用 markdown」指示、照樣輸出
`**…**`；正解是**渲染** markdown（顯示成粗體），而非要求模型別用。本計劃建立一個
輕量 `MarkdownText` 元件（plan 117 更新通知也會用同一個）。

## Current state

- `src/routes/DashboardRoute.tsx`：
  - 問候語 header（770–774 行）：

    ```tsx
    <div className="text-xs ns-field-label">Overview · {monthLabel}</div>
    <h1 className="text-[28px]" style={{ fontFamily: "var(--ns-font-display)", margin: 0, letterSpacing: -0.02, fontWeight: 600 }}>{greeting}</h1>
    ```

  - 摘要卡目前掛在**底部**（1269 行附近）：`{cardVisible("monthlySummary") && hasAnyData ? <MonthlySummaryCard … /> : null}`
  - `DASHBOARD_CARDS` 有一項 `{ key: "monthlySummary", label: "本月摘要 (AI)" }`（107 行）——「版面」Popover 的顯示切換。
  - `MonthlySummaryCard`（1289–1375 行）：`<Card>` + `<SectionHead eyebrow="AI summary · on-device" title="本月摘要" />`，內文
    `<div className="text-body" style={{ lineHeight: 1.7, color: "var(--ns-fg)" }}>{summaryText}</div>`（**raw**，未解析 markdown），底部有「由裝置端 AI 產生…」caption + 「重新產生」ghost button。資料齊時 auto-generate 一次，FM 不可用或無資料時 `return null`。

- **裝置端 prompt**（`src-tauri/gen/apple/Sources/northstar/FoundationModels.swift:247-252`，理解用）：
  已寫「用繁體中文寫 **2–3 句**簡潔摘要」「不要使用 markdown」。模型不遵守 markdown 指示。
  → 「更簡短」若要更強制，改這裡（Swift，需裝置端驗證）；本計劃 JS 端負責移位/去卡/渲染。

- 慣例：muted 小標走 `.ns-field-label` / `.ns-eyebrow` / `.muted`；純文字段不要新增 inline（plan 115 規則）。

## Commands you will need

| Purpose   | Command        | Expected |
|-----------|----------------|----------|
| Install   | `npm ci`       | exit 0   |
| Typecheck | `npx tsc`      | exit 0   |
| Tests     | `npm test`     | all pass |
| Lint      | `npm run lint` | exit 0   |
| Dev shell | `npm run dev`  | :5173（視覺驗證） |

## Scope

**In scope**:
- `src/components/MarkdownText.tsx`（新建，共用）
- `src/components/MarkdownText.test.tsx`（新建）
- `src/routes/DashboardRoute.tsx`（移位 + 去卡片 + 用 MarkdownText）

**Out of scope**:
- `src-tauri/**` 的 prompt（「更簡短」的 Swift 調整是可選後續，需裝置端驗證——見 Maintenance）。
- 其他 dashboard 卡片、`buildMonthlySummaryInput` 的資料組裝、FM invoke 邏輯。
- plan 117 的更新通知（會沿用 MarkdownText，但不在此改）。

## Git workflow

- Branch: `feat/ai-summary-inline`
- Commit style: conventional commits
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: 建立共用 `MarkdownText` 元件

`src/components/MarkdownText.tsx` — 輕量渲染，支援裝置端 AI 與 changelog 會用到的
子集：`**bold**`、`### / ## 標題`、`- 清單`、段落與換行。**不引入 markdown lib**
（專案無此依賴，且只需小子集）。目標 API：

```tsx
export function MarkdownText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }): JSX.Element
```

實作要點（純函式解析，無 dangerouslySetInnerHTML —— 逐行 + inline `**` 切分成
React 節點）：
- 逐行掃描：`### ` / `## ` 開頭 → 對應標題節點（用既有字級 class，如 `text-title-3`/
  `text-ui`，避免 inline）；`- ` / `* ` 開頭 → `<li>`（連續的收成一個 `<ul>`）；
  空行 → 段落分隔；其餘 → 段落 `<p>`。
- inline：把每段文字用 `**…**` 切分，成對的包 `<strong>`，其餘純文字。單一未成對的
  `*`/`**` 當普通字元（不要吃字）。
- 不解析連結/圖片/程式碼區塊（不需要）。輸出用語意標籤 + 既有 class，避免新 inline。

**Verify**: `npx tsc` → exit 0。

### Step 2: MarkdownText 測試

`src/components/MarkdownText.test.tsx`（照專案既有 component 測試風格，如
`NumberField.test.tsx` 用 `@testing-library/react`）：
- `**你好**` → 一個 `<strong>你好</strong>`。
- `這個月收入是 **6,060** 元` → 文字含一個 strong「6,060」，其餘為純文字。
- `### 標題` → 標題節點含「標題」，不含字面 `###`。
- `- a\n- b` → 兩個 list item。
- 未成對 `**` → 原樣純文字，不誤吞後續內容。

**Verify**: `npx vitest run src/components/MarkdownText.test.tsx` → 全 pass。

### Step 3: 摘要移到問候語下方 + 去卡片化

1. 從底部（1269 行）**移除** `<MonthlySummaryCard … />` 的掛載。
2. 在問候語 `<h1>{greeting}</h1>`（774 行）**下方**、同一個左側 `<div>` 內，
   渲染 inline 摘要（非卡片）。改寫 `MonthlySummaryCard` 為 inline 形態
   （移除 `<Card>` 與 `<SectionHead>`）：
   - 無摘要/loading 前：不佔位（維持 `return null` / 極簡 skeleton 單行）。
   - 有摘要：一段 muted、貼合問候語的內文，用
     `<MarkdownText text={summaryText} className="text-body muted" />`（`muted` 讓它
     低調、沉浸，不搶問候語），行距沿用 `leading-*` 而非 inline `lineHeight`。
   - 「重新產生」縮為極輕量的 icon-only ghost button 或移除顯性 caption；
     「由裝置端 AI 產生」的隱私 caption 可縮成一個 hover title 或 `text-caption dim`
     的極短字（操作者要「不刻意」——把裝飾降到最低）。
   - 保留 auto-generate 與 FM 不可用時不顯示的行為。
3. `DASHBOARD_CARDS` 的 `monthlySummary` 項：既然不再是版面卡片，從「版面」
   Popover 清單移除該項（它控制的是卡片顯隱；inline 摘要改為「有就顯示」）。
   若要保留使用者可關閉的能力，改用一個 uiPreference flag——**但預設行為以
   移除 toggle、有摘要即顯示為準**（操作者要沉浸感，不要刻意的開關）。

**Verify**: `npx tsc` → exit 0。`npm run dev` → demo 模式總覽：摘要出現在
「早安/午安/晚安」正下方、非卡片、粗體數字正確渲染、底部不再有摘要卡。

### Step 4: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。桌面 + 375px 各看一次
（摘要在窄幅換行自然、不破版）——deferred to reviewer/operator。

## Test plan

- Step 2 的 MarkdownText 單元測試（bold / heading / list / 未成對）。
- 回歸：`npm test` 全綠。
- 視覺：摘要位置、去卡片、粗體渲染 —— reviewer preview 驗。

## Done criteria

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `src/components/MarkdownText.tsx` 存在且有測試
- [ ] `grep -n "MonthlySummaryCard\|MarkdownText" src/routes/DashboardRoute.tsx` → 摘要在 header 區、用 MarkdownText
- [ ] `grep -n "本月摘要 (AI)" src/routes/DashboardRoute.tsx` → 已從 DASHBOARD_CARDS 移除（或改為 flag）
- [ ] `git status` 只含 in-scope 檔案
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- 摘錄與現場不符（drift）。
- 移除 `MonthlySummaryCard` 牽動其它 dashboard 卡片的 layout grid（grep 確認它是獨立 block）。
- MarkdownText 的解析在某個真實摘要字串上吃錯字 —— 回報樣本，別硬解。

## Maintenance notes

- **「更簡短」的最強手段是裝置端 prompt**（`FoundationModels.swift:247` 的「2–3 句」
  改成「1–2 句」），但那是 Swift 改動、只能在 Apple 裝置上驗證輸出品質，故列為
  可選後續，不在本 JS 計劃。
- `MarkdownText` 是共用元件：plan 117（更新通知）會 import 它；未來任何要顯示
  AI/changelog markdown 的地方都用它，不要再散寫解析。
- Reviewer 檢查重點：摘要與問候語的視覺層級（摘要應低調不搶戲）、窄幅換行、
  粗體/標題渲染、FM 不可用時乾淨不顯示。
