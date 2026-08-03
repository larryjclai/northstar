# Plan 292: 快速記帳確認卡手機版 — 單欄收合、可捲動、避開鍵盤與 home indicator

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 5140008b..HEAD -- src/components/QuickAdd.tsx src/styles/globals.css`
> On any in-scope change, compare "Current state" excerpts against live code;
> mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none（plan 301 之後會把整個 overlay 遷到 ModalShell；本計畫先救急，
  修的東西——單欄 grid、safe-area、鍵盤 hook——遷移後全數沿用）
- **Category**: bug
- **Planned at**: commit `5140008b`, 2026-08-03

## Why this matters

快速記帳是全 app 使用頻率最高的輸入介面，它的確認卡在手機上有三個獨立的「不能用」：

1. **雙欄 grid 不收合**：`1fr 1fr`（記帳）／`1fr 1fr`（投資）在 390px 視口每欄只剩
   ~160px——分類 chip 選單被擠成一欄一顆、右欄（帳戶、商家）的內容被 `html/body` 的
   `overflow-x: clip` 裁掉**點不到**。
2. **卡片無高度上限也無捲動**：overlay 是 `alignItems: "flex-end"`，卡片過高時**頂部**
   （金額欄、確認標題）超出螢幕上緣且永遠不可及——flex-end 容器的溢出方向是向上。
3. **無 safe-area、無鍵盤避讓**：panel 只有硬編碼 `marginBottom: 28`（< iOS 34px home
   indicator 帶），且輸入框開啟即自動聚焦、iOS 鍵盤立刻彈出，WKWebView 不會為鍵盤縮
   layout viewport——固定在底部的輸入列與「確認新增」鈕直接被鍵盤蓋住，使用者盲打。

## Current state

- `src/components/QuickAdd.tsx` — 手刻 overlay（非 ModalShell；遷移是 plan 301，本計畫不做）。
- Overlay 與 panel（line 426–445）：

```tsx
    <div
      className="ns-quickadd-overlay flex"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: overlayLeft,
        zIndex: 80,
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <style>{`@media (max-width:1023.98px){.ns-quickadd-overlay{left:0 !important;}}`}</style>
      <div style={{ position: "absolute", inset: 0, background: "var(--ns-scrim)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-[ns-drawer-in_140ms_var(--ns-ease-out-strong)] flex flex-col gap-2.5"
        style={{ position: "relative", width: "min(620px, 94vw)", marginBottom: 28 }}
      >
```

- 記帳確認卡的雙欄 grid（line 498–501）：

```tsx
                  <div
                    className="gap-2.5"
                    style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}
                  >
```

  左欄是單一「金額」輸入，右欄依序為分類 chip 選單（會換行、行數多）、名稱、商家、
  帳戶等欄位——**行高由分類選單撐開**。
- 投資確認卡的雙欄 grid（line 711）：

```tsx
              <div className="gap-2.5" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
```

  內容：代號／帳戶／股數／價格四個 Field，之後 line 757–773 是「返回／確認新增」footer。
- 全 repo 無任何 `visualViewport` 使用（`grep -rn visualViewport src/` 零筆）。
- 對照組：`.ns-sheet-bottom`（globals.css:396–406）有 `max-height: min(92dvh, 100%)`、
  `padding-bottom: env(safe-area-inset-bottom)`。
- 手機判斷紅線：`max-width: 1023px`，絕不用 `(pointer: coarse)`。

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
- `src/components/QuickAdd.tsx`
- `src/hooks/useKeyboardInset.ts`（新檔）
- `src/styles/globals.css`（`.ns-quickadd-grid` 等 class）

**Out of scope**:
- 遷移到 ModalShell（plan 301）。
- NLP 解析邏輯、`confirm` state 形狀、送出流程——零行為改動。
- chip 點擊目標放大（plan 302）。
- `AccountFilter`／`SuggestInput` 元件內部。

## Git workflow

- Branch: `fix/ai-quickadd-mobile`
- 先 `git status` 確認乾淨；有未提交變更就 STOP。
- Conventional commits；推分支開 PR，不 push main。

## Steps

### Step 1: 雙欄 grid 手機收單欄

globals.css 新增：

```css
/* QuickAdd 確認卡欄位：桌機雙欄、手機單欄。minmax(0,1fr) 防止輸入框的
   min-content 撐爆軌道。 */
.ns-quickadd-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
@media (max-width: 1023px) { .ns-quickadd-grid { grid-template-columns: minmax(0, 1fr); } }
```

QuickAdd.tsx line 500 與 line 711 兩處：移除 inline `display/gridTemplateColumns`，
className 改為 `"ns-quickadd-grid gap-2.5"`。

**Verify**: `npm run build` exit 0；390px 視口解析一筆（例輸入「午餐 120」→ 解析）後，
確認卡單欄、分類 chips 整排換行可見、無元素超出視窗右緣。

### Step 2: 卡片高度上限與捲動

line 442–445 的 panel `style` 加上：

```tsx
        style={{
          position: "relative",
          width: "min(620px, 94vw)",
          marginBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
          maxHeight: "calc(100dvh - 24px - env(safe-area-inset-top, 0px))",
        }}
```

並讓確認卡（`<Card className="p-4" …>`，line 449）在超高時自行捲動：Card 加
`style={{ …existing, overflowY: "auto", minHeight: 0 }}`，panel 保持 `flex flex-col`
（既有 className）——輸入列是 panel 的最後一個 child，維持在卡片下方不被捲走。

**Verify**: 390×600 視口（模擬短螢幕）：分類很多時卡片內部出現縱向捲動，金額欄可捲到；
輸入列仍固定在卡片下方可見。

### Step 3: 鍵盤避讓 hook

新檔 `src/hooks/useKeyboardInset.ts`：

```ts
import { useEffect, useState } from "react";

/**
 * iOS WKWebView 不會為軟鍵盤縮小 layout viewport——固定在視窗底部的元素會被
 * 鍵盤蓋住。這個 hook 回傳鍵盤遮住的高度（px），由 visualViewport 推導；
 * 桌機與鍵盤收起時為 0。
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
```

QuickAdd.tsx：`const keyboardInset = useKeyboardInset();`，panel style 的 transform 加
`transform: keyboardInset ? \`translateY(-${keyboardInset}px)\` : undefined`（動態值，
inline 合規），同時 `maxHeight` 改為 `calc(100dvh - 24px - env(safe-area-inset-top, 0px) - ${keyboardInset}px)`。

**Verify**: `npm run build` exit 0；`npm test` 全綠（jsdom 無 `visualViewport` → hook 走
`if (!vv) return` 分支回 0，不需 stub；若既有 QuickAdd 測試因新 hook 失敗，per-test
`vi.stubGlobal` 補一個假 visualViewport——repo 慣例）。

### Step 4: 裝置驗證

有 iOS Simulator（`docs/ios-mobile-plan.md`）：開 QuickAdd，鍵盤彈出後輸入列與送出鈕
仍完整可見、可點。無 Simulator：DevTools 以 `window.visualViewport` 模擬受限（Chrome
不易模擬），退而以單元測試斷言 transform 隨 inset 變化，PR 註明「鍵盤行為待 operator
真機驗證」。

## Test plan

- vitest（`src/hooks/useKeyboardInset.test.ts` 新檔）：stub `visualViewport`
  （`vi.stubGlobal`，repo 慣例——jsdom 沒有它），斷言 resize 後 inset = innerHeight −
  vv.height − offsetTop、清理移除 listener。
- e2e：390×844 解析一筆 → 斷言確認卡所有欄位的 bounding box `right <= innerWidth`、
  分類 chips 容器寬 > 300px。
- Verification: `npm test`、`npm run test:e2e` 全綠。

## Done criteria

- [ ] `npm run build` exit 0；`npm test` exit 0（含新 hook 測試）；`npm run test:e2e` exit 0
- [ ] `npm run lint` 0 errors；`npm run format:check` 通過
- [ ] `grep -n 'gridTemplateColumns: "1fr 1fr"' src/components/QuickAdd.tsx` → 無結果
- [ ] `grep -c "env(safe-area-inset-bottom" src/components/QuickAdd.tsx` → ≥1
- [ ] 390px：確認卡單欄、無右緣裁切；短視口卡片內部可捲動
- [ ] 1280px：雙欄照舊、視覺與改前一致
- [ ] `git status` 只有 in-scope 檔案（+ 測試檔、plans/README.md）
- [ ] `plans/README.md` 狀態列更新

## STOP conditions

- 摘錄與 live code 不符。
- `translateY` 鍵盤位移與 WKWebView 自己的 scroll-into-view 打架（畫面跳動）——這是已知
  風險，回報實測現象，不要疊 workaround。
- 投資確認卡的 `AccountFilter` popover（body portal）在 transform 後定位錯誤——transform
  會建立 containing block，若 popover 跟著錯位，回報而非硬修。
- 改動看起來需要動 `SuggestInput`／`AccountFilter` 內部。

## Maintenance notes

- `useKeyboardInset` 是共用 hook：plan 293 的記帳 drawer footer、`.ns-sheet-bottom` 的
  footer 之後都可接（記在此，不在本計畫做）。
- plan 301（QuickAdd → ModalShell）落地時，Step 2 的 maxHeight 邏輯會被 `.ns-sheet-bottom`
  的 `92dvh` 取代，Step 1 的 grid class 與 Step 3 的 hook 原樣保留。
- Reviewer 盯：`flex-end` 容器 + maxHeight 的組合在內容短時不得改變卡片位置（貼底不變）。
