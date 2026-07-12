# Plan 169: 記帳 近期動態 + 固定收支 redesign — right-column upgrade + load-more (A) and month-collapse for long ranges (D)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> "STOP conditions" item occurs, stop and report — do not improvise. When done,
> update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat bdfa0c09..HEAD -- src/routes/CashFlowRoute.tsx`
> If it changed since this plan was written, compare the "Current state" excerpts
> to the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (sibling to 168; both read the `dateScope`/`dateRange` state)
- **Category**: direction (design implementation)
- **Planned at**: commit `bdfa0c09`, 2026-07-12
- **Source design**: project `a2b50679-620a-465b-80c5-ef0ca5574bce`,
  `記帳交易 Redesign.html` → `NSLgBottomA` (variant A) + `NSLgBottomD` (variant D)
  in `northstar-ledger-redesign.jsx`. The operator chose **A + D**.

## Why this matters

Cash Flow's bottom half has two problems. (1) The right 320px column holds only
「近 2 週固定收支」 — often a single upcoming item, so a whole column sits empty.
(2) The transaction list is page-based (50/page, prev/next) and always a flat day
list, which is heavy for long ranges. Variant **A** makes the right column earn
its width — 固定收支 extended to 30 days with a monthly-total footer, plus the
「未結清」 banner relocated into it, the column made sticky — and turns the list
into a recent-3-days default with a 「顯示更早」 load-more (+30). Variant **D**
adds month-collapse: for ranges longer than ~3 months (YTD / 近12個月 / 全部) the
list groups by month (one row per month with 收入/支出/淨 subtotals, click to
expand that month's days), so a year of data stays scannable.

**Layout only — no change to what a transaction nets or how the range resolves.**
Reuse `dayGroups`/`groupByDay`, `resolveDateScope`, `recurringRows`,
`buildOutstandingSettlements`, `settlements` untouched
(`AGENTS.md` invariant #1 discipline: same numbers).

## Current state

- `src/routes/CashFlowRoute.tsx` (2805 lines). The overview bottom section:
  - **List + right column layout, line 1178**:
    `<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">`
    — left `Card` = 近期動態 list; right = a flex column with only
    `<UpcomingPayments … />` (line 1250–1253).
  - **近期動態 list Card, lines 1180–1248**: header (title + `{displayRows.length}
    筆` + search input), then `dayGroups.map(...)` → each day: a day-header
    (`{g.date}` + `Net …`) then `g.rows.map(r => <LedgerRow …/>)`, then **page-based
    pagination** (lines 1239–1245: 上一頁 / `{page}/{totalPages}` / 下一頁).
  - **未結清 banner, lines 953–974**: a full-width `Card` at the top of the overview
    tab showing 應收/應付 totals; clicking opens the first item's detail. This moves
    into the right column (variant A).
- **Pagination + grouping state (lines 846–862)**:
  ```tsx
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const displayRows = useMemo(() => mergeTransferRows(activityRows, ledgerRows), …);
  const totalPages = Math.ceil(displayRows.length / pageSize);
  const paginatedRows = useMemo(() => displayRows.slice((page-1)*pageSize, page*pageSize), …);
  const dayGroups = useMemo(() => groupByDay(paginatedRows, toPrimary), …);
  ```
  `displayRows` is already sorted newest-first and reflects the active filters +
  range. `searchQuery` (line 164) filters within.
- `groupByDay` helper (**line 2680**): `(rows, toPrimary) => { date, rows, net }[]`,
  newest day first, `net` sums non-neutral rows' primary amounts. Mirror it for
  months (Step 4).
- `UpcomingPayments` component (**line 1712**): today→+14-day horizon, simple list
  of `recurringRows`, a 記入 button per row (`onPost`). No later section, no
  monthly total. Variant A upgrades it.
- `settlements` (line 867) = `buildOutstandingSettlements(...)` → `{ items,
  receivableTotal, receivableCount, payableTotal, payableCount }`.
- `dateScope`/`dateRange`: `dateRange = resolveDateScope(dateScope, timezone)`
  (line 209) → `{ preset, start, end, label }`. Use `dateScope.preset` to decide
  short-vs-long: `month` → day view; `ytd`/`last12m`/`all` → month view; `custom`
  → month view when `end - start > ~92 days`, else day view (Step 5).
- `LedgerRow` component renders each transaction row with edit/duplicate/delete/
  settle actions. Read it before changing row height / hover behavior.

### Design → app mapping

Canvas-only classes (`.ns-card`, `.ns-btn`, `NSIcon`, `LgDayHeader`,
`LgMonthHeader`, `LgRowNarrow/Wide`) map to `<Card>` / `<Button>` / phosphor icons
/ the existing `LedgerRow` and day-header markup. Market/flow colors: income
`var(--ns-pos)`, expense `var(--ns-neg)` (this file's convention). Reuse the
file's eyebrow/number idioms.

## Commands you will need

| Purpose   | Command            | Expected            |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Full build| `npm run build`    | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0              |
| Preview   | `npm run dev` → 記帳 (load demo data) | list + right column |

## Scope

**In scope**:
- `src/routes/CashFlowRoute.tsx` — the overview bottom section (list render, right
  column, `UpcomingPayments`, pagination→load-more, add `groupByMonth` + a
  month-collapsed list branch).
- `src/styles/globals.css` — only for a genuinely reused new `ns-*` class (e.g.
  sticky day-header, sticky right column).

**Out of scope**:
- `src/domain/*` — do not change `buildOutstandingSettlements`, `resolveDateScope`,
  or any finance/aggregation logic. Add `groupByMonth` **inside** `CashFlowRoute.tsx`
  next to `groupByDay` (keep it route-local, like `groupByDay`).
- The header/toolbar (period control, 篩選, chips) — that is **plan 168**.
- `RecurringRulesTab`, `CategoriesTab`, `MerchantsTab`, the entry drawer,
  `LedgerRow`'s edit/settle actions (you may adjust its hover CSS, not its logic).

## Git workflow

- Branch: `feat/ai-cashflow-recent-recurring`
- Commit per step; conventional-commit style, e.g.
  `feat(cash-flow): upgrade the recurring right column to 30 days + settlements`.
- Do NOT push/PR unless asked.

## Steps

### Step 1: Upgrade `UpcomingPayments` → 固定收支 · 30 天 (variant A)

Extend `UpcomingPayments` (line 1712): change the horizon from +14 to **+30**
days; split into (a) the within-30-days rows (each with the 記入 button, as today)
and (b) a **之後 (later)** section listing the next few active rules beyond 30 days
(design `lgUpcomingLater`: date + name + amount, dimmed, no 記入). Add a footer:
`每月固定 <−NT$X> · <N> 條規則` and a `管理 ›` link to the 週期規則 tab
(`setActiveTab("recurring")` — thread a callback prop). Compute the monthly total
by normalizing each active rule's amount to a monthly figure (yearly ÷ 12, etc. —
see `recurringFrequencyLabels`/`nextRecurringDate` usage in the file for the
frequency model; if a clean monthly normalization helper doesn't exist, sum the
monthly-frequency rules and annualize others ÷ 12, and keep it clearly a display
estimate). Title becomes `固定收支 · 30 天`.

**Verify**: `npx tsc --noEmit` → 0. `npm run dev` (demo data) → the right card
shows 30-day recurring, a 之後 section, and a monthly-total footer with 管理 ›.

### Step 2: Move 未結清 into the right column (variant A)

Remove the top-of-overview 未結清 banner (lines 953–974) and render an equivalent
**未結清 card** in the right column *below* 固定收支 (design `NSLgBottomA`): the
same `settlements` data (應收/應付 badges + totals), the caption
「結清後才計入收支」, and a per-item row that opens the detail on click (reuse the
existing `onClick → setDetailRow(first)` behavior, but per item). Only render the
card when `settlements.items.length > 0`.

**Verify**: the settlements banner no longer appears at the top; the same
应收/应付 numbers appear in the right column. `npx tsc --noEmit` → 0.

### Step 3: Make the right column sticky (variant A)

Wrap the right column (currently `<div className="flex flex-col gap-5">` at line
1251) so it is `position: sticky; top: 20px` on `lg` widths (design: right column
sticks while the list scrolls). Use a new `ns-*` class or a Tailwind
`lg:sticky lg:top-5 self-start` on the column. Keep it non-sticky on mobile
(single-column stack).

**Verify**: scrolling the list keeps the right column visible on desktop.

### Step 4: Replace page-based pagination with load-more + recent-3-days (variant A)

Replace the `page`/`paginatedRows`/`totalPages` mechanism (lines 846–861,
1239–1245) with a **count-based load-more**:
- Add `const [visibleCount, setVisibleCount] = useState(INITIAL)` where the
  default shows **the most recent 3 days** worth of rows *when no explicit range
  is narrowing the list* (design: 「未選期間時預設只顯示最近 3 天」). Simplest
  robust rule: default `visibleCount` = number of rows in the newest 3 day-groups
  of `displayRows` (compute once), and the 「顯示更早」 button does
  `setVisibleCount(c => c + 30)`.
- `visibleRows = displayRows.slice(0, visibleCount)`; `dayGroups =
  groupByDay(visibleRows, toPrimary)`.
- Replace the prev/next pagination block with a centered **「顯示更早的交易」**
  button (+ a caption 「每次多載 30 筆」), shown only while
  `visibleCount < displayRows.length`.
- Reset `visibleCount` to the default whenever the filters/range/search change
  (add to the relevant effect/dependency) so switching range doesn't strand a
  huge or tiny window.

**Verify**: the list starts at ~3 days; 「顯示更早」 loads more; no prev/next
pager remains. `npm run dev` cross-check the row counts are unchanged in total.

### Step 5: Sticky day headers + hover-only row actions (variant A polish)

Make the per-day group header (lines 1208–1219) `position: sticky; top: 0`
within the scrolling list (a new `ns-*` class). Reduce row height toward ~50px
and make `LedgerRow`'s action icons appear on hover only (adjust `LedgerRow`'s
container to reveal its action cluster on `:hover`/`:focus-within` via CSS — do
not remove the actions or change their handlers).

**Verify**: day headers stick while scrolling; action icons are hidden until a row
is hovered/focused. `npm run lint` → 0.

### Step 6: Month-collapse for long ranges (variant D)

Add a route-local `groupByMonth(rows, toPrimary)` next to `groupByDay` (line 2680)
returning `{ month, rows, count, income, expense, net }[]` newest-month-first,
where `income`/`expense` sum settled non-neutral primary amounts by sign and
`net = income − expense`.

Add a **long-range branch** to the list render: when
`isLongRange(dateScope, dateRange)` is true, render month-collapsed groups instead
of the day list:
- `isLongRange`: `dateScope.preset` is `ytd` / `last12m` / `all`, OR `custom` with
  `(end − start) > ~92 days`. (`month` is always short.)
- Each month = one clickable header row (design `LgMonthHeader`): a ▸/▾ chevron,
  `month`, `count 筆`, and right-aligned `收入 +X` / `支出 −Y` / `淨 ±Z`. Track
  `expandedMonths: Set<string>` in state; clicking toggles.
- When a month is expanded, render that month's `groupByDay(...)` day groups
  beneath it (indented, e.g. a left accent border), followed by a per-month
  「顯示其餘 N 筆」 if you cap the initially-rendered days.
- **Search auto-expands** months whose rows match `searchQuery` (when a query is
  active, expand every month that has a matching row).
- In long-range mode, load-more (Step 4) does not apply — all months render (each
  collapsed month is cheap; only expanded months mount their rows).

**Verify**: pick 近 12 個月 (or YTD) → the list becomes month rows with subtotals;
clicking a month expands its days; typing in search auto-expands matching months;
switching back to 本月 restores the flat day list with load-more.

## Test plan

- Numbers unchanged → gates are `npm run build` + `npm test`.
- Add a unit test for `groupByMonth` next to the pattern of any existing
  route-local helper test, OR (since `groupByDay`/`groupByMonth` are route-local)
  add a co-located `cashFlowGrouping.test.ts` if practical — cover: rows across
  two months group correctly; `income`/`expense`/`net` signs; neutral rows
  excluded from net; newest month first. Model on
  `src/routes/transactionsSummary.test.ts`.
- Manual: compare against design artboards `lg-bt-a` (right column + load-more)
  and `lg-bt-d` (month collapse, 2026-06 expanded).

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "上一頁\|下一頁" src/routes/CashFlowRoute.tsx` → gone from the list
      (replaced by 顯示更早 load-more)
- [ ] `grep -n "groupByMonth" src/routes/CashFlowRoute.tsx` → present
- [ ] 未結清 no longer renders as a top banner; appears in the right column
- [ ] Total rows shown across load-more equals the pre-change total for the same
      range (manual)
- [ ] Only in-scope files modified (`git status`)

## STOP conditions

- `CashFlowRoute.tsx` drifted so the cited line ranges don't match.
- Computing the recurring monthly total (Step 1) cleanly requires a new domain
  helper — keep the estimate route-local; if the frequency model is unclear, show
  only the within-30-day list + 之後 and omit the monthly-total footer rather than
  guess (note it).
- Any transaction's net / settled amount changes vs. before (must be identical).
- A verification fails twice after a reasonable fix.

## Maintenance notes

- `groupByDay` (short ranges) and `groupByMonth` (long ranges) are two views of
  the same rows — keep their net math in lock-step. The `isLongRange` threshold
  (~3 months) is the switch; if a new preset is added, classify it there.
- The right column now carries 固定收支 + 未結清; if a third info card is added,
  it stacks in the same sticky column.
- Load-more replaces pagination — the `page`/`totalPages` state is gone; anything
  that referenced it must be updated.
- Reviewer should check: identical totals/nets; load-more never drops or
  duplicates rows; month subtotals equal the sum of their day nets; search
  auto-expand works; sticky headers don't overlap on mobile.
