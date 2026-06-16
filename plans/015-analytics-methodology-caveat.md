# Plan 015: Surface the fixed-weight approximation caveat in the Investments Analytics UI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8b2302d1..HEAD -- src/routes/InvestmentsAnalyticsTab.tsx`
> If the file changed since this plan was written, read it fully and compare
> against the "Current state" excerpts before proceeding; on a structural
> mismatch treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs (trust / explainability) — UI copy + existing component reuse
- **Planned at**: commit `8b2302d1`, 2026-06-16

## Why this matters

`docs/dashboard-analytics-plan.md` §1 made an explicit, decided commitment:

> 「`buildPerformanceTrend` 使用『當前持股數 × 歷史價』＝固定權重回看視圖，非真正
> 時間加權報酬。所有衍生的風險指標沿用此近似，**並在 UI 以註記說明**。」

The engine ships and is used (`buildPortfolioValueSeries` in
`portfolioAnalytics.ts`), but the **UI註記 was never added** — a grep of
`InvestmentsAnalyticsTab.tsx` for 「固定 / 近似 / 權重 / 非時間加權」 returns nothing.
So period returns, alpha, volatility, Sharpe, Sortino and max-drawdown are all
presented as if exact. This violates `PRODUCT.md` principle #3 (「財務計算必須
可解釋」) and is a documented-plan drift, not a calculation bug — **do not change
any calculation; only disclose the method.** A user who added or trimmed
positions mid-period will otherwise misread these numbers.

## Current state

`src/routes/InvestmentsAnalyticsTab.tsx` (~1690 lines) renders a sticky in-page
section nav followed by sections `報酬 / 風險 / 配置 / 股利`. Key anchors:

- A reusable tooltip component already exists — **reuse it, do not build a new one**:
  ```tsx
  function MetricHelp({ text }: { text: string }) { ... }   // ~line 1085
  ```
  It is already used throughout (e.g. risk KPIs pass good `help=` strings such as
  「衡量每承擔一單位下跌風險，換到多少超額報酬。…」 at ~line 783).
- The analytics grid begins with a sticky nav, then the returns section:
  ```tsx
  <div className="grid gap-5">
    <nav style={{ position: "sticky", top: 0, ... }}> ...section anchors... </nav>

    {/* ═══ 報酬 RETURNS ═══ */}
    <section id="an-returns" style={{ display: "grid", gap: 20, scrollMarginTop: 64 }}>
      <CossCard style={{ padding: 34 }}>
        <div className="ns-eyebrow" style={{ marginBottom: 10 }}>期間報酬 · {period}</div>
        ...
  ```
- The risk section has four KPI cards (volatility / Sortino / Sharpe / max
  drawdown) each already carrying a `help=` tooltip (~lines 767–808).

Design tokens to use (from `DESIGN.md` §2, §3): muted caption text =
`var(--ns-fg-muted)`; caption size token `--ns-t-caption` (12px) or the existing
`.text-caption`/`.muted` classes; soft warning surface `var(--ns-warn-soft)` if a
subtle callout background is wanted. Keep it quiet — `.impeccable.md`: 「let data
carry the color; keep the frame quiet」.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm run test` | all pass |
| Lint | `npm run lint` | 0 errors (≈706 warnings pre-exist) |
| Visual check | `npm run dev`, open Investments → 分析 tab | caveat visible |

## Scope

**In scope**:
- `src/routes/InvestmentsAnalyticsTab.tsx` (only)

**Out of scope** (do NOT touch):
- `src/domain/portfolioAnalytics.ts` and any calculation — the numbers stay
  exactly as they are; this is disclosure only.
- The fixed-weight method itself — it is an intentional, documented decision.
- Other routes (Dashboard portfolio strip is a follow-up, see Maintenance notes).

## Git workflow

- Branch: `advisor/015-analytics-caveat`
- One commit; conventional-commit style, suggested:
  `docs(analytics): surface fixed-weight approximation caveat in UI`
- Do NOT push or open a PR unless the operator asks.

## Steps

### Step 1: Add one always-visible methodology caveat at the top of the analytics grid
Directly under the sticky `<nav>` (before the `報酬 RETURNS` `<section>`), add a
single quiet caption line, always visible (not hover-gated), e.g.:

```tsx
<div
  className="text-caption muted"
  style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}
>
  分析採固定持股權重的歷史回看近似（以目前持股 × 歷史價計算），非嚴格時間加權報酬；期間內加碼/減碼會影響解讀。
  <MetricHelp text="所有報酬、Alpha 與風險指標（波動、Sharpe、Sortino、最大回撤）皆以『目前持股數 × 歷史收盤價』回看計算，屬固定權重近似。若你在期間內買賣過該標的，實際時間加權報酬可能與此不同。" />
</div>
```

Keep wording in zh-TW. Do not introduce new color beyond muted text.

**Verify**: `grep -n "固定持股權重\|非嚴格時間加權\|固定權重近似" src/routes/InvestmentsAnalyticsTab.tsx` → at least 1 match.

### Step 2: Add a short caveat anchor at the risk-KPI band
At the risk section heading (the `風險` section, where the 4 KPI cards render),
add a one-line muted sub-caption under the section title, e.g.:

```tsx
<div className="text-caption muted" style={{ marginTop: -4 }}>
  風險指標基於固定權重日報酬序列估算，需足夠歷史天數方有參考意義。
</div>
```

(Place it where the section title is rendered; if a section title element is not
obvious, attach it immediately above the KPI grid. Read the surrounding markup
first.)

**Verify**: `grep -n "固定權重日報酬序列" src/routes/InvestmentsAnalyticsTab.tsx` → 1 match.

### Step 3: Typecheck / lint / test
**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm run lint` → 0 errors
- `npm run test` → all pass

### Step 4: Visual confirm (light + dark)
Run `npm run dev`, open Investments → 分析 tab with enough price history that
charts render.

**Verify**: the top caveat line is visible above 報酬; the risk-band caption is
visible above the 4 KPI cards; the `MetricHelp` info icon expands the longer
explanation on hover/click. Check both light and dark theme — text uses
`--ns-fg-muted`, so it must be readable in both (cross-check against the
light-theme fix already done in plan 010).

## Test plan

No new unit tests — copy/disclosure only, no logic change. The existing
`portfolioAnalytics.test.ts` and full suite must remain green (`npm run test`).

## Done criteria

ALL must hold:
- [ ] `grep -n "固定持股權重\|固定權重近似" src/routes/InvestmentsAnalyticsTab.tsx` → ≥1 match (top caveat)
- [ ] `grep -n "固定權重日報酬序列" src/routes/InvestmentsAnalyticsTab.tsx` → 1 match (risk-band caption)
- [ ] No change to `src/domain/portfolioAnalytics.ts` (`git status`)
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` 0 errors; `npm run test` passes
- [ ] Caveat readable in both light and dark theme (visual)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- The sticky `<nav>` / `id="an-returns"` structure no longer matches "Current
  state" (file drifted) — re-read before placing the caveat.
- `MetricHelp` no longer exists or its signature changed — report; do not invent
  a replacement tooltip.
- Adding the caption forces a layout change beyond one text line — report rather
  than restructuring the section.

## Maintenance notes

- **Deferred (follow-up, not this plan):** the same fixed-weight caveat applies
  to the Dashboard `PortfolioStrip` (報酬/benchmark/alpha) and the holding-level
  P&L; a future plan can add a compact shared caveat there. Kept out to keep
  this change one-file and low-risk.
- If the analytics engine ever switches to true time-weighted return (TWR
  end-to-end), this caveat must be removed/updated — grep the caveat strings
  above to find it.
- Reviewer: confirm zero calculation files changed; this is disclosure only.
