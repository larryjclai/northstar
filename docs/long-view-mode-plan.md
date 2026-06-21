# Long-view mode — design note (Plan 040)

ROADMAP Phase 6.5 (情緒鈍化 / 長期視角模式). Founding intent: "每月把自己暴露在漲跌上，久了免疫".
The app currently amplifies daily fluctuation (range-aware deltas, daily trend points);
long-view mode does the opposite — it dampens day-to-day noise and celebrates real
milestones, nudging the user toward a long-term mindset.

This is pure UX over existing data. **No finance math changes.** The headline net-worth
number and all stored values stay exact; smoothing is a display-only transform.

## Principles (recorded)

- Long-view mode is **OFF by default** → no behaviour change unless the user opts in.
- Smoothing is a **display-only transform**: the headline `netWorth` and every stored
  value are untouched. The chart endpoint must keep equalling the headline (plan-032
  invariant).
- The milestone celebration fires **once per tier crossed**, de-duplicated via a persisted
  `milestoneReached` high-water mark. Never a native dialog (no `window.confirm` in Tauri) —
  it's an in-app toast.
- `longViewMode` and `milestoneReached` are **localStorage UI preferences** (in
  `uiPreferences`, like `sidebarCollapsed`). They are **NOT synced** — they are not finance
  data. Consequence: a celebration could re-fire on a fresh device. Acceptable for v1.

## Decision A — milestone tiers + currency

**Fixed TWD ladder in the user's primary currency.**

```
tiers = [1_000_000 (第一桶金), 3_000_000, 5_000_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000]
```

Fixed in v1 (NOT user-editable yet). Compared against net worth expressed in the primary
currency — the existing `netWorth` value the Dashboard already computes (no new conversion).

## Decision B — crossing detection + dedup

**Persist the highest tier reached.** Add `milestoneReached: number` to `uiPreferences`
(default `0`).

On Dashboard mount: if the current `netWorth` ≥ the smallest tier strictly greater than
`milestoneReached`, fire ONE celebration via the existing toast system
(`toast.success(...)` from `useToast()`) and advance `milestoneReached` to the highest tier
now crossed. Guarded so it fires once per mount (mirror the `useDailyLocalBackup` ran-once
`useRef` pattern in `AppShell.tsx`); skipped in demo mode so showcase data never trips it.

## Decision C — volatility dampening

**Trailing 30-day moving average + soften the daily delta.**

When `longViewMode` is ON:
- Render the trend through a **30-point trailing moving average** so day-to-day noise
  recedes.
- Show the longer-period change (window start → now) instead of the day delta.
- Do **NOT** change the default `stripPeriod`.

Display-only: the headline `netWorth` and the chart's endpoint value stay exact. The
smoothing helper preserves the last point's real value so the chart endpoint still equals
the headline (plan-032 invariant).

## Scope

- v1 scopes smoothing to the net-worth trend; composes with the Northstar-metric hero
  (only the `netWorth` metric has a history series).
