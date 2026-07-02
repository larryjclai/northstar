# Plan 090: Fix macOS window dragging (full-width top drag strip)

> **Executor instructions**: Follow step by step. Run every verification command. Touch
> only the in-scope files. NEVER push, NEVER touch `main` (work on your own branch). Note:
> actual window-dragging is a macOS GUI behavior you CANNOT verify headlessly — implement
> per the spec, verify the code gates (tsc/build/lint), and mark the drag behavior
> manual-verify-pending.

## Status
- **Priority**: P1 (shipped regression — window is hard to drag)
- **Effort**: S  •  **Risk**: LOW (additive CSS + one element; macOS-gated)
- **Depends on**: none (branch off `main`)  •  **Category**: bug (regression from 079)
- **Planned at**: commit `a1aaece5`, 2026-06-28

## Why this matters
Plan 079 switched the macOS window to a transparent overlay title bar
(`titleBarStyle: "Overlay"` + `hiddenTitle: true` in `tauri.conf.json`) for the
"content-under-the-title-bar" look. But it only added `data-tauri-drag-region` to the
**sidebar header** — there's no draggable region across the top of the window, so the user
can't drag the window from the natural spot (the top edge). This shipped in
`0.1.0-alpha.47`. The decided fix (operator's choice): **keep the overlay look** and add a
proper **full-width draggable strip across the top**, with the main content padded to clear
it — the standard custom-titlebar pattern.

## Current state
- `src-tauri/tauri.conf.json` window: `titleBarStyle: "Overlay"`, `hiddenTitle: true`,
  `transparent: true`, `windowEffects: [mica, sidebar]`. **Keep these — do NOT revert.**
- `src/styles/globals.css` — 079 added (macOS-only, gated on the `html[data-native-glass]`
  attribute that AppShell sets only in the macOS Tauri app):
  ```css
  html[data-native-glass] .ns-sidebar { padding-top: 28px; }
  ```
  The **main** content area (`.ns-app-main`) has NO equivalent top padding, and there is no
  full-width drag strip.
- `src/components/AppShell.tsx` — the shell renders `<aside class="ns-sidebar">` (with a
  `data-tauri-drag-region` header) and `<main class="ns-app-main pb-20 lg:pb-0">`. The
  `data-native-glass` attribute is set on `<html>` only on macOS Tauri (see
  `applyNativeGlassAttribute`).

### Conventions
- Gate everything macOS-only via the existing `html[data-native-glass]` selector (so
  Windows/Linux/iOS/browser are unaffected — they keep their own title-bar behavior).
- The OS traffic-light buttons render ABOVE the webview, so a drag strip spanning the full
  width (including behind the lights) leaves the lights clickable and the rest draggable.
- Keep the drag strip BELOW the more-sheet overlay (which is `z-50`).

## Commands
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Build | `npm run build` | exit 0 |
| Lint | `npm run lint` | exit 0 (0 errors) |

## Scope
**In scope**:
- `src/components/AppShell.tsx` — add the top drag-strip element
- `src/styles/globals.css` — the strip styles + `.ns-app-main` macOS top padding
**Out of scope**: `tauri.conf.json` (keep the overlay title bar); the sidebar's existing
drag region (leave it); any non-macOS behavior; route content.

## Git workflow
- Branch: `fix/ai-macos-window-drag` (off `main`)
- Commit: `fix(macos): add full-width title-bar drag region so the window is draggable`
- Do NOT push.

## Steps

### Step 1: Add the drag strip element
In `AppShell.tsx`, add as the FIRST child inside the shell root (before the sidebar), a
full-width draggable strip:
```tsx
{/* macOS overlay title bar: a full-width draggable strip so the whole top edge
    moves the window. Hidden on non-macOS via CSS (.ns-titlebar-drag display:none). */}
<div data-tauri-drag-region className="ns-titlebar-drag" aria-hidden="true" />
```
It carries no interactive children (so the entire strip is draggable). Do not put buttons in it.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Style the strip + pad the main content (macOS-only)
In `globals.css`, near the other `html[data-native-glass]` rules:
```css
/* Overlay title bar drag strip — only in the macOS Tauri app. Full width so the
   whole top edge drags the window; traffic lights (OS-rendered above the webview)
   stay clickable. Content is padded below it so nothing sits under the strip. */
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
(The sidebar already has its `padding-top: 28px` from 079; this adds the matching padding to
the main column so route content clears the strip on macOS.)

**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → exit 0; `npm run lint` → exit 0.

## Done criteria (ALL)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] `grep -n "ns-titlebar-drag" src/components/AppShell.tsx src/styles/globals.css` shows the element + the CSS (with `display:none` default and the `data-native-glass` override)
- [ ] `grep -n "data-native-glass .ns-app-main { padding-top: 28px" src/styles/globals.css` matches
- [ ] `tauri.conf.json` is unchanged (overlay title bar kept)
- [ ] No files outside the in-scope list modified
- [ ] Window dragging on macOS — **manual-verify-pending** (operator builds + tests: dragging the top strip should move the window; traffic lights still work; no content clipped under the strip)

## STOP conditions
- The `globals.css` 079 sidebar `padding-top: 28px` rule or the `data-native-glass` selector
  isn't present (drift) — report.
- Implementing this appears to require changing `tauri.conf.json` or non-macOS behavior — report.

## Maintenance notes
- The drag strip is the macOS title bar surrogate. Any future top-of-window UI must stay
  below the 28px strip (the `.ns-app-main` / `.ns-sidebar` padding handles this) or sit
  above it with its own higher z-index AND its own non-drag handling.
- If the operator later reports the strip blocks a control near the very top of a route,
  that control is within the 28px title-bar band and should be moved down — that band is
  reserved for the title bar on macOS.
- Windows/Linux are unaffected (no `data-native-glass`); they keep their standard title bars.
