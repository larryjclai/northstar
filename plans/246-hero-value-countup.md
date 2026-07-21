# 246 — Dashboard 淨值 hero 數字滾動(count-up):值變化不再瞬移

- **Status**: TODO
- **Commit**: `92a96210`
- **Severity**: HIGH(missed opportunity —— 全 app 最常被看的一個數字,每次更新報價/記帳後都瞬移)
- **Category**: Missed opportunities(狀態變化不該 teleport)
- **Estimated scope**: 3 files(新增 `AnimatedNumber.tsx` + 其 test;`DashboardRoute.tsx` 小改)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command. On any STOP condition, stop and report. Do NOT update `plans/README.md`.
> Scope = the three files in **Boundaries** only.
>
> **Drift check (run first)**:
> `git diff --stat 92a96210..HEAD -- src/routes/DashboardRoute.tsx src/components/AnimatedNumber.tsx`
> `AnimatedNumber.tsx` must not exist yet; `DashboardRoute.tsx` must be unchanged
> in the lines this plan edits (see excerpts). Mismatch = STOP.

## Problem

Dashboard 的 Northstar hero(預設「淨值」)是全 app 曝光最高的單一數字。它目前是
純靜態 `<span>`:更新報價、記一筆帳、切換指標期間後,值**直接跳變**,沒有任何
過渡 —— 一個大到 `clamp(28px, 4vw, 56px)` 的數字瞬移,是明顯的 jarring change。
數字滾動既是 finance app 的質感慣例,也有資訊價值(眼睛跟得到往上或往下)。

`src/routes/DashboardRoute.tsx:1176-1184` — current:
```tsx
              {/* Hero value */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{
                  fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums lining-nums",
                  fontSize: "clamp(28px, 4vw, 56px)", letterSpacing: "-0.025em", fontWeight: 600,
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {activeMetric.display}
                </span>
```

有利條件(都已存在,不用發明):
- metric registry **已經帶原始數值** `value: number | null`(`DashboardRoute.tsx:411-457`
  的 `METRIC_REGISTRY`,及 `:707-716` 追加的 `benchmarkGap`)。
- hero span 已是 `tabular-nums` + `--ns-font-num` → 滾動時**每一格數字等寬,零版面抖動**。

## Target

新增一個可重用的 `<AnimatedNumber>` 元件(rAF tween,因為 CSS 無法補間文字內容),
hero 換用它。精確行為規格:

- **時長 560ms**,easing 為 cubic ease-out:`p => 1 - Math.pow(1 - p, 3)`
  (與 `--ns-ease-out-strong` 同「快進緩停」性格;UI transition 的 <300ms 預算
  不適用於數字 ticker —— 它是內容補間,560ms 是可讀性的甜蜜點)。
- **可中斷**:動畫進行中值又變 → 從**當前顯示值**重新 tween 到新目標(不跳回起點)。
- **直接 snap(不滾動)的條件**(全部必須實作):
  1. 首次 mount(進頁面不表演)。
  2. `resetKey` 改變(= 換了「哪個指標/哪個帳本」—— 語境切換不是數據變化)。
  3. `prefers-reduced-motion: reduce`。
  4. 隱私模式開啟(`isPrivacyMaskOn()` —— 遮蔽字串無法補間)。
  5. `value` 為 `null` 或非有限數 → 直接 render `fallback` 字串。
  6. 新舊值格式化後字串相同 → 什麼都不做。

## Repo conventions to follow

- 元件放 `src/components/`,PascalCase 單檔(exemplar:`src/components/MarkdownText.tsx`
  + 同名 `.test.tsx`)。
- jsdom 無 `matchMedia`/`localStorage` → 測試用 `vi.stubGlobal` per-test
  (exemplar:`src/components/ModalShell.test.tsx:15-29` 的 `stubMatchMedia`)。
- 隱私遮蔽的單一事實來源是 `isPrivacyMaskOn()`(`src/domain/currency.ts:209`)。
- 靜態樣式不寫 inline(AGENTS.md 樣式優先序)—— 本元件不帶任何樣式,由呼叫端的
  既有 span 樣式包住。

## Steps

1. **新增 `src/components/AnimatedNumber.tsx`**:

   ```tsx
   import { useEffect, useRef, useState } from "react";

   import { isPrivacyMaskOn } from "../domain/currency";

   const DURATION_MS = 560;
   /** Same fast-start/slow-settle character as --ns-ease-out-strong. */
   const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);

   export interface AnimatedNumberProps {
     /** Raw numeric value. null/NaN renders `fallback` with no animation. */
     value: number | null;
     /** Formats a frame's interpolated value (e.g. formatMoney). */
     format: (n: number) => string;
     /** Rendered when value is null/non-finite (e.g. "—"). */
     fallback?: string;
     /**
      * Identity of WHAT is being measured (e.g. `${metricKey}:${bookId}`).
      * When it changes, snap — a context switch is not a data change.
      */
     resetKey?: string;
   }

   /**
    * Tweens displayed numbers on value change (plan 246). Pure content tween via
    * rAF — CSS can't interpolate text. Snaps (no animation) on: first mount,
    * resetKey change, reduced motion, privacy mask, and null/non-finite values.
    * Interruptible: a new value mid-tween retargets from the currently shown
    * value. Render inside a tabular-nums container so digits don't shift layout.
    */
   export function AnimatedNumber({ value, format, fallback = "—", resetKey }: AnimatedNumberProps) {
     const [text, setText] = useState<string>(() =>
       value != null && Number.isFinite(value) ? format(value) : fallback,
     );
     // The numeric value currently shown — the retarget starting point.
     const shownRef = useRef<number | null>(value != null && Number.isFinite(value) ? value : null);
     const rafRef = useRef<number>(0);
     const prevResetKeyRef = useRef(resetKey);
     const formatRef = useRef(format);
     formatRef.current = format;

     useEffect(() => {
       const target = value != null && Number.isFinite(value) ? value : null;
       const resetChanged = prevResetKeyRef.current !== resetKey;
       prevResetKeyRef.current = resetKey;

       cancelAnimationFrame(rafRef.current);

       if (target == null) {
         shownRef.current = null;
         setText(fallback);
         return;
       }

       const from = shownRef.current;
       const reduceMotion =
         typeof window.matchMedia === "function" &&
         window.matchMedia("(prefers-reduced-motion: reduce)").matches;
       const snap =
         from == null || resetChanged || reduceMotion || isPrivacyMaskOn();

       if (snap || formatRef.current(from as number) === formatRef.current(target)) {
         shownRef.current = target;
         setText(formatRef.current(target));
         return;
       }

       const start = performance.now();
       const startValue = from as number;
       const tick = (now: number) => {
         const p = Math.min(1, (now - start) / DURATION_MS);
         const v = startValue + (target - startValue) * easeOutCubic(p);
         shownRef.current = v;
         setText(formatRef.current(v));
         if (p < 1) {
           rafRef.current = requestAnimationFrame(tick);
         } else {
           shownRef.current = target;
           setText(formatRef.current(target));
         }
       };
       rafRef.current = requestAnimationFrame(tick);
       return () => cancelAnimationFrame(rafRef.current);
       // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [value, resetKey, fallback]);

     return <>{text}</>;
   }
   ```

   (若 repo 的 eslint 設定不需要那行 disable 註解 —— 即 `npm run lint` 在沒有它時
   也是 0 errors —— 就拿掉它。)

2. **在 `src/routes/DashboardRoute.tsx` 給每個 metric 補 `formatValue`**。
   registry 型別(`:411-417`)加一個欄位:

   ```ts
   const METRIC_REGISTRY: Array<{
     key: string;
     label: string;
     value: number | null;
     display: string;
     /** Formats an interpolated frame of `value` — must mirror `display` (plan 246). */
     formatValue: (n: number) => string;
     sub: string;
   }> = [
   ```

   六個 metric 各加一行,格式**必須**與其 `display` 完全同構:
   - `netWorth`(`:418-424`):`formatValue: (n) => formatMoney(n, primaryCurrency),`
   - `savingsRate`(`:425-431`):`formatValue: (n) => `${n.toFixed(1)}%`,`
   - `coverageRatio`(`:432-440`):`formatValue: (n) => `${n.toFixed(1)}%`,`
   - `runway`(`:441-449`):`formatValue: (n) => `${n.toFixed(1)} 個月`,`
   - `fireProgress`(`:450-456`):`formatValue: (n) => `${n.toFixed(1)}%`,`
   - `benchmarkGap`(`:707-716` 的 `allMetrics` 追加項):
     `formatValue: (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`,`

3. **hero span 換用元件**(`:1176-1184`)。import `AnimatedNumber`,把
   `{activeMetric.display}` 換成:

   ```tsx
                   <AnimatedNumber
                     value={activeMetric.value}
                     format={activeMetric.formatValue}
                     fallback={activeMetric.display}
                     resetKey={`${activeMetric.key}:${activeBookId}`}
                   />
   ```

   span 本身的樣式與外層結構**一字不動**。(`activeBookId` 已在元件內
   `DashboardRoute.tsx:44` 附近取得 —— `useUiPreferences((state) => state.activeBookId)`。)

4. **新增 `src/components/AnimatedNumber.test.tsx`**(模仿 `ModalShell.test.tsx`
   的 stub 慣例):

   ```tsx
   import { act, render, screen } from "@testing-library/react";
   import { afterEach, describe, expect, it, vi } from "vitest";

   import { AnimatedNumber } from "./AnimatedNumber";
   import { setPrivacyMaskOn } from "../domain/currency";

   // jsdom-safe rAF: run frames manually via vi.advanceTimersByTime.
   function stubRaf() {
     let now = 0;
     vi.useFakeTimers();
     vi.stubGlobal("performance", { now: () => now });
     vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
       setTimeout(() => { now += 16; cb(now); }, 16) as unknown as number);
     vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
   }

   afterEach(() => {
     setPrivacyMaskOn(false);
     vi.unstubAllGlobals();
     vi.useRealTimers();
   });

   const fmt = (n: number) => n.toFixed(0);

   describe("AnimatedNumber", () => {
     it("renders the formatted value immediately on first mount (no tween-in)", () => {
       stubRaf();
       render(<span data-testid="n"><AnimatedNumber value={100} format={fmt} /></span>);
       expect(screen.getByTestId("n").textContent).toBe("100");
     });

     it("renders fallback for null", () => {
       stubRaf();
       render(<span data-testid="n"><AnimatedNumber value={null} format={fmt} fallback="—" /></span>);
       expect(screen.getByTestId("n").textContent).toBe("—");
     });

     it("tweens to a new value and settles exactly on the target", () => {
       stubRaf();
       const { rerender } = render(<span data-testid="n"><AnimatedNumber value={100} format={fmt} /></span>);
       rerender(<span data-testid="n"><AnimatedNumber value={200} format={fmt} /></span>);
       act(() => { vi.advanceTimersByTime(96); }); // mid-flight
       const mid = Number(screen.getByTestId("n").textContent);
       expect(mid).toBeGreaterThan(100);
       expect(mid).toBeLessThan(200);
       act(() => { vi.advanceTimersByTime(1000); }); // past DURATION_MS
       expect(screen.getByTestId("n").textContent).toBe("200");
     });

     it("snaps (no tween) when resetKey changes", () => {
       stubRaf();
       const { rerender } = render(
         <span data-testid="n"><AnimatedNumber value={100} format={fmt} resetKey="a" /></span>);
       rerender(<span data-testid="n"><AnimatedNumber value={999} format={fmt} resetKey="b" /></span>);
       expect(screen.getByTestId("n").textContent).toBe("999");
     });

     it("snaps when privacy mask is on", () => {
       stubRaf();
       const { rerender } = render(<span data-testid="n"><AnimatedNumber value={100} format={fmt} /></span>);
       setPrivacyMaskOn(true);
       rerender(<span data-testid="n"><AnimatedNumber value={200} format={fmt} /></span>);
       expect(screen.getByTestId("n").textContent).toBe("200");
     });

     it("snaps under prefers-reduced-motion", () => {
       stubRaf();
       vi.stubGlobal("matchMedia", vi.fn().mockImplementation((q: string) => ({
         matches: q === "(prefers-reduced-motion: reduce)",
         media: q, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
         addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
       })));
       const { rerender } = render(<span data-testid="n"><AnimatedNumber value={100} format={fmt} /></span>);
       rerender(<span data-testid="n"><AnimatedNumber value={200} format={fmt} /></span>);
       expect(screen.getByTestId("n").textContent).toBe("200");
     });
   });
   ```

   若 `setPrivacyMaskOn` 未從 `src/domain/currency.ts` export,STOP 回報
   (檢視 `:209` 附近 —— `isPrivacyMaskOn` 有 export;`setPrivacyMaskOn` 依
   `uiPreferences.ts:3` 的 import 判斷應該也有)。

## Boundaries

- 只碰:`src/components/AnimatedNumber.tsx`(新)、`src/components/AnimatedNumber.test.tsx`
  (新)、`src/routes/DashboardRoute.tsx`(registry 型別 + 6 個 `formatValue` + hero span 換用)。
- **不碰**:一眼脈搏 KPI strip(`:1600` 起)、MoM Badge、`domain/currency.ts` 的格式化
  函式本體、任何 CSS。strip 的滾動是可能的 follow-up,**不在本計劃**。
- 不加任何依賴(不裝 count-up 函式庫 —— 60 行內自己寫)。
- 與計劃 excerpt 不符(drift)→ STOP。

## Verification

- **Mechanical**:
  - `npx tsc --noEmit` → exit 0。
  - `npm test -- src/components/AnimatedNumber.test.tsx` → 6 tests pass。
  - `npm test` → 全綠(無回歸)。
  - `npm run lint` → 0 errors。
- **Feel check**(dev server,reviewer 至少做一次):
  - Dashboard 開著 → 點「更新報價」:淨值**滾動**到新值,~0.5s 內停穩,結尾減速自然。
  - 滾動途中再觸發一次更新:從**當前顯示值**續滾,不跳回起點、不閃。
  - 點 hero 的指標切換(淨值 → 儲蓄率):**瞬切**,不滾(語境切換)。
  - 切換帳本:**瞬切**。
  - 開隱私模式再關:遮蔽字串期間無任何滾動;關閉後直接顯示,不從 0 滾上來。
  - DevTools Rendering → emulate `prefers-reduced-motion: reduce`:值變化直接瞬切。
  - 滾動全程盯 Badge 與右側排版:因 `tabular-nums`,**不允許任何水平抖動**。
- **Done when**:mechanical 全綠 + feel check 七項全數通過。
