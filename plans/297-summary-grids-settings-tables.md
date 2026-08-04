# Plan 297: 摘要網格與設定表格手機收合 — 對帳／分類摘要、名稱／商家表、同步衝突列

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/routes/ReconcileRoute.tsx src/routes/CategoriesTab.tsx src/routes/settings/NamesSection.tsx src/routes/settings/MerchantsSection.tsx src/routes/settings/ConnectSection.tsx src/styles/globals.css`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: M（四個獨立小修的批次）
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

四處同型問題：固定欄數 grid／不可縮 flex 在 390px 手機上把內容擠成細條或裁掉。
每一處旁邊都有**已經做對的兄弟**可以直接抄——這是補課，不是設計。

1. **對帳頁三欄摘要**（本期消費／已核對／未核對）：每欄 ~99px，`NT$14,975,000` 這種
   token ~130px，溢出卡框。同檔上方 line 244 已用正確的 auto-fit 模式。
2. **分類分頁三欄摘要卡**：每欄內容 ~58px 放 18px 字串。正確範本是隔壁
   `MerchantsTab.tsx:131` 的 `repeat(auto-fit, minmax(min(200px, 100%), 1fr))`。
3. **設定的名稱／商家主檔表**：固定軌 `1fr 72px 100px 40px`／`1fr 72px 80px`，手機上
   名稱欄只剩 ~106px。同家族的 CategoriesSection **已有** mobile override
   （globals.css:927–928），這兩個漏接。
4. **同步衝突列**：兩側 `shrink-0` 叢集（Badge+時間標籤、兩顆按鈕）合計 ~270px，唯一
   可縮的是「哪筆資料在衝突」的標題——被壓到 ~40px 省略號。使用者要在看不到是哪筆的
   情況下做「保留本機 vs 採用遠端」的破壞性選擇（operator 截圖可見擁擠狀態）。

## Current state

- `src/routes/ReconcileRoute.tsx:361–367`：

```tsx
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 20,
        }}
      >
```

  （其後三張 `Card className="p-4"`，19px `NT$…` 數字。）同檔 line 244 附近有正確的
  auto-fit 前例（執行時先看一眼確認寫法）。頁根 `padding: "24px 32px 100px"`（line 311）
  ——一併接 `--ns-page-gutter`（同 plan 296 Step 1 的做法）。
- `src/routes/CategoriesTab.tsx:143`：

```tsx
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
```

  正確範本 `src/routes/MerchantsTab.tsx:129–131`：

```tsx
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
      >
```

- `src/routes/settings/NamesSection.tsx:131`（header）與 `:149`（rows）：
  `gridTemplateColumns: "1fr 72px 100px 40px"`。
  `src/routes/settings/MerchantsSection.tsx:261`（header）與 `:277`、`:313`（rows）：
  `"1fr 72px 80px"`。
  既有解法範本（globals.css:921–928）：

```css
@media (max-width: 640px) {
  …
  .ns-settings-category-head, .ns-settings-category-row { grid-template-columns: minmax(0, 1fr) 72px 64px !important; padding-left: 14px !important; padding-right: 12px !important; gap: 6px; }
  .ns-settings-category-budget, .ns-settings-category-usage { display: none !important; }
```

- `src/routes/settings/ConnectSection.tsx:1267–1291`（衝突列）：

```tsx
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="rounded-full text-micro shrink-0">…</Badge>
                      <span className="font-semibold truncate" title={summary.title}>…</span>
                      <span className="shrink-0" style={{ color: "var(--ns-fg-muted)" }}>…（本機較新等）</span>
                    </span>
                    <span className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" …>保留本機</Button>
                      …
```

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/routes/ReconcileRoute.tsx`（摘要 grid + 頁根 gutter）
- `src/routes/CategoriesTab.tsx`（摘要 grid 一行）
- `src/routes/settings/NamesSection.tsx`、`src/routes/settings/MerchantsSection.tsx`
  （掛 class）
- `src/routes/settings/ConnectSection.tsx`（衝突列版面）
- `src/styles/globals.css`（settings 表格 override、衝突列 mobile 規則）

**Out of scope**:
- Reconcile 的對帳邏輯、ConnectSection 的同步/衝突解決邏輯（`resolveConflict` 等）。
- ConnectSection 的配對 dialog（plan 287）。
- `CategoriesSection.tsx`（已正確）。

## Git workflow

- Branch: `fix/ai-mobile-grid-batch`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；一個 commit 一個小修（4 commits 也可以）；推分支開 PR。

## Steps

### Step 1: Reconcile 摘要 + gutter

line 364 → `gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))"`；
line 311 頁根 padding → `"24px var(--ns-page-gutter, 32px) 100px"`（先確認變數解析，
同 plan 296 Step 1 的注意事項）。

**Verify**: 390px：三卡直向堆疊或 2+1、金額完整；1280px：三欄不變。

### Step 2: CategoriesTab 摘要

line 143 → 完全比照 MerchantsTab 寫法：

```tsx
      <div
        className="grid gap-5"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}
      >
```

**Verify**: 390px 堆疊、1280px 三欄。

### Step 3: 名稱／商家表 mobile override

globals.css 的 `@media (max-width: 640px)` 區塊（line 921 起）追加：

```css
  .ns-settings-names-head, .ns-settings-names-row { grid-template-columns: minmax(0, 1fr) 56px 40px !important; gap: 6px; }
  .ns-settings-names-lastused { display: none !important; }
  .ns-settings-merchants-head, .ns-settings-merchants-row { grid-template-columns: minmax(0, 1fr) 56px 64px !important; gap: 6px; }
```

NamesSection.tsx：header（line 126 div）加 `className="ns-settings-names-head"`、rows
（line ~149 對應 div）加 `ns-settings-names-row`，「最後使用」欄的 header span 與 row
span 各加 `ns-settings-names-lastused`（欄位名先開檔確認——本計畫寫作時只讀了 header
template，執行時對照實際欄位語意掛 class）。MerchantsSection.tsx 同理掛
`ns-settings-merchants-*`。

**Verify**: 390px 設定 → 名稱／商家：名稱欄 ≥ 内容寬 60%、無溢出；桌機不變
（override 只在 ≤640px）。

### Step 4: 衝突列兩行化

ConnectSection.tsx line 1267 的列容器：手機讓標題行與按鈕行各占整行。最小改法——
給外層 div 加 class `ns-conflict-row`、按鈕叢集 span 把 `flex-shrink-0` 換成 class 控制，
globals.css：

```css
@media (max-width: 640px) {
  .ns-conflict-row > span:first-child { flex: 1 1 100%; }
  .ns-conflict-row > span:last-child { flex: 0 0 auto; margin-left: auto; }
}
```

（效果：第一行 Badge+標題+新舊標籤佔滿寬、標題有空間；第二行按鈕靠右。）
桌機一行不變。header 的「全部保留本機／全部採用遠端」列（line 1236）已有 `flex-wrap`，
實測 390px 若換行正常則不動。

**Verify**: 390px：衝突列標題至少顯示 ~15 個字（`truncate` 前的可見寬 > 150px）；
按鈕完整可點；桌機單行不變。

## Test plan

- e2e（併入本批 mobile spec）：390×844 斷言四處各自的關鍵 bounding box（摘要卡
  `right <= innerWidth`、衝突列標題寬 > 150）。衝突列需要造衝突資料，若 e2e 環境做不到
  就以 vitest 元件測試（渲染 `ConflictList` 或對應子元件、jsdom 量 class 存在）代替，
  並在 PR 註明版面實測依賴 operator 手機複驗。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -n '"repeat(3, 1fr)"' src/routes/ReconcileRoute.tsx` → 無結果
- [ ] `grep -n '"1fr 1fr 1fr"' src/routes/CategoriesTab.tsx` → 無結果
- [ ] `grep -c "ns-settings-names" src/routes/settings/NamesSection.tsx` → ≥2
- [ ] 390px 四處全部無溢出、衝突列標題可辨識
- [ ] 桌機四處逐像素等價
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 任一摘錄與 live code 不符（重新定位失敗即 STOP）。
- NamesSection/MerchantsSection 的欄位語意與計畫假設不符（例如 100px 欄不是「最後使用」）
  ——對照實際欄位後仍不確定隱藏哪欄，STOP 問 operator。
- 衝突列兩行化後與 `p-2.5` 卡片的視覺密度明顯變差（高度 >2 倍）——回報截圖再定案。

## Maintenance notes

- 這批修完後，repo 的「摘要卡 grid」慣例統一為 `repeat(auto-fit, minmax(min(NNNpx, 100%), 1fr))`
  ——新頁面照抄，勿再寫死欄數。
- Reviewer 盯：settings override 沿用既有 `!important` 模式（該區塊風格如此，維持一致），
  但不要把 `!important` 擴散到新的非 settings class。
