# Plan 300: COSS 44pt 觸控目標機制脫離 `pointer: coarse` — 改用 repo 信任的寬度判斷

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/components/coss src/styles/globals.css`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P2（系統性；影響全 app 每顆按鈕）
- **Effort**: M
- **Risk**: MED（全域 hit-area 行為變化，需視覺/行為雙驗）
- **Depends on**: none（但建議在 Wave 1/2 版面修完後做，避免同時動太多變數）
- **Category**: tech-debt
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

COSS primitives（Button／Toggle／Badge-as-button／Select trigger）的 44pt 觸控目標
擴張**全部**掛在 Tailwind 的 `pointer-coarse:` variant（= `@media (pointer: coarse)`）上。
但這個 repo 自己有明文紅線：**WKWebView 會誤報 `pointer: coarse`**——macOS Tauri 桌面
build 回報 coarse=true（plans 244/245 的教訓，`ModalShell.tsx:149` 與 `globals.css:1038`
的註解都在講這件事），手機判斷一律要用 `max-width: 1023px`。

後果雙向都壞：桌機（誤報 coarse）每顆按鈕長出隱形的 44×44 `::after`，在密集列裡攔截
鄰居的點擊；若 iOS 端某版 WebView 反向誤報，全 app 的 44pt 保證無聲消失。機制與 repo
的既定判斷方式對齊後，行為變成可預測的「手機版面 = 大 hit area」。

## Current state

- `src/components/coss/button.tsx:11`（`buttonVariants` 基底字串內）：
  `… pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 …`
- `src/components/coss/toggle.tsx:9`：同款四段。
- `src/components/coss/badge.tsx:10`：`[button&,a&]:pointer-coarse:after:…` 四段
  （僅 button/a 渲染時生效）。
- `src/components/coss/select.tsx:14`（`selectTriggerVariants`）：
  `pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11`（無 min-w）。
- `src/components/coss/toggle-group.tsx:30-31`：依 orientation **取消**子項的一個方向：
  `"*:pointer-coarse:after:min-w-auto"` ／ `"*:pointer-coarse:after:min-h-auto"`。
- Tailwind v4（COSS UI migration 的既定 stack）。v4 自訂 variant 語法：CSS 檔內
  `@custom-variant touch (@media (max-width: 1023px));`——先確認 repo 的 Tailwind 入口
  （`grep -rn "@import \"tailwindcss\"\|@custom-variant\|@theme" src/styles/`）把
  variant 宣告加在同一入口檔。
- 已知決策（不要重報）：Phosphor icon 的 size prop 在 Button/Badge 內是 inert——與本
  計畫無關，不碰 §7 的 svg 規則。

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
- `src/components/coss/button.tsx`、`toggle.tsx`、`badge.tsx`、`select.tsx`、
  `toggle-group.tsx`（僅 `pointer-coarse:` → 新 variant 的機械替換）
- Tailwind 入口 CSS（`@custom-variant` 宣告一行）

**Out of scope**:
- COSS 其他視覺（顏色、尺寸、focus ring）。
- 非 COSS 的手刻小目標（plan 302）。
- `ModalShell.tsx`／`globals.css` 的既有註解。

## Git workflow

- Branch: `fix/ai-coss-touch-variant`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 宣告 variant

Tailwind 入口 CSS（找到 `@import "tailwindcss"` 的檔案）加：

```css
/* 44pt hit-area 的觸發條件。不用 (pointer: coarse)：WKWebView 誤報（plans 244/245），
   репo 的手機判斷一律走視窗寬度，與 ModalShell 的 1023px 閘一致。 */
@custom-variant touch (@media (max-width: 1023px));
```

**Verify**: `npm run build` exit 0（v4 對未知 variant 會在用到時才報錯，先建再換）。

### Step 2: 機械替換

五個檔案內把 `pointer-coarse:` 全部換成 `touch:`（`sed` 或編輯器全取代，逐檔
`git diff` 檢查只有 variant 前綴變化、無其他字元被誤傷——特別是 badge 的
`[button&,a&]:pointer-coarse:` 複合前綴要變成 `[button&,a&]:touch:`）。

**Verify**: `grep -rn "pointer-coarse" src/components/coss/` → 無結果；
`npm run build` exit 0；`npm test` 全綠。

### Step 3: 行為驗證

1. 1280px 桌機：DevTools 檢查任一 Button 的 `::after`——**不存在**（桌機不再長隱形
   hit area；這是本計畫在桌機側的實質修復）。
2. 390px：Button 的 `::after` 存在、`min-height: 44px`；ToggleGroup 水平組的子項
   `::after` `min-width: auto`（取消橫向擴張的行為保留）。
3. 密集列抽查（記帳列表的行內按鈕、投資分析 tabs）：桌機點擊不再被鄰格攔截
   ——若改前有此問題，此時應消失。

**Verify**: 上述三點 + `npm run test:e2e` 全綠。

## Test plan

- e2e：390px 斷言 `getComputedStyle(button, "::after").minHeight === "44px"`；1280px
  斷言 `::after` 的 `content` 為 none（或 minHeight 非 44px）。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -rn "pointer-coarse" src/components/coss/` → 無結果
- [ ] `grep -rn "pointer-coarse" src/ --include="*.tsx" --include="*.css" | grep -v "註解\|comment\|test"` 逐筆確認剩餘命中全是註解/測試
- [ ] 390px hit area 44pt 生效；1280px 無隱形 `::after`
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- Tailwind 入口找不到或 `@custom-variant` 語法在 repo 的 Tailwind 版本不支援
  （`npx tailwindcss --help` 或 package.json 確認 v4；v3 語法不同——STOP 回報）。
- 替換後任何 COSS 元件的**視覺**（非 hit area）在桌機出現變化——`pointer-coarse:` 理論上
  只管 `::after`，若 diff 影響其他 utility 代表誤傷，回滾該檔重做。
- iPad（768–1023px、實體 coarse pointer）在新機制下 hit area 是 44pt（正確——它走
  手機版面）；若 operator 期望 1024+ 的觸控裝置也要 44pt，那是新需求，STOP 討論。

## Maintenance notes

- 之後新元件的 hit-area 擴張一律用 `touch:` variant；`pointer-coarse:` 在此 repo 視同
  禁用（與 `@media (pointer: coarse)` 同一條紅線）。
- Reviewer 盯：badge 的複合前綴替換正確性；`toggle-group` 的取消邏輯（`touch:after:min-w-auto`）
  與子項的 `touch:after:min-w-11` 特異性順序在 Tailwind 產出 CSS 內仍然成立。
