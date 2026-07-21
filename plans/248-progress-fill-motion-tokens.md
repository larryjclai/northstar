# 248 — 進度條填充動畫統一到 motion tokens(`.ns-progress-fill`)

- **Status**: TODO
- **Commit**: `92a96210`
- **Severity**: LOW(cohesion polish —— 三種進度條、三種動畫行為)
- **Category**: Cohesion & tokens
- **Estimated scope**: 4 files(`globals.css` 新類別;`FireGoalCard.tsx`、`GoalsRoute.tsx`、`AccountsRoute.tsx` 換用)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command. On any STOP condition, stop and report. Do NOT update `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 92a96210..HEAD -- src/features/goals/FireGoalCard.tsx src/routes/GoalsRoute.tsx src/routes/AccountsRoute.tsx src/styles/globals.css`
> 例外:`FireGoalCard.tsx` / `globals.css` 若已含 plan 247 的改動(`ns-goal-track` /
> `ns-goal-shimmer`)不算 drift。其他與 excerpt 不符 = STOP。

## Problem

同一個「進度條填充」模式在三處有三種動畫行為 —— cohesion drift:

1. `src/features/goals/FireGoalCard.tsx:93-105` — current:**Tailwind 預設 timing**,
   非 repo token(Tailwind v4 `transition-[transform]` = 150ms + 它自家的
   `cubic-bezier(0.4,0,0.2,1)`,而 repo 的標準是 `var(--ns-dur)` 200ms + `var(--ns-ease)`):
   ```tsx
   <div
     className="h-full transition-[transform]"
     style={{
       width: "100%",
       background: ...,
       transform: `scaleX(${(progressPct ?? 0) / 100})`,
       transformOrigin: "left",
     }}
   />
   ```
2. `src/routes/GoalsRoute.tsx:241`(選定目標詳情)與 `:406`(目標清單列)— current:
   **完全沒有動畫**(值變了就跳),而且用 `width: %` 而非 transform(若日後直接
   在 width 上加 transition,會動到 layout 屬性 —— 效能反模式):
   ```tsx
   {/* :240-242 */}
   <div className="mb-3" style={{ height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden" }}>
     <div style={{ width: `${stats.progress.toFixed(1)}%`, height: "100%", background: "linear-gradient(90deg, var(--ns-accent), var(--ns-pos))", borderRadius: 3 }} />
   </div>
   ```
   ```tsx
   {/* :405-407 */}
   <div className="flex-1" style={{ height: 6, borderRadius: 3, background: "var(--ns-surface-strong)", overflow: "hidden" }}>
     <div style={{ height: "100%", width: `${progress}%`, background: color, borderRadius: 3 }} />
   </div>
   ```
3. `src/routes/AccountsRoute.tsx:464`(信用卡額度利用率條)— current:已用 token
   easing 但 hand-typed `0.3s` 時長:
   ```tsx
   <div style={{ width: "100%", height: "100%", background: utilBarColor, transform: `scaleX(${(utilPct ?? 0) / 100})`, transformOrigin: "left", transition: "transform 0.3s var(--ns-ease)" }} />
   ```

依 AGENTS.md 樣式優先序,重複 ≥3 次的靜態 inline 模式應抽成共用 `ns-*` class。

## Target

一個共用類別,四個填充全部換用:

```css
/* target — globals.css */
.ns-progress-fill {
  width: 100%;
  height: 100%;
  transform-origin: left;
  transition: transform var(--ns-dur) var(--ns-ease);
}
```

填充度一律走 `transform: scaleX(fraction)`(compositor-only;transition 可中斷、
值連續變化時自然 retarget)。動態部分(scaleX 比例、background 顏色)留在 inline
`style` —— 那是 props/state 計算值,符合樣式優先序第 3 條。

## Repo conventions to follow

- `ns-*` 元件類別放 `src/styles/globals.css`,區塊註解 `/* ── <名稱> (plan NNN) ── */`。
- Motion tokens:`--ns-dur`(200ms)、`--ns-ease`(`:47-49`)。已正確使用 scaleX 模式的
  exemplar 就是 AccountsRoute:464 本身(只差時長 token 化)。

## Steps

1. **`src/styles/globals.css`** — 在 `/* ── SegmentedControl sliding thumb ── */`
   區塊(`:471-480`)之前新增:

   ```css
   /* ── Progress fill (plan 248) ── */
   /* Shared fill for all progress/utilization bars: scaleX-driven (compositor-
      only, interruptible), tokened timing. Dynamic scaleX + colors stay inline. */
   .ns-progress-fill {
     width: 100%;
     height: 100%;
     transform-origin: left;
     transition: transform var(--ns-dur) var(--ns-ease);
   }
   ```

2. **`FireGoalCard.tsx:93-105`** — fill div 改為:

   ```tsx
   <div
     className="ns-progress-fill"
     style={{
       background: reachedFi
         ? "var(--ns-positive, var(--ns-accent))"
         : projection.onTrack
           ? "var(--ns-accent)"
           : "var(--ns-danger, #c0392b)",
       transform: `scaleX(${(progressPct ?? 0) / 100})`,
     }}
   />
   ```
   (移除 `h-full transition-[transform]` 類別與 inline 的 `width`/`transformOrigin`
   —— 由共用類別接手。background 三元判斷一字不動。)

3. **`GoalsRoute.tsx:241`** — 改為 scaleX 模式:

   ```tsx
   <div className="ns-progress-fill" style={{ background: "linear-gradient(90deg, var(--ns-accent), var(--ns-pos))", transform: `scaleX(${Math.min(1, stats.progress / 100)})` }} />
   ```
   (外層 `:240` 的軌道 div 不動 —— 已有 `overflow: hidden` + 圓角,scaleX 壓縮的
   圓角會被軌道裁掉。fill 自身的 `borderRadius: 3` 移除:被 scaleX 非等比壓縮反而
   變形,裁切交給軌道。)

4. **`GoalsRoute.tsx:406`** — 同樣改法:

   ```tsx
   <div className="ns-progress-fill" style={{ background: color, transform: `scaleX(${Math.min(1, progress / 100)})` }} />
   ```

5. **`AccountsRoute.tsx:464`** — 換用類別、時長 token 化:

   ```tsx
   <div className="ns-progress-fill" style={{ background: utilBarColor, transform: `scaleX(${(utilPct ?? 0) / 100})` }} />
   ```
   (0.3s → `var(--ns-dur)` 200ms:利用率條與其他進度條同節奏;300ms 無記錄在案的
   理由,視為 hand-typed drift。)

## Boundaries

- 只碰上列四檔的引用行。**不碰**:進度值的計算(`stats.progress`、`utilPct` 等財務
  語意)、軌道 div 的結構與顏色、`GoalsRoute` 其他區塊。
- 不動 plan 247 的 `ns-goal-track` / shimmer(若已存在)。
- `progress` / `stats.progress` 已在來源 `Math.min(100, ...)` 封頂(`GoalsRoute:121,382`),
  步驟 3、4 的 `Math.min(1, ...)` 是防禦性重複 —— 保留,無害。
- 與 excerpt 不符(drift)→ STOP。

## Verification

- **Mechanical**:
  - `npx tsc --noEmit` → exit 0。
  - `npm test` → 全綠。
  - `npm run lint` → 0 errors。
  - `grep -rn "transition-\[transform\]" src/features/goals/FireGoalCard.tsx` → 無。
  - `grep -c "ns-progress-fill" src/features/goals/FireGoalCard.tsx src/routes/GoalsRoute.tsx src/routes/AccountsRoute.tsx` → 1 / 2 / 1。
- **Feel check**(dev server):
  - Goals 頁:切換選定目標 → 詳情大進度條**平滑滑動**到新比例(~200ms),不跳變;
    漸層與圓角外觀與改前無異。
  - 目標清單列與帳戶頁信用卡利用率條:同樣平滑、同樣節奏(視覺上分不出三處的
    動畫個性差異 —— 這就是本計劃的目的)。
  - 進度 100% 與 0% 的極端值:fill 貼滿/完全消失,無殘邊。
- **Done when**:mechanical 全項 + feel check 三項通過。
