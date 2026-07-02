# Plan 094: Make the macOS window draggable — grant the missing drag permission (+ full-width strip)

> **Executor instructions**: Follow step by step. Run every verification command. Touch only the
> in-scope files. NEVER push, NEVER touch `main`. Branch off `main`. Actual window-dragging is a
> macOS GUI behavior you cannot verify headlessly — implement per spec, verify the code gates
> (`check:tauri`/tsc/build/greps), and mark dragging manual-verify-pending.
>
> **Supersedes plan 090** (the unmerged `fix/ai-macos-window-drag`): this plan includes the same
> full-width drag strip PLUS the actual root-cause fix (the permission). If plan 090's branch was
> never merged, this plan is the complete fix; do NOT also merge 090.

## Status
- **Priority**: P1 (shipped regression — window can't be dragged)
- **Effort**: S  •  **Risk**: LOW  •  **Depends on**: none (079's overlay title bar is already on main)
- **Category**: bug (regression from 079)  •  **Planned at**: commit `e1975b78`, 2026-06-29

## Why this matters — the real root cause (confirmed)
Plan 079 switched the macOS window to a transparent overlay title bar
(`titleBarStyle: "Overlay"` + `hiddenTitle: true`) and added `data-tauri-drag-region` to the
sidebar header. Two attempts to make dragging work (079's sidebar region, 090's full-width strip)
**both failed** — and the reason is not the markup. In **Tauri v2, `data-tauri-drag-region`
calls the `start_dragging` window command internally, which requires the
`core:window:allow-start-dragging` capability permission. That permission is NOT part of
`core:default`** and must be granted explicitly (per the Tauri v2 "Window Customization" docs:
*"core:window:allow-start-dragging … is not included in core:window:default and must be added
explicitly"*). Northstar's `capabilities/default.json` grants `core:default` but **not**
`core:window:allow-start-dragging`, so `startDragging()` is silently denied and no drag region
works. This plan grants that permission (the fix) and adds a full-width top drag strip so the whole
top edge drags the window (not just the sidebar header).

## Current state (verified on `main`)
- `src-tauri/tauri.conf.json` window: `"titleBarStyle": "Overlay"`, `"hiddenTitle": true`,
  `"transparent": true`, `windowEffects: [mica, sidebar]`. **Keep these.**
- `src-tauri/capabilities/desktop.json` — desktop-only caps (`platforms: ["macOS","windows","linux"]`,
  `windows: ["main"]`, permissions `updater:default`, `window-state:default`). **The drag permission
  belongs here** (window dragging is desktop-only).
- `src-tauri/capabilities/default.json` — grants `core:default` (+ sql/stronghold/fs/notification),
  but NO `core:window:allow-start-dragging`.
- `src/components/AppShell.tsx` — the shell root is `<div className="ns-app-shell min-h-screen lg:grid" ...>`
  containing `<aside class="ns-sidebar ...">` (its header already has `data-tauri-drag-region`) and
  `<main class="ns-app-main pb-20 lg:pb-0">`. The `data-native-glass` attribute is set on `<html>`
  only in the macOS Tauri app (see `applyNativeGlassAttribute`). There is **no** full-width top drag
  strip on main (`grep ns-titlebar-drag` returns nothing).
- `src/styles/globals.css` — has `html[data-native-glass] .ns-sidebar { padding-top: 28px; }` (079).
  No `.ns-app-main` top padding and no drag strip.

### Conventions
- Capability identifiers are validated at build time (`check:tauri` / the schema), so a typo fails
  the build — that's your gate that the permission id is correct.
- Gate the CSS strip macOS-only via the existing `html[data-native-glass]` selector.
- The OS traffic lights render above the webview, so a full-width strip leaves them clickable.

## Commands
| Install | `npm install` | exit 0 |
| Rust + capability check | `npm run check:tauri` | exit 0 (validates the new permission) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Build | `npm run build` | exit 0 |
| Lint | `npm run lint` | exit 0 (0 errors) |

## Scope
**In scope**:
- `src-tauri/capabilities/desktop.json` — add `"core:window:allow-start-dragging"`
- `src/components/AppShell.tsx` — add the full-width top drag strip element
- `src/styles/globals.css` — strip styles + `.ns-app-main` macOS top padding
**Out of scope**: `tauri.conf.json` (keep the overlay title bar); the sidebar's existing drag region
(leave it); non-macOS behavior; route content. Do NOT set `decorations: false` (that would remove the
traffic lights — we keep them via Overlay).

## Git workflow
- Branch: `fix/ai-macos-drag-permission` (off `main`)
- Commit: `fix(macos): grant core:window:allow-start-dragging so the window is draggable`
- Do NOT push.

## Steps

### Step 1: Grant the drag permission (the actual fix)
In `src-tauri/capabilities/desktop.json`, add `"core:window:allow-start-dragging"` to `permissions`:
```json
  "permissions": [
    "updater:default",
    "window-state:default",
    "core:window:allow-start-dragging"
  ]
```

**Verify**: `npm run check:tauri` → exit 0 (this validates the capability identifier against the
schema; a wrong id fails here). If it fails complaining the identifier is unknown, STOP and report
the exact message — the correct id per Tauri v2 is `core:window:allow-start-dragging`.

### Step 2: Add the full-width top drag strip
In `AppShell.tsx`, add as the FIRST child inside the shell root `<div>` (before the sidebar):
```tsx
{/* macOS overlay title bar: full-width draggable strip; hidden on non-macOS via CSS. */}
<div data-tauri-drag-region className="ns-titlebar-drag" aria-hidden="true" />
```
In `globals.css`, near the other `html[data-native-glass]` rules:
```css
.ns-titlebar-drag { display: none; }
html[data-native-glass] .ns-titlebar-drag {
  display: block;
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 28px;
  z-index: 30;
}
html[data-native-glass] .ns-app-main { padding-top: 28px; }
```

**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → exit 0; `npm run lint` → exit 0.

## Done criteria (ALL)
- [ ] `npm run check:tauri` exits 0 (permission validated)
- [ ] `npx tsc --noEmit` exits 0; `npm run build` exits 0; `npm run lint` exits 0 (0 errors)
- [ ] `grep -n "core:window:allow-start-dragging" src-tauri/capabilities/desktop.json` matches
- [ ] `grep -n "ns-titlebar-drag" src/components/AppShell.tsx src/styles/globals.css` shows element + CSS
- [ ] `tauri.conf.json` unchanged; no `decorations: false` anywhere
- [ ] No files outside the in-scope list modified
- [ ] Window dragging on macOS — **manual-verify-pending** (operator builds + drags the top edge; with
  the permission granted, `data-tauri-drag-region` now actually moves the window)

## STOP conditions
- `check:tauri` rejects `core:window:allow-start-dragging` as an unknown identifier — report the exact
  message (the id may differ by Tauri version; do NOT guess another).
- The `desktop.json` / `tauri.conf.json` excerpts don't match (drift) — report.
- The fix appears to require `decorations: false` or removing the overlay title bar — report (we keep the look).

## Maintenance notes
- **This is the root-cause fix.** If dragging STILL fails on macOS after this, the next thing to check
  is whether `data-native-glass` is actually set (the strip is `display:none` without it) — but vibrancy
  working proves it is. If it still fails, the fallback is reverting to the standard decorated title bar
  (remove `titleBarStyle: Overlay` + `hiddenTitle` + the strip), which is unconditionally draggable.
- Plan 090 (`fix/ai-macos-window-drag`) is **superseded** by this plan — do not merge both (both add the
  strip). Mark 090 REJECTED/superseded in the index.
- Reviewer: confirm the permission is in the DESKTOP capability (not leaking to mobile), and the strip is
  macOS-gated.
