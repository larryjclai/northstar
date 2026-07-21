# 247 — FIRE 達成瞬間的一次性慶祝:低調光暈掃過 + 百分比 scale-pop

- **Status**: TODO
- **Commit**: `92a96210`
- **Severity**: MEDIUM(missed opportunity —— 稀有高情緒時刻,目前 delight budget = 0)
- **Category**: Missed opportunities(rare, high-emotion moment)
- **Estimated scope**: 2 files(`FireGoalCard.tsx` + `globals.css`)
- **Depends on**: 建議先做 248(本計劃的 shimmer 疊在 248 引入的 `.ns-progress-fill`
  結構上;不做 248 也能實作,但 selector 措辭以 248 完成後為準 —— 見 Boundaries)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command. On any STOP condition, stop and report. Do NOT update `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 92a96210..HEAD -- src/features/goals/FireGoalCard.tsx src/styles/globals.css`
> 若 `FireGoalCard.tsx` 的進度條區塊(見 excerpt)已與本計劃引用不符,先確認是否為
> 248 的預期改動(`.ns-progress-fill` 類別化);其他不符 = STOP。

## Problem

達成 FIRE 是這個產品的**終極時刻** —— 使用者可能為它記了十年帳。目前跨過 100% 時
唯一的變化是進度條換色(`reachedFi` 三元判斷),與「本月儲蓄率變高」的視覺權重
完全相同。依 delight budget 原則:高頻元素零動畫、**稀有高情緒時刻可以花**。
這裡一毛都沒花。

`src/features/goals/FireGoalCard.tsx:56-57` — current(達成判斷):
```tsx
  const progressPct = target > 0 ? Math.min(100, Math.max(0, (currentValue / target) * 100)) : 0;
  const reachedFi = currentValue >= target;
```

`src/features/goals/FireGoalCard.tsx:87-107` — current(進度條 + 百分比):
```tsx
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs" style={{ color: "var(--ns-muted)" }}>
          <span>進度</span>
          <span className="tabular">{progressPct.toFixed(1)}%</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--ns-surface-strong)" }}>
          <div
            className="h-full transition-[transform]"
            style={{ ... transform: `scaleX(${(progressPct ?? 0) / 100})`, transformOrigin: "left" }}
          />
        </div>
      </div>
```

## Target(操作者已拍板:「低調光暈掃過」,2026-07-21)

跨過 100% 的**當下**(in-session `false → true` 轉變)播一次、只播一次:

1. **光暈掃過**:一道 accent 色高光從進度條左端掃到右端,600ms,
   `var(--ns-ease-out-strong)`,播完消失。
2. **百分比 scale-pop**:`進度` 行右側的百分比數字 `scale(1 → 1.06 → 1)`,320ms。

明確**不做**:confetti、粒子、卡片位移。維持 crisp 儀表板性格。

**觸發語意(必須精確實作)**:
- 只在「元件掛載期間觀察到 `reachedFi` 由 false 變 true」時播。
- 首次 mount 時已達成 → **不播**(每天打開 app 不重播慶祝)。
- 播完自動清理(`onAnimationEnd` 移除 data 屬性),同 session 內不重播;
  若值又跌破再重新跨越,允許再播(那確實是再一次達成)。
- `prefers-reduced-motion`:交給 `globals.css:627` 的全域 kill(keyframes 時長歸零
  → 實質不播)。純裝飾動畫,這樣處理即可,不需另寫 reduce 分支。

## Repo conventions to follow

- 動畫 CSS 集中在 `src/styles/globals.css`,區塊註解 `/* ── <名稱> (plan NNN) ── */`,
  exemplar:`:410-419` 的 Toast 區塊(plan 158)。
- 一次性狀態動畫用 data 屬性驅動,exemplar:`main[data-privacy-anim]`(`:487`)。
- easing/duration 一律用既有 token(`--ns-ease-out-strong`、`--ns-ease`),不得
  hand-type cubic-bezier。

## Steps

1. **`src/styles/globals.css`** — 在 `/* ── Privacy toggle blur crossfade ── */`
   區塊(`:482-487`)之後新增:

   ```css
   /* ── FIRE reached celebration (plan 247) ── */
   /* One-shot shimmer sweep across the progress fill + a subtle pop on the
      percentage. Driven by data-celebrate, removed onAnimationEnd. Decorative:
      the global reduced-motion kill (see @media block) zeroes it out. */
   @keyframes ns-goal-shimmer {
     from { transform: translateX(-100%); }
     to   { transform: translateX(100%); }
   }
   @keyframes ns-goal-pop {
     0%   { transform: scale(1); }
     45%  { transform: scale(1.06); }
     100% { transform: scale(1); }
   }
   .ns-goal-track { position: relative; }
   .ns-goal-track[data-celebrate]::after {
     content: "";
     position: absolute; inset: 0;
     background: linear-gradient(
       105deg,
       transparent 20%,
       color-mix(in srgb, var(--ns-accent-fg, #fff) 45%, transparent) 50%,
       transparent 80%
     );
     animation: ns-goal-shimmer 600ms var(--ns-ease-out-strong) 1;
     pointer-events: none;
   }
   .ns-goal-pct { display: inline-block; }
   .ns-goal-pct[data-celebrate] {
     animation: ns-goal-pop 320ms var(--ns-ease-out-strong) 1;
   }
   ```

   (`translateX(±100%)` 以 ::after 自身寬度為單位 —— 即軌道寬,無 hardcode px。
   `display: inline-block` 是 `transform` 在 span 上生效的必要條件。)

2. **`src/features/goals/FireGoalCard.tsx`** — 加跨越偵測 + data 屬性:

   a. 元件頂部(`reachedFi` 宣告後)加:

   ```tsx
   // One-shot celebration when FI is crossed while mounted (plan 247).
   // Mount-time reachedFi does NOT celebrate — only a false→true transition.
   const prevReachedRef = useRef(reachedFi);
   const [celebrating, setCelebrating] = useState(false);
   useEffect(() => {
     if (reachedFi && !prevReachedRef.current) setCelebrating(true);
     prevReachedRef.current = reachedFi;
   }, [reachedFi]);
   ```

   (補 `useEffect, useRef, useState` 的 import;若檔案已有部分,合併。)

   b. 百分比 span(`:90`)加類別與屬性(**不綁** `onAnimationEnd` —— 見 c. 的說明):

   ```tsx
   <span className="tabular ns-goal-pct" data-celebrate={celebrating || undefined}>
     {progressPct.toFixed(1)}%
   </span>
   ```

   c. 進度條軌道 div(`:92`,`overflow-hidden rounded-full` 那層)加類別、屬性、
   與**唯一**的 `onAnimationEnd`:

   ```tsx
   <div
     className="mt-1 h-2 overflow-hidden rounded-full ns-goal-track"
     data-celebrate={celebrating || undefined}
     onAnimationEnd={(e) => {
       // Only the longest animation (shimmer, 600ms) ends the celebration.
       // The pop's animationend (320ms) bubbles up here too — clearing state
       // on it would unmatch the [data-celebrate] selector and cut the
       // shimmer off mid-sweep.
       if (e.animationName === "ns-goal-shimmer") setCelebrating(false);
     }}
     style={{ background: "var(--ns-surface-strong)" }}
   >
   ```

## Boundaries

- 只碰 `src/features/goals/FireGoalCard.tsx` 與 `src/styles/globals.css`。
- **不碰** `GoalsRoute.tsx`(`:383` 的 `achieved` 是同一時刻的另一呈現 —— 可能的
  follow-up,不在本計劃)、不碰 Dashboard 其他卡片、不加依賴。
- 若 248 已先落地,`:92-94` 的 fill 會變成 `.ns-progress-fill` 類別 —— 那**不是 drift**,
  照常把 `ns-goal-track` 加在外層軌道 div 上即可;其他不符 = STOP。
- 不改 `reachedFi` / `progressPct` 的計算語意(財務語意鎖定)。

## Verification

- **Mechanical**:
  - `npx tsc --noEmit` → exit 0。
  - `npm test` → 全綠。
  - `npm run lint` → 0 errors。
- **Feel check**(dev server;需要能改資料的環境):
  - 建一個目標金額略高於目前淨值的 FIRE 目標 → 記一筆讓它跨過 100% 的資產 →
    Dashboard 的 FIRE 卡:光暈**從左到右掃一次**、百分比**輕輕彈一下**,600ms 內
    全部結束,之後畫面完全靜止。
  - 重新整理頁面(已達成狀態下 mount):**不播**。
  - DevTools Animations panel 調到 10% 速度重看一次:光暈是「掃過」不是「閃爍」,
    高光帶邊緣柔和;pop 頂點 1.06 不誇張。
  - Rendering → emulate `prefers-reduced-motion: reduce` → 重演跨越:無可感知動畫。
- **Done when**:mechanical 全綠 + feel check 四項通過 + 操作者(品味擁有者)看過
  實際效果點頭。
