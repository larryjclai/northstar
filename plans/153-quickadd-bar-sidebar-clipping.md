# Plan 153: Stop the Quick Add bar from being covered by the sidebar in narrow windows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat da946482..HEAD -- src/components/QuickAdd.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `da946482`, 2026-07-11

## Why this matters

Operator report: 「快速記帳 bar 在小視窗的時候會被 Sidebar 覆蓋到」. Reproduced
by the advisor in the dev preview at a 1040×650 viewport: the Quick Add bar's
left edge (its「+」icon and the input's start) disappears under the sidebar.

Mechanism (both sides are working as designed, and their interaction is the bug):

- The desktop sidebar deliberately sits at `zIndex: 1100`, ABOVE every fixed
  overlay, so full-viewport scrims don't grey out the macOS-vibrancy sidebar
  (a documented decision — see the comment at `src/components/AppShell.tsx:150-157`,
  from plan 052's follow-up / plan 063). **That decision stands; do not lower
  it or raise QuickAdd above it.**
- The Quick Add overlay is `position: fixed; inset: 0; zIndex: 80` and centers
  its bar in the **full viewport**. The bar is `width: min(620px, 94vw)`.
  Whenever `(viewportWidth − 620) / 2 < 240` (i.e. viewport ≲ 1100px with the
  expanded 240px sidebar), the bar extends under the sidebar and gets covered.

The fix follows the pattern the codebase already uses for the cash-flow entry
drawer: offset the overlay to start at the sidebar's right edge on desktop, so
centering happens within the content area. No z-index changes.

## Current state

- `src/components/QuickAdd.tsx` — the ⌘N quick-entry overlay. The container as
  of `da946482` (line 230–236):

  ```tsx
  return (
    <div className="flex" style={{ position: "fixed", inset: 0, zIndex: 80, alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "var(--ns-scrim)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-[ns-drawer-in_180ms_cubic-bezier(0.22,1,0.36,1)] flex flex-col gap-2.5"
        style={{ position: "relative", width: "min(620px, 94vw)", marginBottom: 28 }}
      >
  ```

- The exemplar pattern to copy — `src/routes/CashFlowRoute.tsx:1826` and
  `1909-1917` (the EntryDrawer):

  ```tsx
  const scrimLeft = sidebarCollapsed ? 64 : 240;
  // ...
  <div className="fixed inset-0 z-50" onClick={onClose}>
    {/* Scrim covers only the content area, leaving the native-vibrancy
        sidebar untouched on desktop; full-width below the lg breakpoint. */}
    <style>{`@media (max-width:1023.98px){.ns-entry-scrim{left:0 !important;}}`}</style>
    <div
      className="ns-entry-scrim absolute top-0 right-0 bottom-0"
      style={{ left: scrimLeft, background: "var(--ns-scrim)" }}
    />
  ```

  where `sidebarCollapsed` comes from the `useUiPreferences` zustand store
  (`src/state/uiPreferences.ts`; the sidebar is 64px collapsed / 240px
  expanded, and it is hidden entirely below the `lg` breakpoint, 1024px).

- QuickAdd's in-overlay popovers (`AccountFilter positionerClassName="z-[90]"`,
  lines 336/371) portal to `document.body` — they are unaffected by moving the
  overlay's left edge. Do not change them.

- Sidebar layout facts (context only, no changes there): `AppShell.tsx:140-159`,
  `aside` is `hidden lg:flex ... lg:sticky`, width 64/240 driven by the same
  `sidebarCollapsed` preference.

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass            |
| Lint      | `npm run lint` | exit 0              |
| Dev server| Browser-pane `preview_start` name `northstar-dev` (port 5173) | app loads |

## Scope

**In scope** (the only file you should modify):
- `src/components/QuickAdd.tsx`

**Out of scope** (do NOT touch, even though they look related):
- `src/components/AppShell.tsx` — the sidebar z-index 1100 decision is
  documented and intentional; do not lower it.
- `src/routes/CashFlowRoute.tsx` EntryDrawer — already correct; it is the
  pattern, not a target.
- QuickAdd's internal popovers (`positionerClassName="z-[90]"`) — body-portalled,
  unaffected.
- Mobile layout (<1024px): the sidebar is hidden there; the overlay must keep
  `left: 0` below `lg`.

## Git workflow

- Branch: `fix/ai-quickadd-sidebar-clip`
- Commit style: conventional commits, e.g.
  `fix(quick-add): center the bar in the content area so the sidebar cannot cover it`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Offset the overlay by the live sidebar width on desktop

In `src/components/QuickAdd.tsx`:

1. Read the collapse state (add to the component's existing hook calls):
   ```tsx
   import { useUiPreferences } from "../state/uiPreferences";
   // inside the component:
   const sidebarCollapsed = useUiPreferences((state) => state.sidebarCollapsed);
   const overlayLeft = sidebarCollapsed ? 64 : 240;
   ```
   (Check the store's actual selector shape against another consumer, e.g.
   `AppShell.tsx`, and match it.)

2. Change the outer container to start at the sidebar edge on `lg`+ and stay
   full-width below, mirroring the EntryDrawer trick:
   ```tsx
   <div className="ns-quickadd-overlay flex" style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: overlayLeft, zIndex: 80, alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
     <style>{`@media (max-width:1023.98px){.ns-quickadd-overlay{left:0 !important;}}`}</style>
   ```
   (`inset: 0` is replaced by the four sides so `left` can vary. The inner
   scrim div keeps `position:absolute; inset:0` — it now covers exactly the
   content area, same as the EntryDrawer scrim.)

3. Leave everything else (bar width `min(620px, 94vw)`, z-index, animation,
   click-to-close) untouched. Note `94vw` still references the viewport; at
   e.g. 1040px wide the content area is 800px and the bar takes
   `min(620, 977.6)` = 620 > 800? No — 620 < 800, fits. Only below ~660px
   content width would `94vw` overflow the content area, and below 1024px the
   offset is 0 again; the narrow band 1024–1100px yields a bar of 620px in a
   ≥784px content column. No change needed — verify visually in Step 2.

**Verify**: `npx tsc` → exit 0; `npm run lint` → exit 0.

### Step 2: Live verification

1. Start the dev server (Browser pane, launch config `northstar-dev`).
2. Resize to 1040×650. Open Quick Add (the sidebar「快速記帳」button or ⌘N).
   - The bar must be fully visible, its「+」icon clear of the sidebar.
   - The sidebar must NOT be greyed by the scrim (scrim starts at its right edge).
3. Collapse the sidebar (the caret button), reopen Quick Add — bar centers in
   the wider content area (offset 64).
4. Resize to 900×650 (below `lg`; sidebar hidden, mobile dock shows). Open
   Quick Add via the floating + button — the overlay must span the full width
   (`left: 0`).
5. Resize to 1400×800 — unchanged behavior vs today (bar centered, nothing
   clipped).

**Verify**: screenshots at 1040px (expanded sidebar) and 900px; both show the
full bar.

### Step 3: Full gates

**Verify**: `npm test` → all pass (no QuickAdd test asserts the old geometry;
if one fails, read it before touching it — see STOP conditions).

## Test plan

No new unit test: the change is pure fixed-positioning geometry, which jsdom
cannot meaningfully assert. The live checks in Step 2 are the acceptance
evidence (attach screenshots to the report).

## Done criteria

Machine-checkable / observable. ALL must hold:

- [ ] `npx tsc` exits 0; `npm run lint` exits 0; `npm test` exits 0
- [ ] `grep -n "zIndex: 1100" src/components/AppShell.tsx` still matches
      (sidebar decision untouched)
- [ ] `grep -n "ns-quickadd-overlay" src/components/QuickAdd.tsx` → ≥2 matches
      (class + media-query override)
- [ ] Preview at 1040×650: Quick Add bar fully visible left-to-right (screenshot)
- [ ] Preview at 900×650: overlay spans full width (screenshot)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The QuickAdd container at line ~230 doesn't match the excerpt.
- `useUiPreferences` has no `sidebarCollapsed` field (check
  `src/state/uiPreferences.ts` first).
- A test fails that asserts QuickAdd overlay geometry — report it rather than
  rewriting the test.
- Fixing this appears to require changing any z-index in `AppShell.tsx`.

## Maintenance notes

- If the sidebar widths (64/240) ever change in `AppShell.tsx`, this offset
  and `CashFlowRoute.tsx:1826`'s `scrimLeft` must change with them — they are
  now two copies of the same constant; consider centralizing in
  `uiPreferences` if a third consumer appears.
- Reviewer: check the scrim edge at exactly 1024px (breakpoint boundary) in
  both collapsed states.
- Deliberately NOT changed: QuickAdd does not scroll-lock the page (unlike the
  EntryDrawer). Plan 155 fixes the scroll-lock helper; whether QuickAdd should
  adopt it is a product call left open.
