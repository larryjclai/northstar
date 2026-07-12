# Plan 161: GA motion spikes — View Transitions push/pop, scroll-edge effect, Dynamic Type audit (investigate-first, minimal code)

> **Executor instructions**: This is a SPIKE plan — the deliverable is a
> findings document plus at most a tiny proof-of-concept per part, NOT shipped
> features. Timebox each part; write down what you learn even when the answer
> is "not feasible / not worth it". When done, update the status row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 37ccb332..HEAD -- src/routes/router.tsx src/styles/globals.css`
> Drift here is informational only (spike, not surgical edits).

## Status

- **Priority**: P3 (GA-polish; do after 156–160)
- **Effort**: M (three timeboxed investigations)
- **Risk**: LOW — read-mostly; PoC code stays on the branch
- **Depends on**: none strictly; 157/159 landing first makes Part A's
  conclusions more representative
- **Category**: direction (GA readiness)
- **Planned at**: commit `37ccb332`, 2026-07-12

## Why this matters

Three items separate "good mobile app" from "indistinguishable from native"
but each carries real unknowns that make a build-plan premature: (A) iOS users
expect drill-down pages (holding detail, category detail, merchant detail) to
**push** in from the right and **pop** back — the View Transitions API can do
this in modern WKWebView, but integration with TanStack Router and the app's
existing `::view-transition-old(root){animation:none}` guard is unproven here;
(B) sticky headers separate from content with hard 1px borders — Apple-style
scroll-edge fades need an inventory of which surfaces qualify; (C) the whole
type scale is fixed px, so iOS Dynamic Type does nothing — the cost/benefit of
supporting it is unknown. Each part produces a decision + evidence, and if
positive, a concrete follow-up plan stub.

## Current state

Verified at commit `37ccb332`.

- Routing: TanStack Router (`src/routes/router.tsx`), lazy route components.
  Drill-down routes (from DESIGN.md §11): `/holdings/$ticker`,
  `/cash-flow/categories/$categoryName`, `/cash-flow/merchants/$merchantName`,
  `/cash-flow/reconcile/$accountId`, `/goals/fire`.
- `src/styles/globals.css:499-501` — deliberate guard, keep unless a route
  transition explicitly opts in:

  ```css
  /* If the View Transitions API ever engages, don't cross-fade sibling views
     (its default has a transparent mid-gap that reads as a flicker). */
  ::view-transition-old(root), ::view-transition-new(root) { animation: none; }
  ```

- Reduced-motion (`globals.css:491-498`) zeroes all animation durations —
  any push/pop transition must degrade to a cut automatically (it will,
  via that rule).
- Sticky chrome today: demo-mode banner (`AppShell.tsx:367-380`,
  `position: sticky, top: 0` with `borderBottom`), various route-level sticky
  table headers; sidebar/dock are already translucent glass (`.ns-sidebar`,
  `.ns-mobile-dock`).
- Type scale: fixed px tokens (`globals.css:40-44`, `--ns-t-*`; `@theme
  inline` text ladder at `:1490-1506`). Fonts are bundled IBM Plex
  (`src/styles/fonts.css`).
- iOS build SOP: `docs/ios-mobile-plan.md` (free provisioning, 7-day re-sign).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Dev server | `npm run dev`     | serves on 5173 |
| Typecheck + build | `npm run build` | exit 0 |
| Tests     | `npm test`         | all pass |

## Scope

**In scope**:
- `docs/motion-ga-spike.md` (create — the deliverable)
- Throwaway PoC edits allowed ONLY on this plan's branch, confined to:
  `src/routes/router.tsx`, `src/routes/HoldingDetailRoute.tsx`,
  `src/styles/globals.css`
- `plans/README.md` (status row + any follow-up plan stubs you add as
  `plans/16X-*.md` if a part concludes "build it")

**Out of scope**:
- Merging any PoC code to main. Changing the reduced-motion or
  view-transition guards for non-PoC surfaces. Font/tokens refactors.

## Git workflow

- Branch: `feat/ai-ga-motion-spike`. The findings doc is the artifact to keep;
  PoC commits are clearly labeled `spike:`. Do NOT push or open a PR unless
  the operator instructed it.

## Steps

### Part A — View Transitions push/pop (timebox: half a day)

1. Confirm API availability in targets: `document.startViewTransition` in the
   macOS Tauri WKWebView and iOS Safari ≥18 (check caniuse + a runtime
   `typeof` probe logged from the dev app).
2. PoC: wrap ONE navigation pair (investments list → `/holdings/$ticker` and
   back) in `document.startViewTransition(() => router.navigate(...))` (or
   TanStack Router's `viewTransition: true` navigation option if the installed
   version supports it — check `node_modules/@tanstack/react-router` docs/types
   first), with scoped CSS:

   ```css
   html[data-vt="push"]::view-transition-new(root) { animation: ns-vt-push-in 260ms var(--ns-ease-out-strong); }
   html[data-vt="push"]::view-transition-old(root) { animation: ns-vt-push-out 260ms var(--ns-ease-out-strong); }
   /* pop = mirrored (inverse direction) — spatial symmetry */
   ```

   Set `data-vt="push|pop"` before navigating (pop = router history back),
   remove it in `finished`. The `:root animation:none` guard must stay for all
   非 opt-in navigations.
3. Record in the findings doc: does it run compositor-smooth on desktop
   WKWebView? Does the root transition conflict with sticky glass chrome
   (sidebar/dock captured in the snapshot)? Is scoping to `<main>` via
   `view-transition-name` needed to keep chrome static? Verdict + effort
   estimate for the real implementation (which routes, how back-detection
   works in TanStack Router).

**Verify**: findings section "A" exists with a clear GO / NO-GO and evidence;
`npm run build` still exits 0 on the branch.

### Part B — Scroll-edge effect inventory (timebox: 2 hours)

1. Inventory sticky surfaces that sit over scrolling content: demo banner,
   route sticky headers/toolbars (grep `position: sticky|sticky top` in
   src/routes + src/components; list each with file:line).
2. Prototype the effect on ONE surface (demo banner): replace the hard
   `borderBottom` with a mask/gradient fade or a small `backdrop-filter` strip
   only while content is scrolled under it (a `scrollY > 0` class toggle or
   scroll-driven animation if available).
3. Findings: which surfaces qualify, which engine features are available in
   the WKWebView versions we target (scroll-driven animations?), and a
   recommendation (do-all / do-top-3 / not-worth-it).

**Verify**: findings section "B" with the inventory table + verdict.

### Part C — Dynamic Type / text-zoom audit (timebox: 2 hours)

1. In the browser, simulate user text scaling: set
   `document.documentElement.style.fontSize = "20px"` (≈125%) — note that
   because the app's tokens are px, almost nothing should change; then use
   browser zoom 125% as the proxy for "everything scales" and screenshot the
   3 worst layouts (dashboard KPIs, investments table, settings).
2. Estimate the real cost: count px font-size declarations
   (`grep -c "font-size" src/styles/globals.css`, `grep -rn "fontSize" src --include="*.tsx" | wc -l`)
   and identify whether a token-level change (`--ns-t-*` → rem) would cascade
   cleanly or fight the `@theme inline` ladder and inline `fontSize:` styles.
3. Findings: recommendation among (a) full rem migration, (b) iOS-only
   `-webkit-text-size-adjust` opt-in per WKWebView content-size category,
   (c) defer past GA with rationale. Include the caveat that finance tables
   (tabular numbers) are the hardest surface.

**Verify**: findings section "C" with counts, screenshots (paths), verdict.

### Step 4: Write up + follow-up stubs

`docs/motion-ga-spike.md` gets: one-paragraph executive summary, the three
sections, and for each GO verdict a follow-up plan stub added to `plans/`
(next free number, template-conformant header + Why + rough steps, marked
`Status: DRAFT — from spike 161`). Update `plans/README.md`.

## Done criteria

- [ ] `docs/motion-ga-spike.md` exists with sections A/B/C, each ending in an
      explicit verdict (GO / NO-GO / DEFER) + evidence
- [ ] No spike code merged outside the branch; `npm run build` + `npm test`
      green on the branch tip
- [ ] Follow-up plan stubs exist for every GO verdict
- [ ] `plans/README.md` status row updated with the three verdicts

## STOP conditions

- `document.startViewTransition` is undefined in the desktop Tauri webview →
  record NO-GO for desktop, still evaluate iOS Safari, and continue.
- Any part's PoC threatens to exceed its timebox — write down where it stands
  and move on; partial evidence beats a hole.

## Maintenance notes

- The `::view-transition` guard at globals.css:499-501 is load-bearing for
  every non-opt-in navigation; any future route-transition work must scope its
  animations, never delete the guard.
- Re-run Part C's zoom screenshots after any type-scale refactor.
