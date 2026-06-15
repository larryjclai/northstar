# Plan 008: Remediate the esbuild high-severity advisory (override first, vite@8 fallback)

> **Executor instructions**: Follow this plan step by step. It has TWO
> approaches: try **Approach A (override)** first; only if its verification
> fails do you move to **Approach B (vite@8 major bump)**. Run every
> verification command and confirm the expected result. If anything in "STOP
> conditions" occurs, stop and report. When done, update the status row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9115a2b5..HEAD -- package.json package-lock.json vite.config.ts vitest.config.ts`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (build-toolchain change; Approach B is a dual major bump)
- **Depends on**: none
- **Category**: migration / security
- **Planned at**: commit `9115a2b5`, 2026-06-15

## Why this matters

`npm audit` reports **2 high-severity** advisories, both the same root cause: esbuild
`0.25.12` (pulled in transitively by vite `6.4.3`) is in the affected range `0.17.0–0.28.0`
for GHSA-gv7w-rqvm-qjhr. **Honest scoping:** this advisory is a *build/dev-tooling*
supply-chain issue (it concerns esbuild's Deno module and `NPM_CONFIG_REGISTRY`); it does
**not** affect the shipped Tauri binary at runtime. So the value here is a clean
`npm audit` and a hardened CI/build path, not a user-facing fix — which is why we try the
**low-blast-radius override first** and only escalate to a major bump if necessary. The
operator has chosen to do this; this plan keeps the risk proportionate.

## Current state

- Installed (verified at `9115a2b5`): `vite@6.4.3`, `vitest@3.2.6`, `esbuild@0.25.12`
  (only path: `vite → esbuild`). Also `@tailwindcss/vite@4.3.0` and
  `@vitejs/plugin-react@4.7.0`, both peer-depending on the same vite.
- `npm audit` says `fixAvailable: { name: "vite", version: "8.0.16", isSemVerMajor: true }`
  — i.e. npm's blessed fix is a vite **major** bump (and, because `vitest`/`@vitest/mocker`
  depend on vite, a likely `vitest` major bump too).
- `vite.config.ts` is non-trivial: a **custom dev middleware plugin** (`marketDataProxy`,
  uses `server.middlewares.use(...)`), a `manualChunks(id)` function, `dedupe`, `envPrefix`,
  and `@tailwindcss/vite` + `@vitejs/plugin-react` plugins. These are the surfaces a major
  vite bump can break. (`vitest.config.ts` is small: jsdom env, globals, setup file.)
- `package.json` has no `overrides` field yet.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Audit | `npm audit` | (goal) 0 high/critical |
| Installed esbuild | `npm ls esbuild` | the resolved version(s) |
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Build | `npm run build` | exit 0 |
| Tests | `npx vitest run` | all pass (≥409) |
| Dev smoke | `npm run dev` | server starts, market-data proxy works |
| Tauri check | `npm run check:tauri` | exit 0 |

## Scope

**In scope** (modify):
- `package.json` (Approach A: add `overrides`; Approach B: bump `vite`/`vitest`/related devDeps)
- `package-lock.json` (regenerated)
- `vite.config.ts` / `vitest.config.ts` (only if Approach B requires API adjustments)

**Out of scope** (do NOT touch):
- Any `src/**` application code. If a major bump (Approach B) requires source changes beyond
  the two config files, that is a STOP condition — report it; do not refactor the app to chase
  a dev-tooling advisory.
- The Tauri Rust side.

## Git workflow

- Branch: `advisor/008-esbuild-advisory`.
- Commit (A): `chore(deps): pin esbuild via overrides to clear GHSA advisory`.
- Commit (B): `chore(deps): upgrade vite/vitest to clear esbuild advisory`.
- Do NOT push or open a PR unless the operator instructs it.

## Approach A — esbuild override (try this first)

### A1: Find the lowest non-vulnerable esbuild

The advisory range is `0.17.0–0.28.0`, so the fix is the first release `> 0.28.0`. Check the
latest: `npm view esbuild version` and `npm view esbuild versions --json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const v=JSON.parse(d).filter(x=>/^0\.(29|[3-9]\d)\./.test(x)||/^[1-9]/.test(x));console.log(v.slice(-5))})"`
Pick the latest stable (e.g. `0.29.x` or newer). Record the chosen version.

### A2: Add an override

In `package.json`, add (using the version from A1):

```json
"overrides": {
  "esbuild": "^0.29.0"
}
```

Run `npm install`.

**Verify**: `npm ls esbuild` shows the new version everywhere; `npm audit` → 0 high/critical.

### A3: Prove the toolchain still works with the overridden esbuild

vite `6.4.3` was built against esbuild `0.25`; forcing `0.29` is unsupported, so it must be
verified:

- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0 (this runs the real esbuild-backed vite build)
- `npx vitest run` → all pass (≥409)
- `npm run dev`, then in another shell `curl -s "http://127.0.0.1:5173/api/yahoo/v1/finance/search?q=2330" | head -c 200` → returns JSON (proves the custom dev middleware + esbuild transform pipeline still function). Stop the dev server after.

**If all four pass → Approach A is done. Skip Approach B.** Go to "Done criteria".

**If any fail** (esbuild 0.29 incompatible with vite 6 — e.g. build/transform error): revert
the `overrides` change (`git checkout package.json package-lock.json && npm install`), record
the exact error, and proceed to Approach B.

## Approach B — vite@8 + vitest major bump (fallback only)

### B1: Bump the toolchain together

Vite and vitest versions are coupled (vitest pins a vite range), so bump them as a set:

```
npm install -D vite@^8 vitest@^3-or-4-matching @vitejs/plugin-react@latest @tailwindcss/vite@latest
```

Resolve the exact compatible `vitest` major for vite 8 from its peer-deps (npm will error if
mismatched — read the peer-dep message and install the version it names). Run `npm install`.

**Verify**: `npm ls esbuild` shows a version `> 0.28.0`; `npm audit` → 0 high/critical.

### B2: Fix config breakages (only `vite.config.ts` / `vitest.config.ts`)

Run `npm run build` and `npx vitest run` and address any vite-8 API changes. Likely
touchpoints, in priority order:
- the custom `marketDataProxy` plugin's `configureServer` / `server.middlewares` signature,
- the `manualChunks(id)` function form under Rollup's bundled version,
- `defineConfig` / `Plugin` type imports,
- the vitest config shape (`test` field) under the new vitest major.

Make the **minimal** change to each; do not restructure the config.

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm run build` → exit 0
- `npx vitest run` → all pass (≥409)
- `npm run dev` + the `curl …/api/yahoo/...` smoke from A3 → returns JSON
- `npm run check:tauri` → exit 0

### B3: If source files need changes

If clearing the build/tests requires editing anything under `src/**`, STOP and report the
file and error — a dev-tooling advisory does not justify an unscoped app refactor without
operator sign-off.

## Test plan

No new tests — the existing suite is the regression gate. The critical extra verification is
the **dev-server market-data proxy smoke** (A3 / B2 curl) because that custom plugin is the
most likely thing a vite change breaks and no unit test covers it. Record in the PR which
approach succeeded and the final `npm audit` summary.

## Done criteria

ALL must hold:

- [ ] `npm audit` reports 0 high and 0 critical advisories
- [ ] `npm ls esbuild` shows only versions `> 0.28.0`
- [ ] `npx tsc --noEmit` exits 0; `npm run build` exits 0; `npx vitest run` all pass (≥409)
- [ ] Dev-server market-data proxy smoke returns JSON
- [ ] `npm run check:tauri` exits 0 (only required if Approach B touched config; harmless to run anyway)
- [ ] No `src/**` files modified (`git status`)
- [ ] `plans/README.md` status row updated (note which approach was used)

## STOP conditions

Stop and report (do not improvise) if:

- Approach A's override makes the build/tests/dev-smoke fail AND Approach B's major bump also
  requires touching `src/**` — escalate rather than refactoring the app.
- `npm install` hits an unresolvable peer-dependency conflict (React 19 / TS 5.8 / tailwind
  v4 vs the new vite) — report the conflict; do not use `--force`/`--legacy-peer-deps` without
  operator sign-off.
- After remediation `npm audit` still shows the esbuild advisory (the override didn't take, or
  another path pulls a vulnerable esbuild) — report `npm ls esbuild`.

## Maintenance notes

- If Approach A (override) wins, leave a comment in `package.json` near the `overrides` block
  explaining why (forces a patched esbuild under vite 6); revisit/remove it when the project
  later upgrades to a vite version that depends on a patched esbuild natively.
- If Approach B (vite 8) wins, watch the `marketDataProxy` plugin and `manualChunks` on future
  vite minors — they are the project's only custom bundler surface.
- This advisory is dev-tooling only; a reviewer should weigh the change's blast radius against
  that limited benefit and prefer Approach A if it verified clean.
