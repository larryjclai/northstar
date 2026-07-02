# Plan 086: Dependency license audit — confirm no copyleft, document the result (077 Phase 5)

> **Executor instructions**: Follow step by step. This is mostly an audit. If the audit
> finds a GPL/LGPL/AGPL/SSPL dependency, STOP and report it (do not try to replace it).
> Commit your work in the worktree. NEVER push, NEVER touch `main`.
>
> **Base**: build on the stacked branch `feat/ai-mobile-dock-strip-fix` (contains 079–084).
> In your fresh worktree run Step 0 first.

## Status
- **Priority**: P2  •  **Effort**: S  •  **Risk**: LOW  •  **Depends on**: none
- **Category**: dependencies  •  **Planned at**: stacked tip, 2026-06-27
- **Supersedes**: 077 Phase 5

## Why this matters
Northstar is heading toward App Store / public release. Any GPL/LGPL/AGPL/SSPL runtime
dependency would be a licensing problem. The dependency tree is believed clean (all
MIT/Apache-2.0/ISC/BSD) but this has never been verified with a tool. This plan runs the
check and records the result so it's auditable and re-runnable.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| License check | `npx license-checker --production --summary` | prints a license summary |
| Fail-gate | `npx license-checker --production --failOn "GPL-2.0;GPL-3.0;LGPL-2.0;LGPL-2.1;LGPL-3.0;AGPL-3.0;SSPL-1.0"` | exit 0 (no matches) |

## Scope
**In scope**: `package.json` (add a `license:check` script only); a short note in
`docs/DEVELOPMENT.md` (or create `docs/licenses.md`) recording the audit result + how to
re-run it.
**Out of scope**: changing any dependency; the Rust/Cargo licenses (separate ecosystem —
note it as a follow-up but do not audit Cargo here); removing/replacing packages.

## Steps

### Step 0: integrate the stacked base
```
git merge --no-ff feat/ai-mobile-dock-strip-fix -m "integrate: stacked 079-084"
npm install
git checkout -b feat/ai-license-audit
```
If the merge conflicts, STOP and report.

### Step 1: Run the audit
Run `npx license-checker --production --summary` and capture the summary. Then run the
fail-gate command above. Record both the summary and the fail-gate exit code.

- **If the fail-gate exits non-zero** (a copyleft license found): STOP and report exactly
  which package(s) and license(s) — do NOT attempt to remove or replace anything.

### Step 2: Add a re-runnable script + document the result
- In `package.json` `scripts`, add:
  `"license:check": "license-checker --production --failOn \"GPL-2.0;GPL-3.0;LGPL-2.0;LGPL-2.1;LGPL-3.0;AGPL-3.0;SSPL-1.0\""`
  (do NOT add `license-checker` as a dependency — it's invoked via `npx`; if a devDep is
  required for the script to resolve, add `license-checker` to `devDependencies`.)
- Add a short section to `docs/DEVELOPMENT.md` titled "Dependency licenses" recording: the
  date, that the production tree is free of GPL/LGPL/AGPL/SSPL (or the findings if not),
  the summary counts (e.g. "MIT: N, Apache-2.0: M, …"), and `npm run license:check` as the
  re-run command. Note that Cargo/Rust licenses are a separate follow-up.

**Verify**: `npm run license:check` → exit 0 (if the tree is clean); `npx tsc --noEmit` → exit 0 (sanity, no TS touched but confirms nothing broke).

## Done criteria (ALL)
- [ ] `npm run license:check` exists and exits 0 (OR a STOP report names the offending package/license)
- [ ] `docs/DEVELOPMENT.md` (or `docs/licenses.md`) records the audit result + re-run command
- [ ] `npm test` still passes (no new failures)
- [ ] Only `package.json` (+ lockfile) and the docs file changed

## STOP conditions
- The fail-gate finds a copyleft license — report the package(s); do not modify deps.
- `license-checker` cannot run at all (network/registry issue) — report; do not fake a result.

## Maintenance notes
- Re-run `npm run license:check` before any release and whenever a dependency is added.
- Rust/Cargo licenses are NOT covered here — a `cargo-deny` check is a sensible follow-up.
