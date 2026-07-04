# Plan 112: 資產配置圓餅的「現金」與 KPI 卡同色（chart-2 藍）

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b7dd5ba5..HEAD -- src/routes/DashboardRoute.tsx`
> If it changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (visual consistency)
- **Planned at**: commit `b7dd5ba5`, 2026-07-03

## Why this matters

總覽頁的 KPI 卡把「現金 / 存款」固定用 `--ns-chart-2`（藍），但資產配置圓餅
按**排序索引**配色（`CHART_COLORS[i]`），所以「現金」在圓餅裡是哪個顏色純看
它當下佔比排第幾——demo 資料現金佔 71.8% 排第一，拿到 `--ns-chart-1`（綠）。
同一個「現金」在同一頁兩個圖表顏色不一致，使用者容易誤讀。操作者要求：
**確保「現金」這兩處同色即可**（不要求其他類別全對齊）。

## Current state

- `src/routes/DashboardRoute.tsx` — KPI 卡（977–980 行）：

```tsx
<KpiCard label="投資" value={formatMoney(marketValue, primaryCurrency)} color="var(--ns-chart-1)" />
<KpiCard label="現金 / 存款" value={formatMoney(availableCash, primaryCurrency)} color="var(--ns-chart-2)" />
{alternativeAssets > 0 ? <KpiCard label="其他資產" value={formatMoney(alternativeAssets, primaryCurrency)} color="var(--ns-chart-4)" /> : null}
<KpiCard label="負債" value={formatMoney(liabilities, primaryCurrency)} color="var(--ns-chart-5)" tone={liabilities > 0 ? "neg" : undefined} />
```

- `src/routes/DashboardRoute.tsx` — 圓餅資料的配色（`allocation` memo，495–510 行）：

```tsx
const allocation = useMemo(() => {
  const byClass = new Map<string, number>();
  for (const asset of filteredAssets) {
    // …
    const label = asset.assetType ? assetTypeLabels[asset.assetType] : "其他";
    byClass.set(label, (byClass.get(label) ?? 0) + value);
  }
  if (availableCash > 0) byClass.set("現金", (byClass.get("現金") ?? 0) + availableCash);
  if (alternativeAssets > 0) byClass.set("實體資產", (byClass.get("實體資產") ?? 0) + alternativeAssets);
  const total = [...byClass.values()].reduce((s, v) => s + v, 0);
  return [...byClass.entries()]
    .map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length], pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}, [/* … */]);
```

  圓餅本身（`<Pie>` + `<Cell fill={a.color}>`，1140–1141 行）與 legend（1148 行）
  都吃這個 `a.color`。

- `CHART_COLORS` 陣列（111–119 行）：`[chart-1, chart-2, chart-3, chart-4, chart-5, "#2dd4bf", "#fb923c"]`。

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Install   | `npm ci`       | exit 0              |
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/routes/DashboardRoute.tsx`（僅 `allocation` memo 的配色那一段）

**Out of scope** (do NOT touch):
- KPI 卡的顏色（977–980）— 它們已是正準，是被對齊的目標。
- 其他類別的配色一致性（本計劃只管「現金」— 操作者明示）。
- `CHART_COLORS` 陣列本身。
- `assetTypeLabels`、資產分類邏輯。

## Git workflow

- Branch: `fix/ai-allocation-cash-color`
- Commit style: `fix(dashboard): pin allocation 現金 to chart-2 to match KPI card`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: 圓餅「現金」釘死 chart-2

在 `allocation` memo 的 `.map(...)` 配色處，把「現金」這個 label 固定用
`--ns-chart-2`，其餘維持既有的索引配色。改法（保持索引配色為 fallback）：

```tsx
.map(([label, value], i) => ({
  label,
  value,
  color: label === "現金" ? "var(--ns-chart-2)" : CHART_COLORS[i % CHART_COLORS.length],
  pct: total > 0 ? (value / total) * 100 : 0,
}))
```

注意：這樣「現金」永遠是藍色；若某個非現金類別因索引也拿到 chart-2 而與現金
撞色，屬可接受（本計劃只保證現金同色，不做全域去重）。若你想更乾淨，可在
map 後把撞到 chart-2 的非現金項往後推一個索引——但**這是選配**，會擴大改動，
沒把握就別做，保持最小修改。

**Verify**: `npx tsc` → exit 0；`grep -n 'label === "現金"' src/routes/DashboardRoute.tsx` → 1 處。

### Step 2: 全量驗證

**Verify**: `npm test` → all pass；`npm run lint` → exit 0。（視覺驗證：demo 模式
總覽頁，KPI「現金 / 存款」與圓餅「現金」都是藍色——deferred to reviewer/operator。）

## Test plan

- 純配色常數，無邏輯變更 — 不新增測試；回歸由 `npm test` 承擔。

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc`、`npm test`、`npm run lint` 全 exit 0
- [ ] `grep -n 'label === "現金"' src/routes/DashboardRoute.tsx` → 1 處
- [ ] `git status` 只含 `src/routes/DashboardRoute.tsx`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- 摘錄與現場不符（drift）。
- KPI 卡的「現金 / 存款」在現場不是 `--ns-chart-2`（對齊目標變了）— 回報實際值，
  以 KPI 為準對齊。

## Maintenance notes

- 若之後想讓**所有**類別在 KPI 與圓餅間同色，正解是抽一張 `類別 → token` 的
  canonical map 兩處共用，取代 KPI 的手寫 token 與圓餅的索引配色——那是比本計劃
  大的一步，操作者目前只要現金一致。
- Reviewer 檢查重點：現金藍、其他類別未因此撞色到難以分辨。
