# Plan 159: Mobile bottom-sheet presentation for ModalShell + drag-to-dismiss with momentum

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 37ccb332..HEAD -- src/components/ModalShell.tsx src/components/AppShell.tsx src/styles/globals.css`
> Plan 157 landing first is EXPECTED drift (this plan requires it — verify
> `requestClose` and `ns-overlay-panel` exist in ModalShell.tsx before
> starting; if absent, STOP: execute plan 157 first).

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED-HIGH — pointer-gesture code on the shared overlay wrapper;
  regressions block core flows (add investment, edit account) on mobile
- **Depends on**: plans/157-modalshell-exit-motion.md (hard dependency)
- **Category**: direction (iOS native feel)
- **Planned at**: commit `37ccb332`, 2026-07-12

## Why this matters

This is the single biggest gap between "web app in a WKWebView" and "native
iOS app". Today every drawer/sheet renders as a **right-side desktop drawer
even on a phone**, and the codebase contains **zero touch gestures** (verified:
`grep -rn "onPointerDown\|onTouchStart" src --include="*.tsx"` → no matches at
planning time). Native iOS presents forms as bottom sheets the user can drag
down to dismiss, with 1:1 finger tracking, rubber-banding past the top, and a
release decision based on projected momentum (a flick dismisses even from a
small displacement). Centralizing this in ModalShell gives every existing
overlay the native presentation without per-screen work, and gives the
hand-rolled AppShell「更多」sheet (currently animation-less) the same treatment.

## Current state

Verified at commit `37ccb332` (plus plan 157's expected changes).

- `src/components/ModalShell.tsx` — after plan 157: variants
  `center | sheet | drawer`, motion CSS via `ns-overlay-panel[data-motion]`,
  exit via `requestClose()` → `data-closing` → `transitionend` → `onClose`.
  Panels are positioned by **call-site** `panelStyle` (e.g.
  `InvestmentsAddSheet.tsx`: `position: "absolute", right: 0, top: 0,
  bottom: 0, width: "min(520px, 100%)"`).
- `src/components/AppShell.tsx:399-430` — the mobile「更多」sheet is a
  hand-rolled `fixed inset-0` overlay + `absolute inset-x-0 bottom-0
  rounded-t-2xl` panel with `paddingBottom: calc(env(safe-area-inset-bottom) + 8px)`,
  **no animation, no drag, no focus trap**.
- Mobile breakpoint convention: the app treats `< 1024px` (`lg:`) as
  mobile-nav territory and `max-width: 900px` / `640px` for layout collapses.
  Touch detection convention in the codebase: COSS uses the `pointer-coarse:`
  Tailwind variant; `AppShell.applyNativeGlassAttribute` uses
  `navigator.maxTouchPoints`.
- Motion/gesture reference values (from the Apple Designing-Fluid-Interfaces
  material — inline so you don't need any external doc):
  - Momentum projection: `projected = current + (v_px_per_s / 1000) * d / (1 - d)` with `d = 0.998`.
  - Rubber-band: `offset = (overshoot * dim * c) / (dim + c * |overshoot|)` with `c = 0.55`.
  - Dismiss decision: use the **projected** endpoint and the velocity sign,
    not the raw release position.
- Global reduced-motion rule (`globals.css:491-498`) zeroes transition
  durations — drag still tracks 1:1 (inline transform, not a transition), and
  the settle/exit becomes instant. That is the correct reduced-motion
  behaviour; no extra code path.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0 |
| Tests     | `npm test`         | all pass |
| Focused   | `npx vitest run src/components/ModalShell.test.tsx` | all pass |
| Lint      | `npm run lint`     | exit 0 |

## Scope

**In scope**:
- `src/components/ModalShell.tsx` (bottom-sheet mode + drag gesture)
- `src/components/ModalShell.test.tsx`
- `src/styles/globals.css` (sheet-bottom motion + handle styles)
- `src/components/AppShell.tsx` (migrate the「更多」sheet to ModalShell)
- Call sites opting in (Step 4): `InvestmentsAddSheet.tsx`,
  `AccountsRoute.tsx`, `RecurringRulesTab.tsx`, `CategoryManagementDrawer.tsx`

**Out of scope** (do NOT touch):
- `TransactionDetailPanel.tsx` and `CashFlowRoute.tsx` drawers — high-traffic;
  migrate them in a follow-up after this pattern has been verified on device.
- Swipe-back page navigation, pull-to-refresh, row swipe actions.
- `ui/dialog.tsx` (Base UI dialogs stay centered).
- QuickAdd (own overlay, already bottom-anchored on mobile).

## Git workflow

- Branch: `feat/ai-bottom-sheet-gestures`. Conventional commits. Do NOT push
  or open a PR unless the operator instructed it.

## Steps

### Step 1: Bottom-sheet presentation mode in ModalShell

1. New prop: `mobilePresentation?: "bottom-sheet" | "none"` (default `"none"`
   — fully opt-in, zero behaviour change for un-migrated call sites).
2. Detection: `const isCoarse = window.matchMedia("(pointer: coarse), (max-width: 1023px)").matches`
   evaluated once per mount (a `useState` initializer is fine; sheets don't
   need live re-query mid-open).
3. When active (`mobilePresentation === "bottom-sheet" && isCoarse`), ModalShell
   **overrides** the call site's panel positioning: render the panel with
   class `ns-sheet-bottom` and `data-motion="sheet-bottom"` (instead of
   `drawer`), ignoring the call site's positional `panelStyle` keys
   (`position/top/right/bottom/left/width`) but keeping the rest. Implement by
   destructuring those keys out of `panelStyle` in this mode.
4. Render a drag handle + grab region as the first child of the panel in this
   mode: `<div className="ns-sheet-grab" aria-hidden="true"><div className="ns-sheet-handle" /></div>`.
5. CSS in globals.css:

   ```css
   /* ── Bottom sheet (plan 159) ── */
   .ns-sheet-bottom {
     position: fixed; left: 0; right: 0; bottom: 0;
     max-height: min(92dvh, 100%);
     display: flex; flex-direction: column;
     background: var(--ns-bg-elev);
     border-top: 1px solid var(--ns-border);
     border-radius: 16px 16px 0 0;
     box-shadow: var(--ns-shadow-2);
     padding-bottom: env(safe-area-inset-bottom);
     overflow: hidden;
   }
   .ns-overlay-panel[data-motion="sheet-bottom"] {
     transition: transform 260ms var(--ns-ease-out-strong), opacity 260ms var(--ns-ease-out-strong);
     @starting-style { transform: translateY(100%); }
   }
   .ns-overlay-panel[data-motion="sheet-bottom"][data-closing] {
     transform: translateY(100%);
     transition-duration: 200ms;
   }
   .ns-sheet-grab { flex: 0 0 auto; display: grid; place-items: center; padding: 10px 0 6px; touch-action: none; }
   .ns-sheet-handle { width: 36px; height: 5px; border-radius: 999px; background: var(--ns-border-strong); }
   ```

   Inner form content must scroll within the sheet: the call sites' existing
   `flex-direction: column` bodies with their own scroll areas keep working
   because `.ns-sheet-bottom` is a flex column with `overflow: hidden`.

**Verify**: `npm run build` → exit 0; `npx vitest run src/components/ModalShell.test.tsx` → all pass (nothing opts in yet).

### Step 2: Drag-to-dismiss gesture

Add to ModalShell, active only in bottom-sheet mode. Attach
`onPointerDown` to the grab region (`.ns-sheet-grab`) — not the whole panel,
so form scrolling is never hijacked.

```tsx
// refs: dragState = { startY, lastY, lastT, velocity (px/s), active }
onPointerDown: capture the pointer (setPointerCapture), record startY/time,
  set panel style.transition = "none" (1:1 tracking must not be smoothed).
onPointerMove: dy = clientY - startY.
  if (dy >= 0) panel.style.transform = `translateY(${dy}px)`;
  else panel.style.transform = `translateY(${rubberband(dy, panelHeight)}px)`;
  // rubberband(o, dim, c = 0.55) = (o * dim * c) / (dim + c * Math.abs(o))
  velocity = (clientY - lastY) / ((now - lastT) / 1000); // px/s, keep last sample
onPointerUp:
  panel.style.transition = "";           // hand control back to CSS
  const projected = dy + (velocity / 1000) * 0.998 / (1 - 0.998);
  if (projected > panelHeight / 2 && velocity > -50) {
    // momentum says "gone": run the standard exit
    panel.style.transform = "";          // let [data-closing] own the transform
    requestClose();
  } else {
    panel.style.transform = "";          // transition springs it back to 0
  }
```

Guards: ignore a second pointer while dragging; on `pointercancel`, snap back
(same as the else-branch). Keyboard/AT users are unaffected (Escape and the
close buttons still work; the handle is `aria-hidden`).

**Verify**: `npm run build` → exit 0. Gesture correctness is manually verified
in Step 5 (jsdom cannot exercise pointer capture + CSS transforms meaningfully).

### Step 3: Migrate the AppShell「更多」sheet to ModalShell

Replace the hand-rolled block at `AppShell.tsx:399-430` with a ModalShell:

```tsx
{moreOpen ? (
  <ModalShell
    variant="sheet"
    mobilePresentation="bottom-sheet"
    title="更多"
    onClose={() => setMoreOpen(false)}
    className="lg:hidden"
  >
    …existing header (keep the × button, wire it to useModalDismiss(() => setMoreOpen(false)))…
    …existing <nav> content verbatim…
  </ModalShell>
) : null}
```

This upgrade also gives the sheet the focus trap + scroll lock it currently
lacks. Keep the nav links' `onClick={() => setMoreOpen(false)}` (router
navigation unmounts anyway; instant close on navigate is fine).

**Verify**: `npm run build` → exit 0; `npm test` → all pass. Manual at <1024px:
更多 slides up with handle, drags down to dismiss, scrim click closes.

### Step 4: Opt in the four form sheets

In `InvestmentsAddSheet.tsx`, `AccountsRoute.tsx` (account editor drawer),
`RecurringRulesTab.tsx` (rule editor drawer), `CategoryManagementDrawer.tsx`:
add `mobilePresentation="bottom-sheet"` to the ModalShell. No other changes —
desktop keeps the right-drawer presentation.

**Verify**: `npm run build` → exit 0; `npm test` → all pass.

### Step 5: Tests + manual device pass

Unit tests (ModalShell.test.tsx): (a) `mobilePresentation="bottom-sheet"` with
a mocked coarse `matchMedia` renders `ns-sheet-bottom` + the handle; (b) with a
fine-pointer mock, panelStyle positioning is untouched; (c) drag handle exists
only in sheet mode. Mock `matchMedia` per-test with `vi.stubGlobal` (repo
convention for jsdom gaps — AGENTS.md).

Manual (report results in the status row): Vite dev in responsive mode →
presentation + scrim; real gesture feel needs the iOS build
(`npm run tauri ios dev`, see docs/ios-mobile-plan.md) or Safari device
emulation. Check: 1:1 tracking, rubber-band above rest, flick-dismiss from a
small displacement, slow-drag-past-half dismisses, release below half snaps
back, keyboard-only flow unaffected.

## Done criteria

- [ ] `npm run build`, `npm test`, `npm run lint` all exit 0
- [ ] ModalShell.test.tsx: all pre-existing + ≥3 new tests pass
- [ ] Un-migrated ModalShell call sites render pixel-identical on desktop
      (no positional override when `mobilePresentation` unset)
- [ ] AppShell.tsx no longer contains the hand-rolled 更多 overlay
      (`grep -n "rounded-t-2xl" src/components/AppShell.tsx` → 0 matches)
- [ ] The four Step-4 call sites carry `mobilePresentation="bottom-sheet"`
- [ ] `plans/README.md` status row updated (note which manual checks ran)

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 157's `requestClose` / motion classes are absent from ModalShell.
- Overriding panel positioning breaks a call site whose content relies on its
  own `position: fixed` internals — skip that call site and report.
- The focus-trap autofocus fights the drag handle (focus ring on open) —
  report; do not remove the focus trap.
- Any pre-existing ModalShell test needs its assertions changed.

## Maintenance notes

- Follow-up (deliberately deferred): migrate TransactionDetailPanel and the
  CashFlowRoute entry drawer to `mobilePresentation="bottom-sheet"` after a
  real-device pass; add velocity handoff (spring settle) if the CSS-transition
  settle reads as flat on device; consider drag-from-header in addition to the
  handle.
- If a sheet's inner content becomes scrollable to the top edge, a future
  enhancement is drag-from-content when `scrollTop === 0` — keep that OUT of
  the grab-region implementation until asked.
- Reviewer: check that no call site lost its desktop drawer styling, and that
  `touch-action: none` exists on `.ns-sheet-grab` (without it, WKWebView will
  scroll instead of drag).
