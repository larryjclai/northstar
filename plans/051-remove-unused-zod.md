# Plan 051: Remove the unused `zod` dependency (instead of migrating it to v4)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise. When
> done, update this plan's row in `plans/README.md` unless a reviewer told you
> they maintain the index.
>
> **Drift check (run first)**:
> `grep -rn "zod" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js" . --exclude-dir=node_modules --exclude-dir=dist | grep -v "package-lock\|package.json"`
> Expected: **no output** (zod is unused). If this prints any real import/usage,
> zod has started being used since `8f2e90bd` — that is a STOP condition; this
> plan no longer applies and the work becomes a genuine v3→v4 migration instead.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (removing a dependency with zero importers)
- **Depends on**: none
- **Category**: tech-debt / dependencies
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

The original request was to plan a `zod` 3 → 4 migration alongside the other
dependency upgrades. Investigation at `8f2e90bd` found that **`zod` is not
imported anywhere in the codebase** — a repo-wide grep across `src/`, scripts,
configs, and tests returns zero matches; only `package.json` and
`package-lock.json` reference it. Validation in this app is done with hand-written
guards and TypeScript types (e.g. `validateSearch` in `router.tsx`,
`normalizeAssetType`, the import parsers), not zod.

Migrating an unused package to v4 would be pure churn with no benefit and a small
risk of pulling a heavier/transitively-changed dependency into the lockfile.
The correct action is to **remove it**. This trims the dependency surface (one
fewer package to audit, update, and reason about). If the team later wants schema
validation, adding `zod@4` fresh is trivial and starts on the current major.

## Current state

- `package.json` `dependencies` includes `"zod": "^3.25.48"` (resolved to
  3.25.76 in the lockfile).
- `npm outdated` shows `zod 3.25.76 → latest 4.4.3` (a major).
- **Zero source usage** — verified by the drift-check grep above.

### Conventions to follow

- `npm audit` is currently 0 vulnerabilities; it must stay 0.
- The full verification suite (tsc, lint, test, build, `check:tauri`) must stay
  green — removing an unused dep should not perturb any of them.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Confirm unused | the drift-check grep above | no output |
| Remove | `npm uninstall zod` | exit 0 |
| Audit | `npm audit` | 0 vulnerabilities |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass (unchanged count) |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |

## Scope

**In scope:**
- `package.json` — remove the `zod` entry.
- `package-lock.json` — updated by `npm uninstall`.

**Out of scope (do NOT touch):**
- Any source file (there is nothing to change — zod is unused).
- Other dependencies (plans 049/050).
- Do NOT instead add zod usage or "migrate" it — the decision is removal.

## Git workflow

- Branch from current main: `git checkout -B advisor/051-remove-zod main`.
- Single commit, e.g. `chore: remove unused zod dependency`.
- Do NOT push/PR unless told.

## Steps

### Step 1: confirm unused, then remove
Run the drift-check grep — confirm **no output**. Then:

```
npm uninstall zod
```

**Verify**: `git diff package.json` shows only the `zod` line removed;
`grep -n zod package.json` → no match.

### Step 2: verification gate
**Verify**: `npx tsc --noEmit` exit 0; `npm run lint` 0 errors; `npm test` all
pass (count unchanged); `npm run build` exit 0; `npm audit` 0 vulnerabilities.

## Test plan

No new tests. The existing suite + build staying green at the same test count
proves nothing depended on zod (which the grep already established).

## Done criteria

ALL must hold:

- [ ] `zod` absent from `package.json` and `package-lock.json`
- [ ] Repo-wide grep for `zod` (excluding `node_modules`/lockfile) → no matches
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` 0 errors; `npm test` unchanged
      count all pass; `npm run build` exits 0; `npm audit` 0 vulnerabilities
- [ ] No source files modified (`git status` shows only `package*.json`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift-check grep finds real `zod` usage (it started being used since this
  plan was written) — removal is wrong; report so this becomes a v3→v4 migration
  plan instead.
- Removing zod changes the test count or breaks any gate — that would mean a
  transitive/peer relationship existed; investigate and report.

## Maintenance notes

- For the reviewer: the entire justification is "0 importers." Confirm the grep
  yourself before approving.
- If schema validation is wanted later (e.g. for sync envelope parsing or import
  CSV validation), add `zod@4` fresh at that point — starting on the current
  major is cheaper than carrying an unused v3 and migrating it now.
