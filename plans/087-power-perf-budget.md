# Plan 087: Verify & document the power/performance budget (077 Phase 7.5)

> **Executor instructions**: This is primarily a VERIFICATION + documentation task. The
> recon below shows the app is already well-optimized — your job is to machine-verify that
> posture and record it as a guardrail, NOT to refactor working code. Make only the changes
> in scope. NEVER push, NEVER touch `main`. Base on the stacked branch (Step 0).

## Status
- **Priority**: P2  •  **Effort**: S  •  **Risk**: LOW  •  **Depends on**: 083 (routes/AppShell base)
- **Category**: performance  •  **Planned at**: stacked tip, 2026-06-27
- **Supersedes**: 077 Phase 7.5

## Why this matters
A Tauri WKWebView app's biggest energy costs are (a) background work that never sleeps and
(b) loading everything up front. A code audit (2026-06-27) found Northstar already in good
shape — but there's no written budget, so a future change could quietly regress it. This
plan verifies the current good state with machine checks and records a budget so reviewers
can catch regressions.

## Current state (recon — verify these hold)
- **No background polling**: `grep -rn "setInterval" src/ --include="*.ts" --include="*.tsx" | grep -v test`
  returns only TWO hits, both in `src/routes/settings/ConnectSection.tsx` (a 1s clock tick
  and a 10s "now" updater) — UI-only, scoped to the open Settings panel, NO network/DB. Benign.
- **Code-splitting present**: `src/routes/router.tsx` uses `lazyRouteComponent`/lazy in ~15
  places; `vite.config.ts` has `manualChunks` splitting vendors. So routes load on demand.
- **Foundation Models prewarm is lazy**: `src/components/QuickAdd.tsx` calls
  `onDeviceParser.prewarm?.()` only inside the `open` effect (when the user opens Quick Add),
  never at app launch. Correct.
- **Charts memoized**: the heavy chart routes (`DashboardRoute`, `CashFlowRoute`,
  `InvestmentsAnalyticsTab`) use `useMemo` extensively (19–30 each) for chart data.

## Commands
| Install | `npm install` | exit 0 |
| Build | `npm run build` | exit 0 |
| Chunk count | `ls dist/assets/*.js \| wc -l` | many (per-route chunks, not 1) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |

## Scope
**In scope**: `docs/DEVELOPMENT.md` — add a "Performance budget" section (the verified
facts + the guardrail rules). Optionally `vite.config.ts` ONLY IF the chunk check reveals
splitting has regressed (it should not).
**Out of scope**: refactoring routes/components, changing chart code, disabling animations
(see Maintenance — left as a recommendation, NOT done here), any logic change.

## Steps

### Step 0: integrate the stacked base
```
git merge --no-ff feat/ai-mobile-dock-strip-fix -m "integrate: stacked 079-084"
npm install
git checkout -b feat/ai-perf-budget
```
If the merge conflicts, STOP and report.

### Step 1: Machine-verify the budget holds
Run and record results:
1. `grep -rn "setInterval\|setTimeout" src/ --include="*.ts" --include="*.tsx" | grep -v test`
   — confirm no NEW timer does network/DB work (the 2 ConnectSection timers are the only
   intervals; any setTimeout should be one-shot UI, not a polling loop). List what you find.
2. `npm run build` then `ls dist/assets/*.js | wc -l` — confirm MANY js chunks (per-route
   splitting intact). Record the count. If it's ~1–2 (splitting regressed), STOP and report.
3. `grep -n "prewarm" src/components/QuickAdd.tsx` — confirm prewarm is called only inside
   the `open`-gated effect, not at module top-level / app launch.

### Step 2: Document the budget
Add a "## Performance budget" section to `docs/DEVELOPMENT.md` recording:
- The verified facts from Step 1 (no background polling; N per-route chunks; lazy prewarm;
  charts memoized).
- Guardrail rules for reviewers: "No `setInterval` that does network/DB/sync work — sync is
  foreground-only via `useAutoSync`'s `MIN_SYNC_INTERVAL_MS`. Keep routes lazy
  (`lazyRouteComponent`) — a regression that eager-loads all routes (and all Recharts) hurts
  launch energy; watch the `dist/assets/*.js` chunk count. Never call Foundation Models
  `prewarm` at launch — only on Quick Add open."
- A pointer to measuring real energy: "Run from Xcode → Instruments → Energy Log on a 2-min
  scripted session (launch, scroll dashboard, open Quick Add, add a transaction); the app
  should idle at Low impact when not interacting." (manual, device-only — not gated here.)

**Verify**: `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm test` all pass.

## Done criteria (ALL)
- [ ] Step 1 checks recorded; no background-polling regression; `dist/assets/*.js` chunk count is many (report the number)
- [ ] `docs/DEVELOPMENT.md` has a "Performance budget" section with the facts + guardrail rules
- [ ] `npm run build` exits 0; `npx tsc --noEmit` exits 0; `npm test` all pass
- [ ] Only `docs/DEVELOPMENT.md` changed (no source refactor)

## STOP conditions
- The build chunk count shows splitting regressed to ~1 bundle — report (something broke `manualChunks`/lazy routes).
- A `setInterval` doing network/DB/sync work is found — report it as a finding (do not fix here; it'd need its own plan).

## Maintenance notes
- **Optional future fix (NOT done here)**: disable Recharts mount animations on mobile
  (`isAnimationActive={false}` under a mobile flag) for a small battery/jank win. Deferred —
  it touches ~50 chart instances for a marginal gain; do it only if Instruments shows chart
  animation is a real cost.
- The budget is a review guardrail; update it if the architecture changes (e.g. a real
  background task is ever added — it must be justified against this budget).
