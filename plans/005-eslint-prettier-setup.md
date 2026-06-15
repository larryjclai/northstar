# Plan 005: Add ESLint (flat config) + Prettier with non-blocking lint/format scripts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9115a2b5..HEAD -- package.json`
> If `package.json` changed since this plan was written (e.g. a `lint` script
> now exists), reconcile before proceeding.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `9115a2b5`, 2026-06-15

## Why this matters

The repo has no linter or formatter — `package.json` scripts are only `build`, `test`,
`test:e2e`, and `check:tauri`. TypeScript strict mode catches type errors but nothing
catches unused vars, missing React hook dependencies (a real correctness hazard in the
large stateful routes), inconsistent imports, or style drift across 214 source files.
Adding ESLint + Prettier gives contributors and agents a fast, consistent feedback loop
and a place to encode the conventions the codebase already follows informally. This plan
deliberately introduces linting **non-blocking** (rules as warnings, no repo-wide
reformat) so it lands without a thousand-line diff or a red CI on day one; tightening to
errors is a deliberate follow-up.

## Current state

- `package.json` (commit `9115a2b5`) — React 19 + TypeScript 5.8 + Vite 6 project,
  `"type": "module"`. Scripts:

  ```json
  "scripts": {
    "dev": "vite",
    "prebuild": "node scripts/inject-private-assets.mjs",
    "build": "tsc && vite build",
    "preview": "vite preview --host 127.0.0.1",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "test:watch": "vitest",
    "check:tauri": "cd src-tauri && cargo fmt --check && cargo check",
    "tauri": "tauri",
    "version": "node scripts/version-bump.mjs",
    "copy:export": "node scripts/copy-catalog.mjs export",
    "copy:import": "node scripts/copy-catalog.mjs import"
  }
  ```
- No `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, or `biome.json` exists at the repo
  root (verified). `tsconfig.json` is present.
- Source layout: `src/**/*.{ts,tsx}` is the app; `worker/` has its own `tsconfig.json` and
  `node_modules` (a separate package — do NOT lint it from the root config); `scripts/*.mjs`
  are Node build scripts; `src-tauri/` is Rust.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Install deps | `npm install` | exit 0 |
| Lint | `npm run lint` | exit 0 (warnings allowed, 0 errors) |
| Format check | `npm run format:check` | exit 0 once Step 4 runs, or lists files before |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npx vitest run` | all pass (≥409) |

## Scope

**In scope** (create / modify):
- `eslint.config.js` (create — flat config)
- `.prettierrc.json` (create)
- `.prettierignore` (create)
- `package.json` (add devDependencies + `lint`, `lint:fix`, `format`, `format:check` scripts)
- `package-lock.json` (updated by `npm install`)

**Out of scope** (do NOT modify):
- Any `src/**` source file. Do NOT run `eslint --fix` or `prettier --write` across the repo
  in this plan — that mass reformat is a separate, reviewable change. (Auto-fixing is fine
  only if a specific file blocks `tsc`, which it should not here.)
- `worker/` — it is a separate package; the root ESLint config must ignore it.
- `src-tauri/` (Rust), `dist/`, `node_modules/`, `scratch/`.

## Git workflow

- Branch: `advisor/005-eslint-prettier`.
- Commit: `dx: add eslint flat config + prettier with non-blocking scripts`.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Add dev dependencies

Install the ESLint 9 flat-config toolchain for a Vite + React 19 + TS project:

```
npm install -D eslint@^9 @eslint/js@^9 typescript-eslint@^8 \
  eslint-plugin-react-hooks@^5 eslint-plugin-react-refresh@^0.4 \
  prettier@^3 eslint-config-prettier@^9 globals@^15
```

**Verify**: `npm install` completes, exit 0; `npx eslint --version` prints a 9.x version.

### Step 2: Create `eslint.config.js` (flat config)

Create `eslint.config.js` at the repo root:

```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "worker", "src-tauri", "scratch", "**/*.cjs"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Introduce non-blocking: surface signal without failing on the existing
      // backlog. Tighten to "error" in a deliberate follow-up.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react-refresh/only-export-components": "warn",
    },
  },
  prettier,
);
```

**Verify**: `npx eslint src --max-warnings -1` runs to completion and reports **0 errors**
(warnings are fine; `--max-warnings -1` disables the warning ceiling). If it reports
*errors*, see Step 2a.

### Step 2a: If `npx eslint src` reports errors (not warnings)

Do NOT fix source files. Instead, demote the offending rule(s) to `"warn"` or `"off"` in
`eslint.config.js` so the baseline is clean (0 errors, warnings allowed). The goal of this
plan is a working, non-blocking lint setup — not a clean-code sweep. If a rule cannot be
demoted without losing all value, STOP and report which rule and how many errors.

### Step 3: Add `.prettierrc.json` and `.prettierignore`

`.prettierrc.json` — match the style visible in the existing code (2-space indent, double
quotes, semicolons, trailing commas are already present throughout `src/`):

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

`.prettierignore`:

```
dist
node_modules
worker
src-tauri
scratch
package-lock.json
src/locales
```

(`src/locales` is generated/round-tripped translation JSON — see the copy-catalog workflow;
don't let Prettier fight it.)

**Verify**: `npx prettier --check "src/**/*.{ts,tsx}"` runs (it may list files needing
formatting — that is expected and OK; this plan does not reformat them).

### Step 4: Add scripts to `package.json`

Add to the `"scripts"` block:

```json
"lint": "eslint src --max-warnings -1",
"lint:fix": "eslint src --fix",
"format": "prettier --write \"src/**/*.{ts,tsx}\"",
"format:check": "prettier --check \"src/**/*.{ts,tsx}\""
```

(`--max-warnings -1` keeps `npm run lint` green while warnings exist; tighten later.)

**Verify**: `npm run lint` → exit 0. `npm run format:check` → exit 0 or a clean list of
unformatted files (non-zero exit from `format:check` is acceptable for this plan since we
are not reformatting; note it in the PR).

### Step 5: Confirm nothing else broke

**Verify**: `npx tsc --noEmit` → exit 0; `npx vitest run` → all pass (≥409). The lint setup
must not change runtime behavior.

## Test plan

No unit tests (tooling change). Verification is: `npm run lint` exits 0 (Step 4),
`npx tsc --noEmit` clean, full vitest suite green (Step 5). Record in the PR how many lint
warnings the baseline has (`npx eslint src 2>&1 | tail -3`) so a follow-up can track burn-down.

## Done criteria

ALL must hold:

- [ ] `eslint.config.js`, `.prettierrc.json`, `.prettierignore` exist at repo root
- [ ] `package.json` has `lint`, `lint:fix`, `format`, `format:check` scripts and the new devDependencies
- [ ] `npm run lint` exits 0 (0 errors; warnings permitted)
- [ ] `npx tsc --noEmit` exits 0 and `npx vitest run` all pass (≥409)
- [ ] No `src/**` source file was reformatted or edited (`git status` shows only config, `package.json`, `package-lock.json`, `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- ESLint reports errors that cannot be demoted to warnings without removing a whole ruleset
  (report the rule + count).
- `npm install` fails to resolve the toolchain versions (peer-dep conflict with React 19 /
  TS 5.8) — report the conflict; do not force-install with `--legacy-peer-deps` without
  operator sign-off.
- Adding the config changes `tsc` or vitest results.

## Maintenance notes

- This is intentionally **non-blocking**. The natural follow-ups (separate plans/PRs):
  (1) wire `npm run lint` into CI; (2) one-time `npm run format` + `npm run lint:fix` sweep
  as an isolated reviewable commit; (3) promote `no-explicit-any` / `no-unused-vars` to
  `error` once the backlog is burned down.
- The root config ignores `worker/` on purpose (separate package with its own tsconfig); if
  worker linting is wanted, give it its own `eslint.config.js`.
- Reviewer should confirm no source files were reformatted in this PR (keeps the diff to
  tooling only) and that `worker/`, `src-tauri/`, `scratch/`, and `src/locales` are ignored.
