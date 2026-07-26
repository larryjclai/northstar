# Plan 270: Decide Prettier's fate — adopt it properly or remove it

> **Executor instructions**: **Step 0 is an operator decision and this plan
> cannot start without it.** Do not pick a branch yourself. Once the operator has
> chosen, follow only that branch. Run every verification command and confirm the
> expected result before moving on. If anything in "STOP conditions" occurs, stop
> and report. When done, update the status row for this plan in `plans/README.md`.
>
> **⏳ TIMING GATE — read before scheduling this work.** Branch A rewrites 277
> files. Do **not** start it while any other branch in the 259–268 batch is
> unmerged: a repo-wide reformat conflicts with every one of them. Check
> `git branch --list 'perf/ai-*' 'chore/ai-*' 'fix/ai-*'` and confirm the batch
> has landed first.
>
> **Drift check (run first)**:
> `git diff --stat 977f6a13..HEAD -- package.json .prettierrc.json .prettierignore .github/workflows/ci.yml`

## Status

- **Priority**: P3
- **Effort**: S (Branch B) / M (Branch A — the edit is one command, the cost is the diff and the coordination)
- **Risk**: LOW functionally, **HIGH in review noise** for Branch A
- **Depends on**: the 259–268 batch being merged (see timing gate)
- **Operator decision**: **Branch A (adopt)** — chosen 2026-07-25
- **Category**: dx
- **Planned at**: commit `72fc7a7f`; **rebased to `977f6a13` (batch complete), 2026-07-26**

## Why this matters

`npm run format:check` **fails on `main` right now**, and has for a long time:

```
$ npm run format:check
[warn] Code style issues found in 279 files. Run Prettier with --write to fix.
exit 1
```

That is **279 of 360** TypeScript/TSX files under `src/` — 77% of the codebase.

Nothing enforces it, and nothing ever has:

- **No git hooks.** No `husky`, no `lint-staged`, no `simple-git-hooks` in
  `package.json`; no `.husky/` directory.
- **CI does not run it.** `.github/workflows/ci.yml` runs `npm run lint`,
  `npm test`, `npm run build`, `npm run check:tauri`, `npm run test:e2e` — and
  not `npm run format:check`.

So `format` and `format:check` are decorative scripts. That has two real costs:

1. **It poisons every verification checklist.** During plan 262 the advisor
   listed `npm run format:check` as a done criterion expecting exit 0 — a
   criterion that could never pass. The executor correctly flagged it, but only
   after building a separate worktree at `72fc7a7f` to prove the failure was
   pre-existing. That is real effort spent re-discovering a known-broken check,
   and it will happen again to the next person (human or agent) who trusts the
   script's existence as evidence it works.
2. **A check nobody can pass is worse than no check.** It trains everyone to
   skip it, which means if formatting ever *did* matter, the signal is already
   gone.

The status quo is the only option that is definitely wrong. Either enforce it or
delete it.

## Current state

### The config is deliberate, not a default (`.prettierrc.json`)

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

`printWidth: 100` is a considered choice (default is 80). Someone set this up on
purpose — which is an argument for Branch A.

### `.prettierignore` already exists and is sensible

```
dist
node_modules
worker
src-tauri
scratch
package-lock.json
src/locales
```

### The scripts (`package.json:22-23`)

```json
    "format": "prettier --write \"src/**/*.{ts,tsx}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx}\"",
```

### Measured scale

```
npx prettier --list-different "src/**/*.{ts,tsx}" | wc -l   →  277
find src -name '*.ts' -o -name '*.tsx' | wc -l              →  360
```

### ESLint already defers to Prettier

`eslint.config.js` ends with `prettier` (`eslint-config-prettier`), which
*disables* ESLint rules that would conflict with Prettier. If Branch B is chosen,
that import becomes inert — harmless, but worth a comment.

## Step 0 — OPERATOR DECISION ✅ ANSWERED: **Branch A (adopt)**

> **Decided by the operator on 2026-07-25: Branch A.** Execute Branch A only.
> Branch B is retained below purely as the record of what was weighed — do not
> execute it. The timing gate at the top of this file still applies in full:
> Branch A cannot start until the 259–268 batch is merged.

### Branch A — Adopt Prettier properly *(advisor's recommendation)*

Run `prettier --write` once, then make it enforceable so it never rots again.

- **For**: the config encodes deliberate choices; consistent formatting removes a
  whole category of diff noise and review nitpicks; agents working in this repo
  currently produce inconsistently-formatted code with nothing to normalise it.
- **Against**: one commit touching 279 files. `git blame` for most of the
  codebase points at that commit unless mitigated (it is — see Step A3).
- **Cost**: a big, mechanical, reviewable-in-aggregate diff, once.

### Branch B — Remove Prettier

Delete the scripts, `.prettierrc.json`, `.prettierignore`, the `prettier`
devDependency, and the `eslint-config-prettier` import.

- **For**: zero churn; ESLint already carries the rules that matter; formatting
  has evidently not mattered to this project in practice.
- **Against**: throws away a deliberate config; leaves nothing to normalise
  agent-generated formatting; `eslint-config-prettier` exists precisely to pair
  with Prettier, so removing one orphans the other.

**Recommendation: Branch A**, because this repo is actively worked on by multiple
AI agents whose output formatting varies, and a mechanical normaliser is worth
more here than in a single-human codebase. But it is a genuine judgment call and
the diff cost is real — the operator decides.

---

## Branch A — Adopt

### Step A1: Confirm the timing gate

```bash
git branch --no-merged main
git status --porcelain
```

**Use `--no-merged`, not `--list`.** A plain
`git branch --list 'perf/ai-*' …` matches every branch whose *name* fits the
pattern, including ones already merged into `main` — at the time of writing that
is 11 merged branches that have simply not been deleted yet, and the check would
false-positive on all of them. `--no-merged main` asks the question we actually
care about: is there work not yet in `main`?

**Verify**: `git branch --no-merged main` lists nothing from the 259–273 batch.

At `977f6a13` it lists exactly **three** branches, and **all three are expected —
do NOT stop on them**:

| Branch | Why it is unmerged |
|---|---|
| `feat/ai-ga-motion-spike` | Deliberately never merged; its `docs/motion-ga-spike.md` exists only there. Recorded in `plans/README.md`. |
| `wip/ai-plan260-blocked` | Preservation of plan 260's abandoned work (260 was superseded by 268, which is merged). Kept as a record. |
| `test/cla-check` | Stale CI test branch, predates this work. |

None contains code that a reformat would need to merge with. If you see any
branch **other** than these three, **STOP** — report which, and wait.

The working tree should be clean apart from untracked `plans/` files.

(Merged-but-undeleted branches are harmless here. Deleting them is ordinary
post-merge housekeeping and is **not** part of this plan — do not delete
anything.)

### Step A1.5: Make the privacy-mask exemptions wrap-proof (do this BEFORE reformatting)

**Discovered during the first execution attempt — this step exists because the
reformat fails without it.**

`eslint-disable-next-line` covers exactly the **next physical line**. Three sites
suppress the `no-restricted-syntax` privacy-mask rule on expressions that
currently fit one line but exceed `printWidth: 100` once Prettier reformats. When
Prettier wraps them, the disable comment no longer reaches the flagged call, and
`npm run lint` goes from 0 errors to **3 errors**:

| File | The exemption |
|---|---|
| `src/routes/CashFlowRoute.tsx:4239-4241` | `// 金額輸入框編輯狀態，非最終展示` — a ternary with two `n.toLocaleString(...)` branches, 118 chars, wraps to 3 lines |
| `src/routes/settings/ExportSection.tsx:286-288` | `{/* 匯出筆數，非金額展示 */}` — a JSX ternary containing `estimatedCount.toLocaleString()`, wraps to ~9 lines |

These are legitimate, documented exemptions (the ESLint rule's own message invites
them: 「日期或輸入框編輯狀態屬例外——加 eslint-disable-next-line 並附一行理由」).
The guard is not broken; its exemptions are.

**Fix: convert each to a line-range disable, which is wrap-immune.** Prettier does
not move or reflow block comments, so the suppression keeps covering the statement
no matter how it wraps:

```ts
  // 金額輸入框編輯狀態，非最終展示 — 不經 currency helpers
  /* eslint-disable no-restricted-syntax */
  return Number.isInteger(n) ? n.toLocaleString("zh-TW") : n.toLocaleString("zh-TW", { maximumFractionDigits: 4 });
  /* eslint-enable no-restricted-syntax */
```

Keep the existing 繁體中文 justification comment — it is what makes the exemption
reviewable.

**Do NOT**:
- widen the suppression beyond the single statement (no file-level disable, no
  wrapping a whole function) — the narrower the window, the better this guard works;
- restructure the expressions into variables to dodge the wrap. That changes
  evaluation order for a formatting problem.

**Verify** — all on the **unformatted** tree, so this commit stands alone:
- `npm run lint` → exit 0, still 804 warnings / **0 errors**
- `npx tsc --noEmit` → exit 0
- `npm test` → 129 files / 1508

Commit as `fix(lint): make privacy-mask exemptions robust to line wrapping`,
**before** the reformat commit. That ordering matters: it keeps the reformat
commit purely mechanical, and keeps every commit on the branch lint-clean.

### Step A2: Reformat

```bash
npm run format
npm run format:check   # must now exit 0
```

**Verify**:
- `npm run format:check` → exit 0
- `npm run lint` → **exit 0** — if this shows errors, a disable comment lost its
  target the way Step A1.5 describes. Do not fix it inside this commit; go back,
  extend Step A1.5 to cover the new site, and redo the reformat on top.
- `npx tsc --noEmit` → exit 0
- `npm test` → same passing count as before the reformat (record both)
- `npm run lint` → exit 0
- `npm run build` → exit 0

Prettier only rewrites whitespace and syntax-preserving layout, so the test count
**must not change**. If it does, STOP — something other than formatting moved.

Commit as `style: format src/ with prettier`. **This commit must contain nothing
but formatting.**

### Step A3: Preserve `git blame`

Create `.git-blame-ignore-revs` at the repo root containing the SHA of the Step
A2 commit and a comment explaining it:

```
# Repo-wide Prettier normalisation (plan 270). Formatting only — no behaviour
# change. Ignored so `git blame` attributes lines to their real authors.
<the-A2-commit-sha>
```

Then wire it up so it applies automatically for anyone who clones:

```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

Document that command in `CONTRIBUTING.md` (one line, under whatever setup
section exists) — the config is per-clone and cannot be committed, so it has to
be written down. GitHub's blame view honours the file automatically.

**Verify**: `git blame src/data/repositories.ts | head -5` does not attribute
those lines to the reformat commit.

### Step A4: Make it enforceable

Add `format:check` to CI so it can never silently rot again. In
`.github/workflows/ci.yml`, add it next to the existing `npm run lint` step in
the same job:

```yaml
      - run: npm run format:check
```

**Verify**: `grep -c "format:check" .github/workflows/ci.yml` → 1.

Do **not** add a git hook in this plan. CI is sufficient, it needs no per-clone
setup, and pre-commit hooks are a separate opinion the operator has not been
asked for. Note it as a possible follow-up instead.

### Step A5: Full verification

Each exiting 0: `npm run format:check`, `npx tsc --noEmit`, `npm run lint`,
`npm test` (unchanged count), `npm run build`.

---

## Branch B — Remove

### Step B1: Delete the scripts and config

- Remove `"format"` and `"format:check"` from `package.json` scripts
- Remove `prettier` from `devDependencies`
- Delete `.prettierrc.json` and `.prettierignore`

### Step B2: Handle `eslint-config-prettier`

`eslint.config.js` imports `prettier` from `eslint-config-prettier` and applies
it last. With Prettier gone this is inert. **Leave the import in place** but add
a comment explaining it is now vestigial, OR remove both it and the
`eslint-config-prettier` devDependency — operator's call, ask if unclear.

Removing it may re-enable ESLint stylistic rules that were previously disabled.
**Run `npm run lint` and report any new findings before deciding.**

### Step B3: Verify

Each exiting 0: `npx tsc --noEmit`, `npm run lint`, `npm test` (unchanged count),
`npm run build`. And `grep -rn "format:check" .github/ package.json` → no hits.

---

## Test plan

No new tests in either branch.

The load-bearing assertion in **both** branches is that **`npm test`'s passing
count does not change**. Formatting and tooling removal must not alter behaviour;
a changed count means something other than layout moved, and that is a STOP.

For Branch A, additionally: `npm run format:check` exits 0 afterwards, and CI
contains the step that keeps it that way.

## Done criteria

**Branch A**:
- [ ] `npm run format:check` exits 0
- [ ] `npm test` passing count unchanged from the pre-reformat baseline (both recorded)
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` exit 0
- [ ] `.git-blame-ignore-revs` exists and contains the reformat SHA
- [ ] `grep -c "format:check" .github/workflows/ci.yml` returns 1
- [ ] The reformat commit contains formatting only (no behavioural diff)
- [ ] `plans/README.md` status row updated

**Branch B**:
- [ ] `grep -rn "prettier" package.json` returns no script/dependency hits
- [ ] `.prettierrc.json` and `.prettierignore` are gone
- [ ] `npm test` passing count unchanged; `npx tsc --noEmit`, `npm run lint`, `npm run build` exit 0
- [ ] Any newly-surfaced ESLint findings from Step B2 are reported (not silently fixed)
- [ ] `plans/README.md` status row updated

## STOP conditions

- **Step 0 has no operator answer.** Do not pick a branch yourself.
- **Branch A**: `git branch --no-merged main` lists any branch beyond the three named in Step A1.
- `npm test`'s passing count changes in either branch.
- The Step A2 commit turns out to contain a non-formatting change.
- **Branch B**: removing `eslint-config-prettier` surfaces more than a handful of
  new lint findings — report the count and stop; fixing them is a separate scope.

## Maintenance notes

- **The general lesson**: a check that cannot pass is worse than no check. If a
  script exists in `package.json`, either CI runs it or it should be deleted.
  Worth applying to any future script added here.
- Branch A's `.git-blame-ignore-revs` needs a per-clone
  `git config blame.ignoreRevsFile .git-blame-ignore-revs` — that is why Step A3
  documents it in `CONTRIBUTING.md`. GitHub's web blame honours the file with no
  setup.
- Deferred either way: a pre-commit hook (`lint-staged`). CI enforcement is
  enough to stop the rot; a hook is a workflow preference to raise separately.
- If Branch A is chosen, the `prettier` bump in plan 262 (3.8.4 → 3.9.6) already
  landed and changed one file's expected formatting (`src/domain/types.ts`, a
  union-type line-wrap). Run the reformat **after** that bump is merged so the
  normalisation is done against the version actually in the lockfile.
