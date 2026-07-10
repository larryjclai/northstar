# Plan 148: Un-stale the Playwright smoke test and add the e2e CI job (completes plan 128)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. SKIP updating `plans/README.md` — your reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 4ba7784b..HEAD -- src/test/e2e/smoke.spec.ts .github/workflows/ci.yml src/routes/CashFlowRoute.tsx`
> Written against main `4ba7784b`. If your worktree base is older, advance it
> (see dispatch preamble).

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (a test + a CI job; no product code)
- **Depends on**: 128 (MERGED — CI has build/tauri/worker jobs; e2e was omitted)
- **Category**: tests / dx
- **Planned at**: commit `4ba7784b`, 2026-07-09

## Why this matters

The only cross-cutting integration test, `src/test/e2e/smoke.spec.ts`, has been
**stale and failing since ~alpha.3** (last touched 5 weeks ago, commit
`c4fce97a`). It asserts the `/cash-flow` page has 2 native `<select>` elements
with `option[value="all"]` — but that route migrated to COSS components
(`AccountFilter` / `CategoryFilter` / `AppSelect`) long ago and now has ZERO
native `<select>`. So plan 128 (build-surface CI) had to omit the e2e job: you
can't gate on a red test. This plan fixes the smoke assertions to match today's
UI and then adds the e2e job, closing 128's one gap and the audit's TEST-04
("e2e frozen, not gated"). It also validates that the whole first-run →
quick-add → recompute flow still works end to end.

## Current state

- `src/test/e2e/smoke.spec.ts` — the single spec. The stale assertion (~line
  32):
  ```ts
  await expect(page.locator("select").filter({ has: page.locator('option[value="all"]') })).toHaveCount(2);
  ```
  The surrounding assertions (~lines 33-34) already target the CURRENT UI and
  should still pass:
  ```ts
  await expect(page.getByRole("option", { name: "所有帳戶" })).toHaveCount(1);
  await expect(page.getByRole("option", { name: "所有分類" })).toHaveCount(1);
  ```
  So only the native-`<select>` count line is stale — replace it with an
  assertion against the actual `AccountFilter`/`CategoryFilter` markup (open the
  filters and read how they render — likely a combobox/button trigger, not a
  native select). Run the spec, read the failure, and match reality.
- `src/routes/CashFlowRoute.tsx` — uses `AccountFilter` (line ~29),
  `AppSelect` (~30), `CategoryFilter` (~31). Grep these components
  (`src/components/AccountFilter.tsx` etc.) to see their rendered roles/labels
  (e.g. `role="combobox"`, an aria-label, or the "所有帳戶" trigger text).
- `playwright.config.ts` — read it for how the dev server is launched
  (`webServer`?) and the base URL. `smoke.spec.ts` is the only file under its
  `testDir`.
- `.github/workflows/ci.yml` (post-128) — has `checks`, `build`, `tauri`,
  `worker`. The `e2e` job is intentionally absent (this plan adds it). Match
  the existing jobs' checkout + setup-node shape.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install browser | `npx playwright install chromium` | ok (one-time) |
| Run e2e | `npm run test:e2e` (or `npx playwright test --project=chromium`) | smoke passes |
| Typecheck | `npx tsc` | exit 0 |
| YAML sanity | `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8')); console.log('ok')"` | ok |

## Scope

**In scope**:
- `src/test/e2e/smoke.spec.ts` — fix the stale assertion(s) so the spec passes
  against current main; keep the flow it exercises (first-run empty state →
  cash-flow filters present → ⌘N quick-add → recompute) intact and meaningful.
- `.github/workflows/ci.yml` — add the `e2e` job:
  `npm ci` + `npx playwright install --with-deps chromium` + `npm run test:e2e`,
  `timeout-minutes: 15`, same checkout/setup-node pattern as the others.

**Out of scope**:
- Product/source code — if the smoke test reveals a REAL app bug (not just a
  stale selector), STOP and report it; do not fix app code here.
- Broadening e2e beyond the single smoke spec (future work).
- The other CI jobs (128 already landed them).

## Git workflow

- Branch: `fix/ai-e2e-smoke-and-gate`
- Commit: `test(e2e): un-stale the cash-flow smoke assertions + gate e2e in CI`
- Do NOT push or merge to `main`. (The e2e CI job only proves itself on a real
  pushed run — flag that for the operator.)

## Steps

### Step 1: Reproduce and diagnose
`npx playwright install chromium` then `npm run test:e2e`. Confirm it fails at
the native-`<select>` assertion and passes the surrounding steps. Read
`AccountFilter`/`CategoryFilter` to learn their current rendered roles.

**Verify**: you can state exactly which assertion fails and what the current
markup is.

### Step 2: Fix the stale assertion(s)
Replace the native-`<select>` count assertion with one that matches the current
`AccountFilter`/`CategoryFilter` UI (e.g. assert the two filter triggers are
visible by role/label, or that "所有帳戶"/"所有分類" are the default selections).
Keep it a real assertion of "both filters are present and default to all", not
a no-op. Leave the quick-add and recompute steps intact.

**Verify**: `npm run test:e2e` → smoke passes (1 spec green).

### Step 3: Add the e2e CI job
Append an `e2e` job to `ci.yml` mirroring the existing jobs' structure, with
`npx playwright install --with-deps chromium` before `npm run test:e2e`.

**Verify**: YAML parses (command above); `git diff --stat` shows only
`smoke.spec.ts` + `ci.yml`.

### Step 4: Gates
**Verify**: `npx tsc` → exit 0; `npm test` → still 919 pass (unit suite
unaffected); `npm run test:e2e` → green.

## Test plan
The spec IS the test. Success = `npm run test:e2e` green locally and the `e2e`
job present in ci.yml. The first CI run is the operator's to eyeball.

## Done criteria

- [ ] `npm run test:e2e` passes locally (chromium)
- [ ] `smoke.spec.ts` asserts the current cash-flow filter UI (no native
      `<select>` expectation), quick-add + recompute steps intact
- [ ] `ci.yml` has an `e2e` job (`playwright install --with-deps chromium` +
      `test:e2e`, `timeout-minutes: 15`)
- [ ] `npx tsc` exit 0; unit suite still 919
- [ ] Only `smoke.spec.ts` + `ci.yml` modified
- [ ] `plans/README.md` updated

## STOP conditions

- The smoke test fails for a REAL reason (the flow is actually broken — e.g.
  quick-add no longer records, recompute wrong) rather than a stale selector —
  STOP and report the product bug; do not paper over it by weakening the
  assertion.
- The dev server won't launch under Playwright in the sandbox (config expects
  an external server) — report the config assumption; the CI job may still be
  correct even if local run is constrained.

## Maintenance notes

- Once green in CI, the e2e job guards the wired-up flow the unit suite can't —
  extend the spec as major flows stabilize (investments add, reconcile).
- Reviewer: confirm the fixed assertion still fails if the filters genuinely
  disappear (i.e. it's not a tautology).
- This closes the audit's TEST-04 (e2e frozen/not gated) and plan 128's e2e gap.
