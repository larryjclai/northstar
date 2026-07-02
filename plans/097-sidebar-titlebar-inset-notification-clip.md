# Plan 097: Clear the macOS traffic lights above the sidebar logo and unclip the notification panel

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b33bf55e..HEAD -- src/components/AppShell.tsx src/components/NotificationCenter.tsx src/styles/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UI)
- **Planned at**: commit `b33bf55e`, 2026-07-02

## Why this matters

Two visible defects in the desktop app shell, both reported by the user with a
screenshot:

1. On macOS the window uses an Overlay title bar (`titleBarStyle: "Overlay"`,
   `hiddenTitle: true` in `src-tauri/tauri.conf.json`), so the OS traffic-light
   buttons float over the webview's top-left. The sidebar's logo strip starts at
   22px top padding and sits crammed under/next to the traffic lights. A CSS
   rule that was supposed to add clearance is dead code (see below).
2. Clicking 通知 opens the notification panel, but its text is cut off ("字會被
   吃掉"): the panel is absolutely positioned *inside* the sidebar `<aside>`,
   which has `overflow: hidden` and is only 240px wide, while the panel wants
   `minWidth: 280px` — the right edge is clipped.

## Current state

### Files

- `src/components/AppShell.tsx` — app shell; desktop sidebar `<aside>` with
  inline padding (line ~144); renders `<NotificationCenter collapsed={collapsed} />`
  in the sidebar footer (line ~291).
- `src/components/NotificationCenter.tsx` — bell button + popover panel
  (whole file is ~194 lines).
- `src/styles/globals.css` — macOS-glass rules around lines 433-450.

### Defect 1: dead CSS rule, inline style wins

`src/styles/globals.css:441`:

```css
html[data-native-glass] .ns-sidebar { padding-top: 28px; }
```

…but `AppShell.tsx:141-158` sets padding **inline**, which overrides the class:

```tsx
<aside
  className="ns-sidebar hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-screen lg:self-start"
  style={{
    padding: collapsed ? "16px 8px 14px" : "22px 14px 14px",
    gap: 4,
    overflow: "hidden",
    width: collapsed ? 64 : 240,
    ...
    zIndex: 1100,
```

So the sidebar content starts at 16/22px regardless of platform — under the
traffic lights. The `data-native-glass` attribute is set in `AppShell.tsx:62-63`:

```ts
const isMacDesktop = navigator.platform.toUpperCase().includes("MAC") && navigator.maxTouchPoints === 0;
if (isTauri && isMacDesktop) document.documentElement.setAttribute("data-native-glass", "");
```

The full-width drag strip (globals.css:447-448) is 28px tall:

```css
.ns-titlebar-drag { display: none; }
html[data-native-glass] .ns-titlebar-drag { display: block; position: fixed; top: 0; left: 0; right: 0; height: 28px; z-index: 30; }
html[data-native-glass] .ns-app-main { padding-top: 28px; }
```

### Defect 2: panel clipped by `overflow: hidden`

`src/components/NotificationCenter.tsx:95-114` — panel is `position: absolute`
anchored to the footer button, inside the `overflow: hidden` aside:

```tsx
{open && (
  <div
    ref={panelRef}
    role="dialog"
    aria-label="通知中心面板"
    style={{
      position: "absolute",
      bottom: "calc(100% + 8px)",
      left: collapsed ? "calc(100% + 8px)" : 0,
      right: collapsed ? "auto" : 0,
      zIndex: 1200,
      minWidth: 280,
      maxWidth: 340,
      ...
```

The aside's `overflow: hidden` (needed for the 240↔64px width transition)
clips anything wider than the sidebar. In collapsed mode
(`left: calc(100% + 8px)`) the panel is clipped entirely.

### Conventions

- Design system: vanilla CSS + `--ns-*` tokens (never replace with a
  framework; see `.agentrules`). Panel colors already use
  `var(--ns-surface)` / `var(--ns-border)` — keep them.
- The sidebar's stacking context is `zIndex: 1100` (AppShell.tsx:156, comment
  explains it must stay above overlay scrims). The panel's 1200 renders above
  siblings within that context — fine to keep.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0       |
| Lint      | `npm run lint`   | exit 0              |
| Tests     | `npm test`       | exit 0              |
| Dev server (manual check) | `npm run dev` | Vite serves; open browser |

## Scope

**In scope**:
- `src/components/AppShell.tsx` (sidebar padding only)
- `src/components/NotificationCenter.tsx` (panel positioning only)
- `src/styles/globals.css` (titlebar-inset variable; remove the dead rule)

**Out of scope**:
- `src-tauri/tauri.conf.json` — titleBarStyle/Overlay config is correct; do not
  change window options.
- `.ns-titlebar-drag` / `.ns-app-main` rules — the drag fix shipped in plan 094;
  don't rework drag behavior.
- The mobile dock / mobile layout.
- NotificationCenter's data logic (reminders, acknowledge) — shipped in plan
  095 and tested; only the popover positioning changes.

## Git workflow

- Branch: `fix/ai-sidebar-titlebar-notification` (`fix/ai-<name>` per `.agentrules`).
- Conventional commits, e.g. `fix(shell): inset sidebar below macOS traffic lights`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Introduce a titlebar-inset variable

In `src/styles/globals.css`, replace the dead rule at line 441
(`html[data-native-glass] .ns-sidebar { padding-top: 28px; }`) with a variable
(keep the explanatory comment above it, updated):

```css
/* Push sidebar content below the macOS traffic-light buttons. Consumed by the
   sidebar's inline padding in AppShell (inline style would override a class
   rule, so the clearance travels via a variable instead). */
html { --ns-titlebar-inset: 0px; }
html[data-native-glass] { --ns-titlebar-inset: 40px; }
```

40px gives the logo comfortable air below the buttons (the drag strip covers
28px; the extra 12px is breathing room the user asked for — "虛擬的增高").

**Verify**: `grep -n "ns-titlebar-inset" src/styles/globals.css` → the two new lines; `grep -n "padding-top: 28px" src/styles/globals.css` → only the `.ns-app-main` rule remains.

### Step 2: Consume the variable in the sidebar's inline padding

In `AppShell.tsx:144`, change:

```tsx
padding: collapsed ? "16px 8px 14px" : "22px 14px 14px",
```

to:

```tsx
padding: collapsed
  ? "calc(16px + var(--ns-titlebar-inset, 0px)) 8px 14px"
  : "calc(22px + var(--ns-titlebar-inset, 0px)) 14px 14px",
```

Both collapsed (64px) and expanded modes need the inset — the traffic lights
overlap the collapsed rail completely.

**Verify**: `npm run build` → exit 0.

### Step 3: Unclip the notification panel with fixed positioning

In `NotificationCenter.tsx`, switch the panel from `position: absolute` to
`position: fixed`, computed from the trigger button's rect so it escapes the
aside's `overflow: hidden` (a `position: fixed` element is laid out against the
viewport; no ancestor here creates a fixed-containing block — the aside uses no
transform/filter):

1. On open, read `buttonRef.current.getBoundingClientRect()` into state.
2. Panel style:
   - `position: "fixed"`, `zIndex: 1200`
   - `bottom: window.innerHeight - rect.top + 8` (panel sits above the button)
   - `left: collapsed ? rect.right + 8 : rect.left`
   - `width: 320`, drop `minWidth`/`maxWidth`/`right`, keep everything else
     (background, border, radius, shadow, overflow hidden).
3. Close the panel (`setOpen(false)`) on `window` `resize` and when
   `collapsed` changes (a `useEffect` on `collapsed`), so a stale rect never
   positions it wrong. The existing outside-click closer stays as is.

Keep the change minimal — no portal is needed; verify stacking against the
sidebar's own context (`zIndex: 1100` on the aside) still puts the panel above
main content, which it does because the whole sidebar context sits above the
content layer.

**Verify**: `npm run build && npm run lint` → both exit 0.

### Step 4: Browser sanity check

Run `npm run dev`, open the app in a browser (no Tauri needed for this part):

1. Click 通知 with the sidebar expanded → the panel opens fully visible,
   `沒有新的提醒` (or notification text) not truncated; its right edge extends
   over the content area rather than being cut at the sidebar edge.
2. Collapse the sidebar, click the bell → panel opens to the right of the rail,
   fully visible.
3. `data-native-glass` is macOS-Tauri-only, so in the browser confirm the
   sidebar padding is *unchanged* (16/22px — the var resolves to 0px).

**Verify**: the three observations above hold (screenshot or DOM-inspect the
computed `padding-top` and the panel's bounding box).

## Test plan

This is layout-only; no domain logic changes. No new unit tests required —
`npm test` must stay green. The GUI aspects that cannot be verified headlessly
are listed as manual checks in Done criteria.

## Done criteria

Machine-checkable where possible. ALL must hold:

- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -rn "padding-top: 28px" src/styles/globals.css` matches only the `.ns-app-main` rule
- [ ] Browser check (Step 4) passed: panel unclipped in both sidebar states; non-mac padding unchanged
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

**Manual verification for the operator (macOS Tauri build, cannot be done
headlessly)**: logo + "Northstar" wordmark sit clearly below the traffic
lights in both sidebar states; window is still draggable from the top strip
and the sidebar header.

## STOP conditions

Stop and report back (do not improvise) if:

- The inline `padding` at AppShell.tsx:144 no longer matches the excerpt.
- Fixed positioning renders the panel *behind* main content (would indicate a
  stacking-context change elsewhere since `b33bf55e`) — report; do not start
  adding z-indexes across the app.
- You find yourself wanting to remove `overflow: hidden` from the aside to fix
  the clipping — don't; it guards the width transition. Fixed positioning is
  the fix.

## Maintenance notes

- If the sidebar ever gains a `transform` (e.g. an entrance animation), it will
  become the containing block for the fixed panel and re-clip it — reviewers of
  future sidebar animation work should re-test the notification panel.
- The 40px inset is a design constant; if the traffic-light inset is customized
  in `tauri.conf.json` later, revisit `--ns-titlebar-inset` together with the
  `.ns-titlebar-drag` height (28px) and `.ns-app-main` padding.
- Deferred: a proper popover primitive (portal + collision handling) if more
  popovers appear; one-off fixed positioning is fine for a single panel.
