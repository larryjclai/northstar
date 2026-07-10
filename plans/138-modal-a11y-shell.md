# Plan 138: A shared accessible ModalShell (dialog role, focus trap, Escape) adopted by the hand-rolled overlays

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. If anything in the "STOP conditions" section occurs,
> stop and report. When done, update this plan's status row in
> `plans/README.md` — unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/routes src/components DESIGN.md`
> Re-locate by grep; STOP if a shared modal component appeared since planning.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED — focus traps can fight portalled popovers (AppSelect, date
  pickers) rendered inside modals; migration is therefore incremental with
  a per-modal verification step.
- **Depends on**: plans/136 (scrim tokens) recommended first — the shell
  bakes the token in; if 136 hasn't run, the shell still uses the token and
  136's remaining sites shrink.
- **Category**: tech-debt (a11y, WCAG 2.4.3 / 4.1.2)
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

The app has NO shared dialog: every modal/sheet re-implements a fixed overlay
per DESIGN.md §6.4's reference pattern — which itself has no `role="dialog"`,
no `aria-modal`, no focus management, and (in most copies) no Escape handling.
Keyboard focus stays BEHIND the scrim; screen readers get no announcement;
several modals are keyboard-undismissable. Only `OnboardingOverlay` sets
`role="dialog" aria-modal`. A fully-accessible Base UI Dialog exists at
`src/components/ui/dialog.tsx` but is quarantined by
`src/components/ui/README.md` (「app 程式碼禁止直接 import」 — it exists only
for calendar/command internals). The documented convention institutionalizes
the gap; this plan replaces the convention.

## Current state

- §6.4 reference pattern (DESIGN.md, quoted): scrim div (`fixed inset-0 z-50
  flex items-end justify-center p-4 sm:items-center`, click-to-close) +
  stopPropagation panel + header/body/footer. Mobile bottom-sheet via
  `items-end`.
- Escape handled only in: `InvestmentsAddSheet.tsx:246`,
  `CashFlowRoute.tsx:1845`, `QuickAdd.tsx:96`,
  `CategoryManagementDrawer.tsx:126` (read one for the pattern).
- Hand-rolled modal inventory (grep `fixed inset-0` in src/routes
  src/components): HoldingEditModal, AccountsRoute (adjust modal + wizard
  drawer), TransactionDetailPanel, RecurringRulesTab drawer,
  RecurringInvestmentsTab drawer, GoalsRoute/GoalEditorSheet,
  ReconcileRoute ×2, InvestmentImportWizard, ManualPriceImportWizard,
  InvestmentsAddSheet, CashFlowRoute drawer, QuickAdd, ConnectSection modal,
  CategoryManagementDrawer. (Re-derive; some are drawers/sheets — same shell,
  different panel classes.)
- The COSS/ui quarantine is a settled convention — do NOT lift it. The shell
  is a NEW app component.

## Target component

`src/components/ModalShell.tsx` (new), owning:

- Portal-less (matches current pattern) fixed overlay using
  `.ns-modal-scrim` / `var(--ns-scrim)`.
- `role="dialog"`, `aria-modal="true"`, `aria-label` or `aria-labelledby`
  (required prop: `title` string or `labelledById`).
- Focus management WITHOUT a dependency: on mount, save
  `document.activeElement`, focus the panel (`tabIndex={-1}` on the panel
  div) or the first `[data-autofocus]` descendant; on unmount, restore. Trap:
  keydown listener for Tab cycling within the panel's focusable elements
  (query `a[href], button:not([disabled]), input, select, textarea,
  [tabindex]:not([tabindex="-1"])`). ~40 lines; no new dep. (Base UI is
  already a dependency and its Dialog does this better — but it's quarantined;
  if during implementation you find the quarantine README explicitly allows a
  NEW whitelist entry, you may instead propose `dialog` for the whitelist —
  that is an operator decision: STOP and ask via report rather than deciding.)
- Escape closes (unless `disableEscape`), scrim click closes (unless
  `disableScrimClose` — wizards with dirty state may opt out).
- Body scroll lock while open (set `overflow: hidden` on body; restore on
  unmount — check whether any current modal already does this; QuickAdd is a
  likely reference).
- Layout via existing classes: accept `variant: "center" | "sheet" | "drawer"`
  mapping to the current panel class patterns (read 2–3 existing modals per
  variant to extract the shared classes; pixel-identity per variant is the
  bar).

## Commands

`npx tsc` (exit 0), `npm test` (all pass), `npm run lint` (exit 0).

## Scope

**In scope**:
- New `src/components/ModalShell.tsx` + `ModalShell.test.tsx`
- Migration of FOUR pilot modals (one per shape):
  `HoldingEditModal.tsx` (center modal — the §6.4 reference),
  `TransactionDetailPanel.tsx` (side panel),
  `AccountsRoute.tsx` adjust modal (center, small),
  `CategoryManagementDrawer.tsx` (drawer w/ existing Escape).
- DESIGN.md §6.4 rewrite: the pattern is now "use `ModalShell`" with the
  props table; keep the old markup as "legacy pattern (migrating)".

**Out of scope**:
- The remaining ~10 overlays — the migration continues per-file in follow-ups
  (record the inventory + status in the report); do not big-bang.
- QuickAdd and OnboardingOverlay (bespoke flows; migrate later, they already
  have partial handling).
- `components/ui/` quarantine changes (operator decision, see above).

## Git workflow

Branch `feat/ai-modal-shell`; commits: shell+tests, then one per pilot
migration. No push/merge.

## Steps

1. **Build ModalShell + unit tests** (Testing Library, jsdom): renders
   role/aria; Escape calls onClose; Tab from last focusable wraps to first;
   focus restored on unmount; scrim click closes; `disableScrimClose`
   respected. Pattern exemplar: `src/components/MarkdownText.test.tsx` for
   file layout, plus jsdom focus assertions (`document.activeElement`).
   **Verify**: `npm test -- ModalShell` green.
2. **Pilot 1 — HoldingEditModal**: swap the outer two divs for ModalShell,
   keep inner content untouched. Diff must show structure-only change.
   **Verify**: `npx tsc`; app tests green; dev-server eyeball (open the
   modal: focus lands inside, Tab cycles, Escape closes, click-out closes,
   layout pixel-similar) — if headless, list for operator.
3. **Pilots 2–4**: same treatment; CategoryManagementDrawer drops its own
   Escape listener in favor of the shell's.
   **Verify per pilot**: gates + eyeball note. CRITICAL check per pilot: any
   `AppSelect`/date-picker INSIDE the modal still opens and receives focus
   (the trap must treat portalled popover content as inside — if popovers
   portal to body, the trap will fight them → see STOP).
4. **DESIGN.md §6.4 rewrite** + inventory table of remaining overlays in the
   report.
   **Verify**: `npm run lint`, `npm test` green.

## Done criteria

- [ ] ModalShell with ≥6 passing a11y unit tests
- [ ] 4 pilots migrated, visually pixel-similar, popovers-in-modals working
- [ ] DESIGN.md §6.4 points to ModalShell
- [ ] Remaining-overlay inventory recorded
- [ ] Gates green; `plans/README.md` updated

## STOP conditions

- Popovers inside modals portal to `document.body` and the focus trap breaks
  them (Tab jumps out of the popover or the trap steals focus) — STOP after
  documenting which component portals where; the resolution (trap allowlist
  for `[data-portal]` containers vs adopting Base UI Dialog) is a design
  decision for the operator.
- Any pilot needs >20 lines of content change (not just shell swap).

## Maintenance notes

- Follow-up plans migrate the remaining overlays one file at a time (the 115
  campaign's per-file dispatch pattern worked well; reuse it).
- Reviewer: the focusable-elements query and restore-focus path are the bug
  farm — test with a modal opened from a row button deep in a list.
