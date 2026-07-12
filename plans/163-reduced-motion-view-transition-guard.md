# Plan 163: Make `prefers-reduced-motion` reach `::view-transition-*` pseudo-elements

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result. If a STOP condition
> occurs, stop and report. When done, update the status row in
> `plans/README.md` unless a reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 37ccb332..HEAD -- src/styles/globals.css`
> This plan is intended to run STACKED on the motion chain (156–159, plus 162).
> Those add motion tokens and overlay/toast/sheet classes to globals.css — all
> expected. Locate the reduced-motion block by its grep marker, not line numbers.

## Status

- **Priority**: P3
- **Effort**: XS
- **Risk**: LOW — additive CSS inside an existing media query; no behavior change unless a View Transition is active
- **Depends on**: none (independent; defensive/forward-looking)
- **Category**: bug (accessibility, pre-existing)
- **Planned at**: commit `37ccb332`, 2026-07-12

## Why this matters

The global reduced-motion guard zeroes animation/transition durations on
`*, *::before, *::after` — but the View Transitions API animates
`::view-transition-*` pseudo-elements, which the universal selector `*` does
**not** match. So a user with "Reduce Motion" enabled would still get the full
animated page transition once View Transitions land (spike plan 161's Part A
returned a GO verdict for exactly that feature, and its throwaway PoC animates
`::view-transition-old/new`). This is a genuine pre-existing accessibility gap;
fixing it now — before any View Transition ships — means the reduced-motion
contract already holds when that feature is implemented. It is inert today (no
live View Transitions in `main`) and cannot regress anything.

## Current state

`src/styles/globals.css` — the reduced-motion block (find it with
`grep -n "prefers-reduced-motion" src/styles/globals.css`), currently:

```css
/* Native apps cut between views; honor the OS "reduce motion" setting. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
/* If the View Transitions API ever engages, don't cross-fade sibling views
   (its default has a transparent mid-gap that reads as a flicker). */
::view-transition-old(root), ::view-transition-new(root) { animation: none; }
```

The `::view-transition-old(root), ::view-transition-new(root) { animation: none; }`
line is a DIFFERENT, load-bearing guard (it prevents the default root cross-fade
for ALL users, reduced-motion or not) — **do NOT remove or alter it**.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck + build | `npm run build` | exit 0 |
| Tests | `npm test` | all pass |

## Scope

**In scope**: `src/styles/globals.css` — add one rule inside the existing
`@media (prefers-reduced-motion: reduce)` block.

**Out of scope**: the unconditional `::view-transition-old(root), ::view-transition-new(root) { animation: none; }`
guard (leave it); any router/View-Transition wiring; everything else.

## Git workflow

- Branch: `feat/ai-reduced-motion-vt-guard` (stacked on the prior follow-up branch; the dispatch will handle basing).
- Conventional commit, e.g. `fix(a11y): honor reduce-motion for view-transition pseudo-elements`.
- Do NOT push or open a PR.

## Steps

### Step 1: Add the pseudo-element guard inside the reduced-motion media query

Inside the existing `@media (prefers-reduced-motion: reduce)` block (after the
`*, *::before, *::after { … }` rule, still inside the `@media`), add:

```css
  /* The universal selector doesn't match view-transition pseudo-elements, so
     zero them explicitly — otherwise a page/route View Transition would still
     animate for reduce-motion users (161 finding). */
  ::view-transition-group(*),
  ::view-transition-image-pair(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
```

Do NOT touch the separate unconditional root guard below the media query.

**Verify**: `npm run build` → exit 0; the new rule sits INSIDE the
`@media (prefers-reduced-motion: reduce)` braces (visually confirm the closing
`}` order).

## Test plan

None — pure additive CSS with no runtime surface vitest can exercise (jsdom
doesn't run media queries or View Transitions). Verification is the build plus
a visual confirmation of the brace nesting.

- **Verify**: `npm test` → all pass (unchanged count).

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -n "view-transition-group" src/styles/globals.css` → 1 match, and it is inside the `@media (prefers-reduced-motion: reduce)` block
- [ ] The unconditional `::view-transition-old(root), ::view-transition-new(root) { animation: none; }` line still exists unchanged
- [ ] No file other than `src/styles/globals.css` modified (`git status`)
- [ ] `plans/README.md` status row updated (unless the reviewer maintains it)

## STOP conditions

- The `@media (prefers-reduced-motion: reduce)` block isn't found or has a
  different shape than the excerpt — STOP and report.
- The build's CSS pipeline errors on the `::view-transition-*(*)` selectors — STOP
  (do not fall back to a non-`!important` or differently-scoped form without reporting).

## Maintenance notes

- When View Transitions are actually implemented (161 Part A GO), verify with a
  reduce-motion simulation that route changes cut instantly rather than animate.
- If a future View Transition deliberately wants a *reduced* (not zero) motion for
  reduce-motion users (e.g. a quick opacity cut), this blanket `animation: none`
  may need to become a targeted opacity-only rule — revisit then.
