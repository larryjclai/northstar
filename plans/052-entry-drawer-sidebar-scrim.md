# Plan 052: Edit-transaction drawer scrim dims the sidebar into a flat grey block

> **Executor instructions**: Follow this plan step by step. This is a **visual
> bug** — you MUST reproduce it and verify the fix in the running app (the preview
> tooling), not just by typecheck. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop
> and report — do not improvise. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/routes/CashFlowRoute.tsx src/components/AppShell.tsx`
> If these changed since this plan was written, compare the "Current state"
> excerpt against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (a backdrop/scrim style change; no logic)
- **Depends on**: none
- **Category**: bug (UI)
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Operator-reported: when 編輯交易 (the transaction entry/edit drawer) is open, the
**left sidebar turns into a flat grey block** (「左邊的 sidebar 就會變成灰灰一塊」).
The app uses a transparent webview over a native macOS vibrancy layer for the
sidebar (see `AppShell.tsx` header comment about `windowEffects(sidebar)` /
`NSVisualEffectView`). The entry drawer paints a full-viewport dark scrim over
`inset:0`, which sits on top of the vibrant sidebar and flattens it into muddy
grey. This is the same overlay family that plan 041 cleaned up for QuickAdd /
blur — the dark scrim on this drawer was not addressed.

## Current state

`src/routes/CashFlowRoute.tsx`, the `EntryDrawer` component's overlay (around the
return, the lines that begin the fixed overlay):

```tsx
<div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={onClose}>
  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
  {/* …drawer panel: animate-[ns-drawer-in…], boxShadow: "-20px 0 60px rgba(0,0,0,0.4)" … */}
```

The inner `<div … background: "rgba(0,0,0,0.4)" />` is the scrim. With `inset:0`
it covers the entire viewport **including the sidebar column**, dimming the
native vibrancy into the reported grey block.

For reference, plan 041 already adjusted sibling overlays so they don't muddy the
sidebar; `QuickAdd.tsx` and `InvestmentsAddSheet` are the precedents — read how
their backdrop is scoped after 041 and match that treatment.

### Conventions to follow

- The app is a Tauri desktop app with macOS native sidebar vibrancy; **no
  `window.confirm`**; overlays are hand-rolled `fixed` divs (not a portal lib for
  this drawer).
- Plan 041's maintenance note explicitly called out that overlay backdrops must
  not blur/dim the sidebar over native vibrancy. This plan finishes that for the
  dark scrim on the entry drawer.
- The drawer is a **right-side** panel; the scrim's job is to dim the *content*
  area and catch the outside-click to close — it does not need to cover the
  240px/64px sidebar column.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev server (visual) | `npm run dev` | serves on 127.0.0.1 |

## Suggested executor toolkit

- Use the **preview tooling** (`preview_start`, `preview_click`,
  `preview_screenshot`) to: open the 記帳 page, click 記一筆 (or the edit pencil on
  a row) to open the drawer, and screenshot — confirm the sidebar keeps its
  vibrancy and is no longer a flat grey block, in BOTH light and dark themes
  (there's a theme toggle). Demo mode (設定) gives sample data.

## Scope

**In scope:**
- `src/routes/CashFlowRoute.tsx` — only the `EntryDrawer` overlay/scrim markup.

**Out of scope (do NOT touch):**
- The drawer's form contents / submit logic.
- `AppShell.tsx` (that's plan 053).
- Other overlays (QuickAdd, InvestmentsAddSheet, SettleModal) — already handled
  by 041; do not widen the diff. If you find one still dims the sidebar, note it
  as a follow-up, don't fix it here.
- `z-index` of the drawer panel itself (it must stay above the scrim).

## Git workflow

- Branch from current main: `git checkout -B advisor/052-entry-drawer-scrim main`.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 1: reproduce
Run the dev server, open the 記帳 page, open the entry drawer (記一筆 or edit a
row). Screenshot. Confirm the sidebar reads as a flat grey block.

### Step 2: scope the scrim off the sidebar
Change the scrim so it does not flatten the sidebar. Pick the approach that
matches plan 041's precedent in `QuickAdd.tsx`/`InvestmentsAddSheet` (read them
first). Two acceptable shapes:
- **(Preferred)** Inset the scrim's left edge to start after the sidebar column
  (the layout grid is `64px|240px` then `1fr` — the sidebar is the left grid
  column in `AppShell`), so the scrim covers only the content area; OR
- match whatever backdrop treatment 041 standardized (e.g. a lighter scrim
  /`color-mix` that doesn't muddy vibrancy) applied consistently.

Keep the outside-click-to-close behavior working (the `onClick={onClose}` on the
overlay root).

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.

### Step 3: visual verification
Re-open the drawer in the running app. Screenshot in light AND dark themes.
Confirm: the sidebar keeps its vibrancy (no flat grey block), the content area is
still dimmed, and clicking outside the drawer still closes it.

**Verify**: screenshots show the sidebar intact; `preview_console_logs` has no
new errors.

### Step 4: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm run lint` 0 errors; `npm run build`
exit 0.

## Test plan

No unit test (pure visual/style). The gate is the **before/after screenshots in
both themes** + build/lint green. Do not add brittle DOM tests of overlay markup.

## Done criteria

ALL must hold:

- [ ] With the entry drawer open, the sidebar no longer renders as a flat grey
      block (screenshots, light + dark)
- [ ] Outside-click still closes the drawer; the drawer panel still sits above
      the scrim
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` 0 errors; `npm run build` exits 0
- [ ] Only `src/routes/CashFlowRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited overlay lines doesn't match the excerpt (drift since `8f2e90bd`).
- Insetting the scrim breaks the outside-click-to-close or lets clicks fall
  through to the sidebar while the drawer is open.
- Fixing it cleanly appears to require restructuring `AppShell`'s layout grid —
  report; that's a bigger change than this bug warrants.

## Maintenance notes

- For the reviewer: verify by eyes (screenshots), and confirm only the scrim
  changed — the drawer's z-order and close-on-outside-click must still work.
- If a future overlay is added, it should follow the same "don't dim the
  vibrant sidebar" rule — this plus 041 establish the pattern.
