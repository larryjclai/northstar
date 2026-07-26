# Plan 262: In-range dependency sweep, Tauri 2.11.5, and a Rust release profile

> **Executor instructions**: Follow this plan step by step. This is a low-risk
> maintenance bump — the cost is the verification pass, not the edit. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 72fc7a7f..HEAD -- package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock`
> If any of these changed since this plan was written, re-run `npm outdated` and
> `cargo update --dry-run` and compare against the tables below before
> proceeding.

## Status

- **Priority**: P2
- **Effort**: S–M (the edit is minutes; the verification pass is the work)
- **Risk**: LOW
- **Depends on**: none
- **Category**: dependencies
- **Planned at**: commit `79032d3b`; **reconciled and re-verified at `72fc7a7f` (post 259+267 merges), 2026-07-25** — the version tables below were re-run against the registry at that commit and are unchanged

## Why this matters

Three cheap, independent maintenance items bundled into one verification pass:

1. **Every JS dependency is one or two patch/minor releases behind.** All of the
   bumps below are already inside the semver ranges in `package.json`, so they
   are what a fresh `npm install` would resolve anyway — pinning them in the
   lockfile just makes the state explicit and reviewed.
2. **Tauri is at 2.11.3; 2.11.5 is out.** Worth stating plainly because it is
   easy to assume otherwise: **there is no Tauri 3.** `cargo search tauri` at
   `79032d3b` returns `tauri = "2.11.5"`. This is a patch bump, not a migration.
3. **`src-tauri/Cargo.toml` has no `[profile.release]` section**, so release
   builds use cargo's defaults (`codegen-units = 16`, no LTO, symbols retained).
   For an app that ships through an auto-updater, the binary size this leaves on
   the table is paid by every user on every update.

Landing these together means one build + one manual smoke test covers all three.

## Current state

### JS dependencies — everything is in-range (from `npm outdated` at `79032d3b`)

These are **patch/minor within the existing `^` ranges** — bump the lockfile, and
update `package.json` only where the caret already covers it (i.e. do not widen
any range):

| Package | Current | Target |
|---|---|---|
| `react`, `react-dom` | 19.2.7 | 19.2.8 |
| `vite` | 8.0.16 | 8.1.5 |
| `vitest` | 4.1.9 | 4.1.10 |
| `recharts` | 3.8.1 | 3.10.0 |
| `@playwright/test` | 1.61.0 | 1.62.0 |
| `@tanstack/react-query` | 5.101.0 | 5.101.4 |
| `@tanstack/react-router` | 1.170.16 | 1.170.18 |
| `@tauri-apps/cli` | 2.11.3 | 2.11.4 |
| `tailwindcss`, `@tailwindcss/vite` | 4.3.1 | 4.3.3 |
| `@vitejs/plugin-react` | 6.0.2 | 6.0.4 |
| `i18next` | 26.3.1 | 26.3.6 |
| `react-i18next` | 17.0.8 | 17.0.11 |
| `prettier` | 3.8.4 | 3.9.6 |
| `postcss` | 8.5.15 | 8.5.23 |
| `autoprefixer` | 10.5.0 | 10.5.4 |
| `typescript-eslint` | 8.61.1 | 8.65.0 |
| `eslint`, `@eslint/js` | 9.39.4 | 9.39.5 |
| `@fontsource/*` (3 packages) | 5.2.x | 5.3.0 |
| `shadcn` | 4.11.0 | 4.14.1 |
| `@types/node` | 22.19.21 | 22.20.1 |

**Explicitly NOT in this plan** — these are majors and each has its own plan:

| Package | Latest | Plan |
|---|---|---|
| `typescript` 5.9.3 | 7.0.2 | `plans/263-typescript-7-migration.md` |
| `eslint` 9 → 10, `eslint-plugin-react-hooks` 5 → 7, `eslint-config-prettier` 9 → 10, `globals` 15 → 17, `eslint-plugin-react-refresh` 0.4 → 0.5 | | `plans/264-lint-stack-upgrade.md` |
| `jsdom` 26 → 29, `@types/node` 22 → 26, `@testing-library/jest-dom` 6 → 7 | | `plans/265-test-infra-majors.md` |

Note `@types/node` appears in both tables: bump it to **22.20.1** here (in-range),
and leave the 26.x major to plan 265.

### Rust dependencies (targeted `cargo update --dry-run`, re-verified at `72fc7a7f`)

**Use the targeted `-p` form.** A bare `cargo update --dry-run` at `72fc7a7f`
wants to move **108 packages** — a full lock refresh that would bury the Tauri
bump in unrelated churn and make review impossible. The targeted form locks
exactly 3:

```
$ cargo update --dry-run -p tauri -p tauri-runtime-wry -p tauri-winrt-notification
     Locking 3 packages to latest compatible versions
```

```
    Updating tauri v2.11.3 -> v2.11.5
    Updating tauri-runtime-wry v2.11.3 -> v2.11.4
    Updating tauri-winrt-notification v0.7.2 -> v0.7.3
```

Toolchain in use: `rustc 1.96.0`, `cargo 1.96.0`.

### The vendored `tauri-plugin-sql` patch — read this before touching Cargo

`src-tauri/Cargo.toml` ends with:

```toml
# Pin tauri-plugin-sql to a vendored copy that forces the SQLite pool to a
# single connection (vendor/tauri-plugin-sql/src/wrapper.rs). Upstream uses a
# 10-connection pool, which splits multi-statement transactions across
# connections on slow iOS storage → "cannot commit - no transaction is active"
# (code 1) + "database is locked" (code 5). See src/data/repositories.ts
# serializeDatabase() for the JS side of the same invariant.
# When bumping tauri-plugin-sql, re-vendor from the registry and re-apply the
# one-line max_connections(1) change.
[patch.crates-io]
tauri-plugin-sql = { path = "vendor/tauri-plugin-sql" }
```

The vendored copy is at `2.4.0`. **This plan does not bump `tauri-plugin-sql`** —
`cargo update --dry-run` does not list it, and re-vendoring is a separate,
higher-risk task. If `cargo update` tries to move it, that is a STOP condition.

### No release profile (`src-tauri/Cargo.toml`)

`grep -n "\[profile" src-tauri/Cargo.toml` returns nothing.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Tests | `npm test` | all pass |
| E2E | `npm run test:e2e` | all pass |
| Lint | `npm run lint` | exit 0 |
| Format check | `npm run format:check` | **exit 1 expected** — 277 pre-existing failures on `72fc7a7f`; compare the count, not the exit code |
| Build | `npm run build` | exit 0 |
| Rust check | `npm run check:tauri` | exit 0 (`cargo fmt --check && cargo check`) |
| Licenses | `npm run license:check` | exit 0 |
| Desktop app | `npm run tauri dev` | app launches |

## Scope

**In scope**:
- `package.json`, `package-lock.json`
- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`

**Out of scope** (do NOT touch):
- Any file under `src/` or `src-tauri/src/`. If a bump requires a source change,
  that is a STOP condition — it means the bump is not the routine one this plan
  assumes.
- `src-tauri/vendor/tauri-plugin-sql/**` — the vendored patch. Do not re-vendor,
  do not bump, do not "tidy".
- The three major-version groups listed above (plans 263/264/265).
- The `overrides` block in `package.json` (`@hono/node-server`) — a deliberate
  decision, already triaged.
- `worker/` — a standalone package with its own lockfile and its own
  `npm install --legacy-peer-deps` requirement.

## Git workflow

- Branch: `chore/ai-dependency-sweep`
- Three commits, so a bisect can separate them:
  1. `chore(deps): bump in-range JS dependencies`
  2. `chore(deps): bump tauri to 2.11.5`
  3. `perf(build): add a release profile for smaller binaries`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the baseline

Before changing anything, record:

- `ls -la dist/assets/*.js | awk '{s+=$5} END {print s}'` → total JS bytes
- `npm test 2>&1 | tail -5` → the passing test count
- If a release binary already exists, its size (`ls -la src-tauri/target/release/northstar`)

You will compare against these in Step 5.

**Verify**: the three baseline numbers are written down.

### Step 2: Bump the in-range JS dependencies

Run `npm update` (which respects the existing `^` ranges), then `npm outdated` to
confirm only the deliberately-excluded majors remain.

Do **not** hand-edit version ranges in `package.json`. If `npm update` leaves a
package behind that the table says should move, investigate why (usually a peer
constraint) and report it rather than forcing it.

**Verify**:
- `npm outdated` lists only: `typescript`, `eslint`, `@eslint/js`,
  `eslint-config-prettier`, `eslint-plugin-react-hooks`,
  `eslint-plugin-react-refresh`, `globals`, `jsdom`, `@types/node`,
  `@testing-library/jest-dom` (the three deferred major groups).
- `npx tsc --noEmit` → exit 0
- `npm run lint` → exit 0
- `npm test` → all pass, same count as the Step 1 baseline
- `npm run build` → exit 0

### Step 3: Bump Tauri

```bash
cd src-tauri && cargo update -p tauri -p tauri-runtime-wry -p tauri-winrt-notification
```

Use the targeted `-p` form rather than a bare `cargo update`, so nothing else in
the lock moves silently.

**Verify**:
- `git diff src-tauri/Cargo.lock` shows only `tauri`, `tauri-runtime-wry` and
  `tauri-winrt-notification` moving (plus any transitive `tauri-*` crates those
  three pull — inspect and report anything else)
- `grep -A2 '^name = "tauri-plugin-sql"' src-tauri/Cargo.lock` still shows
  `2.4.0`
- `npm run check:tauri` → exit 0

### Step 4: Add the release profile

Append to `src-tauri/Cargo.toml`, **above** the `[patch.crates-io]` section (a
`[patch.*]` table must not have profile keys land inside it):

```toml
# Release profile (plan 262). The app ships through the auto-updater, so binary
# size is paid by every user on every update. LTO + a single codegen unit let
# the compiler drop cross-crate dead code; `strip` removes symbols that only
# matter for local debugging. Slower to build, smaller and marginally faster to
# run — the right trade for a distributed artifact.
[profile.release]
lto = true
codegen-units = 1
strip = true
panic = "abort"
```

**On `panic = "abort"`**: it is the largest size win of the four, but it changes
runtime behavior — a panic in Rust can no longer be caught and will terminate the
process. Check `src-tauri/src/` for `catch_unwind` before keeping it
(`grep -rn "catch_unwind" src-tauri/src/`). **If there is any hit, drop the
`panic` line and keep the other three.** Report which way you went.

**Verify**:
- `npm run check:tauri` → exit 0
- `cd src-tauri && cargo build --release` → exit 0 (expect this to be noticeably
  slower than before; that is the intended trade)
- Record the new binary size and compare against Step 1

### Step 5: Full verification pass

**Verify**, in order, each exiting 0:
1. `npx tsc --noEmit`
2. `npm run lint`
3. `npm run format:check` (expect exit 1 — compare file count vs the 277 baseline)
4. `npm test` — same passing count as baseline
5. `npm run build`
6. `npm run check:tauri`
7. `npm run license:check`
8. `npm run test:e2e`

Then a manual smoke test with `npm run tauri dev`, covering the surfaces the
bumped packages actually touch:

- **recharts 3.8 → 3.10** (the largest single jump): every chart route — 總覽
  (Dashboard), 現金流 (CashFlow), 投資 and 投資分析, 持股明細, 目標.
- **@tanstack/react-router**: navigate every tab; confirm no console errors.
- **i18next / react-i18next**: switch language in 設定 and confirm both zh-TW and
  English render.
- **tailwind 4.3.1 → 4.3.3**: check light *and* dark theme on one dense route.

**Verify**: all eight commands exit 0, and each manual surface confirmed with no
new console errors.

### Step 5b: Re-check the eager-bundle guardrail after the recharts bump

Plan 267 (merged in `72fc7a7f`) moved chunking to rolldown's
`codeSplitting.groups`, where the `charts` group is selected by
`test: /node_modules\/(recharts|d3-|victory-)/`. Bumping recharts 3.8.1 → 3.10.0
can change which modules that regex captures, and a shared transitive dependency
slipping out of the `charts` group is exactly the defect 267 fixed.

```bash
npm run build && node scripts/check-eager-bundle.mjs
```

**Verify**: exit 0, `charts-*.js` **not** in the eager set, and the reported
EAGER TOTAL is within a few kB of **1,415,155** (the value on `72fc7a7f`). A
large jump means the recharts bump changed the chunk graph — report it rather
than adjusting `vite.config.ts`, which is out of scope for this plan.

## Test plan

No new tests. This plan's safety net is the existing suite plus the manual smoke
test in Step 5 — a dependency bump that needs a new test is not a routine bump.

What matters is that the passing count does **not** change:
`npm test` before and after must report the same number of passing tests. A
changed count (either direction) means a bump altered behavior — investigate
before continuing.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` — **DO NOT expect exit 0.** It already fails on
      `72fc7a7f` with 277 files (verified by the reviewer on main). Assert only
      that the failing-file count does not grow by more than the packages you
      bumped would explain, and report the delta. Prettier 3.8.4 → 3.9.6 adds
      exactly one file (`src/domain/types.ts`, a line-wrap opinion change on
      union types). Do not run `prettier --write` — `src/` is out of scope.
- [ ] `npm test` exits 0 with the same passing count as the Step 1 baseline
- [ ] `npm run build` exits 0
- [ ] `npm run check:tauri` exits 0
- [ ] `npm run license:check` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `node scripts/check-eager-bundle.mjs` exits 0 and `charts-*.js` is not eager
- [ ] `npm outdated` lists only the deferred majors named in Step 2
- [ ] `grep -A2 '^name = "tauri"$' src-tauri/Cargo.lock` shows `2.11.5`
- [ ] `grep -A2 '^name = "tauri-plugin-sql"$' src-tauri/Cargo.lock` shows `2.4.0`
      (unchanged)
- [ ] `grep -c "\[profile.release\]" src-tauri/Cargo.toml` returns 1
- [ ] `git diff --name-only` lists only the four in-scope files
- [ ] Binary size before/after recorded in the report
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any bump requires a change to a file under `src/` or `src-tauri/src/`.
- `cargo update` moves `tauri-plugin-sql` off `2.4.0`, or wants to touch
  `vendor/`. Re-vendoring and re-applying the `max_connections(1)` patch is a
  separate task with its own risk — see the comment in `src-tauri/Cargo.toml`.
- `npm test`'s passing count changes.
- `npm run license:check` fails — a transitive dependency changed license, which
  matters for a GPL-3.0 project shipping `THIRD-PARTY-LICENSES.md`.
- A chart renders differently after the recharts bump. 3.8 → 3.10 is two minors;
  report what changed rather than adjusting chart code (that would be out of
  scope).
- `grep -rn "catch_unwind" src-tauri/src/` has hits and you are unsure whether
  `panic = "abort"` is safe — drop the line and report.
- `cargo build --release` fails with LTO enabled (occasionally surfaces a latent
  linker issue). Remove `lto = true`, keep the rest, and report.

## Maintenance notes

- **There is no Tauri 3 to plan for.** The 2.x line is current; treat Tauri
  upgrades as routine patch maintenance until upstream says otherwise.
- The vendored `tauri-plugin-sql` is the one dependency that cannot be bumped
  casually. Whenever it does move, the `max_connections(1)` change must be
  re-applied, and `serializeDatabase()` in `src/data/repositories.ts` is the JS
  half of the same invariant — both exist to prevent the `db-locked` failure on
  iOS. Re-read both before touching either.
- `panic = "abort"` interacts with any future use of `catch_unwind`. If someone
  adds panic recovery to a Tauri command, this profile line has to come out.
- Recharts is the dependency most likely to need a real migration later; plan 050
  covered the 3.x move. Keep chart smoke tests in every dependency sweep.
- Run this sweep periodically — the point of keeping it small and routine is that
  the majors (263/264/265) never have to fight a two-year backlog of patches at
  the same time.
