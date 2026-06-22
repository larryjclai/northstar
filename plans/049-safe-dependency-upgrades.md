# Plan 049: Safe (in-range) dependency upgrades — Tauri 2.11.3, Base UI 1.6, patches

> **Executor instructions**: Follow this plan step by step. This is a low-risk
> maintenance bump of **semver-compatible** versions only. Run every verification
> command and confirm the expected result before moving on. If anything in "STOP
> conditions" occurs, stop and report — do not improvise. When done, update this
> plan's row in `plans/README.md` unless a reviewer told you they maintain the
> index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- package.json src-tauri/Cargo.toml src-tauri/Cargo.lock`
> If these changed since this plan was written, re-run `npm outdated` /
> `cargo update --dry-run` and compare against the version table below before
> proceeding.

## Status

- **Priority**: P3
- **Effort**: S–M (bump + verify; the cost is the verification pass, not the edit)
- **Risk**: LOW (all bumps are within the existing semver ranges — patch/minor)
- **Depends on**: none
- **Category**: dx / dependencies
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Routine dependency hygiene. As of `8f2e90bd`, several deps have **in-range**
(non-breaking) updates available, including a Tauri patch (2.11.2 → 2.11.3) and a
Base UI minor (the project's UI primitive layer). Taking them in one verified
batch keeps the app on current patch levels (security/bug fixes flow through the
Tauri/wry stack) without the risk of a major migration. `npm audit` is already
0 vulnerabilities, so this is preventive, not remedial.

**Explicitly NOT in this plan** (each is a separate major-version migration —
do not touch them here): `recharts` 2→3 (plan 050), `zod` (plan 051 — it is
unused; that plan removes it), `eslint` 9→10 (+ its plugins), `typescript` 5→6,
`jsdom` 26→29, `@eslint/js` 9→10, `globals` 15→17. Bumping any of those is out of
scope; if `npm update` tries to, pin it back.

## Current state

`npm outdated` at `8f2e90bd` — the **in-range** (Wanted ≠ Current, and Wanted is
not a major jump) entries this plan takes:

| Package | Current | → Wanted (take) | Latest (do NOT take) |
|---|---|---|---|
| `@base-ui/react` | 1.5.0 | **1.6.0** | 1.6.0 |
| `@tanstack/react-router` | 1.170.15 | **1.170.16** | 1.170.16 |
| `@tauri-apps/api` | 2.11.0 | **2.11.1** | 2.11.1 |
| `@tauri-apps/cli` | 2.11.2 | **2.11.3** | 2.11.3 |
| `@playwright/test` | 1.60.0 | **1.61.0** | 1.61.0 |
| `react-hook-form` | 7.79.0 | **7.80.0** | 7.80.0 |
| `vitest` | 4.1.8 | **4.1.9** | 4.1.9 |
| `typescript-eslint` | 8.61.0 | **8.61.1** | 8.61.1 |

> `@types/node` is at 22 while the runtime is Node 26 (`node -v` → v26.0.0). The
> *Latest* is 26.0.0 but that is a major bump — **leave it for a separate
> decision** (it can surface new lib types and is not "safe-bucket"). Do not
> change it here.

Rust side — `cargo update --dry-run` at `8f2e90bd` shows the Tauri crate stack
moving within 2.x (all semver-compatible):

```
tauri            2.11.2 -> 2.11.3
tauri-build      2.6.2  -> 2.6.3
tauri-runtime(-wry) 2.11.2 -> 2.11.3
wry / tao / tray-icon  patch/minor (tray-icon 0.23.1 -> 0.24.1)
+ many transitive patches (serde, time, uuid, wasm-bindgen, zerocopy, …)
```

`src-tauri/Cargo.toml` pins Tauri with caret-equivalent `version = "2"` ranges,
so `cargo update` is the right mechanism — **do not** edit version strings in
`Cargo.toml`. Note the **vendored `tauri-plugin-sql` patch**
(`[patch.crates-io] tauri-plugin-sql = { path = "vendor/tauri-plugin-sql" }`):
`cargo update` will not touch the vendored copy. Leave it alone.

### Conventions to follow

- This repo distributes a Tauri desktop app + mobile; verification must include
  the Rust check (`npm run check:tauri` = `cargo fmt --check && cargo check`).
- `npm run build` = `tsc && vite build` — the typecheck gate is part of it.
- 591 tests is the current baseline (see `plans/README.md`); the count must not
  drop.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| JS in-range update | `npm update <pkgs…>` (explicit list, see Step 1) | exit 0 |
| Audit | `npm audit` | 0 vulnerabilities |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass (≥ 591) |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Rust update | `cd src-tauri && cargo update` | updates lockfile, exit 0 |
| Rust check | `npm run check:tauri` | exit 0 |

## Scope

**In scope:**
- `package.json` / `package-lock.json` — only the 8 packages in the table above.
- `src-tauri/Cargo.lock` — via `cargo update` (semver-compatible bumps only).

**Out of scope (do NOT touch):**
- `recharts`, `zod`, `eslint`, `eslint-*` plugins, `@eslint/js`, `globals`,
  `typescript`, `jsdom`, `@types/node` — majors / separate plans.
- `src-tauri/Cargo.toml` version strings — `cargo update` handles the lockfile.
- `vendor/tauri-plugin-sql/` — the vendored single-connection patch stays.
- Any source code. If a bump *requires* a code change to compile, that bump is
  not "safe" — STOP and report it (it belongs in its own plan).

## Git workflow

- Branch from current main: `git checkout -B advisor/049-safe-dep-upgrades main`.
- Two commits: one for JS (`package*.json`), one for Rust (`Cargo.lock`).
- Commit message style: match the repo (e.g. `chore: bump …`). Do NOT push/PR
  unless told.

## Steps

### Step 1: JS in-range bumps
Update only the listed packages (explicit names so npm can't drag in a major):

```
npm update @base-ui/react @tanstack/react-router @tauri-apps/api @tauri-apps/cli \
  @playwright/test react-hook-form vitest typescript-eslint
```

Then confirm no major leaked in: `npm outdated` should now show the 8 rows as
Current === Wanted (or gone), and `recharts`/`zod`/`eslint`/`typescript`/`jsdom`
must still show their **old** Current values.

**Verify**: `npm audit` → 0 vulnerabilities; `git diff package.json` shows only
the 8 packages changed.

### Step 2: JS verification gate
**Verify**: `npx tsc --noEmit` exit 0; `npm run lint` 0 errors; `npm test` all
pass (count ≥ 591); `npm run build` exit 0.

If any fails, see STOP conditions — do not "fix" by editing source; the point of
the safe bucket is that no source change is needed.

### Step 3: Rust in-range bumps
```
cd src-tauri && cargo update
```
This brings `tauri` to 2.11.3 and the transitive patches. It must not change
`Cargo.toml`. The vendored `tauri-plugin-sql` is unaffected.

**Verify**: `npm run check:tauri` → exit 0 (`cargo fmt --check` clean, `cargo
check` clean).

### Step 4: final sweep
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0; `npm run check:tauri` exit 0; `npm audit` 0 vulns.

## Test plan

No new tests — this is a dependency bump. The gate is the existing suite + build
+ Rust check all staying green at or above baseline (591 tests). A drop in test
count or a new tsc/clippy error means a bump was not actually backward-compatible.

## Done criteria

ALL must hold:

- [ ] `package.json` changed for only the 8 listed packages; no major bumped
- [ ] `npm audit` = 0 vulnerabilities
- [ ] `Cargo.lock` updated; `Cargo.toml` unchanged; vendored plugin-sql unchanged
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` 0 errors; `npm test` ≥ 591 pass;
      `npm run build` exits 0; `npm run check:tauri` exits 0
- [ ] No source files (`src/`, `src-tauri/src/`) modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any verification command fails after the bump **and** fixing it would require a
  source-code change — that means the bump is not actually backward-compatible
  for this repo; revert that single package and report it (it needs its own plan).
- `npm update` pulls a major version of any package (check `npm outdated` /
  `git diff package.json`) — pin it back to the in-range version.
- `cargo update` tries to change `Cargo.toml` or the vendored plugin, or
  `cargo check` fails — report; the Tauri stack may have a transitive
  incompatibility worth isolating.
- The test count drops below 591 — a dependency changed behavior; investigate
  before proceeding.

## Maintenance notes

- For the reviewer: confirm the diff is **lockfile + the 8 names only**, no
  source changes, and all gates green including `check:tauri`.
- The deferred majors (`recharts` → plan 050, `zod` → plan 051, plus
  `eslint`/`ts`/`jsdom`/`@types/node`) are tracked separately; don't fold them in
  here — that's what keeps this plan low-risk and revertible.
- `@types/node` 22 vs Node 26 runtime is worth aligning eventually (the lib types
  match the runtime), but it's a major bump that can surface new type errors —
  schedule it with a `tsc` budget, not in the safe bucket.
- Tauri is on the latest 2.x line; there is no Tauri 3 to migrate to.
