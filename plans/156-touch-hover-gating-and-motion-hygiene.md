# Plan 156: Gate hover styles for touch, add touch press feedback, fix FAB safe-area, clean up `transition: all` and duplicate keyframes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 37ccb332..HEAD -- src/styles/globals.css src/components/AppShell.tsx src/components/TransactionDetailPanel.tsx src/routes/RecurringRulesTab.tsx src/routes/CashFlowRoute.tsx src/routes/CategoriesRoute.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — pure CSS/style-attribute hygiene, no logic changes
- **Depends on**: none
- **Category**: tech-debt (iOS readiness / motion hygiene)
- **Planned at**: commit `37ccb332`, 2026-07-12

## Why this matters

Northstar is about to ship on iOS (Tauri mobile). Three small web-isms will
immediately read as "web page in a shell" on a touch screen: (1) `:hover`
styles written in plain CSS fire on tap and **stick** until the next tap
(Tailwind v4's `hover:` variant is already gated behind `@media (hover: hover)`,
but our hand-written CSS is not); (2) list rows and the bottom dock give **no
visual feedback on touch-down** — iOS convention is an immediate highlight;
(3) the mobile FAB sits at a fixed 80 px from the viewport bottom, but the
bottom dock is ~55 px tall **plus** `env(safe-area-inset-bottom)` (~34 px on
Face-ID iPhones), so on a real device the FAB's lower ~9 px overlaps the dock.
Separately, six inline `transition: "all …"` styles and two copy-pasted inline
`@keyframes slideInRight` blocks violate the design system's own motion rules
and make later motion work (plans 157–159) harder.

## Current state

All excerpts verified at commit `37ccb332`.

- `src/styles/globals.css` — the Design System stylesheet. Ungated hover rules:

  ```css
  /* :573-574 */
  .ns-acct-name { transition: color 0.12s; }
  .ns-acct-row:hover .ns-acct-name { color: var(--ns-accent); text-decoration: underline; text-underline-offset: 2px; }

  /* :644 */
  .ns-nav-link:hover:not(.active) { background: var(--ns-bg-hover); color: var(--ns-fg); }

  /* :1040-1042 */
  .ns-detail-table tbody tr:hover {
    background: var(--ns-bg-hover);
  }
  ```

  Existing native-press rule (keep, do not touch) at `:513-516`:

  ```css
  button:not(:disabled):active,
  [role="button"]:not([aria-disabled="true"]):active {
    transform: translateY(1px);
  }
  ```

- `src/components/AppShell.tsx:392-393` — mobile FAB, fixed 80 px bottom
  (`bottom-20`):

  ```tsx
  className="fixed right-4 bottom-20 flex items-center justify-center lg:hidden"
  style={{ zIndex: 40, width: 52, height: 52, borderRadius: 999, background: "var(--ns-accent)", ... }}
  ```

  The mobile dock below it (`AppShell.tsx:433-436`) already pads with
  `paddingBottom: "env(safe-area-inset-bottom)"`.

- `transition: "all …"` inline styles (6 sites):
  - `src/routes/CashFlowRoute.tsx:1962` — mode filter pill: `fontFamily: "inherit", transition: "all 0.15s",` (animates background/color/border)
  - `src/routes/CashFlowRoute.tsx:2184` — category chip: `fontFamily: "inherit", transition: "all 0.12s",`
  - `src/routes/RecurringRulesTab.tsx:149` — filter pill: `transition: "all 0.15s"`
  - `src/routes/RecurringRulesTab.tsx:394` — 支出/收入 pill: `transition: "all 0.15s"`
  - `src/routes/RecurringRulesTab.tsx:493` — isActive toggle pill: `transition: "all 0.15s"`
  - `src/routes/CategoriesRoute.tsx:293` — category row: `transition: "all 0.15s ease"` (animates background + opacity)

- Duplicate inline keyframes (2 sites, both slide a right-hand panel in from
  `translateX(100%)`):
  - `src/components/TransactionDetailPanel.tsx:330-335` — `<style>{@keyframes slideInRight …}</style>`, consumed by `panelStyle: { …, animation: "slideInRight 0.2s ease" }` at `:107`.
  - `src/routes/RecurringRulesTab.tsx:553-559` — identical `<style>` block, consumed by `panelStyle: { …, animation: "slideInRight 0.2s ease" }` at `:366`.

  globals.css already has a related-but-different keyframe at `:348-351`
  (`ns-drawer-in`, 28 px slide) — do NOT merge them; they are visually distinct.

- Repo styling convention (AGENTS.md, quoted): 「**樣式撰寫優先序**:(1) COSS 元件;
  (2) `ns-*` utility class 與 Tailwind utilities;(3) inline `style={{}}` **僅限動態值**。」
  Motion tokens live in globals.css `:46-49`: `--ns-ease: cubic-bezier(.2,.7,.2,1)`,
  `--ns-dur-fast: 120ms`, `--ns-dur: 200ms`.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0 |
| Tests     | `npm test`         | all pass (~1020 tests at planning time) |
| Lint      | `npm run lint`     | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/styles/globals.css`
- `src/components/AppShell.tsx` (FAB `bottom` only)
- `src/components/TransactionDetailPanel.tsx` (keyframes/animation only)
- `src/routes/RecurringRulesTab.tsx` (keyframes/animation + `transition: all` only)
- `src/routes/CashFlowRoute.tsx` (`transition: all` only)
- `src/routes/CategoriesRoute.tsx` (`transition: all` only)

**Out of scope** (do NOT touch, even though they look related):
- The `onMouseEnter`/`onMouseLeave` JS hover handlers in DetailCharts /
  MerchantsTab / InvestmentsAnalyticsTab / CategoriesTab / RecurringRulesTab /
  FIRECalculatorRoute — deferred (see Maintenance notes).
- `ModalShell.tsx` and any overlay enter/exit behaviour — that is plan 157.
- The global `:active { translateY(1px) }` rule and COSS components.
- `.ns-quickadd-overlay` / QuickAdd positioning (plan 153 just landed there).

## Git workflow

- Branch: `fix/ai-touch-hover-hygiene` (repo convention: `fix/ai-<name>`, see `.agentrules` — never commit directly on `main`; check `git status` first and protect any uncommitted human work with a `wip:` commit).
- Commit style: conventional commits, e.g. `fix(ui): gate hover styles behind hover-capable media query`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Gate hand-written hover rules behind `@media (hover: hover)`

In `src/styles/globals.css`, wrap the three hover rules (and only the hover
rules — `.ns-acct-name`'s base `transition` line stays unwrapped) in a
hover-capability media query:

```css
@media (hover: hover) {
  .ns-acct-row:hover .ns-acct-name { color: var(--ns-accent); text-decoration: underline; text-underline-offset: 2px; }
  .ns-nav-link:hover:not(.active) { background: var(--ns-bg-hover); color: var(--ns-fg); }
  .ns-detail-table tbody tr:hover { background: var(--ns-bg-hover); }
}
```

Delete the three original ungated rules.

**Verify**: `grep -n ":hover" src/styles/globals.css` → every match for these
three selectors now sits inside the `@media (hover: hover)` block (comment
line at :512 still mentions ":hover" — that's fine). `npm run build` → exit 0.

### Step 2: Add touch press feedback for rows and the dock

In `src/styles/globals.css`, immediately after the new `@media (hover: hover)`
block, add a coarse-pointer press block (touch-down highlight, iOS-style):

```css
/* Touch press feedback: hover doesn't exist on touch — a row must highlight
   the instant a finger lands on it (iOS cell-highlight convention). */
@media (hover: none) {
  a.ns-compact-row:active,
  .ns-mobile-transaction-row:active,
  .ns-invest-mobile-row:active { background: var(--ns-bg-hover); }
  .ns-mobile-dock a:active,
  .ns-mobile-dock button:active { opacity: 0.55; }
}
```

**Verify**: `npm run build` → exit 0. In a browser at ≤900 px width with
DevTools device emulation (touch), tapping a mobile transaction row flashes
`--ns-bg-hover`.

### Step 3: FAB clears the dock on devices with a home indicator

In `src/components/AppShell.tsx:392`, replace the `bottom-20` utility with a
safe-area-aware arbitrary value (keep everything else identical):

```tsx
className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] flex items-center justify-center lg:hidden"
```

On desktop/web `env(safe-area-inset-bottom)` is 0 → identical to today.

**Verify**: `npm run build` → exit 0; `grep -n "bottom-20" src/components/AppShell.tsx` → no match.

### Step 4: Replace the six `transition: all` styles with explicit properties

At each of the six sites listed in Current state, replace `transition: "all …"`
with the explicit properties that actually change, using the DS ease token.
Pattern (adjust duration to match what each site had):

```tsx
transition: "background 150ms var(--ns-ease), color 150ms var(--ns-ease), border-color 150ms var(--ns-ease)",
```

For `CategoriesRoute.tsx:293` the changing properties are `background` and
`opacity` — use those two.

**Verify**: `grep -rn "transition: \"all\|transition: 'all" src/` → 0 matches.
`npm run lint` → exit 0.

### Step 5: Deduplicate `slideInRight` into globals.css

1. In `src/styles/globals.css`, next to `ns-drawer-in` (`:348`), add:

   ```css
   @keyframes ns-slide-in-right {
     from { transform: translateX(100%); opacity: 0; }
     to   { transform: translateX(0);    opacity: 1; }
   }
   ```

2. In `src/components/TransactionDetailPanel.tsx`: change `animation:
   "slideInRight 0.2s ease"` (at `:107`) to `animation: "ns-slide-in-right
   200ms var(--ns-ease)"`, and delete the whole `<style>{`@keyframes
   slideInRight …`}</style>` block (`:330-335`).
3. Same two edits in `src/routes/RecurringRulesTab.tsx` (`:366` and
   `:553-559`). Note the RRT `<style>` block sits inside a fragment — remove
   only the `<style>` element, keep the fragment structure valid.

**Verify**: `grep -rn "slideInRight" src/` → 0 matches. `npm test` → all pass
(TransactionDetailPanel is exercised indirectly; no test asserts the keyframe
name). `npm run build` → exit 0.

## Test plan

No new unit tests — this is CSS/style hygiene with no logic surface vitest can
observe (jsdom does not run transitions/animations). Verification is the grep
gates above plus the full existing suite:

- `npm test` → all pass, count not lower than before your change.
- Manual (report as done-note, not a gate): `npm run dev`, DevTools mobile
  emulation → tap a nav row (no sticky hover), tap-hold a transaction row
  (highlight), FAB visually above the dock.

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -rn "transition: \"all\|transition: 'all" src/` → 0 matches
- [ ] `grep -rn "slideInRight" src/` → 0 matches
- [ ] `grep -n "bottom-20" src/components/AppShell.tsx` → 0 matches
- [ ] The three hover selectors in globals.css are inside `@media (hover: hover)`
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" no longer matches the live code (drifted).
- `npm test` fails on a test that mentions ModalShell or TransactionDetailPanel
  after Step 5 — a test may have started asserting animation styles; report
  rather than deleting the assertion.
- You find additional `transition: all` sites beyond the six listed — fix the
  six, then report the extras (they may be new code this plan shouldn't claim).

## Maintenance notes

- Plan 157 (overlay exit motion) will **replace** the per-call-site
  `animation:` styles this plan touched in Step 5 with a ModalShell-owned
  motion system. Step 5 is still worth doing now (removes duplication) and
  makes 157's sweep simpler.
- Deferred: the six files using JS `onMouseEnter`/`onMouseLeave` hover state
  also produce sticky hover on touch. The fix (shared `supportsHover` guard in
  `src/lib/`) touches chart tooltip logic and needs per-site judgment — write a
  follow-up plan if iOS testing shows it matters in practice.
- Reviewer should scrutinize: that Step 1 didn't accidentally gate
  `:focus-visible` or `:active` rules, and that Step 4 kept each site's
  original duration.
