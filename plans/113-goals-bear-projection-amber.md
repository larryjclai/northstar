# Plan 113: 目標頁「保守」情境主線改琥珀（與 107 悲觀圖例一致，紅色不代表虧損）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b7dd5ba5..HEAD -- src/routes/GoalsRoute.tsx`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none（延續 plan 107 的語意決定）
- **Category**: bug (visual semantics)
- **Planned at**: commit `b7dd5ba5`, 2026-07-03

## Why this matters

Plan 107 已把 30 年淨值預測的「悲觀」情境從紅色 `--ns-neg` 改成琥珀
`--ns-chart-3`，理由是紅色在本 app 專指虧損/錯誤，而「保守假設」不是虧損。
但目標頁 FIRE 圖表的**主線顏色**漏改：選「保守」情境時整條曲線仍用
`--ns-neg` 紅色，跟 107 剛統一的語意打架。本計劃補上這處。

## Current state

- `src/routes/GoalsRoute.tsx:129` — 主線與漸層的顏色來源：

```tsx
const chartColor = !isFire ? "var(--ns-accent)" : activeProjection === "bear" ? "var(--ns-neg)" : activeProjection === "bull" ? "var(--ns-accent)" : "var(--ns-pos)";
```

  `chartColor` 被用於 299–300 行的漸層 stop 與 320 行的 `<Area stroke={chartColor}>`。

- 情境切換按鈕（263 行附近）：`[["bear", "保守 5%"], ["base", "基準 7.2%"], ["bull", "樂觀 10%"]]`
  — `bear` = 保守。

- **同檔其他 `--ns-neg` 是正當紅色，不要動**：
  - 235/238 行 — `pace.status === "behind"`（進度落後）的背景與文字，落後用紅是對的。
  - 397/406 行 — 刪除目標按鈕，破壞性操作用紅是對的。

- 107 的語意參照：悲觀/保守情境色 = `--ns-chart-3`（琥珀）。

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Install   | `npm ci`       | exit 0              |
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/routes/GoalsRoute.tsx`（僅 129 行的 `chartColor` 三元）

**Out of scope** (do NOT touch):
- 235/238 行的 pace-behind 紅（正當）。
- 397/406 行的刪除鈕紅（正當）。
- `activeProjection` 的邏輯、情境費率、圖表結構。

## Git workflow

- Branch: `fix/ai-goals-bear-amber`
- Commit style: `fix(goals): amber for conservative projection line, not loss-red`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: bear 分支換琥珀

129 行的 `activeProjection === "bear" ? "var(--ns-neg)"` 改為
`activeProjection === "bear" ? "var(--ns-chart-3)"`。整行變成：

```tsx
const chartColor = !isFire ? "var(--ns-accent)" : activeProjection === "bear" ? "var(--ns-chart-3)" : activeProjection === "bull" ? "var(--ns-accent)" : "var(--ns-pos)";
```

**Verify**: `npx tsc` → exit 0；`grep -n 'activeProjection === "bear" ? "var(--ns-neg)"' src/routes/GoalsRoute.tsx` → 無輸出。

### Step 2: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。（視覺：目標頁 FIRE 圖選
「保守 5%」時主線與漸層為琥珀——deferred to reviewer/operator。）

## Test plan

- 純配色常數，無邏輯變更 — 不新增測試。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `grep -c "var(--ns-neg)" src/routes/GoalsRoute.tsx` → 4（129 行移除後，剩 235/238/397/406 四處正當用途）
- [ ] `git status` 只含 `src/routes/GoalsRoute.tsx`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 129 行的 `chartColor` 三元與摘錄不符（drift）。
- `grep -c "var(--ns-neg)"` 改後不是 4（代表同檔 ns-neg 的分佈與預期不同）— 回報現況。

## Maintenance notes

- 語意準則（與 107 一致）：保守/悲觀情境 = 琥珀 `--ns-chart-3`；紅 `--ns-neg`
  保留給實際虧損、落後、破壞性操作。
- Reviewer 檢查重點：只有 bear 主線變色，pace-behind 與刪除鈕的紅原封不動。
