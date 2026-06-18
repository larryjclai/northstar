# Plan 022: Enlarge the Analytics risk-KPI sparklines and make the metric help tappable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update this
> plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat b0fda83d..HEAD -- src/routes/InvestmentsAnalyticsTab.tsx`
> If the file changed since this plan was written, read it and compare against the
> "Current state" excerpts before proceeding; on a structural mismatch STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx (legibility / accessibility)
- **Planned at**: commit `b0fda83d`, 2026-06-16

## Why this matters

The original audit (`docs/ux-chart-audit.md`) flagged the risk KPIs (年化波動率 /
Sortino / Sharpe / 最大回撤) for "術語無常駐說明 + sparkline 過小". **The
resident-explanation half is already done**: each `KpiCard` now renders a plain
`sub` caption under the value (e.g.「只懲罰下跌波動 · MAR x%」) plus a `help`
tooltip — see `InvestmentsAnalyticsTab.tsx:778-815` and `:1061-1086`. What remains
is small but real:

1. The sparkline is **60×26px** — too small to read a trend at a glance.
2. The metric help is a **hover-only native `title` tooltip** on a 13px icon
   (`MetricHelp`, `:1097-1107`), so on touch devices (the app ships to iOS) the
   explanation is undiscoverable.

This plan addresses only those two remainders. It is intentionally P3/small.

## Current state

`src/routes/InvestmentsAnalyticsTab.tsx`:

- `Sparkline` (`:180`): `function Sparkline({ data, color, width = 60, height = 26 })`.
  Used inside `KpiCard` (`:1081`) as `<Sparkline data={spark} color={color} />`
  (no width/height override, so it renders at the 60×26 default).
- `KpiCard` (`:1061-1086`): renders `label` + `MetricHelp(help)`, `note`, the big
  `value`, the `Sparkline`, then `sub` (the resident caption — already present).
- `MetricHelp` (`:1097-1107`):
```tsx
function MetricHelp({ text }: { text: string }) {
  return (
    <span title={text} aria-label={text}
      style={{ display: "inline-flex", color: "var(--ns-fg-muted)", cursor: "help", lineHeight: 1, flexShrink: 0 }}>
      <Info size={13} />
    </span>
  );
}
```
- The four risk `KpiCard`s are at `:779-814`; each passes a `spark`, `sub`, and
  `help`. `KpiCard` is also reused elsewhere in the file — any signature change
  must stay backward-compatible.

**Convention notes**: the file already uses Base UI / COSS primitives. A
tap-friendly tooltip/popover may already exist in `src/components/coss/` or via
`@base-ui/react` — check before hand-rolling. zh-TW for any visible text.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass |
| Visual | `npm run dev` + browser | Step 3 |

## Scope

**In scope**: `src/routes/InvestmentsAnalyticsTab.tsx` only.

**Out of scope**:
- The `sub` resident captions (already done — leave them).
- Any risk calculation in `portfolioAnalytics.ts` — display only.
- The rolling-volatility chart and calendar heatmap.

## Steps

### Step 1: Enlarge the risk-KPI sparkline
Give the risk-card sparklines a larger size without changing the 60×26 default for
any other caller. Two acceptable approaches — pick one:
- (a) Pass explicit props at the risk-card call site: in `KpiCard`'s render, make
  the `Sparkline` responsive-ish, e.g. `width={96} height={32}`; or
- (b) Bump the `Sparkline` default to a larger size **only if** `KpiCard` is its
  sole consumer (verify with `grep -n "<Sparkline" src/routes/InvestmentsAnalyticsTab.tsx`).
Prefer (a) if `Sparkline` has other callers. Keep the SVG path math intact (it is
width/height-relative already).
**Verify**: `npx tsc --noEmit` → exit 0; the sparkline visibly larger in Step 3.

### Step 2: Make the metric help tappable
Replace the hover-only `title` in `MetricHelp` with a tap/click-dismissable
affordance. Preferred: a Base UI / COSS Popover or Tooltip that opens on
click/tap and on hover (so it works on both desktop and touch). If no such
primitive exists, the minimal acceptable fallback is a controlled
`useState`-toggled small popover `<div>` anchored to the icon, closing on outside
click. Keep `aria-label={text}` for screen readers. Bump the icon to `size={15}`
for a comfortably tappable target.
**Verify**: `npx tsc --noEmit` → exit 0; tap behavior confirmed in Step 3.

### Step 3: Visual confirm
Run `npm run dev`, open Investments → 投資分析 → 風險 section (needs enough trading
days; if data is insufficient the cards show the「交易日不足」message — use a longer
range or demo data).
**Verify**:
- The four risk KPI sparklines read as legible trend lines (not a tiny squiggle).
- Tapping/clicking the help icon shows the explanation and dismisses on a second
  tap / outside click — verified by resizing the preview to a narrow (mobile)
  width where hover is unavailable.
- Light + dark theme both legible.

## Test plan

- UI-only; no new unit test required. Existing suite stays green (`npm run test`).

## Done criteria

ALL must hold:
- [ ] Risk-KPI sparkline renders larger than 60×26 (code shows an explicit larger
      size for these cards)
- [ ] `MetricHelp` no longer relies solely on the native `title` tooltip (opens on
      click/tap)
- [ ] `npx tsc --noEmit` exits 0; `npm run build` exits 0; `npm run lint` 0 errors; `npm run test` passes
- [ ] No change to `portfolioAnalytics.ts` or any calculation (`git status`)
- [ ] No files outside `src/routes/InvestmentsAnalyticsTab.tsx` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:
- `Sparkline` turns out to have callers outside this file (then do not change its
  default; use approach (a) only) — report the call sites.
- No tap-capable tooltip/popover primitive exists and a hand-rolled one would
  require touching shared component files — report so it can be scoped separately.

## Maintenance notes

- If a tappable tooltip primitive is later added to `src/components/coss/`,
  `MetricHelp` and `HeadingWithHelp` (`:1088`) should both adopt it.
- Reviewer: confirm no calculation changed and the `sub` captions are untouched.
