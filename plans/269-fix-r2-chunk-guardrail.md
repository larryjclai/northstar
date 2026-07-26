# Plan 269: Make R2 measure what it actually cares about

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9a5d5ecf..HEAD -- docs/performance-budget.md scripts/check-eager-bundle.mjs`
> If either changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (documentation + one script assertion; no product code)
- **Depends on**: none. Safe to run at any time.
- **Category**: dx
- **Planned at**: commit `72fc7a7f`; **rebased to `9a5d5ecf` (post 268+262 merges), 2026-07-25**

## Why this matters

`docs/performance-budget.md` rule **R2** asserts the built chunk count stays in
the **45–60** range. That band is already wrong, and it produced a false alarm
during plan 262:

| Commit | Total chunks | Verdict |
|---|---|---|
| `79032d3b` (before this batch) | 51 | in band |
| `72fc7a7f` | 57 | in band |
| `9a5d5ecf` (current main, after 262's vite 8.0.16 → 8.1.5) | **84** | **out of band** |

Investigation showed the increase is **benign** — vite 8.1.5's rolldown splits
shared chunks more finely. Everything R2 actually cares about was healthy:

- per-route splitting intact: **14** route chunks, unchanged
- big vendors still consolidated: icons 415 kB, charts 409 kB, card 218 kB, react 190 kB
- entry chunk **shrank** 219 kB → 78 kB
- eager total **fell** 1,415,111 → 1,398,585 bytes

R2's own prose says what it is really guarding: *"If it drops to ~1-2, per-route
splitting has regressed."* It is a **collapse detector**. But it is written as a
two-sided band, so it fires on healthy growth too — and a guardrail that cries
wolf on a routine dependency bump is a guardrail people learn to ignore. That is
strictly worse than having no rule, because the next real regression gets waved
through with "oh, R2 always complains."

Fix the criterion so it measures the property, not a proxy that happens to
correlate.

## Current state

### R2 today (`docs/performance-budget.md`, the `### R2` section)

```markdown
### R2 — Keep routes lazy; watch the chunk count

Every route must use `lazyRouteComponent` in `src/routes/router.tsx`. After a build
change, run `ls dist/assets/*.js | wc -l` — the count should remain in the 45–60
range. If it drops to ~1-2, per-route splitting has regressed; investigate
`vite.config.ts` `build.rollupOptions.output.codeSplitting` (see R5 — this is not
`manualChunks`; that option is a deprecated shim in this project's bundler).
```

### Measured baseline on `9a5d5ecf` (current main)

```
ls dist/assets/*Route*.js | wc -l   →  14
ls dist/assets/*.js | wc -l         →  84
node scripts/check-eager-bundle.mjs →  EAGER TOTAL 1397303 across 32 chunks, exit 0
```

Note the total is **84** on current main — already outside the old band, which is
exactly the false alarm this plan removes. The route-chunk count is still 14.

`src/routes/router.tsx` declares 14 `lazyRouteComponent` routes, which is where
the 14 comes from — that is the number to assert, and it is self-maintaining in
the sense that adding a lazy route raises both sides together.

### The existing guardrail script (`scripts/check-eager-bundle.mjs`)

Added by plan 267. It walks the static-import graph from `dist/index.html`,
prints the eager set and its total, and exits non-zero if any `charts-*.js` chunk
is eager. It is the model to follow: an assertion about a *property*, with a
runnable check.

### Conventions to match

- `docs/performance-budget.md` states rules as `### R<n> — <imperative>` followed
  by prose and a runnable command block. Match that exactly.
- Existing rules R1, R3, R4 are unchanged by this plan.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Build | `npm run build` | exit 0 |
| Guardrail | `node scripts/check-eager-bundle.mjs` | exit 0 |
| Route chunks | `ls dist/assets/*Route*.js \| wc -l` | 14 |
| Total chunks | `ls dist/assets/*.js \| wc -l` | 84 — informational only, **not** asserted |
| Lazy routes declared | `grep -c lazyRouteComponent src/routes/router.tsx` | 15 (14 routes + the import) |
| Tests | `npm test` | all pass |

## Scope

**In scope**:
- `docs/performance-budget.md` — the R2 section only
- `scripts/check-eager-bundle.mjs` — add the route-chunk assertion

**Out of scope** (do NOT touch):
- Rules R1, R3, R4, R5 — unchanged.
- `vite.config.ts` — **the chunk count is not a problem to fix.** This plan
  changes how we measure, not how we build. If you find yourself editing
  chunking config, stop.
- Any file under `src/`.
- `chunkSizeWarningLimit`.

## Git workflow

- Branch: `docs/ai-fix-r2-guardrail`
- Commit: `docs(perf): make R2 assert route splitting, not a chunk-count band`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rewrite R2

Replace the whole `### R2` section with a property-based rule. Target content
(match the file's existing voice):

```markdown
### R2 — Keep every route lazily loaded

Every route must use `lazyRouteComponent` in `src/routes/router.tsx`, so a route's
code only loads when the user navigates to it.

```bash
npm run build && node scripts/check-eager-bundle.mjs
```

The check asserts:

- **one built chunk per lazy route** — `dist/assets/*Route*.js` must match the
  number of `lazyRouteComponent(...)` declarations in `src/routes/router.tsx`
  (14 at the time of writing). If route chunks collapse into the entry, per-route
  splitting has regressed — investigate
  `vite.config.ts` `build.rollupOptions.output.codeSplitting` (see R5; this is
  **not** `manualChunks`, which is a deprecated shim in this project's bundler).
- **no `charts-*.js` in the eager graph** (see R5).

**The total chunk count is deliberately NOT asserted.** It was previously pinned
to a 45–60 band, which fired a false alarm when vite 8.1.5 legitimately split
shared chunks more finely (51 → 57 → 84 across this batch) while every property
that matters stayed healthy: route chunks unchanged at 14, vendors still
consolidated, the entry chunk *shrank* 219 kB → 78 kB and the eager total *fell*.
A guardrail that fires on healthy change teaches people to ignore it. Watch the
eager total (R5) instead — that is the number a user actually pays.
```

**Verify**: `grep -c "45–60 range" docs/performance-budget.md` → 0 (the *assertion*
is gone). The string "45–60" itself **still appears once**, inside the new
paragraph explaining why the band was removed — that historical note is
deliberate, keep it. Do not rewrite the prose to make a grep pass.

### Step 2: Add the route-chunk assertion to the script

Extend `scripts/check-eager-bundle.mjs` so it also fails when route chunks
disappear. Derive the expected count from the router rather than hard-coding it,
so the check maintains itself:

```js
// R2: every lazyRouteComponent(...) in the router must produce its own chunk.
// Deriving the expected count from the source (rather than hard-coding 14) means
// adding a lazy route updates both sides at once — plan 269.
const routerSource = readFileSync(path.join(root, "src/routes/router.tsx"), "utf8");
const declaredLazyRoutes = (routerSource.match(/lazyRouteComponent\(/g) ?? []).length;
const routeChunks = readdirSync(assetsDir).filter((f) => /Route-[^.]*\.js$/.test(f)).length;

if (routeChunks < declaredLazyRoutes) {
  console.error(
    `[check-eager-bundle] FAIL: ${declaredLazyRoutes} lazy routes declared but only ` +
      `${routeChunks} route chunks built — per-route splitting has regressed.`,
  );
  process.exit(1);
}
console.log(`[check-eager-bundle] OK: ${routeChunks} route chunks for ${declaredLazyRoutes} lazy routes.`);
```

Use `<` not `!==`: a route chunk can legitimately be split further, and this
check exists to catch *collapse*, not growth. That asymmetry is the whole point
of this plan — do not "tighten" it to an equality check.

Import `readdirSync` alongside the existing `node:fs` imports.

**Verify**:
- `npm run build && node scripts/check-eager-bundle.mjs` → exit 0, and the new
  OK line reports 14 route chunks for 14 lazy routes.
- **Prove it fails**: temporarily add a 15th `lazyRouteComponent(` occurrence in
  a comment in `src/routes/router.tsx`, rebuild, and confirm the script exits
  non-zero. **Revert that edit** and confirm `git status` is clean of it.

### Step 3: Full verification

**Verify**, each exiting 0:
1. `npm run build`
2. `node scripts/check-eager-bundle.mjs`
3. `npm test`
4. `npx tsc --noEmit`
5. `npm run lint`

## Test plan

No unit tests — this is a documented guardrail plus its runnable check.

The verification that matters is **Step 2's deliberate-failure check**: a
guardrail that cannot fail is not a guardrail, which is precisely the lesson this
plan encodes. Record both the passing and the failing run in your report.

## Done criteria

- [ ] `grep -c "45–60 range" docs/performance-budget.md` returns 0 — the old
      assertion is gone. Note `grep -c "45–60"` still returns **1**: the new
      explanatory paragraph cites the old band on purpose. That is correct, not
      a miss.
- [ ] `grep -c "R2" docs/performance-budget.md` returns at least 1
- [ ] `node scripts/check-eager-bundle.mjs` exits 0 and reports the route-chunk count
- [ ] The deliberate-failure check exited non-zero, and was reverted (recorded in the report)
- [ ] `npm run build`, `npm test`, `npx tsc --noEmit`, `npm run lint` all exit 0
- [ ] `git diff --name-only` lists only `docs/performance-budget.md` and
      `scripts/check-eager-bundle.mjs`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The route-chunk count on a clean build is **not** 14, or does not match the
  `lazyRouteComponent(` count in `src/routes/router.tsx`. That would mean a real
  splitting regression already exists, which is a finding, not something to
  paper over by adjusting the check.
- The deliberate-failure check in Step 2 does **not** fail.
- You are tempted to change `vite.config.ts` to bring the chunk count back into
  the old band. The count is not the problem; the rule was.

## Maintenance notes

- **The principle worth keeping**: assert the property, not a proxy. R2 pinned a
  chunk-count band as a stand-in for "routes are still split", and the proxy
  drifted away from the property the moment the bundler changed its granularity.
  The new check reads the router and compares against built output, so it tracks
  the real thing.
- Adding a lazy route needs no change here — both sides of the comparison move
  together.
- If a future bundler inlines small route chunks into a shared chunk on purpose,
  this check will fail and will need revisiting. That is the correct behaviour:
  it should force a conversation, not silently pass.
