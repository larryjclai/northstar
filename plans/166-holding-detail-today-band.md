# Plan 166: Holding Detail — add a「今日」band at the top (data-adapted to stored close/quote only)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report — do not improvise. When done,
> update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9441c152..HEAD -- src/routes/HoldingDetailRoute.tsx`
> If it changed since this plan was written, compare the "Current state"
> excerpts to the live code first; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (sibling to 164/165/167)
- **Category**: direction (design implementation)
- **Planned at**: commit `9441c152`, 2026-07-12
- **Source design**: project `a2b50679-620a-465b-80c5-ef0ca5574bce`,
  `Overview + Invest Redesign.html` → `NSInvDetailToday` in
  `northstar-invest-redesign.jsx`.

## Why this matters

When a user taps a mover on the Overview 今日漲跌 (or a holding row), they arrive
at Holding Detail wanting the same thing they clicked for: *what happened today
and what it did to my money*. Today the detail page opens on a total-return chart
and cost-basis stats — the "today" story is missing. This plan adds a compact
「今日」band at the very top: day change % + points, current price, prior close,
and a plain-language impact line ("今天為你的部位帶來 +NT$958"). When there's no
market data to compute a day change, the whole band collapses (hidden) so it
never shows an empty shell.

**Reuse existing values; do not change any valuation or P/L math** (`AGENTS.md`
invariant #1).

## Current state

- `src/routes/HoldingDetailRoute.tsx` (658 lines). Relevant facts:
  - The component already computes, before the `return` (lines 230-260):
    `marketPrice` (`priced.value`), `marketValue`, `costBasis`,
    `unrealizedGain(Percent)`, `asset.totalQuantity`, `asset.currency`,
    `quote` (the live quote, may be undefined), `dividendYtd`, `holdingDays`.
  - `series` (line 122-128) = this ticker's daily closes for the selected range,
    sorted ascending: `{ date, price }[]` where `price` is the close.
  - The hero header is lines 271-305; the price+position grid begins line 383
    (`<div className="grid ... lg:grid-cols-[1fr_360px] mb-5">`). The new band goes
    **between the hero header (line 305) / custom-asset card (ends 380) and the
    price+position grid (line 383)**.
  - Market colours use `var(--ns-gain)`/`var(--ns-loss)` and `Badge variant="gain"|"loss"`
    (see lines 393-399). Match that.
  - `AssetLogo`, `Badge`, `Card`, `Button` are imported; `ArrowUp` from phosphor
    is imported. Add `Sparkle` (or similar) from `@phosphor-icons/react` if you
    use the design's ✦ glyph on the impact line — optional.

### ⚠ Data-availability constraint (this reshapes the design)

The design band shows five cells: 今日%/▲點, 現價, 開盤, 昨收, 今日區間. But the
app stores **only**:
- `MarketQuote` = `{ symbol, price, currency }` (+ `marketTime`, `updatedAt`).
- `DailyPrice` = `{ ticker, date, close, currency, ... }`.

There is **NO stored open, high, low, or previous-close field.** Therefore:
- **Derivable (build these):** 今日 change % + points, 現價 (current), 昨收
  (prior recorded close = second-to-last of `series`), 今日影響 (impact =
  `quantity × (current − priorClose) × fxToPrimary`).
- **NOT derivable (omit — do NOT fabricate):** 開盤 (open) and 今日區間 (high–low).

So the band ships with **three data cells** (今日%/▲, 現價, 昨收) + the impact
line, not five. Do not invent open/range values. If OHLC is added to the data
layer later, the two extra cells can be filled then (see Maintenance notes).

## Commands you will need

| Purpose   | Command             | Expected            |
|-----------|---------------------|---------------------|
| Typecheck | `npx tsc --noEmit`  | exit 0              |
| Full build| `npm run build`     | exit 0              |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0              |
| Preview   | `npm run dev` → open a holding detail (e.g. /holdings/2330.TW with demo data) | band renders |

## Scope

**In scope**:
- `src/routes/HoldingDetailRoute.tsx` — add the day-change computation + the
  「今日」band JSX; add a `TodayBand` helper (or inline block).

**Out of scope**:
- Adding OHLC to the data/market layer (`data/`, `domain/`, `features/market-data/`).
- The rest of the detail page (chart, FIFO lots, transactions) — unchanged.
- `DashboardRoute`, `InvestmentsRoute`, `InvestmentsAnalyticsTab`.

## Git workflow

- Branch: `feat/ai-holding-detail-today-band`
- Commit style: `feat(holding-detail): add a collapsible 今日 band above the chart`.
- Do NOT push/PR unless asked.

## Steps

### Step 1: Compute today's change for this holding

Before the `return` (after line ~260, alongside the other derived values), add:

```tsx
// Today's move: current market price vs the prior *recorded* daily close.
// Reference is the second-to-last close in `series` (never quote.previousClose,
// which the app doesn't store and which is unreliable post-spinoff).
const priorClose = series.length >= 2 ? series[series.length - 1].price : null;
// series' last point is today's/most-recent close; the current price is
// marketPrice (quote → latest close). Use the close *before* the latest as the
// reference so an intraday quote compares against the prior session.
const latestClose = series.length >= 1 ? series[series.length - 1].price : null;
const refClose = series.length >= 2 ? series[series.length - 2].price : null;
const currentForDay = quote?.price ?? latestClose;
const dayRef = refClose;
const dayChangeAbs = currentForDay != null && dayRef != null ? currentForDay - dayRef : null;
const dayChangePct = dayChangeAbs != null && dayRef ? (dayChangeAbs / dayRef) * 100 : null;
const dayImpact = dayChangeAbs != null ? dayChangeAbs * asset.totalQuantity : null; // in asset.currency
```

**Note on fx**: `dayImpact` above is in `asset.currency`. The design shows it in
NT$. This route does not currently thread a primary-currency converter into the
detail page. If `asset.currency === primaryCurrency` (common case: TWD holdings)
show NT$ directly. If the currency differs and no converter is in scope here,
show the impact in the asset's own currency with its symbol (e.g. `+540 USD`) and
skip the "× 匯率" clause — do NOT hardcode a rate. (Threading a converter is a
possible follow-up; keep this plan scoped to the band.)

Verify the reference logic against `dayChangeMovers`
(`src/domain/portfolioAnalytics.ts:1099`) so the band's % matches the Overview
movers' % for the same ticker.

**Verify**: `npx tsc --noEmit` → 0.

### Step 2: Render the「今日」band (collapses when no data)

Insert between the hero/custom-asset block and the price+position grid
(after line 380, before line 383). Gate the entire band on
`dayChangePct != null` — when null, render nothing (design note: "沒有行情資料時
整條 band 摺疊隱藏").

Band structure (translate the design's `NSInvDetailToday` band to real
components, market colours `var(--ns-gain)`/`var(--ns-loss)`):

- A `<Card>` with `padding: 0, overflow: hidden`, a subtle positive/negative
  border tint (`borderColor: color-mix(in srgb, var(--ns-gain) 32%, var(--ns-border))`
  when up, loss when down).
- A grid row of **three** cells (not five): 
  1. **今日 · <marketTime> 更新** eyebrow + big `dayChangePct` (`+2.14%`) +
     `▲/▼ <|dayChangeAbs|>` in the same colour. Left cell gets a faint tinted
     background (`color-mix(in srgb, var(--ns-gain) 8%, transparent)`).
  2. **現價** = `formatPrice(marketPrice)` + ` ${asset.currency}`.
  3. **昨收** = `formatPrice(dayRef)`.
  Separate cells with `borderRight: 1px solid var(--ns-border)`.
- A footer strip (`borderTop`, `background: var(--ns-bg-elev)`): impact sentence —
  「今天為你的部位帶來 <span pos/neg>{sign}{impact}{ccy}</span>（{qty} 股 ×
  {▲pts}{... × 匯率 clause only if same-currency NT$}）」. Optionally a right-aligned
  「今日投組貢獻排名」 chip **only if** you can cheaply rank this ticker among held
  positions by |impact| — if not, omit the ranking chip (do not fake it).

Use `formatPrice`/`formatNumber` (imported) for numbers.

**Verify**: `npm run dev` with demo data → open a holding with price history; the
今日 band shows above the chart with matching colour. Open a custom/manual asset
with no daily closes → the band is absent (not an empty box).

### Step 3: Confirm the band % matches the Overview mover %

Load demo data, note a ticker's % on the Overview 今日漲跌, open that holding —
the band's 今日% must match (same reference rule). If they differ, your reference
selection in Step 1 is off — align it to `dayChangeMovers`.

**Verify**: manual cross-check passes; `npm test` → green.

## Test plan

- If you extract the day-change computation into a small pure helper (e.g.
  `computeDayChange(series, quotePrice, quantity)` local to the file), add a
  co-located test `src/routes/holdingDetailToday.test.ts` modeled on
  `src/routes/transactionsSummary.test.ts`, covering:
  - live quote newer than last close → change vs. prior close, correct sign;
  - only closes available (no quote) → last close vs. prior close;
  - `series.length < 2` → returns null (band hidden);
  - impact = qty × abs change, sign preserved.
- Otherwise the gate is `npm run build` + `npm test` + the manual cross-check in
  Step 3.

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] Band appears above the price chart when day change is computable; is fully
      absent when `series.length < 2` (no fabricated open/range cells anywhere —
      `grep -n "開盤\|今日區間" src/routes/HoldingDetailRoute.tsx` → no matches)
- [ ] Band % matches the Overview mover % for the same ticker (manual)
- [ ] Only `HoldingDetailRoute.tsx` (+ optional test) modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `HoldingDetailRoute.tsx` drifted so the cited lines/values don't match.
- You find yourself needing to add OHLC to the data layer to fill 開盤/今日區間 —
  those cells are intentionally omitted; do not expand scope.
- The band % can't be made to match `dayChangeMovers` without editing `domain/`
  — STOP and report.
- Any existing displayed number changes.

## Maintenance notes

- The band is intentionally 3 cells because the data layer stores only daily
  `close` + a live `price`. If open/high/low are added later (e.g. a market-data
  provider that returns OHLC into `DailyPrice`), fill the 開盤 and 今日區間 cells
  then — the design's five-cell layout is the target once data exists.
- Cross-holding day-change lives in `dayChangeMovers`; keep the band's reference
  rule in lock-step with it so Overview and detail never disagree.
- If plan 165's per-ticker day-change map or a primary-currency converter lands
  in this route, wire the band's impact through it (NT$ with the 匯率 clause).
- Reviewer should check: band hides cleanly with no data; % matches Overview;
  no invented open/range; no valuation drift.
