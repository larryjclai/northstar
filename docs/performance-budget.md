# Performance & Power Budget

> Verified 2026-06-28 at commit `cde1a2ca` (stacked 079-084 on `46febcab`).
> This file records machine-checked facts and guardrail rules so reviewers can
> catch regressions without re-running the audit.

---

## 1. Verified facts

### No background polling

`grep -rn "setInterval" src/ --include="*.ts" --include="*.tsx" | grep -v test`
returns **exactly 2 hits**, both in `src/routes/settings/ConnectSection.tsx`:

| Line | Purpose | Network/DB? |
|------|---------|-------------|
| 83   | `RelativeTime` — updates a "X 秒前" label every 10 s | No (state-only) |
| 257  | Pairing countdown — ticks a seconds display every 1 s  | No (state-only) |

Sync is foreground-only: `useAutoSync` in `AppShell.tsx` fires on visibility-change
and route transitions, throttled by `MIN_SYNC_INTERVAL_MS` (60 000 ms). There is no
recurring timer that performs network, database, or sync work.

### Per-route code splitting intact

`npm run build` produces **51 JS chunks** in `dist/assets/`. All route components use
`lazyRouteComponent` (15 lazy routes in `src/routes/router.tsx`). Vendor libraries are
split into dedicated chunks (react, tanstack, baseui, charts, icons, etc.).

### Foundation Models prewarm is open-gated

`src/components/QuickAdd.tsx:86` — `onDeviceParser.prewarm?.()` is called inside a
`useEffect` guarded by `if (open)`. It runs only when the Quick Add dialog opens, never
at module load or app launch.

### Chart data is memoized

All chart data arrays across routes use `useMemo` with appropriate dependency arrays
(12+ instances across DashboardRoute, InvestmentsRoute, InvestmentsAnalyticsTab,
CashFlowRoute, HoldingDetailRoute, GoalsRoute, CategoryDetailRoute, MerchantDetailRoute).
This prevents unnecessary Recharts re-renders on unrelated state changes.

---

## 2. Guardrail rules for reviewers

### R1 — No background network/DB/sync timers

Any `setInterval` or `setTimeout` loop that touches the network, SQLite, or sync
must be rejected. Sync is designed as foreground-only (visibility-change + route
transition, throttled to 60 s). If a feature needs periodic refresh, use
visibility-change events, not polling.

### R2 — Keep routes lazy; watch the chunk count

Every route must use `lazyRouteComponent` in `src/routes/router.tsx`. After a build
change, run `ls dist/assets/*.js | wc -l` — the count should remain in the 45–60
range. If it drops to ~1-2, per-route splitting has regressed; investigate
`vite.config.ts` `build.rollupOptions.output.codeSplitting` (see R5 — this is not
`manualChunks`; that option is a deprecated shim in this project's bundler).

### R3 — Never prewarm Foundation Models at launch

`onDeviceParser.prewarm()` must only be called inside the Quick Add open-gated
effect. Calling it at module top-level or in a root-level effect would load the
model at app launch, adding seconds of CPU + memory overhead on every cold start.

### R4 — Keep chart data memoized

Chart data arrays passed to Recharts components must be wrapped in `useMemo` (or
equivalent stable reference). Unstable references cause full Recharts remount +
re-animation on every render.

### R5 — Watch the eager chunk graph, not just the chunk count

This project's Vite 8 is **rolldown-vite**: the actual bundler is `rolldown`, not
classic Rollup. `output.manualChunks` is a **deprecated Rollup-compat shim** here —
it gets internally rewritten into a single `codeSplitting` group with no `priority`,
and Rolldown's `codeSplitting.includeDependenciesRecursively` defaults to `true`, so
each group also recursively pulls in its captured modules' *dependencies*. That
combination once let the `charts` group's recursive capture swallow `clsx` (a
transitive dependency of `recharts`, in addition to backing our own `cn()` in
`src/lib/utils.ts`) even though a `manualChunks` id-matching function explicitly
named a different chunk for it — the deprecated shim has no `priority` to break that
tie, so recursive capture from the (larger, matched-first) `charts` group won.
Net effect: all 388 kB of `recharts` became eager on every route, including
chart-less ones (plan 267).

`vite.config.ts` now uses the real `codeSplitting.groups` API directly, with an
explicit `priority` on each group, so contested modules resolve deterministically
instead of by which group's recursive capture reached them first. Do not reintroduce
`output.manualChunks` — per Rolldown's own type docs, if both `manualChunks` and
`codeSplitting` are specified, `manualChunks` is silently ignored.

After any change to `vite.config.ts` or to a widely-imported utility, run:

```bash
npm run build && node scripts/check-eager-bundle.mjs
```

`charts-*.js` must **not** appear in the eager set, and the eager total must not grow
materially. Heavy, route-specific vendors belong behind `lazyRouteComponent`, not in
the entry graph.

---

## 3. Manual measurement pointer

To verify idle power impact on device:

1. Open Xcode → Instruments → Energy Log template.
2. Run the app on a physical iOS device (or macOS).
3. Script: launch → navigate to Dashboard → wait 2 minutes idle.
4. Expected: app should report **Low** energy impact during the idle period.
5. If it reports **High**, investigate with the CPU Profiler template to find the
   hot path.

This is a manual, device-only check — not gated in CI.

---

## 4. Optional future optimization (not done)

**Disable Recharts mount animations on mobile.** Approximately 18 Recharts
components (`<Area>`, `<Bar>`, `<Line>`, `<Pie>`) still use the default mount
animation. Some charts (NetWorthProjectionCard, InvestmentsAnalyticsTab,
HoldingDetailRoute, FIRECalculatorRoute, GoalsRoute) already set
`isAnimationActive={false}`.

Adding `isAnimationActive={false}` to the remaining ~18 instances would eliminate
animation frame work on mount. This is a marginal gain — do it only if Instruments
shows animation is a real energy cost on mobile. The change is mechanical (no logic
risk) but touches many files, so it should be its own PR.
