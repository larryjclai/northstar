# Plan 002: Remove tracked scratch/ cruft and the stray test-chart.ts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9115a2b5..HEAD -- scratch test-chart.ts`
> If these paths changed since this plan was written, re-list them (Step 1)
> before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `9115a2b5`, 2026-06-15

## Why this matters

`scratch/` holds 33 tracked files that are old one-off migration/refactor
artifacts: throwaway `.cjs` patch scripts plus **stale full copies** of
`scratch/CashFlowRoute.tsx` and `scratch/InvestmentsRoute.tsx` that have since
diverged from the real components in `src/routes/`. There is also a stray
`test-chart.ts` at the repo root. None of it is imported by the app or referenced
by build/test config. Dead copies of route files are an active hazard: a
contributor or agent can grep, land in the wrong file, and "fix" a component that
isn't shipped. Removing this shrinks the surface a future reader (or agent) has to
disambiguate.

## Current state

- `scratch/` — 33 git-tracked files. Confirmed contents include:
  - `scratch/CashFlowRoute.tsx`, `scratch/InvestmentsRoute.tsx` — stale copies of
    the real routes in `src/routes/`.
  - many `scratch/*.cjs` files (`add-*.cjs`, `patch-*.cjs`, `rewrite-*.cjs`,
    `update-*.cjs`, `fix-*.cjs`) — old codemod scripts already applied.
- `test-chart.ts` (repo root, 213 bytes) — a stray scratch file, not a test
  (the real tests are `*.test.ts`; vitest config excludes nothing that would pick
  this up, but it is not a `.test.ts` so it never runs — it is just clutter).
- Nothing in `src/`, `vite.config.ts`, `vitest.config.ts`, `package.json`,
  `tsconfig.json`, or `playwright.config.ts` imports from `scratch/` or
  `test-chart.ts` — Step 1 verifies this before deletion.

## Commands you will need

| Purpose        | Command                                  | Expected on success |
|----------------|------------------------------------------|---------------------|
| List tracked   | `git ls-files scratch test-chart.ts`     | the cruft files     |
| Reference scan | `grep -rn "scratch/\|test-chart" src vite.config.ts vitest.config.ts tsconfig.json package.json playwright.config.ts` | no matches |
| Typecheck      | `npx tsc --noEmit`                       | exit 0              |
| Tests          | `npx vitest run`                         | all pass (≥409)     |

## Scope

**In scope** (remove):
- the entire `scratch/` directory
- `test-chart.ts` (repo root)
- `.gitignore` (optional: add a `scratch/` ignore line if you want to keep a local
  scratch dir untracked — see Step 4)

**Out of scope** (do NOT touch):
- `src/routes/CashFlowRoute.tsx` and `src/routes/InvestmentsRoute.tsx` — these are
  the REAL, shipped components. Deleting the `scratch/` copies must not touch them.
- `scripts/` — these are live, referenced by `package.json` (`copy:export`,
  `version`, `prebuild`, etc.). Do not confuse `scripts/` with `scratch/`.
- `src/test/` — real test setup and e2e specs.

## Git workflow

- Branch: `advisor/002-remove-scratch-cruft`.
- Single commit: `chore: remove stale scratch/ artifacts and stray test-chart.ts`.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Prove the cruft is unreferenced

Run the reference scan:
`grep -rn "scratch/\|test-chart" src vite.config.ts vitest.config.ts tsconfig.json package.json playwright.config.ts`

**Verify**: no matches. If there IS a match (something imports from `scratch/` or
`test-chart.ts`), STOP — the assumption that this is dead code is false.

### Step 2: Remove the files from git

Run: `git rm -r scratch test-chart.ts`

**Verify**: `git status` shows the deletions staged and **no** changes to anything
under `src/routes/` or `scripts/`.

### Step 3: Confirm the app still type-checks and tests pass

**Verify**: `npx tsc --noEmit` → exit 0, and `npx vitest run` → all pass, count ≥ 409.

### Step 4 (optional): Keep a local-only scratch dir

If you want `scratch/` to remain usable locally but untracked, add a line
`scratch/` to `.gitignore` (it currently is not ignored). This is optional; skip
if unsure.

## Test plan

No new tests. This is a deletion of unreferenced files; the gate is that
typecheck and the full suite still pass unchanged (Step 3).

## Done criteria

ALL must hold:

- [ ] `git ls-files scratch test-chart.ts` returns nothing
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0, count ≥ 409
- [ ] `git status` shows no modifications under `src/` or `scripts/`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Step 1's reference scan finds any import of `scratch/` or `test-chart.ts`.
- Typecheck or tests fail after deletion (something depended on it after all).

## Maintenance notes

- If `scratch/` is later re-added for local experiments, gitignore it (Step 4) so
  this cruft does not return to version control.
- Reviewer should confirm the diff is deletions only, and that `scripts/` (the live
  build/release scripts) was not touched.
