# Plan 164: Overview (總覽) redesign — Direction A「一眼脈搏」(minimal pulse dashboard)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9441c152..HEAD -- src/routes/DashboardRoute.tsx src/state/uiPreferences.ts`
> If `DashboardRoute.tsx` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (sibling to 165/166/167; can land independently)
- **Category**: direction (design implementation)
- **Planned at**: commit `9441c152`, 2026-07-12
- **Source design**: claude.ai/design project `a2b50679-620a-465b-80c5-ef0ca5574bce`,
  file `Overview + Invest Redesign.html`, component `NSOvVariantA` in
  `northstar-overview-variants.jsx`. The operator chose **Direction A** of three.

## Why this matters

The Overview is card-heavy: 10+ toggleable cards stacked vertically. Direction A
collapses the first screen to the four things a daily check-in actually needs —
net worth, a 4-cell "pulse" strip (投資今日 / 本月現金流 / 預算 / 待辦), a merged
待辦 card, and today's movers — and demotes everything else behind the existing
「版面」 toggle. Three separate cards (近期帳單, 信用卡繳款提醒, 應收/應付未結清)
become one date-sorted 待辦 list, and the 匯率 card shrinks to a header one-liner.
The result is a quieter, single-glance dashboard.

**This is a visual/layout restructure only. Do NOT change any financial math,
valuation, or the numbers themselves** — reuse every value already computed in
`DashboardRoute` (see invariant #1 in `AGENTS.md`: "Don't silently change
financial math").

## Current state

- `src/routes/DashboardRoute.tsx` (1677 lines) — the entire Overview route. All
  values you need are **already computed** in the `DashboardRoute()` body; this
  plan only rearranges the JSX returned from line ~713 onward and adds two small
  presentational helpers. Key already-computed values:
  - `netWorth`, `momChange`, `momPct`, `stripPeriod`, `reconciledTrend`,
    `visibleTrend`, `adjustedNetWorth`, `netSettlement` — net-worth hero.
  - `marketValue`, `availableCash`, `liabilities`, `alternativeAssets` — KPIs.
  - `monthNet`, `monthIncome`, `monthExpense`, `savingsRate` — cash flow.
  - `budgetCats`, `overBudget`, `totalBudget` — budget.
  - `upcoming` (recurring bills), `creditReminders` (credit cards),
    `settlements.items` (AR/AP) — the three sources that merge into 待辦.
  - `movers.gainers`, `movers.losers`, `heldAssetCount` — today's movers.
  - `fxRates` — FX pairs (currently the 匯率 card at lines 1217-1239).
  - `accountMap`, `primaryCurrency`, `formatMoney`, `formatNumber`,
    `formatCompactMoney`, `toPrimary`.
- The header block is at `DashboardRoute.tsx:775-821`. It contains: greeting,
  `MonthlySummaryInline`, `AccountFilter`, 更新行情 `Button`, 版面 `Popover`
  (re-enables hidden cards via `DASHBOARD_CARDS` / `cardVisible` / `toggleCard`),
  and `<NotificationCenter/>`.
- The net-worth hero + KPI stack is `Row 1` at `DashboardRoute.tsx:823-1022`.
- The three cards to merge:
  - 近期帳單: `upcoming`, rendered lines 1060-1088.
  - 信用卡繳款提醒: `creditReminders`, rendered lines 1092-1117.
  - 應收/應付: `settlements.items`, rendered lines 1120-1145.
- 匯率 card (`fxRates`): lines 1217-1239 (inside `Row 3`).
- Movers card `TopMoversCard` helper: lines 1481-1502; `MoverRow` 1439-1464.

### Design spec for Direction A (translate to real components)

The design file uses design-canvas-only classes (`.ns-card`, `.ns-btn`,
`.ns-pill`, `NSIcon`, `NSRdStat`, `nsRd` mock data). **Do not copy those.** Map
them to the app's real primitives, which this file already uses:

| Design token/class | Use in the app |
|---|---|
| `.ns-card` | `<Card>` from `../components/coss/card` (already imported) |
| `.ns-btn` / `.primary` / `.ghost` / `.icon` | `<Button variant="outline"|"default"|"ghost">` from `../components/coss/button` |
| `.ns-pill.solid-pos` / `.solid-neg` | `<Badge variant="success"|"error" className="rounded-full px-2">` |
| eyebrow (`.ns-eyebrow`) | `<div className="text-xs muted font-medium">` (this file's idiom, e.g. line 831) |
| big number | inline `style={{ fontFamily: "var(--ns-font-num)", fontVariantNumeric: "tabular-nums lining-nums" }}` (idiom at line 881-887) |
| `NSIcon name="refresh"` | `<ArrowsClockwise size={15}/>` (already imported) |
| `NSIcon name="bell"` | `<NotificationCenter/>` (keep the real component) |
| `NSSparkline` | a small recharts `<AreaChart>` — reuse the exact hero-chart markup at lines 951-964, just smaller (see Step 3) |
| `nsRd.*` mock data | the real computed values listed in "Current state" |

Design colours: gains/losses on **market** figures use `var(--ns-gain)` /
`var(--ns-loss)`; cash-flow figures use `var(--ns-pos)` / `var(--ns-neg)`. This
file already follows that split (e.g. `KpiCard` tone, `MoverRow`). Match it.

## Commands you will need

| Purpose   | Command                                   | Expected on success |
|-----------|-------------------------------------------|---------------------|
| Typecheck | `npm run build` (runs `tsc && vite build`)| exit 0, no TS errors |
| Tests     | `npm test`                                | all pass            |
| Lint      | `npm run lint`                            | exit 0              |
| Preview   | `npm run dev` → open the Overview route    | dashboard renders   |

There is no standalone `typecheck` script; `tsc` runs as the first half of
`npm run build`. If a full `vite build` is too slow while iterating, run
`npx tsc --noEmit` for a faster type-only check.

## Scope

**In scope** (the only files you should modify):
- `src/routes/DashboardRoute.tsx` — restructure the returned JSX; add the
  `TodoCard`, `PulseStrip`, and `FxInline` presentational helpers.
- `src/state/uiPreferences.ts` — only if you implement default-hidden cards
  (Step 6); a one-line default change plus a migration guard.
- `src/styles/globals.css` — only if a new `ns-*` utility class is genuinely
  reused 3+ times (per `AGENTS.md` styling rule). Prefer existing classes first.

**Out of scope** (do NOT touch, even though they look related):
- Any `domain/` file, `data/` hook, or valuation/`buildNetWorthTrend` logic —
  numbers must not change. This is layout only.
- `DASHBOARD_CARDS` semantics beyond adding/removing keys — the 版面 toggle must
  keep working for whatever cards remain.
- `InvestmentsRoute.tsx`, `HoldingDetailRoute.tsx`, `InvestmentsAnalyticsTab.tsx`
  — those are plans 165/166/167.
- **Do NOT delete** `buildNetWorthTrend`, `rangeView`, `longView`,
  `PortfolioStrip`, or the 北極星指標 metric picker. Direction A demotes the big
  trend chart, but the engine and the re-enableable card must stay (Step 3).

## Git workflow

- Branch: `feat/ai-overview-variant-a`
- Commit per step; conventional-commit style, e.g.
  `feat(overview): merge bills/cards/AR-AP into a single 待辦 card`.
- Do NOT push or open a PR unless the operator asks.

## Steps

### Step 1: Add the `FxInline` header one-liner and move FX out of the card grid

Add a presentational helper near the other helpers at the bottom of the file:

```tsx
function FxInline({ rates }: { rates: Array<{ pair: string; rate: number; changePct: number | null }> }) {
  if (rates.length === 0) return null;
  return (
    <span className="mono" style={{ display: "inline-flex", gap: 14, alignItems: "center", fontSize: 11.5, color: "var(--ns-fg-dim)" }}>
      {rates.slice(0, 2).map((fx) => (
        <span key={fx.pair} style={{ display: "inline-flex", gap: 5, alignItems: "baseline" }}>
          <span>{fx.pair}</span>
          <span style={{ color: "var(--ns-fg-muted)", fontWeight: 500 }}>{fx.rate.toFixed(2)}</span>
          {fx.changePct != null ? (
            <span style={{ color: fx.changePct >= 0 ? "var(--ns-pos)" : "var(--ns-neg)", fontSize: 10.5 }}>
              {fx.changePct >= 0 ? "▲" : "▼"}{Math.abs(fx.changePct).toFixed(2)}%
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}
```

In the header (lines 794-820), render `<FxInline rates={fxRates} />` as the
first item in the right-hand control cluster, before `AccountFilter`. Remove the
`市場 匯率` `Card` (lines 1217-1239) and its `cardVisible("market")` wrapper, and
delete `"market"` from `DASHBOARD_CARDS` (line 104). Keep `AccountFilter`, the
更新行情 button, the 版面 Popover, and `<NotificationCenter/>` in the header.

**Verify**: `npx tsc --noEmit` → exit 0. `npm run dev`, open Overview → FX pairs
appear as a small grey line in the header; the standalone 匯率 card is gone.

### Step 2: Add the merged `TodoCard` (帳單 + 信用卡 + 應收/應付)

Add a helper that flattens the three existing sources into one date-sorted list
with a type tag. Reuse the already-computed `upcoming`, `creditReminders`,
`settlements`, `accountMap`, `formatNumber`, and `toPrimary`. Row shape:

```tsx
type TodoRow = {
  key: string;
  type: "bill" | "card" | "recv" | "pay" | "income";
  name: string;
  sub: string;
  date: string;   // "MM-DD" for display, but sort on the full ISO date
  iso: string;
  amt: number;    // signed TWD-primary; negative = 待付
  to?: { path: string; params?: Record<string, string>; search?: Record<string, string> }; // optional link target
};
```

Build the rows inside `DashboardRoute()` (a `useMemo` next to the existing
`upcoming`/`creditReminders`/`settlements` memos), mapping:
- each `upcoming` bill → `type: b.entryType === "income" ? "income" : "bill"`,
  `name: b.merchant || b.category`, `sub: accountMap.get(b.accountId)?.name`,
  `iso: b.nextRunDate`, `amt: b.entryType === "income" ? +abs : −abs`.
- each `creditReminders` item → `type: "card"`, `name: r.name`,
  `sub: "繳款日 " + r.dueDate.slice(5) + " · 還有 " + r.daysUntilDue + " 天"`,
  `iso: r.dueDate`, `amt: −r.outstanding`, link to the reconcile route
  (`/cash-flow/reconcile/$accountId`, matching the current card's `<Link>`).
- each `settlements.items` (slice to 5) → `type: item.kind === "receivable" ? "recv" : "pay"`,
  `name: item.counterparty || item.name`, `iso: item.date.slice(0,10)`,
  `amt: (recv? +:−) toPrimary(item.amount, item.currency)`, link to
  `/cash-flow?tx=<id>` (matching the current card).

Sort ascending by `iso`, slice to ~6. Tag metadata:

```tsx
const TODO_META: Record<TodoRow["type"], { label: string; color: string }> = {
  bill:   { label: "帳單",   color: "var(--ns-chart-3)" },
  card:   { label: "信用卡", color: "var(--ns-chart-5)" },
  recv:   { label: "應收",   color: "var(--ns-chart-2)" },
  pay:    { label: "應付",   color: "var(--ns-chart-5)" },
  income: { label: "入帳",   color: "var(--ns-pos)" },
};
```

Render a single `<Card>` titled 「待辦 · 30 天」 with a header badge showing total
待付 (sum of negative `amt`), and one row per `TodoRow` (tag pill on the left via
the `color` above, name + sub in the middle, signed amount + date on the right,
income rows in `var(--ns-pos)`). Model the row markup on the existing 近期帳單
rows (lines 1072-1085). Preserve the links where present (`<Link>` from
`@tanstack/react-router`, already imported).

Delete the three original cards (lines 1060-1088, 1092-1117, 1120-1145) and drop
`"upcoming"`, `"creditCards"`, `"settlements"` from `DASHBOARD_CARDS`; add a
single `{ key: "todos", label: "待辦" }` entry so the 版面 toggle still governs it.

**Verify**: `npx tsc --noEmit` → exit 0. In `npm run dev` with demo data
(load via the empty-state 「載入示範資料」 button), the 待辦 card shows bills,
credit-card payments, and AR/AP interleaved in date order.

### Step 3: Rebuild Row 1 as the minimal hero + pulse strip; demote the big trend chart

Replace the `Row 1` block (lines 823-1022) with Direction A's hero:

1. **Hero card** — net worth eyebrow + value + MoM badge (reuse the exact markup
   at lines 830-901, including the 北極星指標 metric picker Popover and the
   `activeMetric`/`allMetrics` logic — keep all of it), and to its right a
   **small sparkline**: reuse the hero AreaChart markup (lines 951-964) but at
   `height: 64` in a fixed `width: 300` box, no axes, no tooltip. Keep the
   `stripPeriod` period control + 長期視角 toggle available but move them to sit
   above/near the sparkline (they still drive `visibleTrend`).
2. **Pulse strip** — a 4-column row under a `borderTop: "1px solid var(--ns-border)"`
   divider inside the same hero card, each column separated by
   `borderLeft: "1px solid var(--ns-border)"` (see design `NSOvVariantA`
   `pulses`). The four cells:
   - **投資今日** — portfolio's day change in primary currency. Compute it (see
     Step 4) as `portfolioDayChange.amount` + a sub line
     `+X.XX% · 大盤 +Y.YY%` (`stripData` already has the benchmark period figure;
     for the day-vs-benchmark sub, if a same-day benchmark day-change isn't
     cheaply available, show only the portfolio day % and omit the 大盤 clause —
     do NOT fabricate it). Colour `var(--ns-gain)`/`var(--ns-loss)`.
   - **本月現金流** — `monthNet` (signed, `var(--ns-pos)`/`var(--ns-neg)`), sub
     `儲蓄率 ${savingsRate.toFixed(0)}%`.
   - **預算** — `budgetCats.length === 0 ? "尚無預算" : "${budgetCats.length} 分類"`,
     sub = the nearest-to-limit category (highest `spent/budget`) e.g.
     `訂閱 79%`, or `無超支`/超支 count from `overBudget`.
   - **待辦** — `${todoRows.length} 件 · 30 天`, sub = the soonest row's
     `name` + `date`.
3. **KPI stack removed from Row 1**: fold 投資 / 現金 / 負債 into the hero pulse
   context OR keep them as a compact strip below the pulse — Direction A drops the
   separate KPI column. Simplest faithful move: delete the standalone
   `ns-dash-kpi-stack` (lines 997-1021) and rely on the pulse strip + the
   demoted trend card for detail. (投資/現金/負債 remain visible on the 淨值趨勢
   re-enable card, Step 3.4.)
4. **Preserve the rich trend as a re-enableable card**: DO NOT delete the big
   `AreaChart` + `PortfolioStrip` machinery. Move it into a new card gated by
   `cardVisible("netWorthTrend")`, rendered below the pulse hero, containing the
   full-height trend chart (lines 949-966), the period control, 長期視角, and
   `<PortfolioStrip .../>`. Add `{ key: "netWorthTrend", label: "淨值趨勢" }` to
   `DASHBOARD_CARDS`. This keeps every shipped feature; Direction A just changes
   the *default* (Step 6).

**Verify**: `npx tsc --noEmit` → exit 0. `npm run dev` → the hero shows net
worth + sparkline + a 4-cell pulse strip; the full trend chart appears as its own
card that can be hidden/shown from 版面.

### Step 4: Compute `portfolioDayChange` (投資今日 amount)

Add a `useMemo` in `DashboardRoute()` that sums each held position's day impact:
`impact = quantity × (currentPrice − referenceClose) × fxToPrimary`, where
`currentPrice`/`referenceClose` come from the **same logic `dayChangeMovers`
already uses** (live quote vs prior recorded daily close; reference is
`daily_prices`, never `quote.previousClose`). Rather than reimplement, factor the
per-ticker current/reference resolution: you can reuse `movers` if you extend
`dayChangeMovers` to also return the raw `current`/`reference`/`ticker`, but to
stay in-scope, compute locally here using `dailyPriceRows`, `quoteRows`,
`filteredAssets`, `dailyPriceLookup`, `manualPriceLookup`, and `toPrimary`.
Return `{ amount: number | null, pct: number | null }` where `amount` is the
signed TWD sum and `pct = amount / (marketValue − amount) × 100`. Return
`null` fields when no held ticker has both a current and a prior close (mirrors
the movers empty state) so the 投資今日 cell can render 「—」.

**Escape hatch**: if resolving per-ticker current/reference cleanly requires
editing `domain/portfolioAnalytics.ts` (out of scope), STOP and report — propose
promoting `dayChangeMovers` to optionally return raw prices as a tiny follow-up
plan, rather than duplicating fragile valuation logic.

**Verify**: add a console assertion during dev that `portfolioDayChange.amount`
equals `Σ movers impact` sign-wise; then remove it. `npm test` → still green.

### Step 5: Rebuild the lower rows (待辦 + 今日漲跌), hide the rest by default

Under the hero, render a 2-column grid: `<TodoCard/>` (Step 2, wider) beside the
今日漲跌 card (reuse `TopMoversCard`, or the design's combined gainers+losers list
with per-row impact — reuse `movers.gainers`/`movers.losers`; adding the NT$
impact per row is optional polish, gated on Step 4's per-ticker impact). Keep
`allocation`, `goals`, `recentActivity`, `projection` cards in the JSX (unchanged
markup) but they will be **default-hidden** via Step 6, re-enableable from 版面.

**Verify**: `npm run dev` → first screen = header + hero(pulse) + [待辦 | 今日漲跌].
Toggling items in 版面 re-adds 資產配置 / 目標 / 最近交易 / 淨值趨勢 / 30 年預測.

### Step 6: Set Direction A's default-hidden cards

In `src/state/uiPreferences.ts`, `dashboardHiddenCards` currently defaults to
`[]` (line 130) and persists. Change the initial default to the Direction A set:
`["allocation", "goals", "recentActivity", "projection"]`. Because existing
users already persisted `[]`, add a one-time migration in the `load()` parser
(around lines 178-180): if the persisted `dashboardHiddenCards` is exactly `[]`
**and** a new `overviewVariant` flag is absent, seed the Direction A defaults and
set the flag. Keep it minimal and reversible — the user can re-show any card.
If this migration adds meaningful complexity, it is acceptable to ship Direction A
with the cards present-but-below-the-fold and only change the *initial* default
(new installs get the minimal view); note that choice in the PR.

**Verify**: `npm test` → green (add/extend a uiPreferences test if one exists;
see `src/state/` for a `*.test.ts` pattern). Fresh load (clear localStorage in
the dev browser) shows the minimal Direction-A first screen.

## Test plan

- This is presentational; the numbers are unchanged, so the main gate is
  `npm run build` (type safety) + `npm test` (no regression in existing suites).
- Add/extend a unit test for the `TodoCard` row-merge logic **only if you extract
  it into a pure function** (recommended: a `buildTodoRows(...)` in the file or a
  small `domain/` helper — but domain is out of scope, so keep it in-route and
  test via a co-located `DashboardRoute.todos.test.ts` if practical). Cover:
  bills+cards+AR/AP interleave by date; income rows carry `+`; total 待付 sums
  only negatives.
- Model any new test on an existing route-level test, e.g.
  `src/routes/transactionsSummary.test.ts`.
- Manual: load demo data, verify against the design artboard `ov-a` that the
  first screen matches (net worth + sparkline + 4 pulse + 待辦 + 今日漲跌).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0 (tsc + vite build, no type errors)
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "cardVisible(\"market\")" src/routes/DashboardRoute.tsx` → no matches (FX card removed)
- [ ] `grep -n "近期帳單\|信用卡繳款提醒\|應收 / 應付未結清" src/routes/DashboardRoute.tsx` → no matches (merged into 待辦)
- [ ] `grep -n "buildNetWorthTrend\|PortfolioStrip" src/routes/DashboardRoute.tsx` → still present (engine preserved)
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `DashboardRoute.tsx` has drifted so the line ranges in "Current state" no
  longer match (compare excerpts first).
- Computing 投資今日 cleanly forces an edit to `domain/portfolioAnalytics.ts`
  (out of scope) — see Step 4 escape hatch.
- Faithfully implementing Direction A would require deleting the trend engine,
  the period control, `PortfolioStrip`, or the 北極星指標 picker — the plan
  requires demoting, not deleting.
- Any displayed number changes vs. the current dashboard (this must be
  layout-only).
- A verification fails twice after a reasonable fix.

## Maintenance notes

- The 版面 (`DASHBOARD_CARDS` + `dashboardHiddenCards`) mechanism is now the only
  way to restore 資產配置 / 目標 / 最近交易 / 淨值趨勢 / 30 年預測. Keep those
  card bodies intact even though they're default-hidden.
- The 待辦 merge assumes the three source memos (`upcoming`, `creditReminders`,
  `settlements`) keep their shapes. If a new to-do source is added later, extend
  `TODO_META` + the row builder, not a new card.
- Reviewer should scrutinize: (a) no number changed vs. main (diff the values,
  not just the layout); (b) links in 待辦 still route correctly; (c) the
  uiPreferences migration doesn't clobber a user's existing 版面 choices.
- Deferred: per-row NT$ impact in 今日漲跌 and the 大盤 day-benchmark in 投資今日
  depend on the Step 4 per-ticker impact; ship without them if Step 4 hits its
  escape hatch.
