# Plan 041: Modal backdrops stop blurring the app chrome; collapsed sidebar aligns cleanly

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 13f6a723..HEAD -- src/components/QuickAdd.tsx src/routes/CashFlowRoute.tsx src/components/AppShell.tsx src/styles/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UX)
- **Planned at**: commit `13f6a723`, 2026-06-20

## Why this matters

The operator reports two concrete sidebar oddities: (1) "the sidebar blurs
weirdly when you enter a transaction", and (2) "folding the sidebar messes up
the icon list." Both are real and traced to code.

(1) The Quick-Add overlay and the transaction EntryDrawer each paint a
`position: fixed; inset: 0` backdrop with `backdropFilter: blur(...)`. That
backdrop covers the **entire viewport including the left sidebar**, so opening
any transaction blurs the chrome too. On the macOS Tauri build the sidebar is a
real `NSVisualEffectView` (native vibrancy, see `AppShell.tsx:47-59` and
`globals.css:426-446`); layering a translucent CSS blur on top of system
vibrancy reads as muddy and "wrong" — that is exactly the complaint. A modal
backdrop should dim the *content*, not the navigation chrome.

(2) In the 64px collapsed state the icon column doesn't line up: the logo and
the collapse caret are crammed side-by-side into ~48px usable width, and the
icon buttons use three different paddings (`7px`, `7px`, `9px 8px`) so their
icons sit at slightly different horizontal centers.

Both are small, self-contained polish fixes with no finance-logic risk.

## Current state

Files and roles:

- `src/components/QuickAdd.tsx` — the ⌘N quick-add overlay (modal).
- `src/routes/CashFlowRoute.tsx` — contains `EntryDrawer` (the transaction
  add/edit drawer) and three small confirm modals.
- `src/components/AppShell.tsx` — the desktop sidebar (`<aside className="ns-sidebar">`)
  and its collapsed/expanded layout. The shell is a CSS grid:
  `gridTemplateColumns: collapsed ? "64px 1fr" : "240px 1fr"` (`AppShell.tsx:127`).
- `src/styles/globals.css` — `.ns-sidebar` / `.ns-nav-link` / native-glass rules.

### (1) The full-viewport blurring backdrops

`src/components/QuickAdd.tsx:230-231`:

```tsx
<div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(3px)" }} />
```

`src/routes/CashFlowRoute.tsx:1878-1879` (inside `EntryDrawer`):

```tsx
<div style={{ position: "fixed", inset: 0, zIndex: 50 }} onClick={onClose}>
  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
```

Both backdrops are `inset: 0` over the whole window. The sidebar (`<aside>`) is
a sibling in the grid at the same stacking context and gets covered + blurred.

> Note: there are three more `position: fixed; inset: 0` confirm modals in
> CashFlowRoute at lines ~1375, ~1427, ~1482 — these use
> `background: "rgba(0,0,0,0.4)"` **without** `backdropFilter`, so they only
> dim, they don't blur. They are out of scope (see Scope). Only the two
> `backdropFilter` backdrops are the problem.

### (2) Collapsed sidebar misalignment

`src/components/AppShell.tsx:142` — the logo + collapse-toggle row, collapsed
branch packs **two** elements (logo `<img>` at line 155 and the caret `<button>`
at 157) into the 64px column with `justifyContent: "center"`:

```tsx
<div style={{ padding: collapsed ? "0 0 16px" : "0 8px 16px", display: "flex", alignItems: "center", gap: 9, justifyContent: collapsed ? "center" : "space-between" }}>
```

The icon buttons use inconsistent padding when collapsed:
- Search trigger (`AppShell.tsx:176`): `padding: "7px"`
- Quick-add trigger (`AppShell.tsx:204`): `padding: "7px"`
- Nav links (`AppShell.tsx:232`, `249`, `265`, `282`): `padding: "9px 8px"`

`.ns-nav-link` base (`globals.css:572-584`) is `display:flex; align-items:center;
gap:11px; padding:9px 11px`.

### Conventions to follow

- This repo uses inline `style={{}}` heavily in `AppShell.tsx` — match that
  style (do not introduce a CSS-module or styled-component).
- Design tokens live in `globals.css` as `--ns-*` CSS variables. Reuse existing
  tokens; do not hardcode new colors.
- No new dependencies.

## Commands you will need

| Purpose   | Command                          | Expected on success      |
|-----------|----------------------------------|--------------------------|
| Typecheck | `npx tsc --noEmit`               | exit 0, no errors        |
| Tests     | `npm test`                       | all pass (~537 tests)    |
| Lint      | `npm run lint`                   | exit 0 (0 errors; warnings ok) |
| Dev server| `npm run dev`                    | serves on a localhost port |

## Suggested executor toolkit

- This is a visual change. **Verify in a browser preview** (preview tools or
  `npm run dev`): open Quick-Add (⌘N) and a CashFlow transaction, confirm the
  sidebar is no longer blurred; toggle the sidebar collapse caret and confirm
  the icon column is aligned. If you cannot run a browser, say so in your report
  and fall back to careful code inspection — do not claim visual verification
  you didn't perform.

## Scope

**In scope** (the only files you should modify):
- `src/components/QuickAdd.tsx`
- `src/routes/CashFlowRoute.tsx` (only the `EntryDrawer` backdrop at ~1879)
- `src/components/AppShell.tsx`

**Out of scope** (do NOT touch):
- The three confirm modals in CashFlowRoute (~1375/1427/1482) — they don't blur.
- `InvestmentsAddSheet.tsx`, `HoldingEditModal.tsx`, `GlobalSearch.tsx`,
  `OnboardingOverlay.tsx` — other overlays; if they have the same
  full-viewport-blur issue, note it in your report as a follow-up, but do NOT
  change them in this plan (keep the diff reviewable).
- Any finance/domain logic. This is presentation only.
- The mobile bottom nav / "更多" sheet — the bug is desktop-sidebar specific.

## Git workflow

- Branch: `advisor/041-overlay-and-sidebar-polish` — create it from current
  `main` so you build on the latest tree:
  `git checkout -B advisor/041-overlay-and-sidebar-polish main`
  (executor worktrees may be based on a frozen older commit; branching from
  `main` avoids stale-base conflicts).
- Commit per logical unit. Match the repo's short imperative commit style
  (e.g. `fix: modal backdrops no longer blur the sidebar chrome`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Stop the Quick-Add backdrop from blurring the sidebar

The cleanest fix that preserves the intended dimming of *content* while leaving
the chrome crisp is to remove `backdropFilter` from the full-viewport backdrops
and keep (or slightly deepen) the dim. The blur was applied to the whole window;
there is no way to blur "only the content area" with a single `inset:0` layer
without restructuring, and the dim alone already focuses attention on the modal.

In `src/components/QuickAdd.tsx:231`, change the backdrop div's style from:

```tsx
<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(3px)" }} />
```

to (drop the blur; keep the scrim):

```tsx
<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
```

**Verify**: `grep -n "backdropFilter" src/components/QuickAdd.tsx` → no matches.

### Step 2: Stop the EntryDrawer backdrop from blurring the sidebar

In `src/routes/CashFlowRoute.tsx:1879`, change:

```tsx
<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }} />
```

to:

```tsx
<div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
```

**Verify**: `grep -n 'backdropFilter: "blur(4px)"' src/routes/CashFlowRoute.tsx`
→ no matches. (There should be no remaining `backdropFilter` in EntryDrawer; the
confirm modals never had one.)

### Step 3: Fix the collapsed logo/caret row

When collapsed, show only the app logo on its own centered row and move the
expand caret to its own full-width centered button below the logo, so nothing is
crammed into 48px. In `src/components/AppShell.tsx`, the block at lines 142–166
currently renders logo + caret in one flex row. Restructure the **collapsed
branch only** so that:

- collapsed: render the logo centered, then the caret toggle as a separate
  centered `ns-nav-link`-styled button on its own line (same width treatment as
  the other collapsed icon buttons — `justifyContent: "center"`).
- expanded: keep the existing layout exactly (logo+name on the left,
  caret on the right via `justifyContent: "space-between"`).

Target shape (collapsed branch):

```tsx
{collapsed ? (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 0 16px" }}>
    <img src={appIconUrl} alt="" style={{ width: 26, height: 26, borderRadius: 7 }} />
    <button
      type="button"
      onClick={toggleSidebarCollapsed}
      title="展開側欄"
      className="ns-nav-link"
      style={{ justifyContent: "center", padding: "7px", color: "var(--ns-fg-dim)" }}
    >
      <CaretRight size={14} />
    </button>
  </div>
) : (
  /* keep the existing expanded logo + name + CaretLeft layout unchanged */
)}
```

Keep the existing expanded markup byte-for-byte; only branch it. `CaretRight`
and `CaretLeft` are already imported (`AppShell.tsx:4-5`).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Make the collapsed icon buttons share one padding

So the icon column lines up, give every collapsed icon button the same padding.
Change the two `padding: "7px"` collapsed buttons and the `padding: "9px 8px"`
collapsed nav links to a single consistent value. Use `padding: "9px 8px"` for
all of them (it matches the nav links, the most numerous case), OR `7px` for
all — pick one and apply it to:

- Search trigger collapsed button (`AppShell.tsx:176`)
- Quick-add trigger collapsed button (`AppShell.tsx:204`)
- The new caret button from Step 3
- The collapsed nav-link `style` overrides at lines ~232, ~249, ~265, ~282
  (they read `{ justifyContent: "center", padding: "9px 8px" }`)

Because the icons themselves are all `size={16}` (nav/search/quick-add) the
glyphs will then sit on the same vertical centerline. Leave the privacy toggle
and local-first lock-icon footer as they are unless they visibly misalign — if
they do, give them the same collapsed padding.

**Verify**: `npx tsc --noEmit` → exit 0, and
`grep -n 'padding: "7px"' src/components/AppShell.tsx` returns only the
intentionally-unified value count you chose (i.e. the paddings are consistent,
not a mix of `7px` and `9px 8px` for the collapsed icon buttons).

### Step 5: Full verification + visual check

Run all gates, then verify visually (Step "Suggested executor toolkit").

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → all pass
- `npm run lint` → 0 errors
- Browser: open ⌘N quick-add → sidebar text/icons are sharp (not blurred);
  open a CashFlow transaction (click a row → EntryDrawer) → sidebar sharp;
  click the collapse caret → icons form a single tidy centered column; expand
  again → logo + "Northstar" + name layout unchanged.

## Test plan

This is presentation-only; there are no domain units to add. Do **not** invent a
test that asserts on inline style strings — that is brittle and not the repo's
convention (the existing `AppShell` has no snapshot test).

- Verification is the existing suite staying green (`npm test`) plus the manual
  browser check in Step 5.
- If a browser is unavailable, state that explicitly in your report and provide
  the `grep` results from Steps 1–4 as the evidence that the code change is in
  place.

## Done criteria

ALL must hold:

- [ ] `grep -rn "backdropFilter" src/components/QuickAdd.tsx` → no matches
- [ ] `grep -n 'backdropFilter: "blur(4px)"' src/routes/CashFlowRoute.tsx` → no matches
- [ ] Collapsed sidebar: logo and caret are on separate centered lines (no
      two-element cram); all collapsed icon buttons share one padding value
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0 (warnings allowed; 0 errors)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `13f6a723`).
- Removing the blur visibly degrades readability behind the modal in light theme
  (if the `rgba(0,0,0,0.4)` scrim looks too weak, report it — do not start
  redesigning the modal/backdrop architecture in this plan).
- You find the collapsed layout requires CSS changes in `globals.css` beyond the
  inline-style fixes described (e.g. `.ns-sidebar` width is fighting you) — stop
  and report rather than rewriting the sidebar layout.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- For the reviewer: confirm the diff touches only the two `backdropFilter`
  backdrops and the collapsed-sidebar branch — the **expanded** sidebar markup
  must be unchanged, and the three CashFlow confirm modals must be untouched.
- Deferred on purpose: a "blur only the content pane, not the chrome" effect
  would require moving the backdrop inside `<main>` (or giving the sidebar a
  higher z-index than the backdrop and a solid background while a modal is open).
  That's a larger restructure; this plan deliberately just removes the blur. If
  the operator later wants the frosted-content look back, that's the follow-up.
- Other overlays (`InvestmentsAddSheet`, `HoldingEditModal`, `GlobalSearch`,
  `OnboardingOverlay`) may share the full-viewport-blur pattern — if your
  inspection in scope confirms it, file it as a sibling cleanup; this plan kept
  the blast radius to the two the operator actually hit.
