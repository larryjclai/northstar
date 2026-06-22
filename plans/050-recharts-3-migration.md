# Plan 050: Migrate recharts 2 → 3 (chart library major version)

> **Executor instructions**: This is a **major-version migration with a spike
> gate**. Phase 0 migrates ONE chart and verifies it visually before rolling
> across the rest. Do NOT bulk-bump and hope. Run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions"
> occurs, stop and report — do not improvise. When done, update this plan's row
> in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- package.json $(grep -rl recharts src/)`
> If the set of recharts-importing files changed since this plan was written,
> re-grep (Step 0) and reconcile before proceeding.

## Status

- **Priority**: P3
- **Effort**: M–L (11 chart files; risk is in visual regressions, not LOC)
- **Risk**: MED–HIGH (major version; charts are the product's core surface;
  breakage is visual and can pass typecheck/tests silently)
- **Depends on**: none (but do AFTER plan 049 so the toolchain is current first)
- **Category**: dependencies / migration
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

`recharts` is at **2.15.4**; latest is **3.8.1** — a major rewrite. The app is
chart-heavy (11 files import recharts), so staying on v2 means falling behind on
fixes and React-19 compatibility work happening upstream in v3. There is **no
user-facing feature** in this migration — it is support-longevity only — which is
exactly why it ranks below the feature plans and why it must be done carefully:
the downside (a subtly broken chart on a finance app) outweighs the upside if
rushed. The safe path is spike-one-chart-then-roll, with **visual** verification
at each stage (typecheck and unit tests will NOT catch a chart that renders
wrong).

## Current state

The 11 files importing `recharts` at `8f2e90bd` (re-grep in Step 0 to confirm):

```
src/components/NetWorthProjectionCard.tsx
src/routes/HoldingDetailRoute.tsx
src/routes/MerchantsTab.tsx
src/routes/InvestmentsAnalyticsTab.tsx
src/routes/GoalsRoute.tsx
src/routes/CategoriesRoute.tsx
src/routes/CategoriesTab.tsx
src/routes/InvestmentsRoute.tsx
src/routes/DashboardRoute.tsx
src/routes/CashFlowRoute.tsx
src/routes/FIRECalculatorRoute.tsx
```

Chart types in use across these (from prior plans): line charts with custom
tooltips + trade markers (HoldingDetail, plan 011), grouped bars + cumulative
line (CashFlow, per `feedback_chart_preferences`), area charts with scenario
bands (NetWorthProjectionCard, plan 025), pie/donut (Merchants/Categories),
sparklines (InvestmentsAnalyticsTab risk KPIs, plan 022).

### Known migration-relevant facts (verify against the official guide)

- React 19 is already in use (`react ^19.1.0`) — v3 targets React 18/19, so that
  axis is fine.
- v3 ships as ESM and removes legacy `defaultProps`-on-function-component usage
  and several deprecated props. **Do not rely on this list from memory** — read
  the official migration guide first (URL below) and grep the codebase for each
  API it flags as changed/removed.
- Build is Vite 8 + `@vitejs/plugin-react` (plan 008) — watch for ESM/interop
  issues at `npm run build`, not just `tsc`.

### Conventions to follow

- Custom tooltip theming matters: plan 011 themed the HoldingDetail tooltip so
  it's readable in dark mode (recharts' default tooltip is white). Any tooltip
  API change must preserve that theming. Re-read `HoldingDetailRoute.tsx`'s
  tooltip before/after.
- Chart colors come from DS CSS variables (`var(--ns-*)`), not hardcoded hex
  (plan 010 fixed light-theme readability). Keep that.
- zh-TW labels, tabular nums, 漲跌色 conventions on chart axes/legends stay.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install v3 | `npm install recharts@^3` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 (catches ESM/interop) |
| Dev server (for visual check) | `npm run dev` | serves on 127.0.0.1 |

## Suggested executor toolkit

- **Read the official recharts v3 migration guide first**:
  https://recharts.org/en-US/guide/migrate-from-v2-to-v3 (and the v3 release
  notes / CHANGELOG). Build a checklist of every changed/removed API it lists,
  then `grep -rn "<api>" src/` for each. This is the source of truth for what
  breaks — not assumptions.
- Use the **preview tooling** (`preview_start`, `preview_screenshot`,
  `preview_snapshot`, `preview_console_logs`) to verify each migrated chart
  renders with no console errors, in BOTH light and dark themes (the app has a
  theme toggle). Demo mode (Settings) loads sample data so charts have content.

## Scope

**In scope:**
- `package.json` / `package-lock.json` — `recharts` to `^3`.
- The 11 chart files listed above — only the recharts API surface in each.
- Any shared chart helper they import (grep for a `components/charts` or similar
  shared module; migrate it once if present).

**Out of scope (do NOT touch):**
- Finance/domain math feeding the charts — the data is unchanged; only the
  rendering library changes. If you find yourself editing a `domain/` file,
  you've gone too far — STOP.
- Other dependency bumps (plan 049 / 051) — keep this diff to recharts.
- Chart *redesigns* — this is a like-for-like port. A chart should look the same
  after migration (modulo unavoidable v3 default changes, which you document).

## Git workflow

- Branch from current main: `git checkout -B advisor/050-recharts-3 main`.
- Commit the spike (Phase 0) separately, then commit per-file or per-logical-group
  as you roll out. Do NOT push/PR unless told.

## Steps

### Step 0 (spike gate): migrate ONE chart, verify visually
1. `npm install recharts@^3`.
2. Read the official v2→v3 migration guide; write a short checklist of
   changed/removed APIs at `docs/recharts-v3-migration.md` and grep each across
   `src/` so you know the total blast radius before touching anything.
3. Migrate the **simplest** chart first — suggest `CategoriesTab.tsx` or
   `MerchantsTab.tsx` (pie/donut, fewest custom pieces). Apply the guide's
   changes for the APIs it actually uses.
4. `npx tsc --noEmit` → 0; `npm run build` → 0; run the dev server and
   **screenshot that chart in light AND dark** with demo data; check
   `preview_console_logs` for zero recharts warnings/errors.

**Gate**: STOP and report the spike result + the blast-radius checklist before
rolling out. If the spike reveals a removed API with no clean v3 equivalent that
the app depends on (e.g. a custom-tooltip or animation behavior), surface it so
the operator can decide before you touch 10 more files.

### Step 1+: roll across the remaining charts
Migrate the rest in increasing order of complexity, ending with the custom ones
(HoldingDetail tooltip+markers, CashFlow grouped-bars+line, NetWorthProjection
area+band). After each file: `npx tsc --noEmit` → 0, and a visual screenshot of
that chart in both themes with no console errors.

**Verify (per file)**: `npx tsc --noEmit` → 0; chart renders correctly
(screenshot) with empty `preview_console_logs` errors.

### Step 2: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0; every one of the 11 charts screenshotted in light
+ dark with no console errors.

## Test plan

- recharts charts are not unit-tested (they're visual) — the **gate is visual +
  build**. Do NOT add brittle DOM-snapshot tests of chart internals.
- The existing domain tests that compute chart *data* must still pass unchanged
  (proves you didn't touch the data layer).
- Verification artifact: screenshots of all 11 charts (light + dark, demo data),
  attached to the PR/report, plus a clean `npm run build`.

## Done criteria

ALL must hold:

- [ ] `recharts` is `^3.x` in `package.json`; `npm run build` exits 0
- [ ] `npx tsc --noEmit` exits 0; `npm test` all pass (unchanged count);
      `npm run lint` 0 errors
- [ ] All 11 charts render correctly in light AND dark with **zero** recharts
      console errors/warnings (screenshots captured)
- [ ] The dark-mode tooltip (HoldingDetail) and DS-variable colors still hold
- [ ] No `src/domain/` file modified (`git status`)
- [ ] `docs/recharts-v3-migration.md` records the API checklist + any documented
      visual default changes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The spike (Step 0) hits a removed API the app depends on with no clean v3
  equivalent — get a decision before migrating the rest.
- `npm run build` fails with an ESM/interop error that isn't a straightforward
  import fix — report (it may need a Vite config tweak).
- A chart renders visibly wrong after migration and the fix isn't in the guide —
  do not guess at chart internals; report with the screenshot.
- The migration appears to require touching a `domain/` data file — stop; the
  data layer must be untouched.

## Maintenance notes

- For the reviewer: this is verified by **eyes**, not just CI. Insist on the 11
  before/after screenshots in both themes; tsc+tests passing is necessary but not
  sufficient for a chart migration.
- Do plan 049 first so the toolchain (Vite/vitest) is on current patch levels
  before adding a major library bump — fewer moving parts if something breaks.
- recharts v3 may change some animation/spacing defaults; document any accepted
  visual deltas in `docs/recharts-v3-migration.md` so they're not later mistaken
  for bugs.
