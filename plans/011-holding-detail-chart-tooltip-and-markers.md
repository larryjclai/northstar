# Plan 011: Holding Detail chart shows a readable tooltip and buy/sell markers that sit on the price line

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a4ee4f2b..HEAD -- src/routes/HoldingDetailRoute.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a4ee4f2b`, 2026-06-15

## Why this matters

On the Holding Detail page (持倉投資 → a single holding) the price chart has two
visible defects reported with a screenshot:

1. **The hover tooltip is unreadable.** It renders with recharts' default
   *white* background and pale text, so in the app's dark theme the date and
   price are nearly invisible (white-on-white). Every other chart in the app
   themes its tooltip with design-system tokens; this one was missed.
2. **The buy/sell triangle markers look misplaced ("不準").** Each marker is
   positioned at the *transaction's own fill price* on the Y axis, which is
   detached from the drawn price line, so the triangles float above/below the
   line instead of marking the point on the line where the trade happened.
   Worse, the markers use `ifOverflow="extendDomain"`, so a single trade whose
   price lies outside the selected window's close range silently **stretches the
   whole Y axis**, distorting the price line itself.

After this plan: the tooltip is legible in both themes, and the markers ride the
price line at the trade date without ever warping the chart's vertical scale.

## Current state

- `src/routes/HoldingDetailRoute.tsx` — the entire Holding Detail page. The
  chart is an `AreaChart` from `recharts`. Relevant pieces:

**The price series** (one point per charted day), built at lines ~49–55:

```tsx
const series = useMemo(() => {
  const cutoff = rangeCutoff(seg);
  return dailyPriceRows
    .filter((p) => p.ticker.toUpperCase() === ticker.toUpperCase() && (!cutoff || p.date >= cutoff))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(p => ({ date: p.date, price: p.close }));
}, [dailyPriceRows, ticker, seg]);
```

**The trade markers** (lines ~68–89). Note `price: t.price` — the marker's Y is
the transaction price, NOT the close on that date:

```tsx
const tradeMarkers = useMemo(() => {
  if (series.length === 0) return [] as Array<{ date: string; price: number; action: "buy" | "sell" }>;
  const seriesDates = series.map((p) => p.date);
  const snap = (date: string): string | null => {
    const d = date.slice(0, 10);
    if (d < seriesDates[0] || d > seriesDates[seriesDates.length - 1]) return null;
    let best = seriesDates[0];
    let bestGap = Infinity;
    for (const sd of seriesDates) {
      const gap = Math.abs(Date.parse(sd) - Date.parse(d));
      if (gap < bestGap) { bestGap = gap; best = sd; }
    }
    return best;
  };
  return txns
    .filter((t) => t.action === "buy" || t.action === "sell")
    .map((t) => {
      const snapped = snap(t.date);
      return snapped ? { date: snapped, price: t.price, action: t.action as "buy" | "sell" } : null;
    })
    .filter((m): m is { date: string; price: number; action: "buy" | "sell" } => m !== null);
}, [txns, series]);
```

**The chart JSX** (lines ~233–255). Note the unthemed `<Tooltip>` (line ~243)
and `ifOverflow="extendDomain"` on each `ReferenceDot` (line ~251):

```tsx
<AreaChart data={series}>
  <defs>…</defs>
  <XAxis dataKey="date" hide />
  <YAxis domain={['auto', 'auto']} hide />
  <Tooltip formatter={(v) => [typeof v === "number" ? v.toFixed(2) : v, "price"]} />
  <Area type="monotone" dataKey="price" stroke={markColor} fillOpacity={1} fill="url(#colorPrice)" isAnimationActive={false} />
  {showTradeMarkers && tradeMarkers.map((m, i) => (
    <ReferenceDot
      key={`${m.date}-${i}`}
      x={m.date}
      y={m.price}
      r={0}
      ifOverflow="extendDomain"
      shape={(props: { cx?: number; cy?: number }) => <TradeMarker cx={props.cx ?? 0} cy={props.cy ?? 0} action={m.action} />}
    />
  ))}
</AreaChart>
```

**The marker component** (lines ~425–433) — unchanged by this plan, shown for
context. It already offsets the triangle slightly off `cy` (buy below, sell
above) and colors by the TW market convention (`--ns-gain` red, `--ns-loss`
green), which is correct:

```tsx
function TradeMarker({ cx, cy, action }: { cx: number; cy: number; action: "buy" | "sell" }) {
  const color = action === "buy" ? "var(--ns-gain)" : "var(--ns-loss)";
  const d = action === "buy"
    ? `M ${cx} ${cy + 2} L ${cx - 5} ${cy + 11} L ${cx + 5} ${cy + 11} Z`
    : `M ${cx} ${cy - 2} L ${cx - 5} ${cy - 11} L ${cx + 5} ${cy - 11} Z`;
  return <path d={d} fill={color} stroke="var(--ns-bg-elev)" strokeWidth={1} />;
}
```

### Conventions to follow

- **Themed recharts tooltip** — every other chart passes `contentStyle`,
  `itemStyle`, and `labelStyle` built from `--ns-*` tokens. The canonical
  exemplar is `src/routes/DashboardRoute.tsx:600`:

  ```tsx
  <Tooltip
    formatter={(value) => formatMoney(Number(value), primaryCurrency)}
    contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }}
    itemStyle={{ color: "var(--ns-fg)" }}
    labelStyle={{ color: "var(--ns-fg)" }}
  />
  ```

  See also `src/routes/InvestmentsRoute.tsx:925` and
  `src/routes/InvestmentsAnalyticsTab.tsx:661` for the same pattern. `--ns-bg-elev`
  and `--ns-fg` are both defined for light AND dark themes in
  `src/styles/globals.css` (lines ~108/164 and ~113/169), so this is automatically
  theme-correct.

- **Design tokens, not hardcoded colors** — never introduce hex literals; use
  `var(--ns-*)`. (This is the same rule plan 010 enforced.)

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors    |
| Tests     | `npm test`         | all pass             |
| Lint      | `npm run lint`     | exit 0 (warnings ok) |

This is a Vite + React 19 + TypeScript app; charts use `recharts@2`. There is no
separate `typecheck` script — use `npx tsc --noEmit` (this is what the repo's own
reconcile notes use).

## Scope

**In scope** (the only file you should modify):
- `src/routes/HoldingDetailRoute.tsx`

**Out of scope** (do NOT touch):
- `src/routes/InvestmentsRoute.tsx`, `InvestmentsAnalyticsTab.tsx`, any other
  chart — they already theme their tooltips; leave them alone.
- The `TradeMarker` component's colors/shape and the legend (lines ~269–289).
  The TW red-gain/green-loss convention is intentional and correct — do not
  "fix" the colors.
- `src/styles/globals.css` — no token changes needed.
- The `rangeCutoff` helper and the segment toggle.

## Git workflow

- Branch: `advisor/011-holding-detail-chart`
- Commit message style: conventional commits, matching recent history
  (e.g. `fix(holding-detail): theme price-chart tooltip + anchor trade markers to line`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Theme the chart tooltip

In `src/routes/HoldingDetailRoute.tsx`, replace the unthemed `<Tooltip>` (the
line reading `<Tooltip formatter={(v) => [typeof v === "number" ? v.toFixed(2) : v, "price"]} />`)
with a themed version that keeps the existing formatter and adds the three style
props from the exemplar:

```tsx
<Tooltip
  formatter={(v) => [typeof v === "number" ? v.toFixed(2) : v, "price"]}
  contentStyle={{ borderRadius: 8, border: "1px solid var(--ns-border)", background: "var(--ns-bg-elev)" }}
  itemStyle={{ color: "var(--ns-fg)" }}
  labelStyle={{ color: "var(--ns-fg)" }}
/>
```

**Verify**: `npx tsc --noEmit` → exit 0. Then
`grep -n "contentStyle" src/routes/HoldingDetailRoute.tsx` → returns one line.

### Step 2: Anchor markers to the price line (close on the trade's snapped date)

The marker should sit on the drawn line at the trade date, not at the trade's
own fill price. Build a lookup from the (already-computed) `series` and use the
close at the snapped date as the marker's `price` (Y value).

In the `tradeMarkers` `useMemo`, change the snap/map so it returns the **close
at the snapped date** as `price`. Concretely:

- After `const seriesDates = series.map((p) => p.date);`, add a close lookup:
  ```tsx
  const closeByDate = new Map(series.map((p) => [p.date, p.price]));
  ```
- In the `.map((t) => { … })`, replace `price: t.price` with the snapped
  close, while still carrying the actual fill price for the tooltip-free marker
  (we don't display it, so just use the close):
  ```tsx
  const snapped = snap(t.date);
  return snapped
    ? { date: snapped, price: closeByDate.get(snapped) ?? t.price, action: t.action as "buy" | "sell" }
    : null;
  ```
  The `?? t.price` is a defensive fallback that cannot normally trigger
  (`snapped` always comes from `seriesDates`, which are exactly the keys of
  `closeByDate`).

Leave the `snap` function and the out-of-range `null` filtering exactly as they
are. The shape of the returned array (`{ date, price, action }`) is unchanged,
so the JSX needs no change for this step.

**Verify**: `npx tsc --noEmit` → exit 0. Then
`grep -n "closeByDate" src/routes/HoldingDetailRoute.tsx` → returns 2 lines
(declaration + use).

### Step 3: Stop markers from distorting the Y axis

On the `ReferenceDot`, change `ifOverflow="extendDomain"` to
`ifOverflow="hidden"`. Now that markers ride the line (Step 2), their Y values
are always within the close range, so `"hidden"` will never actually clip a
marker — it only guarantees that a future edge case can never stretch the axis.

```tsx
<ReferenceDot
  key={`${m.date}-${i}`}
  x={m.date}
  y={m.price}
  r={0}
  ifOverflow="hidden"
  shape={(props: { cx?: number; cy?: number }) => <TradeMarker cx={props.cx ?? 0} cy={props.cy ?? 0} action={m.action} />}
/>
```

**Verify**: `grep -n "extendDomain" src/routes/HoldingDetailRoute.tsx` → no
matches. `npx tsc --noEmit` → exit 0.

### Step 4: Full verification

Run the whole suite and lint.

**Verify**:
- `npm test` → all pass (no test currently covers this file; you are not
  required to add one — see Test plan).
- `npm run lint` → exit 0 (pre-existing warnings are acceptable; no NEW errors
  in `HoldingDetailRoute.tsx`).

## Test plan

This is a small, presentational fix to a chart that has no existing unit test
and renders via recharts/ResponsiveContainer (which needs layout and does not
render meaningfully in jsdom). A unit test here would assert almost nothing of
value, so **no new automated test is required**.

Instead, record this manual check in your report for the operator to run in the
desktop/dev app (`npm run dev` or the Tauri build):

1. Open a holding that has at least one buy and one sell with `顯示買賣標記`
   enabled.
2. Switch the app to dark theme → hover the chart → confirm the tooltip box has
   a dark elevated background with legible light text (date + price).
3. Confirm the red (買進) and green (賣出) triangles sit *on* the price line at
   the trade dates, and that toggling `顯示買賣標記` on/off does not change the
   line's vertical scale (the line should not "jump" taller/shorter).
4. Repeat the tooltip check in light theme.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -n "extendDomain" src/routes/HoldingDetailRoute.tsx` → no matches
- [ ] `grep -n "contentStyle" src/routes/HoldingDetailRoute.tsx` → exactly one match
- [ ] `grep -n "closeByDate" src/routes/HoldingDetailRoute.tsx` → two matches
- [ ] `git status` shows only `src/routes/HoldingDetailRoute.tsx` modified
- [ ] `plans/README.md` status row for 011 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `HoldingDetailRoute.tsx` changed and the "Current state"
  excerpts no longer match (e.g. the chart was migrated off recharts, or
  `tradeMarkers` no longer carries `price: t.price`).
- After Step 2, TypeScript complains that `series` items lack a `price` field —
  that means the series shape changed; re-read the `series` `useMemo` and report.
- `recharts` no longer accepts `ifOverflow="hidden"` on `ReferenceDot` (API
  change) — typecheck will flag it; report rather than guessing a replacement.

## Maintenance notes

- If the chart is ever switched to show **market value** (price × quantity)
  instead of raw close, the marker Y must switch to the same basis, or markers
  will detach again. The `closeByDate` lookup is the single place to change.
- A reviewer should confirm no hardcoded colors crept in and that the legend
  (買進/賣出) still matches the marker colors (`--ns-gain` / `--ns-loss`).
- Deferred out of scope: showing the actual fill price (which may differ from
  the snapped close) in a per-marker hover tooltip. Nice-to-have, not needed to
  fix the reported "不準" perception.
