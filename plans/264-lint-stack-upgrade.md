# Plan 264: Upgrade the lint stack to ESLint 10 and react-hooks 7

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4473222a..HEAD -- eslint.config.js package.json`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (five coordinated majors; the failure mode is noisy, not silent)
- **Depends on**: `plans/262-dependency-maintenance-sweep.md` — DONE, merged in `9a5d5ecf`
- **Blocks**: `plans/266-react-compiler.md` — the React Compiler lint rules ship in
  `eslint-plugin-react-hooks` v6+, so that plan needs this one first
- **Category**: dependencies / dx
- **Planned at**: commit `79032d3b`; **reconciled and re-verified at `4473222a`, 2026-07-25** (post 262/268/269/263 merges — 262 moved eslint 9.39.4 → 9.39.5 in range; the table below reflects the current state)

## Why this matters

Five lint-stack packages are a full major behind, and they move together — ESLint
10 needs plugin versions that declare support for it, so bumping one at a time
just produces peer conflicts. Doing them as one coordinated change is less work
than five sequential ones.

The concrete payoff beyond staying current: **`eslint-plugin-react-hooks` v7
ships the React Compiler lint rules.** Those rules report the places where a
component violates the Rules of React badly enough that the compiler cannot
safely memoize it. That is the prerequisite diagnostic for
`plans/266-react-compiler.md`, which is where the runtime rendering win actually
comes from. Without this plan, plan 266 would be flying blind.

## Current state

### The versions (from `npm outdated` at `79032d3b`)

| Package | Current | Target |
|---|---|---|
| `eslint` | 9.39.5 | 10.8.0 |
| `@eslint/js` | 9.39.5 | 10.0.1 |
| `eslint-plugin-react-hooks` | 5.2.0 | 7.1.1 |
| `eslint-config-prettier` | 9.1.2 | 10.1.8 |
| `eslint-plugin-react-refresh` | 0.4.26 | 0.5.3 |
| `globals` | 15.15.0 | 17.7.0 |

`typescript-eslint` is **not** on this list — 262 already took it to **8.65.0**
(the latest published; re-verified at `4473222a`). Leave it alone here.

**One extra thing to check while you are in this stack** (see Step 5b): plan 263
is BLOCKED because `typescript-eslint@8.65.0` declares
`typescript: ">=4.8.4 <6.1.0"`, which excludes TypeScript 7 and makes
`npm run lint` fail hard with `typescript-eslint does not support TS 7.0.`
If this upgrade happens to pull a `typescript-eslint` that widens that range, it
unblocks a measured ~5.7–8× typecheck speedup.

Its ESLint peer range is already fine for this plan (verified:
`npm view typescript-eslint@8.65.0 peerDependencies` →
`eslint: '^8.57.0 || ^9.0.0 || ^10.0.0'`).

Compatibility already verified by the advisor:
- `eslint-plugin-react-hooks@7.1.1` peer → `eslint: '… || ^9.0.0 || ^10.0.0'` ✓

### `eslint.config.js` (verified at `79032d3b`, full file)

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
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "warn",
      "react-refresh/only-export-components": "warn",
      "prefer-const": "warn",
      "no-irregular-whitespace": "warn",
    },
  },
  {
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: 'CallExpression[callee.property.name="toLocaleString"]',
          message:
            "金額顯示必須走 src/domain/currency.ts 的 helpers（formatMoney / formatNumber / formatCompactMoney…），它們內建隱私遮罩。日期或輸入框編輯狀態屬例外——加 eslint-disable-next-line 並附一行理由。",
        },
      ],
    },
  },
  prettier,
);
```

Two things here are load-bearing and must survive the upgrade:

1. **The `no-restricted-syntax` rule banning `toLocaleString` in `src/routes/`.**
   This is a *correctness* guard, not style: it forces money through
   `src/domain/currency.ts` helpers that apply the privacy mask. If this rule
   stops firing, the privacy mask can be silently bypassed. Step 5 tests it
   explicitly.
2. **`reactHooks.configs.recommended.rules` spread into a flat config.** The
   plugin's config export shape changed across v5 → v7; this line is the most
   likely thing to break. See Step 3.

### The scripts (`package.json:20-21`)

```json
    "lint": "eslint src",
    "lint:fix": "eslint src --fix",
```

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm install` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Lint (verbose) | `npx eslint src --max-warnings=-1` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Format check | `npm run format:check` | **exit 1 expected** — 279 pre-existing failures on `4473222a`, unrelated to lint; tracked by plan 270. Compare the count, not the exit code |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `package.json`, `package-lock.json`
- `eslint.config.js`

**Out of scope** (do NOT touch, even though they look related):
- **Any file under `src/`.** If ESLint 10 surfaces new findings, your job is to
  *report the counts*, not to fix them. Fixing lint findings is a separate change
  with its own review — mixing it into a config upgrade makes both unreviewable.
  The one exception is an automatic `npm run lint:fix` pass, and only if Step 6
  says so.
- `typescript-eslint` — bumped in plan 262.
- `prettier` / `.prettierrc` — formatting is unchanged here.
- The React Compiler rules themselves — enabling them is
  `plans/266-react-compiler.md`. This plan installs the plugin version that
  *contains* them; it does not turn them on.
- `worker/` and `src-tauri/` — both already in the `ignores` list.

## Git workflow

- Branch: `chore/ai-lint-stack-10`
- Commits:
  1. `chore(deps): upgrade eslint stack to 10.x`
  2. `chore(lint): adapt flat config to eslint 10` (only if Step 3 needs changes)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Record the baseline

```bash
npm run lint 2>&1 | tail -20
```

Record: exit code, and the exact error/warning counts. If ESLint reports a
summary line, copy it verbatim. This is what you compare against — the upgrade
must not change *findings*, only the engine.

Also record `npx eslint src --format json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log('errors',r.reduce((n,f)=>n+f.errorCount,0),'warnings',r.reduce((n,f)=>n+f.warningCount,0))})"`
— a machine-readable count you can diff against later.

**Verify**: baseline counts written down.

### Step 2: Install the six packages together

```bash
npm install --save-dev eslint@10.8.0 @eslint/js@10.0.1 eslint-plugin-react-hooks@7.1.1 eslint-config-prettier@10.1.8 eslint-plugin-react-refresh@0.5.3 globals@17.7.0
```

One command, so npm resolves the peer graph as a set rather than fighting it
package by package.

**Verify**: `npm ls eslint eslint-plugin-react-hooks` → no `UNMET PEER
DEPENDENCY` and no `invalid` markers. Report any peer warnings verbatim even if
install succeeds.

### Step 3: Adapt `eslint.config.js` if the config exports moved

Run lint and see what breaks:

```bash
npm run lint
```

The likely failure is `reactHooks.configs.recommended.rules` being `undefined` in
v7 (the plugin reorganised its flat-config exports across v5 → v7). If so, the
fix is to consume the plugin's own flat config rather than spreading its rules.
Check what the installed version actually exports before writing anything:

```bash
node -e "import('eslint-plugin-react-hooks').then(m => console.log(Object.keys(m.default ?? m), Object.keys((m.default ?? m).configs ?? {})))"
```

Then adapt minimally — for example, if v7 exposes a flat config entry, add it to
the top-level array and drop the manual `plugins` + rules spread for react-hooks.
**Change as little as possible**; every other line of this config stays.

Do **not** silently drop a rule because it errors. If a rule cannot be carried
forward, that is a STOP condition.

**Verify**: `npm run lint` runs to completion (exit 0 or genuine findings — not a
crash or a config error).

### Step 4: Compare findings against the baseline

Re-run the machine-readable count from Step 1 and diff.

- **Same counts** → ideal. Proceed.
- **Fewer findings** → a rule stopped firing. Investigate *which* — a silently
  disabled rule is worse than a noisy one. Report before proceeding.
- **More findings** → new rules in the majors. Record the new rule ids and
  counts. Do **not** fix them in this plan (see Scope); report them so a
  follow-up can be scoped.

**Verify**: a before/after table of error and warning counts, plus the list of
any new rule ids, in your report.

### Step 5: Prove the privacy-mask guard still fires

The `no-restricted-syntax` rule banning `toLocaleString` in `src/routes/` is a
correctness guard. Prove it survived by making it fail on purpose:

1. In any file under `src/routes/`, temporarily add a line calling
   `.toLocaleString()` on something.
2. Run `npm run lint`.
3. Confirm it reports the 金額顯示 error for that line.
4. **Revert the temporary line.**

**Verify**: the rule fired in step 3, and `git status` is clean of the temporary
edit afterwards.

### Step 6: Full verification pass

**Verify**, in order:
1. `npm run lint` → exit 0 (or the documented, reported findings from Step 4)
2. `npx tsc --noEmit` → exit 0
3. `npm run format:check` → exit 0
4. `npm test` → all pass, same count as before
5. `npm run build` → exit 0
6. `git status --porcelain` → only the in-scope files

If Step 4 surfaced new *auto-fixable* findings and the operator wants them
handled, that is a **separate branch and a separate commit** — not this one.

### Step 5b: Re-check whether TypeScript 7 is unblocked

Plan 263 landed the `tsconfig.json` migration but had to revert the compiler,
because `typescript-eslint@8.65.0` hard-fails on TypeScript 7. That is the only
thing standing between this repo and a **measured** `tsc --noEmit` speedup of
10.877 s → 1.92 s (~5.7×; the advisor separately measured 5.26 s → 0.66 s).

After this upgrade, check whether the constraint moved:

```bash
npm ls typescript-eslint
npm view typescript-eslint peerDependencies
```

**If the installed `typescript-eslint`'s `typescript` peer range now includes 7.x**,
report that prominently — plan 263 becomes a one-line change
(`npm install --save-dev typescript@7.0.2`) and should be re-run. **Do not make
that change here**; it is out of this plan's scope. Just report the range you
observed.

If the range is still `>=4.8.4 <6.1.0`, say so explicitly so the reviewer knows
263 stays blocked.

## Test plan

No new automated tests; ESLint config is not unit-tested in this repo.

The verification is:
- **Step 5's deliberate-failure check** — the one manual test that matters,
  because it covers the rule with real correctness consequences.
- **The Step 1 vs Step 4 finding-count diff** — the regression test for
  "the engine changed but the rules did not".
- `npm test` unchanged, proving nothing in `src/` moved.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm ls eslint` reports 10.x with no peer errors
- [ ] `npm run lint` exits 0, or exits non-zero only on findings enumerated in
      the Step 4 report
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run format:check` exits 0
- [ ] `npm test` exits 0 with an unchanged passing count
- [ ] `npm run build` exits 0
- [ ] `grep -c "no-restricted-syntax" eslint.config.js` returns 1, and Step 5's
      deliberate-failure check is recorded as passing
- [ ] `grep -c "金額顯示必須走" eslint.config.js` returns 1 (the guard's message
      is intact)
- [ ] `git diff --name-only` lists only `package.json`, `package-lock.json`,
      `eslint.config.js`
- [ ] Before/after finding counts recorded in the report
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A rule from the current config cannot be carried forward to ESLint 10. Report
  which rule and why; do not drop it.
- Step 5's deliberate-failure check does **not** report the 金額顯示 error. That
  guard protects the privacy mask; a config upgrade that disables it must not
  land.
- Finding counts **drop** and you cannot account for which rule stopped firing.
- `npm install` reports an unmet peer dependency that you would need to force
  (`--force` / `--legacy-peer-deps`) to resolve. This repo uses
  `--legacy-peer-deps` only for `worker/`; using it in the app is a decision, not
  a workaround.
- You are tempted to fix `src/` findings to get lint green. Out of scope —
  report the counts instead.
- `typescript-eslint` turns out to need a bump too. Report it; that is plan 262's
  territory and doing it here tangles two diffs.

## Maintenance notes

- **This plan unblocks `plans/266-react-compiler.md`.** Once `eslint-plugin-react-hooks`
  v7 is installed, its React Compiler rules exist but are not enabled — plan 266
  turns them on and acts on what they report. Do not enable them here.
- The `no-restricted-syntax` / `toLocaleString` rule is the highest-value lint
  rule in this repo. Any future lint change should re-run Step 5's
  deliberate-failure check; it takes a minute and catches a silent correctness
  regression.
- ESLint flat-config plugin exports are still churning across majors. Expect the
  `reactHooks.configs.*` shape to move again; the `node -e "import(...)"` probe in
  Step 3 is the fastest way to find out what a given version actually exports.
- Deferred out of this plan: fixing whatever new findings ESLint 10's majors
  surface. Scope that from the Step 4 report — it may be a one-line
  `lint:fix` run or a real backlog, and that is worth knowing before committing
  to it.
