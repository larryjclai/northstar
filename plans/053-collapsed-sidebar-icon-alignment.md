# Plan 053: Align the collapsed-sidebar search + quick-add icons with the nav column

> **Executor instructions**: Follow this plan step by step. This is a **visual
> alignment bug** — reproduce and verify in the running app (preview tooling),
> not just by typecheck. If anything in "STOP conditions" occurs, stop and report.
> When done, update this plan's row in `plans/README.md` unless a reviewer told
> you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/components/AppShell.tsx`
> If it changed since this plan was written, compare the "Current state" excerpt
> against live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (CSS/style only)
- **Depends on**: none
- **Category**: bug (UI)
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Operator-reported: when the sidebar is collapsed (64px), the **搜尋 (search) and
快速記帳 (quick-add) icon buttons are not aligned** with each other / with the nav
icons below them. Plan 041 reworked the collapsed sidebar but left these two
trigger buttons in wrapper `<div>`s whose padding differs from the nav links,
producing a visible horizontal misalignment of the icons in the 64px rail.

## Current state

`src/components/AppShell.tsx`, collapsed branch. The container padding when
collapsed is `"16px 8px 14px"` (the `ns-sidebar` style). The relevant elements:

Search trigger (wrapped):
```tsx
<div style={{ padding: collapsed ? "0 0 8px" : "0 8px 8px" }}>
  {collapsed ? (
    <button … className="ns-nav-link"
      style={{ justifyContent: "center", padding: "9px 8px" }}>
      <MagnifyingGlass size={16} />
    </button>
  ) : ( … )}
</div>
```

Quick-add trigger (wrapped, plus a filled-accent box):
```tsx
<div style={{ padding: collapsed ? "0 0 8px" : "0 8px 8px" }}>
  {collapsed ? (
    <button … className="ns-nav-link"
      style={{ justifyContent: "center", padding: "9px 8px",
               background: "var(--ns-accent)", color: "var(--ns-accent-fg)",
               borderRadius: "var(--ns-r-sm)" }}>
      <Plus size={16} weight="bold" />
    </button>
  ) : ( … )}
</div>
```

Nav links (NOT wrapped — direct children of `<nav>`):
```tsx
<Link … className="ns-nav-link"
  style={collapsed ? { justifyContent: "center", padding: "9px 8px" } : undefined}>
  <item.icon size={16} weight="duotone" />
</Link>
```

The mismatch sources to investigate (confirm which actually causes the visible
gap, by inspecting computed box widths in the running app):
- The search/quick-add buttons are inside `<div style={{ padding: "0 0 8px" }}>`
  wrappers (full-width of the 48px inner column), while the nav links are direct
  children of `<nav>` with `gap: 2` — if `ns-nav-link` isn't `width:100%`, the
  button and the link can center their content differently.
- The quick-add button carries an extra filled box (`background` +
  `borderRadius`), so its visual icon centroid can sit differently from the plain
  search button if their box widths differ.

### Conventions to follow

- The collapsed rail is 64px with `16px 8px 14px` container padding → a 48px
  inner content width; every icon button should center its glyph in that same
  48px column so all icons share one vertical centerline.
- `ns-nav-link` is the shared nav button class — reuse it; align by making the
  geometry consistent, not by hardcoding magic offsets.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev server (visual) | `npm run dev` | serves on 127.0.0.1 |

## Suggested executor toolkit

- Preview tooling: collapse the sidebar (the caret toggle), then
  `preview_screenshot` and `preview_inspect` the search, quick-add, and a nav
  icon to compare their computed left offset / width. The fix is correct when all
  three icons share one vertical centerline.

## Scope

**In scope:**
- `src/components/AppShell.tsx` — only the collapsed-state styles of the search
  trigger, the quick-add trigger, and (if needed) their wrapper `<div>`s, to
  align with the nav links.

**Out of scope (do NOT touch):**
- The expanded (240px) sidebar layout — it's fine; don't regress it.
- The entry-drawer scrim (plan 052).
- `ns-nav-link` global CSS, unless the root cause is genuinely there (if so, a
  change must be verified not to regress the expanded sidebar — prefer fixing in
  `AppShell` styles).

## Git workflow

- Branch from current main: `git checkout -B advisor/053-collapsed-sidebar-align main`.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 1: reproduce + measure
Run dev server, collapse the sidebar, screenshot, and `preview_inspect` the
search / quick-add / a nav icon. Record their computed horizontal offsets to
confirm the misalignment and its source.

### Step 2: unify the geometry
Make the search and quick-add icon buttons share the nav links' collapsed box:
same effective width and `justify-content:center` in the 48px inner column.
Concretely — make the two wrapper `<div>`s' horizontal padding consistent with
how nav links sit (the wrappers use `0 0 8px`; nav links have no wrapper), and
ensure both buttons are `width:100%` of the inner column so their centered icons
land on the nav centerline. Keep the quick-add's accent fill but make its box the
same width as the others so its glyph centers identically.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.

### Step 3: visual verification
Re-collapse the sidebar in the running app; screenshot. All icons (search,
quick-add, every nav item) must share one vertical centerline. Check both light
and dark themes. Also confirm the expanded sidebar still looks correct.

### Step 4: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm run lint` 0 errors; `npm run build`
exit 0.

## Test plan

No unit test (visual/style). Gate = before/after collapsed-sidebar screenshots
showing the shared centerline + the expanded sidebar unregressed.

## Done criteria

ALL must hold:

- [ ] In the collapsed sidebar, the search, quick-add, and nav icons share one
      vertical centerline (screenshot)
- [ ] The expanded (240px) sidebar is visually unchanged
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` 0 errors; `npm run build` exits 0
- [ ] Only `src/components/AppShell.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpt (drift since `8f2e90bd`).
- The misalignment root-causes to `ns-nav-link` global CSS and fixing it there
  would regress the expanded sidebar — report so we decide where to fix.

## Maintenance notes

- For the reviewer: confirm by screenshot that collapsed icons align and the
  expanded sidebar is untouched.
- Keep the collapsed rail's "every icon centers in the 48px inner column" rule in
  mind for any future sidebar item.
