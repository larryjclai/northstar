# Plan 263: Upgrade to TypeScript 7 (the native compiler) — 8× faster typecheck

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. **The advisor already ran this migration end to end
> against this exact commit; the expected outputs below are measured, not
> estimated.** If your results differ materially from them, that is a signal to
> stop, not to push through. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 72fc7a7f..HEAD -- tsconfig.json package.json src/data/repositories.testHarness.ts`
> If any in-scope file changed since this plan was written, re-run the Step 1
> probe and compare against the measured results below before proceeding.

## Status

- **Priority**: P2
- **Effort**: M (mostly verification — the edit is six lines)
- **Risk**: MED (the risk is not the compiler; it is `typescript-eslint`
  compatibility, and it is **expected to bite** — see Step 4 before you start)
- **Depends on**: none. Runs cleanly before or after
  `plans/262-dependency-maintenance-sweep.md`; landing 262 first is tidier
  because it removes the in-range noise from `npm outdated`.
- **Category**: dependencies / dx
- **Planned at**: commit `79032d3b`; **re-verified at `72fc7a7f`, 2026-07-25** — `npm outdated` still reports `typescript` latest = **7.0.2**, and neither 259 nor 267 touched `tsconfig.json` or the `typescript` dependency, so the measured results below still hold

## Why this matters

TypeScript 7 is the native (Go) port of the compiler, shipped as the `latest`
tag of the ordinary `typescript` package with per-platform binaries as optional
dependencies. It is a drop-in replacement for `tsc` — and on **this repo, at this
commit**, the advisor measured:

| | Current (TS 5.9.3) | TS 7.0.2 |
|---|---|---|
| `tsc --noEmit` wall time | **5.26 s** | **0.66 s** |
| Errors after config migration | 0 | **0** |

That is an **8× speedup** on a command that runs in `npm run build`
(`"build": "tsc && vite build"`), in CI, and by hand many times a day. When the
user asked to "improve the program's speed", this is the largest measured win
available on the build side, and it costs six lines of config.

TypeScript 7 removes options deprecated during the 5.x line. This repo uses two
of them, so the config must be migrated. **Both replacements are also valid on
TypeScript 5.9.3** — the advisor verified this — so the config change can land
first, on its own, with zero risk, and the compiler bump becomes a one-line
second commit.

**The known blocker**: `typescript-eslint@8.65.0` declares
`typescript: ">=4.8.4 <6.1.0"`, which excludes TS 7. Lint may therefore fail even
though the compiler itself is clean. Step 4 handles this with an explicit
fallback that keeps the (independently valuable) config migration and reverts
only the compiler. Plan this work expecting that outcome; if
`typescript-eslint` has shipped TS 7 support by the time you run it, so much the
better.

## Current state

### `tsconfig.json` (verified at `79032d3b`, full file)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": []
}
```

### What TypeScript 7 says about it — measured, verbatim

Running TS 7.0.2 against the config above produces exactly two errors:

```
tsconfig.json(13,25): error TS5108: Option 'moduleResolution=node10' has been removed. Please remove it from your configuration.
tsconfig.json(18,5): error TS5102: Option 'baseUrl' has been removed. Please remove it from your configuration.
  Use '"paths": {"*": ["./*"]}' instead.
```

(`"moduleResolution": "Node"` is the legacy `node10` algorithm. This project is
bundled by Vite, so `"bundler"` is the correct successor — not `"node16"`.)

### What the source code says — measured

With `moduleResolution` and `baseUrl` fixed but nothing else changed, TS 7
reports exactly **three** errors, all one root cause:

```
src/data/repositories.sqlite-tx.test.ts(1,30): error TS2591: Cannot find name 'node:sqlite'. …
src/data/repositories.sync.test.ts(1,30): error TS2591: Cannot find name 'node:sqlite'. …
src/data/repositories.testHarness.ts(1,30): error TS2591: Cannot find name 'node:sqlite'. …
```

These three files import Node's built-in `node:sqlite` (the test harness that
backs the dual-repo suites). Adding `"types": ["node"]` resolves all three.

**The fully-migrated config produces 0 errors on TS 7.0.2 and 0 errors on TS
5.9.3.** Both were run by the advisor against this commit.

### Where `tsc` is used

- `package.json:12` — `"build": "tsc && vite build"`. This is the only place
  `tsc` emits nothing but gates the build.
- There is **no** separate `typecheck` script; the convention in this repo's
  plans is `npx tsc --noEmit`.
- Vite itself transpiles with esbuild and does **not** typecheck, so no Vite
  config changes are needed.

### The `@/*` alias has a second home

`vite.config.ts:14-16` resolves the same alias independently:

```ts
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
```

Removing `baseUrl` changes only how **TypeScript** resolves `@/*`; Vite is
unaffected. The `paths` entry `"@/*": ["./src/*"]` is relative to the tsconfig's
own directory once `baseUrl` is gone, which is the same directory it was relative
to before — so the mapping is unchanged in practice. Do not "fix" `vite.config.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Typecheck (timed) | `time npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 |
| Build | `npm run build` | exit 0 |
| E2E | `npm run test:e2e` | all pass |

## Scope

**In scope**:
- `tsconfig.json`
- `package.json`, `package-lock.json` (the `typescript` devDependency only)

**Out of scope** (do NOT touch, even though they look related):
- **Any file under `src/`.** The measured error count after the config migration
  is zero. If you find yourself editing source to satisfy TS 7, stop — something
  is different from what was measured.
- `vite.config.ts` — its `@` alias is independent and already correct.
- `vitest.config.ts` — Vitest does not typecheck.
- `eslint.config.js` — the lint stack is `plans/264-lint-stack-upgrade.md`. This
  plan only *verifies* lint still runs; it does not change lint config.
- The `worker/` package — separate lockfile and toolchain.
- `src-tauri/` — Rust.

## Git workflow

- Branch: `chore/ai-typescript-7`
- Two commits, deliberately separable so the config change can be kept even if
  the compiler bump has to be reverted:
  1. `chore(ts): migrate tsconfig off removed options (baseUrl, moduleResolution=node10)`
  2. `chore(deps): upgrade to TypeScript 7`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the baseline

```bash
time npx tsc --noEmit
```

Record the wall time and confirm exit 0. The advisor measured **5.26 s** at this
commit; anything in that neighbourhood is fine.

Also record `npm test 2>&1 | tail -5` (the passing count) for comparison later.

**Verify**: baseline time and passing test count written down.

### Step 2: Migrate `tsconfig.json` — still on TypeScript 5.9.3

Make exactly three changes:

1. `"moduleResolution": "Node"` → `"moduleResolution": "bundler"`
2. Delete the `"baseUrl": "."` line
3. Add `"types": ["node"]`

Result:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["node"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": []
}
```

Why each change:
- **`bundler`** — Vite resolves modules; `node10` is removed in TS 7 and was
  never the right algorithm for a bundled app.
- **`baseUrl` removed** — removed in TS 7. With it gone, `paths` resolves
  relative to the tsconfig's directory, which is where `./src/*` already pointed.
- **`types: ["node"]`** — three files import `node:sqlite`. Under the old
  resolution they picked up `@types/node` ambiently; `bundler` + TS 7 requires it
  to be declared. Note this **narrows** ambient types to just `node`, which is
  the intent — the browser lib comes from `"lib"`.

**Verify** (this is the key gate — it must pass on the *current* compiler):
- `npx tsc --noEmit` → exit 0, no errors
- `npm test` → all pass, same count as Step 1
- `npm run build` → exit 0
- `npm run lint` → exit 0

Commit this separately before continuing.

### Step 3: Upgrade the compiler

```bash
npm install --save-dev typescript@7.0.2
```

TypeScript 7 ships the native binary via optional per-platform packages
(`@typescript/typescript-darwin-arm64` and friends). Confirm one got installed:

```bash
ls node_modules/@typescript/ 2>/dev/null
```

**Verify**:
- `npx tsc --version` → `Version 7.0.2`
- `time npx tsc --noEmit` → exit 0, **no errors**, and dramatically faster than
  the Step 1 baseline. The advisor measured **0.66 s** (vs 5.26 s). Record your
  number.

### Step 4: Verify `typescript-eslint` still works — expect trouble here

`eslint.config.js` uses `typescript-eslint` (8.61.1 at this commit, 8.65.0 after
plan 262). It consumes the TypeScript compiler API, and TS 7's API surface is a
port — this is the one place the upgrade can genuinely break.

**This is not hypothetical.** The advisor checked the published metadata:

```
$ npm view typescript-eslint@8.65.0 peerDependencies
{
  eslint: '^8.57.0 || ^9.0.0 || ^10.0.0',
  typescript: '>=4.8.4 <6.1.0'
}
```

**TypeScript 7.0.2 is outside that range.** So expect at minimum an
`npm install` peer-dependency warning, and quite possibly a hard lint failure.
Treat a clean `npm run lint` as the pleasant surprise, not the baseline.

Before running lint, re-check whether a newer `typescript-eslint` has widened the
range — that would make this whole step moot:

```bash
npm view typescript-eslint version
npm view typescript-eslint peerDependencies
```

If a newer version accepts TypeScript 7, install it first and note the version in
your report. Otherwise proceed and expect the fallback.

```bash
npm run lint
```

**If lint fails with a TypeScript-API error** (not a genuine lint finding), do
**not** start rewriting lint config. Take the documented fallback:

- Keep the Step 2 config migration (it is independently valuable and already
  committed).
- Revert only the compiler: `npm install --save-dev typescript@5.9.3`.
- Report exactly which `typescript-eslint` version was in play and the error, and
  mark this plan **BLOCKED** in `plans/README.md` pending a
  `typescript-eslint` release that supports TS 7.

**Verify**: `npm run lint` → exit 0, or the fallback executed and reported.

### Step 5: Full verification pass

**Verify**, in order, each exiting 0:
1. `npx tsc --noEmit` — and note the time
2. `npm run lint`
3. `npm run format:check`
4. `npm test` — same passing count as Step 1
5. `npm run build`
6. `npm run test:e2e`

Then `npm run tauri dev` and confirm the app launches and one route renders. The
compiler does not affect runtime output (Vite/esbuild does the transpiling), so
this is a smoke test, not a deep pass.

**Verify**: all six commands exit 0; app launches.

## Test plan

No new tests. A compiler upgrade that needs a new test is not a compiler upgrade.

The safety net is:
- **`npx tsc --noEmit` exiting 0** — this *is* the test for a typechecker, and it
  covers all 360 TypeScript files in `src/`.
- **`npm test` reporting an unchanged passing count.** A changed count means the
  emitted/interpreted semantics moved, which should be impossible here — Vitest
  transpiles via esbuild, not `tsc`.
- **`npm run build` exiting 0** — proves the `tsc && vite build` gate holds.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --version` reports `Version 7.0.2`
- [ ] `npx tsc --noEmit` exits 0 with zero errors
- [ ] `npm run lint` exits 0 (or the Step 4 fallback was taken and reported)
- [ ] `npm run format:check` exits 0
- [ ] `npm test` exits 0 with the same passing count as the Step 1 baseline
- [ ] `npm run build` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `grep -c "baseUrl" tsconfig.json` returns 0
- [ ] `grep -c '"moduleResolution": "bundler"' tsconfig.json` returns 1
- [ ] `grep -c '"types": \["node"\]' tsconfig.json` returns 1
- [ ] `git diff --name-only` lists only `tsconfig.json`, `package.json`,
      `package-lock.json`
- [ ] Before/after `tsc --noEmit` timings recorded in the report
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 2 (`tsconfig` migration on TS 5.9.3) produces **any** error. It was
  measured clean at this commit; an error means the codebase drifted and the
  measured error list below is stale.
- TS 7 reports more than the three measured `node:sqlite` errors before
  `types: ["node"]`, or any error at all after it. **Do not fix source code to
  satisfy the compiler** — report the errors instead. Zero was measured; anything
  else needs a human decision.
- `npm run lint` fails with a TypeScript-API error (Step 4 — take the documented
  fallback, do not improvise around it).
- `npm test`'s passing count changes.
- The `@/*` alias stops resolving anywhere (a module-not-found in `tsc`, Vite, or
  Vitest). That would mean removing `baseUrl` shifted the `paths` base, which was
  measured not to happen.
- No `@typescript/typescript-<platform>` package is installed after Step 3 — the
  native binary is missing and `tsc` may be silently falling back.

## Maintenance notes

- **`types: ["node"]` is now explicit and exclusive.** Any future dependency that
  relies on ambient global types (a testing framework's globals, a `vite/client`
  reference) must be added to that array or it will not be seen. This is the most
  likely source of a confusing future error; it is also why the array is the
  right call — ambient type leakage was hiding the `node:sqlite` dependency.
- `moduleResolution: "bundler"` is stricter about extension-less deep imports
  into packages that lack `exports` maps. If a future dependency fails to
  resolve under `tsc` but works in Vite, this is the cause.
- Keep `vite.config.ts`'s `@` alias and `tsconfig.json`'s `paths` in sync
  manually — they are two independent resolvers pointing at the same directory,
  and nothing enforces agreement.
- `typescript-eslint` is the coupling to watch on every future TypeScript bump.
  Plan 264 moves the lint stack to ESLint 10; if that lands after this plan,
  re-run `npm run lint` as part of it.
- Deferred out of this plan: adding a dedicated `"typecheck": "tsc --noEmit"`
  script to `package.json`. Worth doing (every plan in `plans/` spells out
  `npx tsc --noEmit` by hand), but it is a convention change that should not ride
  along with a compiler migration.
