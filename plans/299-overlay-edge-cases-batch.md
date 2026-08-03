# Plan 299: Overlay 與版面邊角批次 — sheet 寬度契約補洞、onboarding chips、匯入精靈對應列、記帳 datetime 欄、卡片內距

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/components/ModalShell.tsx src/components/CategoryManagementDrawer.tsx src/components/OnboardingOverlay.tsx src/routes/InvestmentImportWizard.tsx src/routes/CashFlowRoute.tsx src/routes/GoalsRoute.tsx src/routes/CategoriesRoute.tsx`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: M（五個獨立 S 修的批次）
- **Risk**: LOW（唯 ModalShell 一處 MED——見 STOP）
- **Depends on**: plan 298（沿用 `.ns-form-row-2` helper；若 298 未落地，本計畫 Step 4
  先自建該 class，內容相同）
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

五個彼此獨立的手機邊角問題，單獨都太小不值一份計畫，合批處理：

1. **ModalShell bottom-sheet 寬度契約有洞**：sheet 模式會剝掉 call site 的
   `position/top/right/bottom/left/width`，但**不剝 `maxWidth`**。分類管理 drawer 傳了
   `maxWidth: 400`——在 428/430px 的 iPhone Plus/Pro Max 上，`left:0 + right:0 +
   max-width:400` 過度約束、LTR 下丟棄 `right`，sheet 變成 **400px 寬靠左貼齊**，右側
   露出一條 30px 的 scrim 縫，像 rendering bug。
2. **Onboarding 第一步的 5 欄示意 chips**：390px 每欄 ~50px，`minmax(0,1fr)` 允許縮到
   min-content 以下，`Account`/`Category` 字樣溢出自己的圓角底、疊到鄰格——新使用者
   手機首屏。
3. **投資匯入精靈的交易類別對應列**：`1fr 200px` 固定軌 + 無 `min-width:0` 的 mono
   value——長 token 的 CSV 值把列撐出卡片。
4. **記帳 drawer 的帳戶+日期列**：`grid-cols-2` 在手機每欄 ~164px，zh-TW 的
   `datetime-local`（`2026/08/03 上午10:30`）固有寬 >164px，時間部分被裁。
5. **Goals／Categories 卡片內距硬編碼 32px**：手機上卡片內容白白少 32px/側。

## Current state

- `src/components/ModalShell.tsx:18`：

```ts
const PANEL_POSITION_KEYS = ["position", "top", "right", "bottom", "left", "width"] as const;
```

  剝除邏輯在 line 334–339（`sheetActive && panelStyle` 時 delete 這些 key）。
- `src/components/CategoryManagementDrawer.tsx:131–143`（唯一傳 `maxWidth` 的
  bottom-sheet call site）：

```tsx
      panelStyle={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: "100%",
        maxWidth: 400,
        background: "var(--ns-bg)",
        borderLeft: "1px solid var(--ns-border)",
        …
```

- `src/components/OnboardingOverlay.tsx:321–336`：

```tsx
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                      gap: 8,
                    }}
                  >
                    {["Date", "Account", "Name", "Amount", "Category"].map((label) => (
                      <div
                        key={label}
                        className="mono text-caption rounded-md px-2 py-2"
```

- `src/routes/InvestmentImportWizard.tsx:497–502`：

```tsx
                          <div
                            key={value}
                            className="items-center"
                            style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10 }}
                          >
                            <span className="mono text-body">{value}</span>
```

- `src/routes/CashFlowRoute.tsx:4692`（支出/收入分支）與 `:4353`（轉帳分支）：
  `className="grid grid-cols-2 gap-3.5"`／`gridTemplateColumns: "1fr 1fr"`，右欄是
  `<input className="ns-input" type="datetime-local" …>`（`:4726-4731` 附近；執行時
  重新定位確認）。
- `src/routes/GoalsRoute.tsx:651`：`style={{ padding: "0 32px" }}`（`:657` 同款）；
  `src/routes/CategoriesRoute.tsx:663`：`style={{ margin: "0 32px 16px", … }}`。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`（含 `ModalShell.test.tsx`） | all pass |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/components/ModalShell.tsx`（只加兩個 key 到 `PANEL_POSITION_KEYS`）
- `src/components/CategoryManagementDrawer.tsx`、`src/components/OnboardingOverlay.tsx`
- `src/routes/InvestmentImportWizard.tsx`、`src/routes/CashFlowRoute.tsx`（僅兩列 grid）
- `src/routes/GoalsRoute.tsx`、`src/routes/CategoriesRoute.tsx`（僅內距）
- `src/styles/globals.css`（必要的小 class）

**Out of scope**:
- ModalShell 其他行為（focus trap、drag、動畫）。
- 匯入精靈的解析/對應邏輯。
- 記帳 drawer 的其他欄位與送出流程。

## Git workflow

- Branch: `fix/ai-overlay-edge-cases`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- 一修一 commit（5 commits）；推分支開 PR，不 push main。

## Steps

### Step 1: ModalShell 寬度契約補洞

line 18：

```ts
const PANEL_POSITION_KEYS = [
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "maxWidth",
  "minWidth",
] as const;
```

同時 CategoryManagementDrawer 的 `borderLeft`（sheet 模式下無意義的 drawer 邊）不動
——它只是 1px 視覺噪音且 sheet 模式其實蓋不到（`.ns-sheet-bottom` 的 border-top 蓋過
視覺）；**只改 key 清單，行為面最小**。

**Verify**: `npm test -- ModalShell` → 既有測試全過（`ModalShell.test.tsx:249` 起的
positional-strip 測試斷言的是舊六鍵——若測試列舉 key，**同步把 `maxWidth` 案例加進
測試**）；`npm run dev` 428px 視口開分類管理：sheet 全寬、無右縫。

### Step 2: Onboarding chips

line 324 → `gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))"`，chips 加
`truncate`（`className="mono text-caption rounded-md px-2 py-2 truncate"`）。
（5 欄在 390px 自動變 2 行 3+2；桌機寬度夠仍一行 5 顆。）

**Verify**: 390px onboarding 第一步：chips 文字不溢出圓角底；1280px：一行 5 顆不變。

### Step 3: 匯入精靈對應列

line 500 → `gridTemplateColumns: "minmax(0, 1fr) minmax(140px, 200px)"`；value span 加
`className="mono text-body truncate" title={value}`。

**Verify**: `npm run build` exit 0；模擬長 token（dev 隨便貼一個 30 字元字串於 CSV）
不再撐出卡片。

### Step 4: 記帳 datetime 列收合

line 4692 與 line 4353 兩列 → `className="ns-form-row-2 gap-3.5"`（plan 298 的 helper；
未落地則在 globals.css 先建同名 class，定義見 298 Step 1）。

**Verify**: 390px 記帳新增：日期欄全寬、`2026/08/03 上午 HH:MM` 完整可見；桌機兩欄不變。

### Step 5: 卡片內距

GoalsRoute line 651/657 的 `"0 32px"`、`"8px 32px 8px"` 與 CategoriesRoute line 663 的
`"0 32px 16px"`——32px 換 `var(--ns-card-inset, 32px)`，globals.css：

```css
:root { --ns-card-inset: 32px; }
@media (max-width: 639px) { :root { --ns-card-inset: 20px; } }
```

（若 repo 已有等義 token——先 `grep -n "card-inset\|inset" src/styles/globals.css`——
用既有的，不新造。）

**Verify**: 390px 目標頁／分類頁：卡片內容左右各多 12px；桌機不變。

## Test plan

- `ModalShell.test.tsx`：新增（或擴充既有 positional-strip 案例）——`panelStyle` 含
  `maxWidth: 400` 時 sheet 模式的 panel 無 `max-width` inline style。
- e2e：428×926（Pro Max 尺寸）開分類管理，斷言 panel 寬 = 視窗寬。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0（含新 ModalShell 案例）；e2e 全綠
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -n '"repeat(5, minmax(0, 1fr))"' src/components/OnboardingOverlay.tsx` → 無結果
- [ ] `grep -n '"1fr 200px"' src/routes/InvestmentImportWizard.tsx` → 無結果
- [ ] 428px：分類管理 sheet 全寬
- [ ] 桌機五處逐一與改前一致
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 摘錄與 live code 不符。
- `PANEL_POSITION_KEYS` 加鍵後有**其他** bottom-sheet call site 的版面壞掉（目前掃描
  只有 CategoryManagementDrawer 傳 maxWidth，但 drift 後可能新增——`grep -rn
  "mobilePresentation" src --include="*.tsx"` 逐一開來檢查後再改）。
- 記帳 drawer 兩列的行號漂移且以「datetime-local + AccountFilter 的兩欄列」重新定位
  找不到唯一對應。

## Maintenance notes

- ModalShell 的契約從此是「sheet 模式下水平幾何完全由 `.ns-sheet-bottom` 決定」——
  之後新增 call site 傳任何寬度 key 都會被剝，這是預期行為，寫在 `PANEL_POSITION_KEYS`
  的註解裡（順手補一行註解）。
- Reviewer 盯：onboarding chips 換行後第一屏高度是否仍容納 CTA（OVERLAY-09 的 `100vh`
  疑慮——若 CTA 被推出視野，順手把 `OnboardingOverlay.tsx:153` 的 `100vh` 改 `100dvh`，
  同檔一行屬 in scope）。
