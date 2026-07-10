# Plan 128: Make CI cover the build surface (vite build, Rust, worker, e2e smoke)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- .github/workflows/ci.yml package.json`
> STOP if ci.yml no longer matches the excerpt.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED (CI-only; risk = slow/flaky jobs, no product risk)
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

The CI gate runs `lint` + `tsc` + `vitest` only. It does NOT run `vite build`
(so bundler-only failures pass), does not compile the Rust shell, does not
typecheck the sync worker, and never runs the Playwright smoke test (frozen
since ~alpha.3). A commit can be green yet fail to build the app or break the
worker. Note: full per-platform builds happen in `release.yml` at release
time — this plan is about the every-push gate catching breakage early, not
duplicating releases.

## Current state

`.github/workflows/ci.yml` (complete file):

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: lts/*
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc
      - run: npm test
```

Facts:
- `npm run build` = `tsc && vite build`; `prebuild` runs
  `scripts/inject-private-assets.mjs` — READ that script first: if it
  requires private assets absent from CI, build with a flag/fallback (check
  whether the script no-ops gracefully when `private-assets/` content is
  missing; it exists in-repo — verify what it copies).
- `npm run check:tauri` = `cd src-tauri && cargo fmt --check && cargo check`.
  Docs note 3–8 min cold; use `Swatinem/rust-cache@v2`. `src-tauri/vendor/`
  exists — check `.cargo/config` for vendored-deps implications.
- `worker/` has its own `package.json` (wrangler; no test script yet). At
  minimum: `npm ci && npx tsc --noEmit` in `worker/` (check
  `worker/tsconfig.json` compiles standalone).
- E2E: `playwright.config.ts` → `src/test/e2e/smoke.spec.ts` (single spec).
  Read the config for the dev-server assumption (does it `webServer`-launch
  vite or expect one running?).

## Commands you will need (local dry-runs before pushing workflow changes)

| Purpose | Command | Expected |
|---|---|---|
| Build   | `npm run build` | exit 0, `dist/` written |
| Rust    | `npm run check:tauri` | exit 0 |
| Worker  | `cd worker && npm ci && npx tsc --noEmit` | exit 0 |
| E2E     | `npx playwright install chromium && npm run test:e2e` | smoke passes |

Run ALL four locally first; any local failure is a pre-existing issue → STOP
for that job and report (don't add a red job to CI).

## Scope

**In scope**: `.github/workflows/ci.yml`. Nothing else — no source changes,
no new test content (plan 129 owns worker tests).

**Out of scope**: `release.yml`; adding worker unit tests; broadening e2e
coverage; macOS/Windows runners.

## Git workflow

- Branch: `feat/ai-ci-build-surface`
- Commit: `ci: add build, tauri check, worker typecheck, e2e smoke jobs`
- Do NOT push to `main`; note that workflow changes only prove themselves on
  a pushed branch/PR — tell the operator the first real run needs eyeballing.

## Steps

### Step 1: Parallel jobs skeleton

Restructure `ci.yml` into parallel jobs, keeping the existing one intact as
`checks`:

```yaml
jobs:
  checks:        # unchanged: lint, tsc, vitest
  build:         # npm ci && npm run build
  tauri:         # rust toolchain + Swatinem/rust-cache@v2 + npm run check:tauri
  worker:        # npm ci + npx tsc --noEmit, working-directory: worker
  e2e:           # npm ci + npx playwright install --with-deps chromium + npm run test:e2e
```

Each job: checkout + setup-node (cache: npm) as in the current file. `tauri`
additionally needs `dtolnay/rust-toolchain@stable` (or the action the repo's
release.yml already uses — READ release.yml and reuse its exact Rust setup
steps for consistency) plus any Linux system deps release.yml installs for
Tauri (webkit2gtk etc. — copy its apt-get block).

### Step 2: Local dry-runs

Run the four local commands above; fix ONLY workflow-file issues. Any product
failure → STOP that job, keep the others.

**Verify**: all four local commands exit 0 (or per-job STOP recorded).

### Step 3: Validate workflow syntax

**Verify**: `npx --yes @action-validator/cli .github/workflows/ci.yml` if
available, else `node -e "require('js-yaml')"`-style parse or careful review;
plus `git diff` shows only ci.yml changed.

## Test plan

CI proves itself on the first pushed run — the operator must eyeball the
Actions tab after this branch is pushed. Record that handoff explicitly in
your report.

## Done criteria

- [ ] ci.yml has the 5 jobs; `checks` unchanged in content
- [ ] All 4 new job commands pass locally (or STOP-reported per job)
- [ ] Rust job uses rust-cache; e2e installs chromium with deps
- [ ] Only `.github/workflows/ci.yml` modified
- [ ] `plans/README.md` updated (note "first real CI run pending operator")

## STOP conditions

- `npm run build` fails locally due to `inject-private-assets.mjs` needing
  secrets — report what it needs; the build job may need a
  `NORTHSTAR_SKIP_PRIVATE_ASSETS`-style escape (a source change → out of
  scope here).
- The smoke test fails or flakes locally 2× — add the other jobs, leave e2e
  out, report.
- `check:tauri` needs system packages release.yml doesn't already document.

## Maintenance notes

- When plan 129 adds worker vitest, extend the `worker` job with `npm test`.
- The e2e job is intentionally chromium-only and single-spec; broadening is
  future work.
- Reviewer: confirm job-level `timeout-minutes` are set (suggest 15 for
  tauri, 10 for others) so a hang can't burn 6h of runner time.
