# Plan 136: Route every overlay scrim and drawer shadow through the design tokens

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. If anything in the "STOP conditions" section occurs,
> stop and report. When done, update this plan's status row in
> `plans/README.md` — unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/routes src/components src/styles/globals.css`
> Step 1's grep re-derives the list; STOP only if `--ns-scrim` or
> `.ns-modal-scrim` definitions changed in globals.css.

## Status

- **Priority**: P3
- **Effort**: M (mechanical but each overlay needs an eyeball)
- **Risk**: LOW (token is a drop-in; slight intended visual shift)
- **Depends on**: none
- **Category**: tech-debt (design-system compliance)
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

DESIGN.md §2.4 defines `--ns-scrim` — a brand-hued translucent dark that
replaces pure black behind modals/sheets（「設計原則：不用純黑」）— and plan
107/115 already migrated CashFlowRoute's modals to it via `.ns-modal-scrim`.
But ~12 other overlays still hardcode `rgba(0,0,0,0.35–0.6)`, several with a
decorative `backdropFilter: blur(4px)` on top (glassmorphism-as-default — an
impeccable anti-pattern; the sanctioned glass material is only the
macOS `data-native-glass`). Drawer shadows likewise hardcode black instead of
`--ns-shadow-2`. Result: overlays are colder/off-brand and don't tint with
the light theme.

## Current state

Canonical implementations to match:
- `globals.css`: `.ns-modal-scrim` (uses `var(--ns-scrim)`) and
  `.ns-modal-panel` — grep both for exact definitions; CashFlowRoute's three
  modals use them (exemplar).
- `--ns-shadow-2` (DESIGN.md §2.6) for overlay/modal elevation.

Sites to migrate (verified by grep at planning; re-derive with
`grep -rn "rgba(0,0,0" src/routes src/components --include="*.tsx"`):

Scrims (background + often blur):
- `AccountsRoute.tsx` ×2 (0.4 + blur), `InvestmentsAddSheet.tsx` (0.4 + blur),
  `RecurringInvestmentsTab.tsx` (0.4 + blur),
  `CategoryManagementDrawer.tsx` (0.4 + blur), `ReconcileRoute.tsx` ×2 (0.4),
  `RecurringRulesTab.tsx` (0.35), `TransactionDetailPanel.tsx` (0.35),
  `CashFlowRoute.tsx` one remaining (0.4 — the drawer at ~:1903, distinct
  from the three fixed modals), `QuickAdd.tsx` (0.4),
  `InvestmentImportWizard.tsx` (0.6), `ManualPriceImportWizard.tsx` (0.6),
  `settings/ConnectSection.tsx` (0.45).

Drawer/panel shadows (`boxShadow: "-24px 0 60px rgba(0,0,0,0.45)"` and
similar): AccountsRoute, RecurringInvestmentsTab, InvestmentsAddSheet (~:474),
CashFlowRoute (~:1911), RecurringRulesTab (~:361),
TransactionDetailPanel (~:113).

Leave alone (NOT scrims — small elevation/borders; verified):
`NotificationCenter.tsx:125`, `FilterPill.tsx`, `SegmentedControl.tsx:51`,
`CategoriesRoute` header shadow, `AnnualReportRoute` `--ns-bg-subtle`
fallback, the `border: 1px solid rgba(0,0,0,0.12)` active-chip borders in
CashFlowRoute/QuickAdd (subtle intentional edge on colored chips).

## Commands

`npx tsc` (exit 0), `npm test` (all pass), `npm run lint` (exit 0).

## Scope

**In scope**: the scrim + drawer-shadow sites above. Where an overlay is a
`fixed inset-0` div: prefer `className="ns-modal-scrim"` (+ keep
positioning classes) over inline `background: "var(--ns-scrim)"` — follow the
CashFlowRoute exemplar. Drop the decorative `backdropFilter: blur(4px)`
everywhere it accompanies a scrim. Shadows → `boxShadow: "var(--ns-shadow-2)"`
or a class if one exists.

**Out of scope**: the leave-alone list; modal STRUCTURE/behavior (plan 138);
globals.css token values; `data-native-glass` machinery (macOS titlebar —
guarded by prior plans 094/097/111, do not touch AppShell).

## Git workflow

Branch `refactor/ai-scrim-tokens`; commit
`refactor(design): overlays use --ns-scrim / --ns-shadow-2, drop decorative blur`.
No push/merge.

## Steps

1. Re-derive the live site list (grep). Migrate scrims file-by-file; each
   file: swap background → token/class, remove blur, swap shadow.
   **Verify per file**: `npx tsc` exit 0.
2. Sweep check:
   `grep -rn 'rgba(0,0,0,0\.[3-6]' src/routes src/components --include="*.tsx"`
   → only the leave-alone borders remain (0.12 etc. are excluded by the
   pattern; confirm output matches the leave-alone list).
3. Visual pass: with the dev server, open ≥4 migrated overlays (AccountsRoute
   adjust modal, InvestmentsAddSheet, TransactionDetailPanel, QuickAdd) in
   BOTH themes; scrim should read slightly brand-tinted, no blur. If no
   browser available, note "operator visual check" with that list.
   **Verify**: `npm test`, `npm run lint` green.

## Test plan

No unit tests (visual styling); Step 2's grep is the machine check.

## Done criteria

- [ ] Step 2 grep output == leave-alone list only
- [ ] `grep -rn "backdropFilter" src/routes src/components` shows no
      blur-on-scrim sites (only sanctioned material effects, if any)
- [ ] Gates green; visual pass done or handed to operator
- [ ] `plans/README.md` updated

## STOP conditions

- An overlay's scrim doubles as a color-critical backdrop (e.g. an
  image-preview lightbox needing near-black) — leave it, record it.
- `.ns-modal-scrim` carries positioning that conflicts with a site's layout —
  fall back to inline `var(--ns-scrim)` for that site and note it.

## Maintenance notes

- Plan 138's ModalShell should bake `.ns-modal-scrim` in, ending this class
  of drift.
- Reviewer: light-theme check matters most — pure black at 0.4 vs the tinted
  scrim is most visible there.
