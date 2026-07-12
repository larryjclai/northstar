# Plan 165: Investments 持倉 tab — slim 5-column table with expandable rows, summary strip, distribution bar

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report — do not improvise. When done,
> update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9441c152..HEAD -- src/routes/InvestmentsRoute.tsx`
> If it changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (sibling to 164/166/167)
- **Category**: direction (design implementation)
- **Planned at**: commit `9441c152`, 2026-07-12
- **Source design**: project `a2b50679-620a-465b-80c5-ef0ca5574bce`,
  `Overview + Invest Redesign.html` → `NSInvHoldingsRedesign` in
  `northstar-invest-redesign.jsx`.

## Why this matters

The 持倉 tab stacks four large KPI cards, a donut allocation card, and a wide
holdings table with up to 5 optional columns. The redesign layers information:
the table shows only "認得出它 + 今天 + 值多少 + 賺賠" (5 columns — 代號/名稱,
今日, 現價, 市值, 未實現損益) and pushes 均價/股數/券商/成本基礎/FIFO/股利 into a
per-row expansion opened on click. The 4 KPI cards collapse to one summary strip,
and the donut becomes a thin stacked distribution bar (saves ~360px of height).
This makes the holdings list scannable at a glance while keeping the detail one
click away — and keeps the existing 「欄位」 toggle for users who want everything
flattened.

**Layout only. Do not change valuations, P/L, or any computed figure** — reuse
what `InvestmentsRoute`/`HoldingsTab` already compute (`AGENTS.md` invariant #1).

## Current state

- `src/routes/InvestmentsRoute.tsx` (1997 lines). Relevant regions:
  - Portfolio-tab render, lines 451-498: four KPI `CossCard`s
    (`目前市值 / 未實現損益 / 今年已實現 / 今年股利`, lines 457-474), then
    `<HoldingsAllocation/>` (476-482), then `<HoldingsTab/>` (484-496).
  - `回補分類` button in the header, lines 414-419 (only shown on the portfolio
    tab). The redesign demotes this into a 「⋯」 overflow menu.
  - `HoldingsAllocation` helper (donut), lines 955-1016. Builds `data` =
    top-6 holdings by value + 其他, renders a recharts donut + a legend list.
  - `HoldingsTab` component starts line 1028; column-toggle state
    (`holdingsColumns`, `HOLDINGS_COLUMN_OPTIONS` at 1020-1026), filters
    (`filterAccount`, `filterSector`, `searchTerm`, lines 1063-1065), and the
    table render further down (read lines 1074-1400 before editing — the grid
    header + rows live there).
- Values already available to `HoldingsTab` via the `positions: HoldingPosition[]`
  prop and `assetsById`, `accountMap`, `toPrimary`, `manualPriceSnapshots`. Each
  `HoldingPosition` carries ticker, quantity, currency, marketValue, costBasis,
  P/L etc. (grep `interface HoldingPosition` in `src/domain/`).
- **Day-change per holding ("今日" column)**: the app computes per-ticker day
  change via `dayChangeMovers` in `src/domain/portfolioAnalytics.ts` (used by the
  dashboard). There is **no per-row day-change in `HoldingsTab` today** — you must
  compute a `Map<ticker, changePercent>` from `dailyPrices` + `quotes` (see
  Step 3). Reference is the prior recorded daily close, never
  `quote.previousClose`.

### Data-availability constraint (read before Step 3)

`StoredMarketQuote`/`MarketQuote` = `{ symbol, price, currency }` (+ marketTime).
`DailyPrice` = `{ ticker, date, close, currency, ... }`. There is **no stored
open / high / low / previousClose field.** The design's row-expansion "今日影響"
is derivable (`qty × (current − priorClose) × fx`), but do not invent open/range
data anywhere — only day %, current price, market value, and cost-derived figures
are real.

### Design → app component mapping

Same mapping as plan 164 (`.ns-card`→`<Card>`/`CossCard`, `.ns-btn`→`<Button>`,
`NSIcon`→phosphor icons already imported: `Plus`, `ArrowsClockwise`,
`MagnifyingGlass`/`CaretRight`/`CaretDown`/`DotsThree` — import any missing from
`@phosphor-icons/react`). Market P/L colours use `var(--ns-gain)`/`var(--ns-loss)`
(this file's convention). Follow the existing eyebrow/number idioms in the file.

## Commands you will need

| Purpose   | Command             | Expected            |
|-----------|---------------------|---------------------|
| Typecheck | `npx tsc --noEmit`  | exit 0              |
| Full build| `npm run build`     | exit 0              |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0              |
| Preview   | `npm run dev` → 投資 → 持倉 | table renders |

## Scope

**In scope**:
- `src/routes/InvestmentsRoute.tsx` — the portfolio-tab KPI block, the
  `HoldingsAllocation` helper, and the `HoldingsTab` table.
- `src/styles/globals.css` — only for a genuinely reused new `ns-*` class.

**Out of scope**:
- `domain/` valuation/day-change logic (compute day% in-route from existing
  helpers; if that forces a domain edit, see Step 3 escape hatch).
- `TransactionsRoute`, `RecurringInvestmentsTab`, `InvestmentsAnalyticsTab`
  (analytics = plan 167), `HoldingDetailRoute` (plan 166).
- The 「欄位」 column-toggle feature — keep it working for the flattened view.

## Git workflow

- Branch: `feat/ai-holdings-slim-table`
- Commit per step, conventional-commit style, e.g.
  `feat(investments): collapse holdings KPI cards into one summary strip`.
- Do NOT push/PR unless asked.

## Steps

### Step 1: KPI cards → one summary strip

Replace the four `CossCard`s (lines 457-474) with a single `<CossCard>` laid out
as a 4-column grid, each column separated by
`borderLeft: "1px solid var(--ns-border)"`, showing the same four metrics
(目前市值 / 未實現損益 / 今年已實現 / 今年股利) with the same values
(`totalValue`, `totalPnL`+`returnPct`, `realizedYTD`, `dividendsYTD`). Keep the
exact-value tooltips (`title={exact}`) and the gain/loss colouring on 未實現損益 /
今年已實現. Model the compact stat block on the design's `NSRdStat` (label above,
number below) but with this file's number idiom.

**Verify**: `npx tsc --noEmit` → 0. `npm run dev` → one strip replaces four cards.

### Step 2: Donut → thin distribution bar

Rewrite `HoldingsAllocation` (lines 955-1016) to render a single **stacked thin
bar** instead of a recharts donut. Keep the existing `data` computation (top-6 +
其他). Render:
- a `height: 10, borderRadius: 99, overflow: hidden, display: flex, gap: 2` track,
  one segment per datum with `width: d.pct + "%"` and
  `background: ALLOCATION_COLORS[i % ...]` (reuse the existing palette const),
  each segment `title={d.name}`.
- below it, a wrapped legend row: for each datum a small square swatch + name +
  `d.pct.toFixed(1)%` in muted mono (reuse the existing legend markup, lines
  1004-1012, minus the donut).

Drop the recharts `PieChart`/`Pie`/`Cell`/`Tooltip` usage from this helper (leave
the imports if still used elsewhere in the file — check with grep before removing).

**Verify**: `npx tsc --noEmit` → 0. Dev → allocation renders as a thin colour bar
+ inline legend; the card is much shorter.

### Step 3: Compute a per-ticker day-change map for the 今日 column

In `HoldingsTab`, add a `useMemo` that builds `Map<upperTicker, number>` of day
change %, using `dailyPrices`(you'll need to thread `dailyPrices` + `quotes` into
`HoldingsTab` as new props from the parent — they exist in `InvestmentsRoute` as
`dailyPriceRows`/`quoteRows`) with the **same reference rule as
`dayChangeMovers`**: current = live quote price when its `marketTime` is newer
than the last close, else the last close; reference = the prior recorded daily
close. Prefer calling `dayChangeMovers(...)` directly (it already returns
`{ ticker, changePercent }[]`) and reshaping to a map, passing the held tickers —
that avoids duplicating the logic.

**Escape hatch**: if wiring `dayChangeMovers` here needs a new export or a
signature change in `domain/portfolioAnalytics.ts`, STOP and report — propose a
tiny follow-up to expose the per-ticker map, rather than hand-rolling valuation.

**Verify**: `npm test` → green. Dev → each holding row shows today's %.

### Step 4: Slim the table to 5 columns + expandable rows

Restructure the `HoldingsTab` table (in the range ~1074-1400 — read it first):

1. **Default grid** = 6 tracks: `2.2fr 1fr 1fr 1.2fr 1.3fr 40px` →
   `代號/名稱` (logo + ticker + name), `今日` (day %, right, gain/loss colour),
   `現價`, `市值`, `未實現損益` (amount · pct, gain/loss), and a chevron cell.
   Keep the column header row in mono-uppercase, matching the design artboard.
2. **Row click toggles an expansion.** Track `expandedTicker: string | null` in
   component state. The chevron rotates 90° when open
   (`transform: rotate(90deg)`, `transition: transform 0.15s`). Clicking a row
   toggles; clicking again collapses. Do NOT navigate on row click — keep an
   explicit 「查看詳情 →」 button inside the expansion for navigation to
   `/holdings/$ticker` (the existing detail route).
3. **Expansion panel** (rendered as a `React.Fragment` sibling below the open
   row, spanning full width, `background: var(--ns-bg-hover)`): a mini sparkline
   of recent closes (build from `dailyPrices` for that ticker; reuse a small
   recharts `AreaChart` like the dashboard's), plus a grid of the pushed-down
   stats — **股數, 均價, 成本基礎, 券商, 今日影響, 股利 YTD, 持倉天數**, and (if
   cheaply available) FIFO 批次 count. Pull each from the position/asset/records
   already available (`positions`, `assetsById`, `accountMap`,
   `manualPriceSnapshots`); 今日影響 = `qty × (current − priorClose) × fx` from
   Step 3's data. Two action buttons: `新增交易` (primary) and `查看詳情 →`.
4. **Keep the 「欄位」 toggle** (`HOLDINGS_COLUMN_OPTIONS`, `holdingsColumns`,
   `toggleCol`): when the user enables optional columns, append them to the grid
   as today (the flattened power-user view). The 5-column layout is the *default*
   collapsed state; optional columns extend it.
5. Keep the search input, account filter, and sector filter in the table header
   (lines ~near the top of the render); add the 券商/產業/欄位 controls per the
   design's toolbar. Move `回補分類` (from the page header, lines 414-419) into a
   「⋯」 (`DotsThree`) overflow `Popover`/menu in the table or page header.

**Verify**: `npx tsc --noEmit` → 0. Dev → default table is 5 columns; clicking a
row expands an inline detail panel; the 「欄位」 toggle still adds columns; 回補分類
is reachable from a ⋯ menu.

### Step 5: Accessibility + keyboard

Make each expandable row a real toggle: `role="button"`, `tabIndex={0}`,
`aria-expanded`, and Enter/Space handlers mirroring the click. The chevron is
decorative (`aria-hidden`).

**Verify**: keyboard-tab to a row, press Enter → it expands. `npm run lint` → 0.

## Test plan

- Numbers are unchanged → primary gates are `npm run build` + `npm test`.
- If you extract a pure helper for the day-change map or 今日影響, add a unit test
  next to `src/domain/portfolioAnalytics.test.ts`'s patterns covering: a ticker
  with a live quote newer than the last close; a ticker priced only from closes;
  a ticker missing a prior close (→ omitted / null).
- Manual: compare against design artboard `inv-holdings` — 5 columns, 0050.TW-style
  expansion, thin distribution bar, one summary strip.

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "innerRadius" src/routes/InvestmentsRoute.tsx` → the donut in
      `HoldingsAllocation` is gone (any remaining `innerRadius` is a different
      chart — confirm it is not the holdings allocation)
- [ ] Table default shows exactly the 5 columns + chevron; 「欄位」 toggle still works
- [ ] `回補分類` still reachable (now via ⋯ menu)
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `InvestmentsRoute.tsx` drifted so the cited line ranges don't match.
- Per-ticker day change can't be computed without editing `domain/` (Step 3
  escape hatch).
- Any displayed valuation/P&L changes vs. current (must be layout-only).
- A verification fails twice after a reasonable fix.

## Maintenance notes

- The expansion re-uses data already loaded for the page — no new queries. If a
  new per-holding datum is wanted later, add it to the expansion grid, not a new
  column (keep the collapsed table at 5 columns).
- The 「今日」 column and 今日影響 share Step 3's day-change source; if
  `dayChangeMovers` changes, both follow.
- Reviewer should check: collapsed table matches design `inv-holdings`; no number
  drift; ⋯ menu discoverability for 回補分類; keyboard toggle works.
- Deferred: FIFO 批次 count in the expansion is "if cheaply available" — omit if
  it needs a new `calculateFifo` call per row that hurts render perf.
