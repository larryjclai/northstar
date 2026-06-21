# Plan 040: Long-view mode — dampen daily volatility + celebrate net-worth milestones

> **Executor instructions**: This is a **design-first plan with a decision
> gate** (ROADMAP 6.5). Phase 0 produces a design note and needs operator
> sign-off on the milestone tiers and the volatility-dampening method before any
> code. Do NOT implement until the gate is resolved. Follow steps in order; run
> every verification command. If a "STOP condition" occurs, stop and report.
> When done, update this plan's row in `plans/README.md` unless a reviewer told
> you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 13f6a723..HEAD -- src/state/uiPreferences.ts src/routes/DashboardRoute.tsx src/components/NetWorthProjectionCard.tsx`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (presentation + a preference; no finance math change)
- **Depends on**: none (composes with the shipped Northstar-metric framework, plan 024)
- **Category**: direction (feature)
- **Planned at**: commit `13f6a723`, 2026-06-20

## Why this matters

`ROADMAP.md` Phase 6.5 (情緒鈍化 / 長期視角模式) is the last unbuilt Phase-6 item,
and it's grounded in Northstar's founding intent: *"每月把自己暴露在漲跌上，久了免疫"* —
the product currently **amplifies** daily fluctuation (range-aware deltas, daily
trend points), which works against the long-term mindset the app is trying to
cultivate. A long-view mode does two things: (1) **dampen daily volatility** —
smooth the net-worth trend to a moving average / year line so day-to-day noise
recedes, and (2) **celebrate milestones** — a one-time acknowledgement when net
worth crosses 第一桶金 / 100萬 / 500萬 … so progress feels rewarded rather than
anxiety-inducing. It's a pure UX layer over data that already exists (the
net-worth trend, current net worth), so the risk is low and the payoff is
emotional alignment with the product's whole reason for existing.

## Current state

Files and roles:

- `src/state/uiPreferences.ts` — the persisted preference store (zustand +
  localStorage). It already holds simple boolean/ string prefs with defaults and
  a parse guard: `sidebarCollapsed: boolean` (line 41, default false at 115,
  parsed at 162) and `northstarMetric: string` (line 43, default `"netWorth"` at
  116, parsed at 163-165). **This is the exact pattern to copy** for a new
  `longViewMode: boolean`.
- `src/routes/DashboardRoute.tsx` — the net-worth hero + trend chart. It builds
  `reconciledTrend` (memo, line ~369), derives `rangeView` / `visibleTrend`
  (line ~410-411), and renders an `AreaChart` (recharts, imported line 4). The
  net-worth hero block keys on `activeMetric.key === "netWorth"` (lines ~812,
  841) — `activeMetric` comes from the plan-024 Northstar-metric registry.
- `src/components/NetWorthProjectionCard.tsx` — already has milestone *figures*
  (`MilestoneCell`, lines ~82-93, 311) for the projection card, but there is **no
  achievement/celebration** when actual net worth crosses a threshold, and **no
  global long-view toggle** anywhere.

### Conventions to follow

- Preference persistence: copy the `sidebarCollapsed` / `northstarMetric`
  pattern in `uiPreferences.ts` exactly — add the field to the state interface,
  the default, the parse guard, and a setter/toggle.
- No `window.confirm` in Tauri (`AGENTS.md` gotcha) — a milestone celebration
  must be in-app UI (a toast or a card), never a native dialog. The app has a
  toast system (`src/components/Toast.tsx`, used throughout `AppShell.tsx`).
- UI copy via i18n / `copy.csv`, not hand-edited zh-TW in TSX.
- Design tokens (`--ns-*`), DS component classes (`ns-surface`, etc.); reuse the
  existing chart styling — do not introduce a new chart library.
- **No finance math changes.** Smoothing is a *display* transform on the trend
  series; the headline net-worth number and all stored values stay exact.

## Decision gate (Phase 0 — REQUIRED before any code)

Write `docs/long-view-mode-plan.md` and get operator sign-off on:

**Decision A — milestone tiers + currency handling.**
What thresholds trigger a celebration, and in which currency? Recommend a
configurable ladder defaulting to TWD-oriented tiers (第一桶金 = NT$1,000,000,
then 3M / 5M / 10M / …) since the app is zh-TW/TW-first, expressed in the user's
primary currency. Confirm the tiers and whether they're user-editable in v1
(recommend: fixed ladder v1, editable later).

**Decision B — how "crossing" is detected and de-duplicated.**
A milestone should fire **once**, not every render or every day it stays above
the line. Recommend: persist the highest milestone reached
(`milestoneReached: number` in `uiPreferences`); on load, if current net worth ≥
the next tier above `milestoneReached`, raise the celebration and advance the
stored value. State the exact rule and where it's checked (recommend: a small
hook in `DashboardRoute` or `AppShell`, throttled like the existing
`useDailyLocalBackup`).

**Decision C — volatility-dampening method.**
Recommend: when long-view is on, render the trend as a moving average (e.g.
trailing 30-day) / down-sample to monthly points, and de-emphasize the
range-aware daily delta (show the longer-period change instead). Confirm the
window length and whether long-view also changes the default `stripPeriod`.

**Gate**: STOP after writing the note; present A/B/C; record choices at the top
of the note before Phase 1.

## Commands you will need

| Purpose   | Command                                       | Expected on success |
|-----------|-----------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                            | exit 0              |
| Tests     | `npm test`                                     | all pass            |
| Test one  | `npx vitest run src/state/uiPreferences.test.ts` (if present) / the new smoothing test | all pass |
| Lint      | `npm run lint`                                 | exit 0 (0 errors)   |
| Dev server| `npm run dev`                                  | serves on localhost |

## Suggested executor toolkit

- This is visual — verify the toggle, the smoothed chart, and the milestone
  toast in a browser preview (or `npm run dev`). If you can't run a browser, say
  so and rely on the unit test for the smoothing transform + code inspection.

## Scope

**Phase 1 (after the gate) — In scope:**
- `src/state/uiPreferences.ts` — add `longViewMode: boolean` (+ toggle) and
  `milestoneReached: number` (per Decision B), following the existing pattern.
- A new pure helper, e.g. `src/domain/trendSmoothing.ts` +
  `src/domain/trendSmoothing.test.ts` — moving-average / down-sample of a
  `{ iso, value }[]` series (Decision C). Pure, tested.
- `src/routes/DashboardRoute.tsx` — apply the smoothing transform to the trend
  when long-view is on; soften the daily delta; add the long-view toggle entry
  point; wire the milestone check.
- A milestone celebration UI — reuse the toast system, or a small dismissible
  Dashboard card.
- The long-view toggle control (Dashboard header or Settings).

**Out of scope (do NOT touch):**
- `buildNetWorthTrend` / `reconciledTrend` *source* values — smoothing is a
  display transform applied on top; the underlying series and the headline
  net-worth number stay exact.
- FIRE / projection / investment / budget math.
- The Northstar-metric registry (plan 024) beyond reading `activeMetric.key`.
- Any sync change (the new prefs are localStorage-only UI prefs, like
  `sidebarCollapsed`; they are **not** synced finance data — confirm they live in
  `uiPreferences`, not the repository).

## Git workflow

- Branch from current main: `git checkout -B advisor/040-long-view-mode main`.
- Commit the design note, then the pure smoothing helper + tests, then the UI.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 0 (gate): design note + operator decision
Write `docs/long-view-mode-plan.md` (Decisions A/B/C). **STOP for sign-off.**

### Step 1: preferences
Add `longViewMode` (+ `toggleLongViewMode`) and `milestoneReached` to
`uiPreferences.ts`, copying the `sidebarCollapsed` pattern (interface field,
default, parse guard, setter). **Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: pure smoothing helper + tests
Create `src/domain/trendSmoothing.ts` with a pure function (e.g.
`smoothTrend(points, { window })`) implementing Decision C. Write
`trendSmoothing.test.ts` first. **Verify**:
`npx vitest run src/domain/trendSmoothing.test.ts` → all pass.

### Step 3: apply smoothing in the Dashboard chart
When `longViewMode` is on, feed `visibleTrend` through `smoothTrend` before the
`AreaChart`, and show the longer-period change instead of the daily delta. Leave
the off path identical to today. **Verify**: `npx tsc --noEmit` → exit 0; chart
renders smoothed in `npm run dev` with the toggle on, identical to current with
it off.

### Step 4: milestone celebration
Add the milestone check (Decision B) — on Dashboard mount, if current net worth
crosses the next tier above `milestoneReached`, raise a toast/card and advance
`milestoneReached`. Throttle/guard like `useDailyLocalBackup` so it fires once.
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 5: the toggle control + full verification
Add the long-view toggle (header or Settings) bound to `toggleLongViewMode`.
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; browser: toggle on → chart smooths + daily delta softens; toggle off →
back to today's behavior; preference survives reload.

## Test plan

`src/domain/trendSmoothing.test.ts`:
- moving average over a known series returns the expected smoothed values.
- a window of 1 (or off) returns the input unchanged.
- series shorter than the window degrades gracefully (no NaN, no throw).
- down-sampling to monthly keeps the last point (so the endpoint still matches
  the headline — same invariant plan 032 protects).

If `uiPreferences` has a test file, add a case that `longViewMode` /
`milestoneReached` round-trip through the parse guard with defaults for missing
keys (model after the existing `sidebarCollapsed` parse).

Verification: `npx vitest run src/domain/trendSmoothing.test.ts` → all pass.

## Done criteria

ALL must hold:

- [ ] `docs/long-view-mode-plan.md` records the operator's chosen A/B/C options
- [ ] `longViewMode` + `milestoneReached` persist via `uiPreferences` (survive
      reload) and default to off / 0 → no behavior change when off
- [ ] `src/domain/trendSmoothing.ts` is pure (no React/I/O) and its tests pass
- [ ] A milestone celebration fires **once** per tier crossed (not every render)
- [ ] Headline net-worth number and stored values are unchanged (smoothing is
      display-only)
- [ ] `npx tsc --noEmit` exits 0; `npm test` exits 0; `npm run lint` 0 errors
- [ ] No files outside the Phase-1 in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The operator has not signed off on Decisions A/B/C (milestone tiers and
  smoothing window are product choices, not executor guesses).
- The code at cited lines doesn't match the excerpts (drift since `13f6a723`).
- Applying smoothing changes the headline net-worth value or the chart endpoint
  no longer equals the headline (that breaks the plan-032 invariant) — stop.
- The milestone celebration can't be made to fire exactly once with the chosen
  detection rule — stop and report rather than shipping a nag.

## Maintenance notes

- For the reviewer: confirm long-view is **off by default**, smoothing is purely
  a display transform (headline + stored values untouched), and the milestone
  fires once (check the de-dup via `milestoneReached`).
- These are UI preferences in `uiPreferences` (localStorage), deliberately **not**
  synced finance data — a different device can have its own view preference.
  `milestoneReached` not syncing means a celebration could re-fire on a new
  device; that's acceptable v1 (note it).
- Composes with plan 024's Northstar-metric hero: if long-view should also affect
  non-net-worth heroes, that's a follow-up — v1 scopes smoothing to the
  net-worth trend.
