# Plan 288: 投資分析分頁手機版 — 期間切換器可捲動、SectionHeader 不裁切

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/routes/InvestmentsAnalyticsTab.tsx src/components/SegmentedControl.tsx src/styles/globals.css`
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

投資 → 分析分頁在手機（~393pt）上有兩處水平溢出，被 `.ns-app-main` 的 `overflowX: clip`（AppShell.tsx:507，防禦全頁橫向溢出的既定機制）直接裁掉：

1. **期間切換器**（`1W 1M 3M 6M YTD 1Y 5Y All 自訂` 九段 SegmentedControl）比視窗寬，「自訂」被裁到只剩半個字——**而且點不到**。手機使用者永遠無法選自訂區間，這是功能性缺陷，不只是視覺問題。
2. **SectionHeader**（`01 報酬 我有沒有贏過大盤？ [tag]`）是不換行的 flex row，右側的 ScopeTag 膠囊被推出視窗外裁掉（使用者截圖顯示只剩「跟…」）。

兩者都有現成的修法素材：repo 已有 `.ns-hscroll`（橫向捲動 + 隱藏卷軸 + 右緣淡出遮罩，DashboardRoute.tsx:1712 是使用範例）。

## Current state

- `src/routes/InvestmentsAnalyticsTab.tsx` — 分析分頁主檔（2628 行）。
  - 期間控制列在 line 821–847：

```tsx
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedControl
            value={selection}
            onChange={handleSelectionChange}
            options={periodOptions}
          />
```

  - `SectionHeader` 定義在 line 2138–2166，root 為：

```tsx
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
```

    子項依序：編號（mono 11px）、標題（18px）、問句（dim 12px）、`{tag}`。五個 section（01–05）都用它。
- `src/components/SegmentedControl.tsx` — 共用九處以上的控制元件；root 是 `inline-flex`（line 55），內容決定寬度，本身無捲動。**不要改它**——其他 call site（多為 2–4 段）沒有溢出問題。
- `.ns-hscroll`（globals.css:2107–2119）：`overflow-x: auto`、隱藏 scrollbar、右緣 16px 淡出 mask；`.ns-hscroll--nofade` 可關閉淡出。
- 樣式優先序（AGENTS.md）：先用既有 `ns-*` class，靜態樣式不准寫 inline。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/routes/InvestmentsAnalyticsTab.tsx`

**Out of scope**:
- `src/components/SegmentedControl.tsx` — 元件本身行為正確，溢出是 call site 容器的責任。
- `src/styles/globals.css` — `.ns-hscroll` 已存在，夠用。
- `src/components/AppShell.tsx` 的 `overflowX: clip` — 防禦機制是對的，不要為了「看到溢出」而拆掉它。
- 分析分頁的其他 mobile 問題（FAB 遮擋 → plan 290；狀態列遮罩 → plan 289）。

## Git workflow

- Branch: `fix/ai-analytics-mobile-overflow`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 期間切換器包進橫向捲動容器

InvestmentsAnalyticsTab.tsx:823 的 `<SegmentedControl …>` 外包一層：

```tsx
          <div className="ns-hscroll" style={{ maxWidth: "100%" }}>
            <SegmentedControl … />
          </div>
```

（與 DashboardRoute.tsx:1712 同款用法。`maxWidth: "100%"` 是動態上下文裡既有的用法，維持一致；桌機內容不超寬時無捲動、無視覺變化。）

注意：外層 `div.flex.items-center.gap-2.flex-wrap`（line 822）保留——自訂日期 inputs 仍要能換行。

**Verify**: `npm run build` exit 0；390px 視口下九段全部可捲到、「自訂」可點選並展開日期 inputs。

### Step 2: SectionHeader 改為可換行

line 2150 的 root style 加 `flexWrap: "wrap"`，並讓問句允許收縮、tag 靠右不被推出：

```tsx
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        rowGap: 4,
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
```

問句 span（line 2160）加 `minWidth: 0`。桌機寬度足夠時一行照舊；393pt 時 tag 換到第二行完整顯示。

**Verify**: `npm run build` exit 0；390px 下五個 section（01–05）的 ScopeTag 完整可見（bounding box `right <= window.innerWidth`）；1280px 下仍為單行（可用瀏覽器工具比對改前截圖）。

### Step 3: 迴歸檢查

`npm test`、`npm run test:e2e`（含 `sticky-chrome.spec.ts` 的分析導覽列測試）全綠。

## Test plan

- e2e 優先：在 plan 287 若已建立 mobile e2e spec，追加兩個斷言（期間控制器可捲動至「自訂」並點擊、`ScopeTag` bounding box 在視窗內）；否則參考 `src/test/e2e/sticky-chrome.spec.ts` 新建。
- 臨時 Playwright 設定除 port 外必須與 `playwright.config.ts` 逐項相同（repo 教訓）。
- Verification: `npm test` + `npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0
- [ ] `npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] 390px 視口：「自訂」可點選；01–05 各 section 的 tag 完整可見
- [ ] 1280px 視口：期間控制列與 SectionHeader 視覺與改前一致（單行、無捲動條）
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 現狀摘錄與 live code 不符（行號漂移超過 ±30 行也算——先重新定位確認邏輯相同再繼續，定位不到就 STOP）。
- `.ns-hscroll` 包裹後 SegmentedControl 的 thumb 動畫（`ns-seg-thumb`，依 `offsetLeft` 定位）錯位——代表捲動容器影響了 offset 計算，回報而非硬修。
- 修法看起來需要動 SegmentedControl.tsx 或 globals.css。

## Maintenance notes

- 之後若新增期間選項（例如 3Y），`.ns-hscroll` 容器自動吸收，無需再動版面。
- Reviewer 盯：右緣淡出遮罩（`.ns-hscroll` 內建）在深色主題的觀感；`flex-wrap` 後 SectionHeader 在 768–1023px 平板寬度的中間態。
