# Plan 084: Fix mobile bottom-nav tap target (z-index) and the overflowing net-worth period strip

> **Executor instructions**: Follow step by step. Run every verification command and
> confirm the expected result before moving on. If a STOP condition occurs, stop and
> report. Touch only the in-scope files.
>
> **Base**: build on the stacked branch `feat/ai-responsive-grid-collapse` (contains
> plans 079–083). Confirm: `grep -n "ns-an-feature-split" src/styles/globals.css`
> matches (proves 083 present). If not, STOP — wrong base.

## Status

- **Priority**: P1 (mobile nav is partly unusable)
- **Effort**: S
- **Risk**: LOW — one z-index rule + wrapping one control in a scroll container
- **Depends on**: 083 (shares `globals.css`, `DashboardRoute.tsx`)
- **Category**: bug (mobile UX)
- **Planned at**: stacked on `feat/ai-responsive-grid-collapse`, 2026-06-27

## Why this matters

Two mobile bugs reported at 379px width:
1. **Bottom-nav taps to 投資 (`/investments`) and 記帳 (`/cash-flow`) don't register.**
   Root cause: the fixed bottom dock `.ns-mobile-dock` has **no `z-index`**, so content
   that creates a stacking context (the tall net-worth chart card whose bottom extends
   into the dock area) is hit-tested above the dock's `<Link>`s — taps land on the card,
   not the nav. A fixed bottom nav must sit on its own raised stacking layer.
2. **The net-worth period strip (`1D 1W 1M 3M YTD 1Y 5Y All`) overflows the screen.**
   It's a non-wrapping `inline-flex` `SegmentedControl` with 8 segments; 8 don't fit at
   379px. Fix: make the strip horizontally scrollable (keep all 8 presets, swipe to reach
   them) — the standard mobile pattern, no functionality removed.

## Current state

**`src/styles/globals.css`** — the dock rule has background/blur/border but **no z-index**:
```css
.ns-mobile-dock {
  background: var(--ns-glass-bg);
  -webkit-backdrop-filter: blur(...) saturate(...);
  backdrop-filter: blur(...) saturate(...);
}
.ns-mobile-dock { border-top: 1px solid var(--ns-border); }
```
The dock element (`src/components/AppShell.tsx:414`): `className="ns-mobile-dock fixed inset-x-0 bottom-0 grid grid-cols-5 lg:hidden"` — no `z-*` class. The mobile FAB (`AppShell.tsx:372`): `className="fixed right-4 bottom-20 ... lg:hidden"` — also no `z-*`. The "更多" sheet overlay already uses `z-50` (`fixed inset-0 z-50 lg:hidden`).

**`src/routes/DashboardRoute.tsx`** (~line 891-897) — the overflowing strip:
```tsx
<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
  <SegmentedControl
    value={stripPeriod}
    onChange={setStripPeriod}
    options={STRIP_PERIODS.map((v) => ({ value: v, label: v }))}
  />
  <Button size="sm" variant={longViewMode ? "default" : "outline"} ...>長期視角</Button>
```
The outer `flexWrap: "wrap"` lets the 長期視角 button wrap below, but the `SegmentedControl`
itself is `inline-flex` (`src/components/SegmentedControl.tsx`) and does not shrink/scroll —
its 8 segments overflow horizontally.

### Conventions to follow

- z-index: the codebase uses Tailwind `z-*` (the more-sheet uses `z-50`). Keep the dock
  **below** the more-sheet (z-50) but above content. Use `z-40` for the dock and `z-30`
  for the FAB (FAB sits above content, below the dock where they'd ever overlap).
- Add z-index in `globals.css` on `.ns-mobile-dock` (keep it with the other dock rules),
  OR as a Tailwind `z-40` class on the element — pick the globals.css approach to keep the
  dock's chrome rules together. Also add `isolation: isolate` so the dock forms its own
  stacking context reliably across engines.
- For the strip, wrap the `SegmentedControl` in a horizontally-scrollable container; hide
  the scrollbar (this UI has no visible scrollbars elsewhere). Use an existing utility if
  one exists; otherwise add a small `.ns-hscroll` helper in globals.css.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Build | `npm run build` | exit 0 |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Tests | `npm test` | all pass |
| Dev (for the 379px repro) | `npm run dev` | Vite serves on a port |

## Scope

**In scope**:
- `src/styles/globals.css` — `.ns-mobile-dock` z-index + isolation; a `.ns-hscroll` helper if needed
- `src/components/AppShell.tsx` — FAB `z-30` (only if needed to keep ordering correct)
- `src/routes/DashboardRoute.tsx` — wrap the net-worth `SegmentedControl` in a scroll container

**Out of scope**:
- The `SegmentedControl` component itself (used in many places — don't change its base
  behavior; only wrap the one instance on the dashboard)
- Any route logic, data, or chart internals
- The desktop layout (≥1024px `lg:`) — must be visually unchanged
- The other date control (`DateScopeControl`, 4 presets) — it fits; leave it

## Git workflow

- Branch: `feat/ai-mobile-dock-strip-fix` (off the stacked base via Step 0)
- Conventional commits, e.g. `fix(mobile): raise bottom-nav z-index and make net-worth strip scrollable`
- Commit when done. Do NOT push.

## Steps

### Step 0: integrate the stacked base
In your fresh worktree:
```
git merge --no-ff feat/ai-responsive-grid-collapse -m "integrate: stacked 079-083"
npm install
grep -n "ns-an-feature-split" src/styles/globals.css   # expect a match (083 present)
npx tsc --noEmit                                        # expect exit 0
git checkout -b feat/ai-mobile-dock-strip-fix
```
If the merge conflicts or the grep/tsc fail, STOP and report.

### Step 1: Raise the bottom dock onto its own stacking layer

In `globals.css`, add to the `.ns-mobile-dock` rules:
```css
.ns-mobile-dock { z-index: 40; isolation: isolate; }
```
(Place it next to the existing `.ns-mobile-dock { border-top: ... }` line.)

If, after Step 4 reproduction, taps still miss, the FAB or another overlay may be the
culprit — give the FAB in `AppShell.tsx:372` a `z-30` class (`className="... z-30 ..."`).
Only add the FAB z-index if reproduction shows it's needed; note your decision.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Make the net-worth period strip horizontally scrollable

In `DashboardRoute.tsx` (~line 891), wrap the `SegmentedControl` (NOT the 長期視角 button)
in a horizontally-scrollable container so the 8 presets scroll instead of overflowing.
Target shape:
```tsx
<div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
  <div className="ns-hscroll" style={{ maxWidth: "100%" }}>
    <SegmentedControl
      value={stripPeriod}
      onChange={setStripPeriod}
      options={STRIP_PERIODS.map((v) => ({ value: v, label: v }))}
    />
  </div>
  <Button ...>長期視角</Button>
</div>
```
Add the helper to `globals.css` (if no equivalent exists):
```css
/* Horizontal scroll for overflowing inline controls (e.g. the net-worth period
   strip on phones). Scrollbar hidden to match the app's chrome-less surfaces. */
.ns-hscroll { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
.ns-hscroll::-webkit-scrollbar { display: none; }
```
The `SegmentedControl` is `inline-flex`, so inside an `overflow-x:auto` box it keeps its
intrinsic width and the box scrolls. Do not set `fullWidth` on it.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Full verification

**Verify**:
- `npm run build` → exit 0
- `npm run lint` → exit 0 (0 errors)
- `npm test` → all pass (no new failures)

### Step 4: Reproduce at 379px (best-effort in your environment)

Start the dev server (`npm run dev`) and, if you have browser/preview tooling, load the
app at 379px width in demo mode (the app has a 示範模式 / demo entry on the dashboard).
Confirm:
- The net-worth strip no longer overflows the viewport — it scrolls horizontally.
- The bottom-nav 投資 and 記帳 items are tappable (navigate to `/investments` and
  `/cash-flow`).

If you cannot drive the browser in your environment, mark these two as
"manual-verify-pending" and instead prove the CSS is applied:
`grep -n "z-index: 40" src/styles/globals.css` and confirm `.ns-hscroll` wraps the strip.

## Done criteria (ALL must hold)

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] `npm test` exits 0 (no new failures)
- [ ] `grep -n "z-index: 40" src/styles/globals.css` matches (dock raised)
- [ ] `grep -n "isolation: isolate" src/styles/globals.css` matches
- [ ] `grep -n "ns-hscroll" src/styles/globals.css src/routes/DashboardRoute.tsx` shows defined AND used
- [ ] No files outside the in-scope list modified
- [ ] 379px tap + scroll behavior — confirmed, or marked manual-verify-pending with the CSS-applied greps shown

## STOP conditions

- Base is not the stacked branch (083 grep fails).
- The cited `DashboardRoute.tsx` strip markup doesn't match the excerpt (drift).
- Raising the dock z-index visibly breaks the desktop sidebar or the more-sheet overlay
  ordering (the sheet must stay above the dock).
- Reproduction shows the nav failure persists even with the dock at z-40 AND the FAB at
  z-30 — then the cause is elsewhere (e.g. a route render crash); STOP and report what
  you observed (console errors, whether the URL changes on tap) rather than guessing.

## Maintenance notes

- The dock z-index is the durable fix for "fixed bottom nav swallowed by content" — any
  future full-bleed card or overlay must stay below `z-40` (content) or above `z-50`
  (true modals) accordingly.
- The `.ns-hscroll` helper is reusable for any other inline control that might overflow on
  phones (e.g. future filter chip rows).
- **Reviewer**: confirm at 379px that (a) the strip scrolls and all 8 presets are
  reachable, (b) 投資/記帳 navigate, (c) desktop ≥1024px is unchanged.
