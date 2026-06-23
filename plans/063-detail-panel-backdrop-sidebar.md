# Plan 063: Transaction detail-panel backdrop still greys the sidebar (052 follow-up)

> **Executor instructions**: Follow this plan step by step. This is a **visual bug** —
> verify in the running app if a preview is available; otherwise verify via tsc/lint/
> build + close code inspection and say so. Run every verification command. If a STOP
> condition occurs, stop and report. Update this plan's row in `plans/README.md`
> unless a reviewer maintains it.
>
> **Drift check (run first)**:
> `git diff --stat 65775330..HEAD -- src/components/TransactionDetailPanel.tsx src/routes/CashFlowRoute.tsx src/components/AppShell.tsx`
> Compare the "Current state" excerpts against live code first.

## Status
- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (backdrop/overlay styling)
- **Depends on**: plan 052 (merged) — same overlay family
- **Category**: bug (UI)
- **Planned at**: commit `65775330`, 2026-06-23

## Why this matters
Operator-reported: opening 交易詳情 and then 編輯交易 leaves the **left sidebar greyed
out** (a dim wash over it). Plan 052 fixed the *entry drawer's own* scrim to dodge the
sidebar, but the **`TransactionDetailPanel` backdrop was not touched** — and the
edit-transaction flow in the screenshot is opened *from* that panel.

Root cause (confirmed in code): `TransactionDetailPanel` renders a full-viewport
backdrop that covers the sidebar:
```tsx
// src/components/TransactionDetailPanel.tsx ~line 93-100
{/* Backdrop */}
<div onClick={onClose} style={{
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
  zIndex: 998, transition: "opacity 0.2s", opacity: 1,
}} />
```
`inset: 0` spans the whole viewport including the 240px/64px sidebar → the sidebar
reads as a flat grey block (worse over the macOS native vibrancy). 052 only fixed the
`CashFlowRoute` EntryDrawer scrim (`ns-entry-scrim`, `left: scrimLeft`); this panel and
any other sibling overlay with a full-`inset:0` dark backdrop still grey the sidebar.

## Current state
- `src/components/TransactionDetailPanel.tsx` — backdrop `position:fixed; inset:0;
  rgba(0,0,0,0.35); zIndex:998` (above). Panel is `zIndex:999`, `right:0; width:460`.
- `src/routes/CashFlowRoute.tsx` — the 052 fix on the EntryDrawer scrim, for reference:
```tsx
const sidebarCollapsed = useUiPreferences((state) => state.sidebarCollapsed);
const scrimLeft = sidebarCollapsed ? 64 : 240;
// …
<div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={onClose}>
  <style>{`@media (max-width:1023.98px){.ns-entry-scrim{left:0 !important;}}`}</style>
  <div className="ns-entry-scrim" style={{ position:"absolute", top:0, right:0, bottom:0, left: scrimLeft, background:"rgba(0,0,0,0.4)" }} />
```
- `src/components/AppShell.tsx` — the desktop sidebar (`ns-sidebar`, line 133,
  `lg:sticky`) sits in a grid column (`gridTemplateColumns: collapsed ? "64px 1fr" :
  "240px 1fr"`, line 129) and has **no z-index** (so any `fixed` overlay paints over it).

### Conventions to follow
- macOS native sidebar vibrancy (transparent webview) — a dark `inset:0` scrim over it
  reads as muddy grey; backdrops must not cover the sidebar (the 052 rule).
- Keep outside-click-to-close working (the backdrop's `onClick={onClose}`).
- zh-TW; reuse the existing breakpoint (`1023.98px` / `lg`) so behavior matches 052.

## Decision (recommended — pick one; prefer the robust option)
**Option A (robust, fixes all overlays at once — RECOMMENDED):** give the desktop
sidebar a stacking context ABOVE the overlays. Add a `z-index` to `.ns-sidebar`
(e.g. above 1000) and make it its own positioned stacking context, so NO `fixed`
backdrop ever visually dims it — for the detail panel, the entry drawer, QuickAdd,
the centered modals, etc. Verify outside-click still closes (clicks that land on the
sidebar won't close the overlay, which is acceptable/expected). Confirm nothing else
relied on the sidebar being under overlays.

**Option B (targeted, mirror 052):** apply the 052 treatment to
`TransactionDetailPanel`'s backdrop — make it start at `left: scrimLeft`
(`sidebarCollapsed ? 64 : 240`) with the same `<=1023.98px → left:0` media query,
instead of `inset:0`. Then sweep the other full-`inset:0` dark backdrops (the centered
PayCard/Defer/Settle modals in CashFlowRoute, QuickAdd, InvestmentsAddSheet) and apply
the same — otherwise each remains a sidebar-greyer.

Option A is fewer lines and fixes the whole class; Option B matches the existing 052
pattern but must be repeated per overlay. Choose A unless raising the sidebar's
z-index breaks an existing interaction (verify).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev (visual) | `npm run dev` | serves 127.0.0.1 |

## Scope
**In scope (Option A):** `src/components/AppShell.tsx` (sidebar stacking context).
**In scope (Option B):** `src/components/TransactionDetailPanel.tsx` + the other overlay
backdrops named above.
Pick ONE option; keep the diff to that option's files.
**Out of scope:**
- The panels'/drawers' contents and close logic (only the backdrop/stacking).
- The 052 EntryDrawer scrim itself (already fixed) — don't re-do it.

## Git workflow
- Branch from current main: `git checkout -B advisor/063-detail-backdrop-sidebar main`.
- Short imperative commit style. Do NOT push/PR.

## Steps
### Step 1: reproduce
Run the dev server; open 記帳 → a transaction's 交易詳情, then 編輯交易. Confirm the
sidebar greys. (If no preview, reason from the `inset:0` backdrop excerpt.)
### Step 2: apply the chosen option
Option A: add a z-index/stacking context to `.ns-sidebar` so it sits above the
`fixed` overlays; verify the sidebar keeps its vibrancy with the detail panel / edit
drawer / QuickAdd open. Option B: scope each dark backdrop off the sidebar (left:
scrimLeft + media query), starting with `TransactionDetailPanel`.
**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.
### Step 3: visual verification
Re-open 交易詳情 and 編輯交易 (and QuickAdd) in light + dark; confirm the sidebar keeps
its vibrancy and outside-click still closes the overlay. Screenshot.
### Step 4: full verification
`npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm run build` 0.

## Test plan
No unit test (visual/style). Gate = before/after screenshots (or code inspection if
no preview) + build/lint green. Do not add brittle DOM tests of overlay markup.

## Done criteria
- [ ] With 交易詳情 and/or 編輯交易 open, the sidebar no longer greys (keeps vibrancy)
- [ ] Outside-click still closes the panel/drawer
- [ ] If Option B: the other named `inset:0` backdrops also no longer cover the sidebar
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm run build` 0
- [ ] Diff limited to the chosen option's files
- [ ] `plans/README.md` row updated

## STOP conditions
- Code at cited lines doesn't match (drift since `65775330`).
- Option A: raising the sidebar z-index breaks an existing overlay interaction
  (e.g. a modal that intentionally covers the sidebar) — fall back to Option B and report.
- The grey turns out NOT to be the `inset:0` backdrop (some other layer) — report what
  you found before changing anything.

## Maintenance notes
- This completes the 052 family: NO overlay backdrop should dim the macOS-vibrancy
  sidebar. Option A enforces it globally; if Option B is chosen, any NEW overlay must
  repeat the sidebar-dodge.
- Reviewer: verify by eyes (screenshots) across the detail panel, entry drawer, and QuickAdd.
