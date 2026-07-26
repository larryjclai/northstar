# Plan 265: Upgrade jsdom, @types/node and jest-dom to current majors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 62e935d8..HEAD -- package.json vitest.config.ts src/test/setup.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M (three majors, but the compatibility homework is already done —
  the work is running the suite and reading failures)
- **Risk**: LOW–MED (test-only; a failure is loud and cannot reach users)
- **Depends on**: `plans/262-dependency-maintenance-sweep.md` — DONE, merged in `9a5d5ecf`. Also lands after 264 (ESLint 10), merged in `62e935d8`.
- **Category**: dependencies / tests
- **Planned at**: commit `79032d3b`; **reconciled and re-verified at `62e935d8`, 2026-07-25** — all three target versions and both compatibility constraints re-checked and unchanged (Node v26.0.0, `@testing-library/dom` 10.4.1). Note `@types/node` is now at **22.20.1** (262 bumped it in range), not 22.19.21.

## Why this matters

Three test-infrastructure packages are a major (or four) behind. None of them
ship in the app — they only affect the test run — so this is the lowest-stakes
upgrade in the batch, and its failure mode is a red test rather than a broken
build for users.

It is still worth doing rather than deferring forever: `jsdom` is where DOM
behavior in tests diverges from the real WKWebView the app actually runs in, and
staying four majors behind widens that gap. `@types/node` at 22 while the machine
runs Node 26 means the types describe a runtime nobody is using.

The advisor pre-checked every compatibility constraint (see below) — all three
are satisfied by what is already installed.

## Current state

### The versions (from `npm outdated` at `79032d3b`)

| Package | Current | Target |
|---|---|---|
| `jsdom` | 26.1.0 | 29.1.1 |
| `@types/node` | 22.20.1 | 26.1.1 |
| `@testing-library/jest-dom` | 6.9.1 | 7.0.0 |

### Compatibility — verified by the advisor, not assumed

| Constraint | Requirement | This repo | OK? |
|---|---|---|---|
| `jsdom@29.1.1` engines | `node: ^20.19.0 \|\| ^22.13.0 \|\| >=24.0.0` | `node --version` → **v26.0.0** | ✓ |
| `@testing-library/jest-dom@7.0.0` engines | `node: >=22` | v26.0.0 | ✓ |
| `@testing-library/jest-dom@7.0.0` peer | `@testing-library/dom: >=10 <11` | `npm ls @testing-library/dom` → **10.4.1** (via `@testing-library/react@16.3.2`) | ✓ |
| `@types/node@26.1.1` | no peer deps; `typesVersions` fallbacks only for TS ≤5.7 | TS 5.9.3 (or 7.0.2 after plan 263) | ✓ |

**Note the Node engine requirement**: `jsdom@29` will not run on Node < 20.19.
If CI pins an older Node than the dev machine, that is the thing to check —
see Step 1.

### The test setup (`src/test/setup.ts`, full file)

```ts
import "@testing-library/jest-dom/vitest";
```

That single import is the entire jest-dom integration, and `/vitest` is the entry
point most likely to move in a major. Step 3 verifies it.

### The vitest config (`vitest.config.ts`, relevant part)

```ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    exclude: ["**/node_modules/**", "**/dist/**", "**/src/test/e2e/**", "**/.claude/**", "**/worker/**"],
  },
});
```

### The jsdom gotcha this repo already knows about

jsdom's environment in this project does **not** provide `localStorage` to tests;
the established workaround is to stub it per-test with `vi.stubGlobal`. Several
suites rely on that. A jsdom major is exactly the kind of change that could make
`localStorage` appear (or behave differently), which would not break the stubs —
but if a suite starts failing around storage, this is the first place to look.
See `src/state/deviceIdentity.test.ts` and `src/state/uiPreferences.ts` consumers
for the pattern in use.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Tests | `npm test` | all pass |
| Single suite | `npx vitest run <path>` | pass |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| E2E | `npm run test:e2e` | all pass |

## Scope

**In scope**:
- `package.json`, `package-lock.json`
- `src/test/setup.ts` — only if the jest-dom 7 entry point moved
- `vitest.config.ts` — only if the jsdom environment options changed
- Individual `*.test.ts(x)` files — **only** where a genuine jsdom/jest-dom
  behavior change requires it, and each such edit must be called out
  individually in your report with the reason

**Out of scope** (do NOT touch, even though they look related):
- **Any non-test file under `src/`.** These three packages do not ship in the
  app. If a *product* source file needs to change to make a test pass, the test
  was asserting something the upgrade revealed — that is a finding to report, not
  a thing to patch around.
- `vitest` itself — bumped in plan 262 (4.1.9 → 4.1.10, in-range).
- `@testing-library/react` / `@testing-library/dom` — currently satisfying
  jest-dom 7's peer range. Do not bump them here.
- Playwright / `src/test/e2e/**` — a different runner with its own browser; not
  affected by jsdom.
- `worker/` — its own package, excluded from this vitest config, and it needs
  `npm install --legacy-peer-deps`.

## Git workflow

- Branch: `chore/ai-test-infra-majors`
- One commit per package where possible, so a bisect can isolate a regression:
  1. `chore(deps): upgrade jsdom to 29`
  2. `chore(deps): upgrade @types/node to 26`
  3. `chore(deps): upgrade @testing-library/jest-dom to 7`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the baseline and check CI's Node

```bash
node --version
npm test 2>&1 | tail -10
```

Record the exact passing/failing/skipped counts and the Node version.

Then check what Node CI runs — `grep -rn "node-version" .github/workflows/` —
and confirm it satisfies `jsdom@29`'s engine range
(`^20.19.0 || ^22.13.0 || >=24.0.0`). **If CI pins something older, that is a
STOP condition**: the suite would pass locally and fail in CI.

**Verify**: baseline counts recorded; CI Node version confirmed compatible.

### Step 2: Upgrade jsdom

```bash
npm install --save-dev jsdom@29.1.1
```

**Verify**: `npm test` → all pass, same counts as baseline.

If suites fail, triage before touching anything: jsdom majors typically change
unimplemented-API behavior (a method that used to throw now returns, or vice
versa) and CSS/layout stubs. Record which suites and which APIs. Pay particular
attention to anything storage-related (see "the jsdom gotcha" above).

### Step 3: Upgrade jest-dom

```bash
npm install --save-dev @testing-library/jest-dom@7.0.0
```

Confirm the `/vitest` entry point still exists — it is the whole of
`src/test/setup.ts`:

```bash
node -e "console.log(require.resolve('@testing-library/jest-dom/vitest'))" 2>&1 || echo "ENTRY MOVED"
```

(If that fails under ESM resolution, check the package's `exports` map directly:
`node -e "console.log(JSON.stringify(require('@testing-library/jest-dom/package.json').exports, null, 1))"`.)

If the entry moved, update `src/test/setup.ts` to the new one — that single line
is the only change permitted in this step.

**Verify**: `npm test` → all pass. Then confirm the matchers are actually
loaded — pick an existing test that uses `toBeInTheDocument` or
`toHaveTextContent` and run just that file:
`npx vitest run <that file>` → passes. (A silently un-registered matcher set is
the failure mode where jest-dom "works" because every assertion is a no-op.)

### Step 4: Upgrade @types/node

```bash
npm install --save-dev @types/node@26.1.1
```

This is types-only — it cannot change runtime behavior, only whether `tsc`
accepts the code. Note that `plans/263-typescript-7-migration.md` adds
`"types": ["node"]` to `tsconfig.json`; if 263 has already landed, this bump
directly changes what those three `node:sqlite` importers see.

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → all pass

If `tsc` now reports errors in `src/data/repositories.testHarness.ts`,
`repositories.sqlite-tx.test.ts` or `repositories.sync.test.ts`, that is the
`node:sqlite` typing surface changing between major versions. Report the errors;
fixing them is in scope **only** if the fix is confined to those test/harness
files.

### Step 5: Full verification pass

**Verify**, in order, each exiting 0:
1. `npm test` — same counts as the Step 1 baseline
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm run build`
5. `npm run test:e2e`

## Test plan

No new tests — this plan's subject *is* the test infrastructure.

The safety net is the existing suite, and the assertion that matters is
**an unchanged passing count**. Specifically confirm these suites, which exercise
the areas most sensitive to a jsdom or jest-dom change:

- `npx vitest run src/state/deviceIdentity.test.ts` — the `localStorage`
  stubbing pattern
- `npx vitest run src/data/repositories.sqlite-tx.test.ts src/data/repositories.sync.test.ts` —
  the `node:sqlite` harness that `@types/node` types
- Any component test using jest-dom matchers — proves Step 3's matcher
  registration actually took

Verification: `npm test` → all pass, count unchanged from baseline.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0 with the same passing count as the Step 1 baseline
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `npm ls jsdom @testing-library/jest-dom @types/node` shows 29.x, 7.x, 26.x
      with no peer errors
- [ ] `npm ls @testing-library/dom` still shows 10.x (jest-dom 7's peer range)
- [ ] `git diff --name-only` contains no non-test file under `src/`
- [ ] Any `*.test.ts(x)` edit is individually justified in the report
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- CI pins a Node older than `jsdom@29` supports (Step 1).
- A **product** source file under `src/` would need to change to make a test
  pass. Report what the upgrade revealed instead.
- The passing test count changes and you cannot attribute the change to a
  specific, understood jsdom/jest-dom behavior change.
- jest-dom matchers stop being registered (Step 3's second check) — a suite that
  passes because assertions became no-ops is worse than a failing suite.
- `npm install` reports an unmet peer that would need `--force` or
  `--legacy-peer-deps`.
- More than ~3 test files need edits. That is no longer a routine bump; report
  the pattern so it can be scoped properly.

## Maintenance notes

- **`@testing-library/dom` is the coupling to watch.** jest-dom 7 requires
  `>=10 <11`, and `@testing-library/dom` arrives transitively through
  `@testing-library/react`. A future `@testing-library/react` major could pull in
  `@testing-library/dom` 11 and break jest-dom 7's peer range — check that pairing
  before bumping either.
- The `localStorage`-absent-in-jsdom quirk and its `vi.stubGlobal` workaround is
  documented repo knowledge. If a future jsdom version starts providing
  `localStorage` natively, the stubs become redundant but harmless — do not rush
  to remove them; they also isolate tests from each other.
- `@types/node` should track the Node version the team and CI actually run, not
  the newest published. It is at 26 here because the dev machine runs Node 26.
- Deferred out of this plan: aligning the `worker/` package's test dependencies.
  It has its own lockfile, its own `vitest-pool-workers` config, and needs
  `npm install --legacy-peer-deps` — a separate job.
