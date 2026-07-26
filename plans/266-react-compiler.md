# Plan 266: Adopt the React Compiler (staged, annotation-first)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. **This plan deliberately stops before turning the
> compiler on for the whole app**: Steps 1–4 install and measure, Step 5 hands
> the go/no-go decision back. Do not skip to full compilation. When done, update
> the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 989f9ea8..HEAD -- vite.config.ts vitest.config.ts package.json eslint.config.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (auto-memoization changes *when* components re-render; the
  failure mode is subtle rendering differences, not build errors)
- **Depends on**: `plans/264-lint-stack-upgrade.md` — **hard dependency**. The React
  Compiler lint rules ship in `eslint-plugin-react-hooks` v6+, and this plan's
  Step 2 is "read what those rules report". Running this without 264 means
  adopting the compiler blind.
- **Category**: perf
- **Planned at**: commit `79032d3b`, 2026-07-25

## Why this matters

Thirty-three modules call `useFinanceData()`, which subscribes to fourteen React
Query keys. Any local write invalidates `ledger` (and usually `accounts`), so a
single edit re-renders effectively the whole app. The current defence is manual:
**301 `useMemo` and 29 `useCallback` calls, and zero `React.memo`** (measured at
`79032d3b`). That is a lot of hand-maintained memoization, and hand-maintained
memoization drifts — a missing dependency silently over-memoizes, an unstable
dependency silently under-memoizes, and `docs/performance-budget.md` rule **R4**
exists precisely because an unstable chart-data reference causes a full Recharts
remount.

The React Compiler (`babel-plugin-react-compiler`, now at a stable `1.0.0`)
memoizes automatically and correctly, based on what the code actually reads. It
is the structural fix for that whole class of problem.

It is also the plan in this batch with the least certain payoff, which is why it
is staged. The compiler only helps where re-renders are actually expensive, and
this codebase is already heavily (if manually) memoized. **Step 4 measures
whether it helps before anyone commits to it.**

## Current state

### The re-render surface (measured at `79032d3b`)

- `grep -rl "useFinanceData" src/ | wc -l` → **33** files
- `grep -rho "useMemo" src/ | wc -l` → **301**
- `grep -rho "useCallback" src/ | wc -l` → **29**
- `grep -rho "React.memo" src/ | wc -l` → **0**
- `vite.config.ts` and `package.json` contain no React Compiler configuration
  (`grep -rn "reactCompiler\|babel-plugin-react-compiler" vite.config.ts package.json` → no hits)

### The invalidation fan-out (`src/data/hooks.ts:187-205`)

```ts
export function useRepositoryMutation<TInput>(
  action: (repository: FinanceRepository, input: TInput) => Promise<void>,
  invalidate: Array<keyof typeof keys>,
) {
  const queryClient = useQueryClient();
  const repository = useRepository();
  return useMutation({
    mutationFn: async (input: TInput) => { … },
    onSuccess: async () => {
      await Promise.all(invalidate.map((key) => queryClient.invalidateQueries({ queryKey: keys[key] })));
      noteLocalChange();
    },
  });
}
```

### The Vite setup (`vite.config.ts:1-12`)

```ts
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import path from "node:path";

const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), marketDataProxy()],
```

### The integration recipe — from the installed plugin's own README

`@vitejs/plugin-react@6.0.2` (the version in `node_modules` at this commit)
documents React Compiler support via an exported `reactCompilerPreset` helper.
Quoting `node_modules/@vitejs/plugin-react/README.md`:

> React Compiler support is available via the exported `reactCompilerPreset`
> helper, which requires `@rolldown/plugin-babel` and
> `babel-plugin-react-compiler` and `@babel/core` as peer dependencies

```sh
npm install -D @rolldown/plugin-babel @babel/core babel-plugin-react-compiler
npm install -D @types/babel__core   # TypeScript projects
```

```js
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
})
```

The preset accepts:
- `compilationMode: 'annotation'` — compile **only** components annotated
  `"use memo"`. This is the staged-rollout switch this plan uses.
- `target: '17' | '18'` — for older React. **Not needed here**: this repo is on
  React 19, which provides `react/compiler-runtime` natively.

### Vitest uses the React plugin too (`vitest.config.ts:1-6`)

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
```

**This is a separate plugin list.** Whatever you do to `vite.config.ts` does not
apply to the test run unless you do it there too — which means tests would
exercise *uncompiled* components while the app ships compiled ones. Step 3
addresses this deliberately.

### Conventions to match

- `docs/performance-budget.md` records machine-checked performance facts and
  guardrail rules **R1–R4**. R2 ("keep routes lazy; watch the chunk count") and
  R4 ("keep chart data memoized") are both directly relevant. If this plan lands,
  that document needs a new rule — see Step 5.
- Long `//` comments citing the plan number for non-obvious build config —
  `vite.config.ts` already does this extensively (see its `manualChunks` comment).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |
| Chunk count | `ls dist/assets/*.js \| wc -l` | 45–60 (budget rule R2) |
| Bundle bytes | `ls -la dist/assets/*.js \| awk '{s+=$5} END {print s}'` | record it |
| E2E | `npm run test:e2e` | all pass |
| Desktop app | `npm run tauri dev` | app launches |

## Scope

**In scope**:
- `package.json`, `package-lock.json`
- `vite.config.ts`
- `vitest.config.ts`
- `eslint.config.js` — enabling the React Compiler lint rules only
- `docs/performance-budget.md` — a new guardrail rule, if Step 5 says go

**Out of scope** (do NOT touch, even though they look related):
- **Removing any existing `useMemo` / `useCallback`.** The compiler makes them
  redundant, not harmful. Stripping 301 call sites is a large, separately
  reviewable change and must not ride along with enabling the compiler — you
  would not be able to tell which change caused a regression.
- Adding `React.memo` anywhere.
- `src/data/hooks.ts` — the invalidation fan-out is a real finding but a
  different fix (narrower query keys), not this one.
- Any component logic. If the compiler's lint rules report a Rules-of-React
  violation, **report it**; fixing violations is a follow-up with its own review.
- `manualChunks` in `vite.config.ts` — see `plans/267-eager-bundle-budget.md`.

## Git workflow

- Branch: `perf/ai-react-compiler`
- Commits:
  1. `chore(deps): add react compiler toolchain`
  2. `chore(lint): enable react compiler rules`
  3. `perf(build): enable react compiler in annotation mode`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the baseline

```bash
npm run build
ls dist/assets/*.js | wc -l
ls -la dist/assets/*.js | awk '{s+=$5} END {print s}'
npm test 2>&1 | tail -5
```

Record: chunk count, total JS bytes, passing test count. The advisor measured
~11 MB across `dist/assets` and the largest chunks as
`icons` 415 kB, `charts` 388 kB, `card` 286 kB, `index` 212 kB at `79032d3b`.

**Verify**: all four numbers written down.

### Step 2: Enable the React Compiler lint rules and read the report

This is the diagnostic step and the reason plan 264 is a hard dependency.

⚠️ **The starting state changed while 264 was executed — read this before Step 2.**

v7's `recommended.rules` turned out to bundle **14 React Compiler diagnostic
rules as `error`**. Spreading it would have turned them on as a side effect of a
dependency upgrade and taken lint 40 errors red, so plan 264 deliberately
**pinned the pre-v7 rule set explicitly** instead. `eslint.config.js` now reads:

```js
      // eslint-plugin-react-hooks@7's `recommended.rules` now bundles the React
      // Compiler diagnostic rules (react-hooks/refs, set-state-in-effect, purity,
      // etc.) as errors. Enabling those is plans/266-react-compiler.md, not this
      // upgrade (plans/264) — so pin the pre-v7 rule set explicitly instead of
      // spreading `recommended.rules`, which would turn them on as a side effect.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
```

So your job in this step is **not** "install a plugin and enable rules" — the
plugin is already installed and the rules are deliberately switched off. You are
**un-pinning**, which makes this an explicit, reviewable opt-in.

**Expect roughly 40 findings** across `react-hooks/refs` (~5),
`set-state-in-effect` (~31), `globals` (~1), `purity` (~1) and
`preserve-manual-memoization` (~2) — those were the counts observed during 264.
Enable them at **`warn`**, not `error`, so lint stays green and CI does not break;
this repo's convention is `error` only for correctness guards (see
`no-restricted-syntax`). Record the counts — that report is this plan's real
deliverable. Do **not** fix the findings.

Check what the installed version exposes before writing config:

```bash
node -e "import('eslint-plugin-react-hooks').then(m => console.log(Object.keys((m.default ?? m).configs ?? {})))"
```

Enable the compiler rule set (typically a `recommended`-style flat config that
includes `react-hooks/react-compiler`, but **use whatever the probe above shows**,
not what this plan guesses).

```bash
npm run lint
```

**Record every violation the compiler rules report**, grouped by rule id and
file. Do **not** fix them.

This report is the single most useful output of this plan: each violation is a
component the compiler will refuse to optimize, and usually also a latent bug
(mutation during render, a ref read in the render path, a conditional hook).

**Verify**: the violation list is in your report, with counts per rule id. If the
count is zero, say so explicitly — that is a meaningful result.

### Step 3: Install the toolchain and wire it in annotation mode

```bash
npm install -D @rolldown/plugin-babel @babel/core babel-plugin-react-compiler @types/babel__core
```

In `vite.config.ts`:

```ts
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig, type Plugin } from "vite";

// …

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // React Compiler (plan 266), deliberately in `annotation` mode: it compiles
    // ONLY components marked "use memo". This app is already heavily
    // hand-memoized (301 useMemo at time of writing), so whole-app compilation
    // is a change with real risk and unproven benefit here — we opt components
    // in one at a time and measure. See docs/performance-budget.md.
    babel({ presets: [reactCompilerPreset({ compilationMode: "annotation" })] }),
    tailwindcss(),
    marketDataProxy(),
  ],
```

Mirror the same plugin into `vitest.config.ts`, so tests exercise compiled
components rather than uncompiled ones:

```ts
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Must mirror vite.config.ts's compiler setup — otherwise tests validate
  // uncompiled components while the app ships compiled ones (plan 266).
  plugins: [react(), babel({ presets: [reactCompilerPreset({ compilationMode: "annotation" })] })],
```

In annotation mode with nothing annotated, this is a **no-op by construction** —
which is exactly what makes it safe to land.

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → all pass, same count as baseline
- `npm run build` → exit 0
- `ls dist/assets/*.js | wc -l` → still 45–60 (budget rule R2)
- Total JS bytes within a few kB of baseline (it should be nearly identical —
  nothing is annotated yet)

### Step 4: Compile one route and measure

Pick **one** heavy, chart-bearing route as the trial. `InvestmentsAnalyticsTab`
is the best candidate: it is the most computation-dense screen and it has the
most `useMemo` calls.

Add the `"use memo"` directive to that component, build, and measure:

- chunk count and total bytes vs baseline
- `npm test` still green
- and the thing that actually matters: **run `npm run tauri dev` and interact
  with that route.** Change the date range, switch the benchmark, toggle books.
  Confirm the charts update correctly and nothing renders stale.

**Verify**: the route behaves identically, tests pass, and you have before/after
byte numbers for the chunk containing it.

### Step 5: Report and STOP for a decision

Write up:

1. The Step 2 lint violation list (per rule, per file).
2. Bundle size before / after the annotated route.
3. Whether the trial route behaved identically.
4. Your recommendation: stay in annotation mode and opt in route by route, or go
   to whole-app `compilationMode` in a follow-up plan.

If — and only if — the recommendation is to proceed, add a guardrail rule to
`docs/performance-budget.md` in the style of the existing rules. **Number it R6** —
R5 is already taken by plan 267's eager-graph rule (merged in `72fc7a7f`), and
plan 269 rewrites R2. Check the file for the highest existing rule number before
writing, rather than trusting this plan's number:

> **R6 — React Compiler is opt-in.** Components are compiled only when annotated
> `"use memo"`. `vite.config.ts` and `vitest.config.ts` must keep the same
> `compilationMode`; a mismatch means tests validate uncompiled code. Before
> annotating a component, run `npm run lint` and confirm it has no
> `react-hooks/react-compiler` violations.

**Then stop.** Whole-app compilation is a separate decision with a separate
review.

## Test plan

No new automated tests — the compiler is a build-time transform, and the existing
suite is the regression net. What must hold:

- **`npm test` passing count unchanged** at every step. In annotation mode with
  nothing annotated (Step 3) this is guaranteed; after Step 4 it is the real
  signal.
- **`vitest.config.ts` mirrors `vite.config.ts`.** Without this the test suite
  provides no coverage of compiled output at all. Confirm by grepping both files
  for `reactCompilerPreset` — both must have it, with the same
  `compilationMode`.
- **The manual interaction pass in Step 4.** Auto-memoization bugs surface as
  stale UI, not as test failures, because the tests mount fresh components. The
  interaction pass is the only thing that catches this class of bug — do not skip
  it.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0, with the compiler rules enabled and their findings
      recorded (findings may be non-zero — they must be *reported*, not fixed)
- [ ] `npm test` exits 0 with the same passing count as the Step 1 baseline
- [ ] `npm run build` exits 0
- [ ] `ls dist/assets/*.js | wc -l` is within 45–60 (budget rule R2)
- [ ] `npm run test:e2e` exits 0
- [ ] `grep -c "reactCompilerPreset" vite.config.ts` returns 1
- [ ] `grep -c "reactCompilerPreset" vitest.config.ts` returns 1
- [ ] `grep -c "annotation" vite.config.ts vitest.config.ts` returns 1 for each
      (the modes match)
- [ ] `git diff -- src/ | grep -c "useMemo\|useCallback"` returns 0 (no
      memoization was removed)
- [ ] The Step 5 report exists, with the lint violations, byte deltas, and a
      recommendation
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 264 has not landed — `eslint-plugin-react-hooks` v7 is a hard prerequisite.
- `@vitejs/plugin-react` in `node_modules` does not export `reactCompilerPreset`.
  The recipe above is quoted from the README of the installed 6.0.2; a different
  version may integrate differently. Re-read that README rather than guessing.
- `npm test`'s passing count changes at any step.
- The Step 4 trial route renders anything stale or wrong. That is the exact
  failure this plan exists to catch — report it in detail, do not work around it.
- You are tempted to remove `useMemo` calls "since the compiler handles it now".
  Out of scope; it would make any regression unattributable.
- You are tempted to switch to whole-app compilation because annotation mode
  "doesn't show a difference". That is a finding to report, not a reason to widen
  the blast radius unreviewed.
- The compiler lint rules report violations in code that also has correctness
  tests — flag those specifically; they may be real bugs.

## Maintenance notes

- **The mode must match between `vite.config.ts` and `vitest.config.ts`.** This
  is the maintenance hazard this plan introduces: two independent plugin lists
  that must stay in sync, with no mechanism enforcing it. Anyone changing one
  must change the other.
- Annotation mode means the compiler's benefit only reaches components someone
  deliberately opted in. Track which are annotated
  (`grep -rn '"use memo"' src/`) so the set does not become invisible.
- The Step 2 violation list is worth keeping even if this plan is abandoned —
  each entry is a Rules-of-React violation that is a latent bug regardless of
  whether the compiler ever ships.
- The 301 `useMemo` calls stay. If whole-app compilation is eventually adopted
  and proves stable, removing them becomes a worthwhile cleanup — but only then,
  and as its own change.
- Deferred out of this plan, and arguably higher leverage than the compiler
  itself: narrowing the invalidation fan-out in `src/data/hooks.ts`. Thirty-three
  consumers re-rendering on every ledger write is a data-layer problem; the
  compiler only makes each re-render cheaper, it does not make them stop
  happening.
