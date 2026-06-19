# Plan 032: Net-worth hero shows the real comparison window, and the chart ends on the headline number

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 721f216f..HEAD -- src/routes/DashboardRoute.tsx`
> Compare the "Current state" excerpts to the live code; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `721f216f`, 2026-06-19

## Why this matters

The operator reported three things about the 總覽 net-worth hero card:
1. The comparison caption is hardcoded「較上月」, but the +/− figure next to it is
   **not** month-over-month — it is the change over the *selected* range
   (1D/1W/1M/3M/YTD/1Y/5Y/All). So the label lies whenever the selected period
   isn't "last month", and even at "1M" it's "31 days ago", not a calendar month.
2. The +/− value doesn't match subtracting two adjacent day labels on the chart —
   because it spans the whole window, not two days. The mislabel is what makes
   this confusing.
3. The chart's value on today's date differs from the big net-worth number,
   because the headline uses live quotes (`buildNetWorthBreakdown`) while the
   chart endpoint uses daily-close valuation (`buildNetWorthTrend`).

This plan makes the caption describe the actual window, and reconciles the
chart's "today" endpoint to the headline number so the curve ends exactly on the
big figure (the historical curve keeps its daily-close valuation — only the
"now" point is aligned, which is correct because the headline is the more current
"now").

## Current state

`src/routes/DashboardRoute.tsx`:
- Period type + presets (lines 66–67):
  ```ts
  type StripPeriod = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "5Y" | "All";
  const STRIP_PERIODS: StripPeriod[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "5Y", "All"];
  ```
- Headline net worth (lines 218–223): `netWorth = breakdown.netWorth`, from
  `buildNetWorthBreakdown(filteredAccounts, marketValue, toPrimary)`. Respects
  `selectedAccount` (via `filteredAccounts`/`filteredAssets`, lines 201/205).
- The trend + delta (lines 344–390):
  ```tsx
  const trend = useMemo(() => buildNetWorthTrend(/* filtered by selectedAccount */), [...]);
  const rangeView = useMemo(() => { /* slices trend to stripPeriod, returns {points, change, pct} */ }, [trend, stripPeriod]);
  const visibleTrend = rangeView.points;
  const momChange = rangeView.change;
  const momPct = rangeView.pct;
  ```
  `rangeView.change = endValue − startValue` where `endValue` is the last point
  of the sliced window (today) and `startValue` is the carry-forward value at the
  window start. So `momChange` is the **window** change, not month-over-month.
- The badge + hardcoded caption (lines 789–797):
  ```tsx
  {activeMetric.key === "netWorth" && trend.length >= 2 ? (
    <>
      <Badge variant={momChange >= 0 ? "success" : "error"} className="gap-1 rounded-full px-2">
        {momChange >= 0 ? <ArrowUp .../> : <ArrowDown .../>}
        <span className="num">{momChange >= 0 ? "+" : "−"}{formatNumber(Math.abs(momChange))} · {Math.abs(momPct).toFixed(2)}%</span>
      </Badge>
      <span className="muted text-xs">較上月</span>
    </>
  ) : null}
  ```
- The chart consumes `visibleTrend` (line 836: `<AreaChart data={visibleTrend}>`).
- The trend builder `buildNetWorthTrend` (lines 1316–1452) ends its series at
  "today": either the last bucket is `todayKey`, or it appends a final point
  `{ date: "現在", value: cashRunning + holdingsValue, iso: todayIso }`. Its
  "today" holdings valuation uses `priceAssetOnDate(today)` — a *different* path
  from the headline's `holdingsMarketValue`, which is why the two can disagree.

**Conventions to match:** zh-TW captions. `formatNumber`/`formatMoney` already
imported. The hero badge uses `Badge` (success/error) + `var(--ns-...)` tokens.
Keep `momPct.toFixed(2)`.

## Commands you will need

| Purpose   | Command            | Expected         |
|-----------|--------------------|------------------|
| Typecheck | `npx tsc --noEmit` | exit 0           |
| Build     | `npm run build`    | exit 0           |
| Tests     | `npm run test`     | all pass         |
| Lint      | `npm run lint`     | exit 0, 0 errors |

## Scope

**In scope**: `src/routes/DashboardRoute.tsx` only.

**Out of scope**:
- `buildNetWorthTrend` internals — do **not** rewrite the valuation waterfall.
  The reconciliation in Step 2 happens at the call site by adjusting only the
  final point's value.
- `buildNetWorthBreakdown` / `holdingsMarketValue` — the headline is the source
  of truth; don't change it.
- The PortfolioStrip / analytics tab (different component).

## Git workflow

- Branch: `git checkout -B advisor/032-dashboard-networth-comparison main`.
- Commit per step; conventional commits
  (e.g. `fix(dashboard): label net-worth delta with the selected period`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Replace the hardcoded「較上月」with a period-accurate caption

Add a pure label map near `STRIP_PERIODS` (top of the file, module scope):
```ts
const STRIP_PERIOD_LABELS: Record<StripPeriod, string> = {
  "1D": "近 1 日",
  "1W": "近 1 週",
  "1M": "近 1 個月",
  "3M": "近 3 個月",
  "YTD": "今年以來",
  "1Y": "近 1 年",
  "5Y": "近 5 年",
  "All": "全期間",
};
```
Then in the badge block (line 795) replace:
```tsx
<span className="muted text-xs">較上月</span>
```
with:
```tsx
<span className="muted text-xs">{STRIP_PERIOD_LABELS[stripPeriod]}</span>
```

**Verify**:
- `grep -n "較上月" src/routes/DashboardRoute.tsx` → **no matches**.
- `npx tsc --noEmit` → exit 0.

### Step 2: Reconcile the chart's "today" endpoint to the headline net worth

The chart should end on the same number shown in big type. After the `trend`
memo (line 353) and after `netWorth` is in scope (it is — defined at line 223,
well above), add a reconciled series that replaces only the final point's value
when that point represents today and differs from the headline:

```tsx
// The headline net worth uses live quotes; the trend's "today" point uses daily
// closes, so they can disagree by a small amount. Align ONLY the final (today)
// point to the headline so the chart visibly ends on the big number. Historical
// points keep their daily-close valuation. Both `netWorth` and `trend` are
// filtered by selectedAccount, so this stays correct when an account is picked.
const reconciledTrend = useMemo(() => {
  if (trend.length === 0) return trend;
  const last = trend[trend.length - 1];
  if (last.iso >= todayIso && Math.abs(last.value - netWorth) > 0.5) {
    return [...trend.slice(0, -1), { ...last, value: netWorth }];
  }
  return trend;
}, [trend, netWorth, todayIso]);
```
(`todayIso` already exists at line 185: `const todayIso = new Date().toISOString().slice(0, 10);`.)

Then change `rangeView` to consume `reconciledTrend` instead of `trend`:
- In the `rangeView` useMemo body (lines 359–387) replace every reference to
  `trend` with `reconciledTrend`, and update its dependency array
  `[trend, stripPeriod]` → `[reconciledTrend, stripPeriod]`.
- The badge guard `trend.length >= 2` (line 789) and the period-control guard
  `trend.length > 1` (line 818) and chart guard `trend.length > 1` (line 829)
  may stay on `trend` (same length) — but for clarity change them to
  `reconciledTrend` too. **Do not** change the `trend` memo itself.

After this, `momChange = endValue − startValue` uses the reconciled endpoint, so
the delta is consistent with the headline, and `visibleTrend` (= rangeView.points)
ends on `netWorth`.

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0.

### Step 3: Manual verification (if the app can run)

`npm run dev` → 總覽:
- The caption under the +/− badge changes with the period selector (近 1 個月 /
  近 3 個月 / 今年以來 / …), never showing 較上月.
- Hover the rightmost point of the chart → its tooltip value equals the big
  net-worth number in the hero (within rounding).
- Switch the period selector → the +/− figure and caption update together.

If the app can't run, rely on typecheck/build and the reasoning above.

## Test plan

- This is presentational + a call-site memo. The underlying `buildNetWorthTrend`
  and `buildNetWorthBreakdown` are already covered by
  `src/domain/dashboardSummary.test.ts` (breakdown). No new domain test is
  strictly required.
- Optional (encouraged if a route test harness exists): a small test that
  `STRIP_PERIOD_LABELS` has an entry for every `StripPeriod` value:
  `STRIP_PERIODS.every((p) => p in STRIP_PERIOD_LABELS)`. If you add it, put it
  in a new `src/routes/DashboardRoute.test.ts` only if other route tests exist;
  otherwise skip (don't introduce a new harness for one assertion).
- Verification: `npm run test` → all pass.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test` exits 0
- [ ] `npm run lint` exits 0, 0 errors
- [ ] `grep -n "較上月" src/routes/DashboardRoute.tsx` → no matches
- [ ] `grep -n "STRIP_PERIOD_LABELS" src/routes/DashboardRoute.tsx` → matches
- [ ] `grep -n "reconciledTrend" src/routes/DashboardRoute.tsx` → matches, and `rangeView` depends on it
- [ ] Only `src/routes/DashboardRoute.tsx` modified (and possibly a new test file per Test plan)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The badge block or `rangeView` memo no longer matches the "Current state"
  excerpts (drift).
- `buildNetWorthTrend`'s return shape isn't `{ date, value, iso }[]` (so the
  `{ ...last, value: netWorth }` spread would be wrong) — STOP and report.
- After Step 2 the chart endpoint still visibly disagrees with the headline by a
  large amount — that implies `netWorth` and the trend are filtered by different
  account scopes; STOP and report rather than papering over it.

## Maintenance notes

- The reconciliation aligns only today's point. If a future change makes
  `buildNetWorthTrend` itself consume the live `marketValue` (the comment at
  lines 207–210 hints at that intent), this call-site reconcile becomes a no-op
  and can be removed.
- If a new `StripPeriod` value is added, `STRIP_PERIOD_LABELS` must gain an entry
  — the `Record<StripPeriod, string>` type makes that a compile error if missed,
  which is intentional.
- Reviewer should confirm the historical part of the curve is unchanged (only the
  last point moves).
