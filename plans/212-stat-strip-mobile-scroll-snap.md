# Plan 212: Fix the mobile stat-strip scroll-snap — one missing `flex-direction`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3a205f7c..HEAD -- src/styles/globals.css src/components/coss/card.tsx`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S (one CSS declaration)
- **Risk**: LOW (additive, media-query-scoped to mobile widths; desktop untouched)
- **Depends on**: none
- **Category**: bug (CSS)
- **Planned at**: commit `3a205f7c`, 2026-07-16
- **Source**: discovered by plan 210's executor while doing its live check; verified by the advisor. It was correctly left unfixed by 210 (out of that plan's additive-only scope, and the fix touches shared CSS affecting a second page).

## Why this matters

Both the 帳戶 (`AccountsRoute`) and 投資 (`InvestmentsRoute`) pages render a
horizontal "stat strip" — the `NT$…` KPI row (`目前市值 / 未實現損益 / …` on
投資, `總資產 / 總負債 / 淨值` on 帳戶). On desktop it is a CSS grid. On
mobile it is **designed** to become a horizontally-scrolling, scroll-snapping
row (`display: flex; overflow-x: auto; scroll-snap-type: x mandatory`) so a
narrow screen can swipe between columns instead of squeezing them.

**That mobile behavior is currently broken on both pages.** The columns stack
vertically instead of scrolling horizontally, and the scroll-snap does nothing.
The strip is not unusable — it just falls back to a vertical stack — which is
why it went unnoticed until 210's executor measured it. But the intended
one-swipe-per-metric interaction is dead.

**The cause is one missing CSS declaration.** The mobile media-query rule sets
`display: flex` but never sets `flex-direction`, so the flex container inherits
`flex-direction: column` from the card component and lays the columns out
top-to-bottom — at which point `overflow-x` / `scroll-snap-type: x` have nothing
to act on (a column-direction flex container doesn't overflow horizontally).

## Current state

### The card component supplies `flex-direction: column` — `src/components/coss/card.tsx:15`

Both pages wrap the strip in this card (`AccountsRoute.tsx:8` imports `Card`
from `../components/coss/card`; `InvestmentsRoute.tsx` uses `CossCard` from the
same module). Its base class string begins:

```
"relative flex flex-col rounded-2xl border bg-card ..."
```

`flex flex-col` = `display: flex; flex-direction: column`. This is a Tailwind
utility, and Tailwind utilities live in a **cascade layer**.

### The two strip rules — `src/styles/globals.css`

**Desktop base (line 1269)** — no `!important`, and it works (grids render):

```css
.ns-holdings-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 16px 24px;
}
```

**Mobile media query (line 700)** — the buggy line:

```css
  .ns-holdings-summary { display: flex !important; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 4px; }
  .ns-holdings-summary-col { flex: 0 0 min(60vw, 220px); scroll-snap-align: start; }
```

It sets `display`, `overflow-x`, `scroll-snap-type`, and makes each column a
fixed-width flex item — everything a horizontal scroll-snap strip needs **except
`flex-direction: row`**. So the column direction from the card's `flex-col`
utility survives, and the columns stack.

### The cascade facts that make the fix a one-liner (and explain the `!important`)

Read `src/styles/globals.css:1` — the file does `@import "tailwindcss"`, so
Tailwind's utilities (`flex-col`) are **layered**. The `.ns-holdings-*` custom
rules are written **outside any `@layer`** (the file's only `@layer` block is
`@layer base` at line 1933, unrelated). **Unlayered rules beat layered rules
unconditionally**, regardless of specificity or source order.

Two consequences you can rely on:

1. **The desktop `display: grid` at :1269 beats the card's `display: flex`
   utility with no `!important`** — proof that an unlayered `.ns-holdings-summary`
   declaration already wins over the layered card utility. The same will hold
   for a `flex-direction: row` you add.
2. **The `display: flex !important` at :700 needs its `!important` for a
   different reason** — not to beat the utility, but to beat the *later-in-file*
   unlayered base rule at :1269 (`display: grid`). Both are unlayered, equal
   specificity; source order would let :1269 win, so the earlier media-query
   rule uses `!important` to override its own base. **`flex-direction` has no
   such competitor** — neither :700 nor :1269 declares it — so a plain
   `flex-direction: row` at :700 has only the layered utility to beat, which
   unlayered wins outright. **No `!important` is needed.** (You will still
   verify this empirically in Step 2 rather than trust the reasoning.)

### Conventions

- `AGENTS.md` 樣式撰寫優先序 rule (2): static styling belongs in `ns-*` /
  utility classes, not inline. This fix is squarely a CSS-file edit.
- Conventional commits. Example from `git log`: `refactor(accounts): 帳戶總覽改用投資頁的 stat strip + 配置條視覺語言`

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (revert `package-lock.json` churn — known stale lockfile — do not commit it) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | **123 files / 1318 tests** at `3a205f7c` — unchanged by a CSS edit |
| Lint | `npm run lint` | 0 errors (762 warnings pre-existing) |
| Build | `npm run build` | exit 0 |
| Dev | `npm run dev` | Vite dev server |

## Scope

**In scope**:
- `src/styles/globals.css` — the single `.ns-holdings-summary` rule at line ~700

**Out of scope** (do NOT touch):
- `src/components/coss/card.tsx` — the card's `flex-col` is correct for every
  other card in the app; do not strip it.
- `AccountsRoute.tsx` / `InvestmentsRoute.tsx` — the markup is right; this is a
  pure CSS fix. Touching a route file fails review.
- The desktop rule at :1269 — leave the grid alone.
- **The `padding-bottom: 4px` on the :700 line.** You may notice it is itself
  overridden by :1269's `padding: 16px 24px` shorthand (later source order, no
  `!important`), so the strip actually gets 16px bottom padding, not 4px. That
  is a real but separate, purely-cosmetic pre-existing quirk — **do not fix it
  here.** Widening this plan to a padding audit is scope creep; note it in your
  report if you like, but change only `flex-direction`.
- Any other `@media` block or `ns-*` rule.

## Git workflow

- Branch: `fix/ai-stat-strip-mobile-snap` off `main` (`3a205f7c`).
- `git status` first; uncommitted work you did not create → STOP, never stash.
  Files under `plans/` are expected and not yours.
- Commit: `fix(ui): stat strip 手機版補 flex-direction:row，恢復 scroll-snap`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the missing declaration

In `src/styles/globals.css`, the line at ~700 (find it by content — it is inside
a mobile `@media` block):

```css
  .ns-holdings-summary { display: flex !important; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 4px; }
```

Add `flex-direction: row;` immediately after `display: flex !important;`:

```css
  .ns-holdings-summary { display: flex !important; flex-direction: row; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 4px; }
```

Change nothing else on the line. Do not add `!important` to `flex-direction`
yet — Step 2 decides whether it is needed (per the cascade reasoning above, it
is not).

**Verify**: `grep -n "flex-direction: row" src/styles/globals.css` → 1 new match
inside the mobile media query.

### Step 2: Prove it works at mobile width (and prove `!important` is unnecessary)

This is a CSS cascade fix; the only real verification is computed style at a
mobile viewport. jsdom cannot do this, so it must be a browser check.

⚠ **Worktree dev-server hazard (this repo, confirmed repeatedly)**: the shared
preview server has silently served the operator's MAIN checkout to executors,
so a check can validate the OLD file. **Start your own dev server on a distinct
port and verify its cwd is YOUR worktree** before trusting anything:
`npm run dev -- --port 5262 --strictPort`, then `lsof -a -d cwd -p <pid>` (or
equivalent) must show your worktree path. Kill it when done.

Navigate to 投資 (`/investments`) and 帳戶 (`/accounts`) with demo data, set the
viewport to **mobile width (≤640px, e.g. 375px)**, and for the
`.ns-holdings-summary` element confirm via `getComputedStyle`:

- `flexDirection` === `"row"` (not `"column"`) — **the fix**
- `overflowX` === `"auto"` and the element's `scrollWidth > clientWidth` (it
  actually overflows horizontally now, so swipe/scroll-snap has something to do)

Then confirm **desktop is unchanged**: at ≥640px width, `getComputedStyle`
`display` === `"grid"` on the same element (the desktop rule still wins).

**If `flexDirection` reads `"column"` at mobile width**, the layered-vs-unlayered
reasoning did not hold in this build for some reason — add `!important` to the
`flex-direction: row` declaration, re-verify, and **report that you needed it**
(it means something about the cascade differs from this plan's analysis and a
maintainer should know).

Report the measured values for both pages and both breakpoints. If you cannot
run a browser, say so plainly — do not claim a pass you did not observe.

### Step 3: Gates

- `npx tsc --noEmit` → 0 (a CSS edit shouldn't affect it; confirm anyway)
- `npm run lint` → 0 errors
- `npm test` → 1318, unchanged (no test exercises this; a CSS media query is not
  jsdom-observable)
- `npm run build` → exit 0 (this compiles the CSS — a syntax slip here fails the build)
- `git status --short` → only `src/styles/globals.css`
- `git diff --stat` → 1 file, 1 line changed

## Test plan

**No new automated test**, and be explicit about it:

- The bug is a CSS cascade / media-query behavior. jsdom (vitest's environment)
  does not evaluate media queries or cascade layers or compute `flex-direction`,
  so a unit test asserting the mobile layout **cannot fail** and would be a fake
  test.
- A real regression test needs Playwright at a mobile viewport asserting
  computed `flex-direction`. The repo has `npm run test:e2e`, but there is no
  existing stat-strip e2e spec to model after, and standing one up for a
  one-line CSS fix is out of proportion.

The gate is: existing suite stays at **1318**, and the Step 2 browser
measurement is the real proof. Record both.

## Done criteria

ALL must hold:

- [ ] `grep -c "flex-direction: row" src/styles/globals.css` increased by exactly 1, inside the mobile media query
- [ ] Step 2 measured `flexDirection: "row"` at mobile width on BOTH 投資 and 帳戶, with `scrollWidth > clientWidth`
- [ ] Step 2 measured `display: "grid"` at desktop width (desktop unchanged)
- [ ] `git diff 3a205f7c..HEAD -- src/components/coss/card.tsx src/routes/AccountsRoute.tsx src/routes/InvestmentsRoute.tsx` → empty (fix stayed in CSS)
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` 1318; `npm run build` 0
- [ ] Only `src/styles/globals.css` modified, 1 line
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `:700` line doesn't match the excerpt (the CSS drifted).
- Step 2 shows `flex-direction: column` even after adding `!important` — then
  something else is forcing column direction (an inline style, a more-specific
  rule) and the diagnosis in this plan is incomplete; report what you find.
- Adding `flex-direction: row` visibly breaks the **desktop** grid (it should
  not — the desktop rule sets `display: grid`, for which `flex-direction` is
  inert) — report rather than compensating.
- You conclude the real fix belongs in `coss/card.tsx` (removing `flex-col`).
  It does not — that card component is shared by every card in the app and its
  column default is correct everywhere else. Report if you disagree; do not
  change it.

## Maintenance notes

- **The root pattern to remember**: `.ns-holdings-summary` is an unlayered class
  overriding a layered Tailwind utility. When switching such an element between
  `grid` and `flex` across breakpoints, **every** flex-specific property the
  flex layout needs (`flex-direction`, `align-items`, `gap`, …) must be set
  explicitly in the flex rule — the element still carries the card's
  `flex-col`/`items-*` utilities underneath, and they resurface for any property
  the custom rule doesn't override. This bug was exactly that: `display` was
  switched, `flex-direction` was forgotten.
- If a third page adopts `.ns-holdings-summary` (the class is now shared design
  vocabulary per plan 210), it inherits this fix for free — no per-page work.
- The deferred `padding-bottom` quirk (noted out-of-scope above) is a separate,
  cosmetic, pre-existing item; fold it into any future stat-strip polish rather
  than a standalone change.
- A reviewer should scrutinize: that the diff is one line in CSS, that no route
  or card component moved, and that the Step 2 desktop measurement (still
  `grid`) was actually taken — the one way to "fix" mobile and silently break
  desktop is to over-apply the flex direction.
