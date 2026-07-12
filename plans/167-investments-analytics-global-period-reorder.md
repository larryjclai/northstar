# Plan 167: Investments 分析 tab — one global period control, 5-section reorder, remove the 365-day calendar heatmap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report — do not improvise. When done,
> update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9441c152..HEAD -- src/routes/InvestmentsAnalyticsTab.tsx`
> If it changed since this plan was written, compare the "Current state"
> excerpts to the live code first; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (sibling to 164/165/166)
- **Category**: direction (design implementation)
- **Planned at**: commit `9441c152`, 2026-07-12
- **Source design**: project `a2b50679-620a-465b-80c5-ef0ca5574bce`,
  `Overview + Invest Redesign.html` → `NSInvAnalyticsReorder` in
  `northstar-invest-redesign.jsx`.

## Why this matters

The 分析 tab answers five questions but scatters them: the period selector lives
inside the 報酬 section, 貢獻 is buried under 報酬, a 365-day calendar heatmap asks
the user to hunt for drawdowns in a grid, and each block implies its own time
basis. The redesign gives the page **one global period control at the top**
(1W/1M/3M/6M/1Y/All + Custom), reorders into five clearly numbered sections that
each answer one thing — **01 報酬 → 02 貢獻 → 03 風險 → 04 股利 → 05 集中度** —
tags each section with its time basis (跟隨期間 / 期間太短→近1年 / 固定TTM /
即時快照), and **removes the 365-day calendar heatmap** (drawdown windows are
stated directly in 最大回撤 instead).

**This is information architecture + a control move. Do NOT change the analytics
math** — `portfolioAnalytics` (TWR, XIRR, attribution, risk, dividends,
concentration) stays exactly as is; you are relocating existing sections and
consolidating the period state (`AGENTS.md` invariant #1, and see memory:
"correctness-first directive" for analytics).

## Current state

- `src/routes/InvestmentsAnalyticsTab.tsx` (1789 lines). Structure:
  - `AnalyticsPeriod` type + `PERIODS` = `["1M","3M","6M","YTD","1Y","5Y","All"]`
    (lines 138-139); `periodStart()` (151-157).
  - `const [period, setPeriod] = useState<AnalyticsPeriod>("1Y")` (line 233) —
    the single period state. **It already drives most sections** (`periodSummary`,
    `core`, `perf`, attribution). Today the `<SegmentedControl>` that sets it is
    rendered *inside* the 報酬 hero (line 599).
  - Section layout (all in one big `return`):
    - `報酬 RETURNS` `<section id="an-returns">` — line 544. Contains the period
      selector (599), period-return hero, TWR/XIRR measures (~615-665), the
      vs-benchmark curve (~684-760), and **attribution / 貢獻** (`AttributionRow`,
      ~766-816).
    - `風險 RISK` `<section id="an-risk">` — line 819. Contains risk KPIs,
      `<RollingVolatilityCard>` (line 882), and the **365-day calendar heatmap**
      (lines 887-899: `NSCalendarHeatmap` + `calendarData`).
    - `配置 ALLOCATION` `<section id="an-allocation">` — line 903. Contains a
      holdings heatmap (~908) and **集中度 / CONCENTRATION** (~1004-1030).
    - `股利 INCOME` `<section id="an-income">` — line 1033 (only when
      `dividends.total > 0`).
  - Sticky section-nav anchors built at lines 441-448
    (`{id:"an-returns",...}` etc.).
  - The calendar heatmap machinery: `calendarData` memo (lines 415-416),
    `buildCalendarData()` (line 1636), `NSCalendarHeatmap` component (line 1677+).
    These are what this plan **deletes**.
  - `SegmentedControl` is imported (line 19). `periodOptions` = `PERIODS.map(...)`
    (line 492).

### Design → app mapping

Same as siblings. The design's per-section scope tag `NSAnScopeTag` → a small
inline pill: `<span>` with mono text, coloured border via `color-mix`, right-
aligned in each section header. The design's numbered section head `secHead(no,
title, q, tag)` → a small `SectionHeader` helper you add (number in accent, title
in display font, one-line question in muted, scope tag pushed right). Follow the
file's existing `NSAnHead`/eyebrow idioms.

## Commands you will need

| Purpose   | Command             | Expected            |
|-----------|---------------------|---------------------|
| Typecheck | `npx tsc --noEmit`  | exit 0              |
| Full build| `npm run build`     | exit 0              |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0              |
| Preview   | `npm run dev` → 投資 → 分析 (needs backfilled daily prices; use demo data) | renders |

## Scope

**In scope**:
- `src/routes/InvestmentsAnalyticsTab.tsx` — move the period control to a global
  header, reorder sections, add section headers + scope tags, delete the calendar
  heatmap.

**Out of scope**:
- `src/domain/portfolioAnalytics.ts` and all analytics math — **do not touch**.
  You are moving JSX and consolidating one existing state variable.
- The methodology caveat (lines 535-541) — keep it (it's a correctness
  disclosure).
- Other routes.

## Git workflow

- Branch: `feat/ai-analytics-global-period-reorder`
- Commit per step, e.g. `refactor(analytics): hoist the period control to a page-global header`.
- Do NOT push/PR unless asked.

## Steps

### Step 1: Add a `Custom` period + hoist the control to a page-global header

1. Extend the period model to support a custom date range. Simplest approach that
   doesn't disturb the math: keep `period: AnalyticsPeriod` as-is and add
   `const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null)`.
   When `customRange` is set, compute the section start from `customRange.start`
   instead of `periodStart(period, end)`. Thread this through the memos that call
   `periodStart(period, end)` (`periodSummary`, `core`, `perf`, attribution) by
   introducing a single derived `const activeStart = customRange?.start ?? periodStart(period, end)`
   and using `activeStart` in those memos. **Do not change what the memos compute
   — only where the start date comes from.** If wiring `activeStart` cleanly into
   a memo proves invasive, keep Custom as a visual affordance that maps to the
   nearest preset and note the limitation (do not fake a range the math ignores).
2. Render the control **once, at the top of the tab** (just under the tab
   header / above the methodology caveat), as a `<SegmentedControl>` over
   `["1W","1M","3M","6M","1Y","All"]` plus a `Custom` toggle that reveals two
   date inputs. Remove the `<SegmentedControl>` from inside the 報酬 hero
   (line 599). Show the resolved label (e.g. `期間：近 6 個月` or the custom
   range) at the right.
   - Note the design's preset list is `1W/1M/3M/6M/1Y/All` (adds 1W, drops YTD/5Y).
     Reconcile with the existing `PERIODS`: you may keep YTD/5Y in the enum for
     the math but present the design's six buttons — or add `1W` to `PERIODS` and
     `periodStart` (`daysAgo(7, end)`). Adding `1W` requires a one-line addition
     to the `days` map in `periodStart` (line 154-156). Keep it minimal.

**Verify**: `npx tsc --noEmit` → 0. Dev → one period control at the top drives
the whole page; the in-section selector is gone.

### Step 2: Add `SectionHeader` + `ScopeTag` helpers

Add two small presentational helpers:

```tsx
function ScopeTag({ follow, label }: { follow?: boolean; label: string }) {
  const c = follow ? "var(--ns-accent)" : "var(--ns-fg-dim)";
  return (
    <span className="mono" style={{ marginLeft: "auto", fontSize: 10, letterSpacing: "0.06em",
      color: c, border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`,
      borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>{label}</span>
  );
}

function SectionHeader({ no, title, question, tag }: { no: string; title: string; question: string; tag: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--ns-accent)", letterSpacing: "0.1em" }}>{no}</span>
      <span style={{ fontFamily: "var(--ns-font-display)", fontSize: 18, fontWeight: 600 }}>{title}</span>
      <span className="dim" style={{ fontSize: 12 }}>{question}</span>
      {tag}
    </div>
  );
}
```

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: Reorder to 5 numbered sections and tag each

Rearrange the existing section JSX (move whole blocks; do not rewrite their
inner charts/stats) into this order, each with a `SectionHeader` + `ScopeTag`:

1. **01 · 報酬** — 「我有沒有贏過大盤？」 — tag `跟隨期間` (`follow`). Keep the
   period-return hero + TWR/XIRR measures + vs-benchmark curve currently in the
   報酬 section (minus the moved period selector).
2. **02 · 貢獻** — 「報酬主要從哪裡來？」 — tag `跟隨期間`. **Extract** the
   attribution / `AttributionRow` block currently nested at the end of 報酬
   (~766-816) into its own top-level section here.
3. **03 · 風險** — 「波動與回撤在可接受範圍嗎？」 — tag: `follow` normally, but
   when the active period is very short (design uses ≤ ~1M), show
   `期間太短 → 以近 1 年估算` (the risk stats already fall back to a longer window
   — see the existing risk memo; keep its behaviour, just label it). Keep the
   risk KPIs + `<RollingVolatilityCard>`. **Delete the calendar heatmap here**
   (Step 4).
4. **04 · 股利** — 「被動現金流累積得如何？」 — tag `固定 TTM · 不隨期間` (not
   `follow`). Keep the existing dividends block (still gated on
   `dividends.total > 0`).
5. **05 · 集中度** — 「配置是否失衡？」 — tag `即時快照 · 不隨期間`. **Extract**
   the concentration block from the current 配置 section (~1004-1030) into its own
   section. The holdings-heatmap portion of the old 配置 section can be folded
   into 集中度 or dropped if redundant with the concentration bars — prefer
   keeping concentration's bars (design `05 集中度` shows horizontal bars with a
   ⚠ on 前三大持倉).

Update the sticky section-nav anchors (lines 441-448) to the new ids/order:
`报酬 / 貢獻 / 風險 / 股利 / 集中度` (keep 股利 conditional on
`dividends.total > 0`). Give each `<section>` a matching `id`
(`an-returns`, `an-contrib`, `an-risk`, `an-income`, `an-concentration`).

**Verify**: `npx tsc --noEmit` → 0. Dev → sections appear in the new order, each
with a number, question, and a scope tag; changing the global period updates 01/02
(and 03 unless short), while 04/05 stay put.

### Step 4: Remove the 365-day calendar heatmap

Delete:
- the heatmap render block in the 風險 section (lines 887-899),
- the `calendarData` memo (lines 415-416),
- `buildCalendarData()` (from line 1636) and the `NSCalendarHeatmap` component
  (from line 1677) **only if they have no other references** — grep first.

Add one muted line in 03 風險 near 最大回撤 stating the drawdown window inline
(the design copy: 「回撤區間直接標在『最大回撤』裡，不再讓使用者自己從格子裡找。」)
— the 最大回撤 stat already knows its peak/trough dates (from the risk memo); show
them as its `sub`.

**Verify**:
- `grep -n "NSCalendarHeatmap\|buildCalendarData\|calendarData" src/routes/InvestmentsAnalyticsTab.tsx`
  → no matches.
- `npx tsc --noEmit` → 0 (no unused-symbol / missing-reference errors).

### Step 5: Clean up unused imports/symbols

Remove any imports only used by the deleted heatmap (e.g. a heatmap colour scale
helper). `npm run lint` will flag unused ones.

**Verify**: `npm run lint` → exit 0. `npm run build` → exit 0.

## Test plan

- The analytics math is untouched, so gates are `npm run build` + `npm test`
  (existing analytics tests, e.g. `src/domain/portfolioAnalytics.test.ts`, must
  stay green — if any fail, you changed math and must revert that part).
- If you add `1W`/Custom to `periodStart`, add a case to any existing
  `periodStart`/period test (grep for a test importing `periodStart`); cover:
  `1W` → 7-days-ago start; a custom range → `activeStart === customRange.start`.
- Manual: with demo data + backfilled prices, verify against design artboard
  `inv-analytics`: one top period control; sections numbered 01→05; scope tags
  present; no calendar grid anywhere.

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0 (analytics math tests unchanged and green)
- [ ] `npm run lint` exits 0
- [ ] `grep -n "NSCalendarHeatmap\|buildCalendarData" src/routes/InvestmentsAnalyticsTab.tsx` → no matches
- [ ] Exactly one period control renders on the tab (the in-section one is gone)
- [ ] Sections render in order 01 報酬 / 02 貢獻 / 03 風險 / 04 股利 / 05 集中度, each with a scope tag
- [ ] Only `InvestmentsAnalyticsTab.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `InvestmentsAnalyticsTab.tsx` drifted so the cited line ranges/section ids
  don't match — reconcile before editing.
- Threading `activeStart`/Custom into a memo would require changing a
  `portfolioAnalytics` function signature (out of scope) — STOP; ship Custom as
  a preset-mapped affordance and report.
- Any analytics test starts failing (you changed math — revert and reconsider).
- Deleting `buildCalendarData`/`NSCalendarHeatmap` reveals another live reference
  — STOP and report rather than force it.

## Maintenance notes

- The whole page now shares one period source (`period` + `customRange` →
  `activeStart`). Any new time-based section must consume `activeStart`, not add
  its own selector; any snapshot/TTM section must be tagged `不隨期間`.
- The calendar heatmap is gone by design — do not reintroduce it; drawdown info
  belongs in 03 風險's 最大回撤 stat.
- Reviewer should check: analytics numbers identical to main for the same period;
  the scope tags truthfully describe each section's time basis (esp. 03 風險's
  short-period fallback and 04/05 being 不隨期間); no orphaned heatmap code.
- Deferred: a true custom-range that the math honours end-to-end may need a small
  `portfolioAnalytics` change — track as a follow-up if Step 1's escape hatch is hit.
