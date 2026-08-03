# Plan 302: 非 COSS 小點擊目標批次加大 + 下拉寬度視口感知

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/components/QuickAdd.tsx src/components/SuggestInput.tsx src/components/AccountFilter.tsx src/components/AppSelect.tsx src/components/ui/command.tsx src/styles/globals.css`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.（plans 292/301 會先動 QuickAdd——在其結果之上作業，chip 的 style
> 物件語意不變即可繼續。）

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW-MED（chips 變高改變確認卡高度——292 的捲動先行即無害）
- **Depends on**: plan 292（確認卡先能捲動）；與 300 互補（300 管 COSS、本計畫管手刻）
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

快速記帳與投資流程裡約一打**非 COSS** 的手刻控件，點擊目標只有 20–36px（44pt 建議值
的 45–65%），而且都是密集換行列——誤觸選到隔壁分類/帳戶是**無聲的資料品質問題**，
不只是體驗差。COSS Button 的 44pt 擴張機制（plan 300 之後掛在 `touch:` variant）
罩不到這些 raw `<button>`。另外兩個常用下拉（帳戶、通用 select）固定 256px、建議
清單最高 288px——手機鍵盤開啟時超出可視區。

## Current state

（以下 QuickAdd 行號為 `5140008b` 時點；292/301 落地後以樣式物件內容重新定位。）

- `src/components/QuickAdd.tsx`：
  - 分類 chips（line 541–552）：raw button、`padding: "4px 10px"`、text-xs → ~26px 高。
  - 子分類 chips（line 582–591）：`padding: "3px 9px"` → ~22px。
  - 記帳/投資模式切換（line 790–808）：`padding: "5px 16px"` → ~28px。
  - 範例 chips（~line 868–889）、預覽修正 chips（~line 1093–1144，`padding: "2px 8px"`
    → ~20px）——執行時以同款 style 物件搜尋定位。
- `src/components/SuggestInput.tsx`：
  - 下拉容器（line 85–98）：`position:absolute; left:0; right:0; maxHeight: 224`。
  - 選項（line 114–125）：`padding: "6px 8px"` → ~28px 高。
- `src/components/AccountFilter.tsx`：trigger `height: 36`（line ~150–155 的 style 物件，
  含 `minWidth: 140, maxWidth: 220`）；PopoverContent `className="w-64 …"` +
  `style={{ width: 256 }}`（line 183–186）。
- `src/components/AppSelect.tsx`：PopoverContent 同款 `w-64` + `width: 256`（line 96–100）。
- `src/components/ui/command.tsx`：CommandList `max-h-72`（line 89）；CommandItem
  `px-2 py-1.5 text-sm`（line 148）→ ~32px。
- 手機判斷：`max-width: 1023px`；hit-area 放大的既有手法是透明 `::after` 擴張
  （COSS button.tsx 同款），視覺尺寸可不變。

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0        |
| Tests     | `npm test`           | all pass            |
| Lint      | `npm run lint`       | 0 errors            |
| Format    | `npm run format:check` | 通過              |

## Scope

**In scope**:
- `src/styles/globals.css`（`.ns-chip` hit-area utility）
- `src/components/QuickAdd.tsx`（chips 掛 class）
- `src/components/SuggestInput.tsx`（選項 padding + 容器 min-width）
- `src/components/AccountFilter.tsx`、`src/components/AppSelect.tsx`（popover 寬度 clamp
  + trigger 高度）
- `src/components/ui/command.tsx`（list 高度 clamp、item 手機 padding）

**Out of scope**:
- COSS primitives（plan 300）。
- chips 的視覺尺寸／配色（只擴 hit area，不改外觀）。
- HoldingEditModal 24px 刪除鈕（plan 298 已處理）。

## Git workflow

- Branch: `fix/ai-tap-targets`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: `.ns-chip` hit-area utility

globals.css：

```css
/* 手刻 pill/chip 的觸控擴張：視覺尺寸不變，手機版面下用透明 ::after 把
   命中區撐到 ≥44px（同 COSS button 的手法）。使用者需在元素上有
   position:relative（chips 的 style 物件已是 inline-flex，加 relative 即可）。 */
.ns-chip { position: relative; }
@media (max-width: 1023px) {
  .ns-chip::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: max(100%, 44px);
    height: max(100%, 44px);
  }
}
```

### Step 2: QuickAdd chips 掛 class

分類/子分類/模式切換/範例/預覽修正五組 raw button 都加 `ns-chip`（className 併入既有
class；style 物件不動）。**注意換行密集列的重疊**：44px 命中圈在 26px 視覺列會與上下
行重疊——這是 trade-off，命中以 DOM 順序後者優先；分類 chips 列的 `gap` 若 <8px，
把該列 gap 提到 8px（同檔 style 微調，記錄在 PR）。

**Verify**: 390px：任一 chip 的 `::after` 高 ≥44px；點擊上下緊鄰 chips 各 10 次無誤觸
（手動抽測）。

### Step 3: SuggestInput 與 command 選項

- SuggestInput 選項 padding `"6px 8px"` → 手機 `"12px 10px"`（class 化：選項加
  `ns-suggest-option`，globals.css 內 `@media (max-width:1023px)` 提 padding）。
- command.tsx CommandItem 同理：`className` 追加 `touch:py-2.5`（plan 300 的 variant；
  300 未落地則用等義 media class）。
- CommandList `max-h-72` → `max-h-[min(18rem,50dvh)]`。
- SuggestInput 容器加 `minWidth: "min(240px, 90vw)"`（在窄欄內展開時不被欄寬鎖死；
  仍 `left:0` 對齊，右緣允許溢出到欄外——它是 absolute、z 90，蓋在卡片上方是預期）。

**Verify**: 390px：建議選項高 ≥40px；鍵盤模擬（視窗高 500px）下拉不超出可視區。

### Step 4: 帳戶/通用下拉寬度

AccountFilter 與 AppSelect 的 PopoverContent：`style={{ width: 256 }}` →
`style={{ width: "min(320px, calc(100vw - 32px))" }}`（`w-64` class 一併移除，避免
兩處衝突）。AccountFilter trigger `height: 36` → `height: 40`（僅手機？trigger 高度是
inline 動態物件——直接 40，桌機 +4px 觀感可接受；若 operator 反對再退）。

**Verify**: 390px：下拉寬 = 358px、選項文字截斷減少；桌機下拉 320px（比 256 寬，
確認無版面破壞——popover 是浮層，安全）。

## Test plan

- vitest：`.ns-chip` 的 class 存在性斷言（QuickAdd 渲染後 chips 均含 ns-chip）。
- e2e：390px 量 `::after` 尺寸（`getComputedStyle(chip, "::after").height` ≥ 44px）。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0；e2e 全綠
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -c "ns-chip" src/components/QuickAdd.tsx` → ≥5
- [ ] `grep -n "width: 256" src/components/AccountFilter.tsx src/components/AppSelect.tsx` → 無結果
- [ ] 390px：chips/選項命中區 ≥44px（抽測）；桌機視覺不變
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- QuickAdd 在 292/301 之後結構變化到 chips 樣式物件無法對應。
- `::after` 擴張讓密集列的誤觸**變多**（重疊命中反轉）——實測若如此，改為「手機提高
  視覺 padding」方案並回報（那會改變卡片高度，需 operator 過目）。
- AccountFilter trigger 高度改 40 造成任何桌機版面斷行。

## Maintenance notes

- 之後新的手刻 pill 一律掛 `.ns-chip`；更好的是直接用 COSS Toggle/Button。
- Reviewer 盯：`::after` 不能攔截 pointer-events 以外的東西（純 content:"" 無
  pointer-events 設定即繼承可點——這正是目的；但要確認沒蓋住輸入框的點擊）。
