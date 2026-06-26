# Plan 074: Branch cleanup after going public

> **Executor instructions**: Branch DELETION is destructive and partly OPERATOR-GATED. This
> plan's executable part is read-only CLASSIFICATION + generating a safe delete script;
> actually deleting branches that aren't provably merged is the operator's call. NEVER delete
> `archive/*`, the default branch, or any branch with unmerged commits without operator
> confirmation (per `.agentrules`). Reply with EXACTLY the report format.

## Status
- **Priority**: P3 (hygiene)
- **Effort**: S
- **Risk**: MED (deleting a branch with unmerged work loses it; mitigated by merged-only rule)
- **Depends on**: none
- **Planned at**: commit `23b6982d`, 2026-06-26

## Why this matters
The repo just went public with a large pile of stale branches (many `advisor/0XX-*` executor
branches from completed plans, plus old `feat/*`/`fix/*`). On a public repo these are visible
to everyone and clutter the branch list. Clean up the **provably-merged** ones; keep
intentional archives and anything with unmerged work.

## Current state (observed; re-verify live — branches change)
- Many local `advisor/0XX-<slug>` branches (e.g. `advisor/011-…` … `advisor/045-…`,
  `advisor/072-open-source-mit`) — these are executor/worktree branches whose work was merged
  to `main` via no-ff merges. Most should be merged ⇒ safe to delete.
- `archive/swift-native-before-tauri`, `archive/windows-support-plan` — **intentional
  archives; KEEP** (they preserve abandoned directions).
- `feat/*` / `fix/*` (e.g. `feat/unified-valuation-engine`, `feat/ios-mobile`,
  `feat/portfolio-analytics`, `fix/ai-058-…`, `fix/sync500-…`) — check each: merged ⇒ delete,
  unmerged ⇒ keep/flag.
- Remote (`origin/*`) mirrors of the above + the `worktree-agent-*` refs from this session's
  executors.

## Decision (implement this)
Classify every branch into **MERGED** (its tip is an ancestor of `main`), **ARCHIVE** (keep),
or **UNMERGED** (has commits not on `main` — keep + flag). Then delete only MERGED branches,
local + remote, EXCEPT `archive/*` and the default branch.

## Commands you will need
| Purpose | Command |
|---|---|
| Local branches merged into main | `git branch --merged main \| grep -vE '^\*\|main\|archive/'` |
| Local branches NOT merged | `git branch --no-merged main \| grep -vE 'archive/'` |
| Remote branches merged | `git branch -r --merged origin/main \| grep -vE 'origin/main\|origin/HEAD\|archive/'` |
| Remote NOT merged | `git branch -r --no-merged origin/main \| grep -vE 'archive/'` |
| Delete a merged local branch | `git branch -d <name>`  (`-d` refuses if not merged — a safety net) |
| Delete a merged remote branch | `git push origin --delete <name>` |
| Worktree refs from this session | `git worktree list` then `git worktree prune` |

## Steps
### Step 1 (read-only): produce the classification.
Run the merged/no-merged commands above and write `docs/branch-cleanup.md` with three lists:
MERGED-safe-to-delete, ARCHIVE-keep, UNMERGED-flag (with, for each unmerged branch, the count
of commits ahead of main: `git rev-list --count main..<branch>` and the latest commit subject,
so the operator can judge).
### Step 2 (executor MAY do): delete the **MERGED, non-archive** branches.
Use `git branch -d` (NOT `-D`) for locals — it self-refuses anything not actually merged, so it
can't lose work. Delete the matching remotes with `git push origin --delete`. Also
`git worktree prune` + delete stale `worktree-agent-*` refs.
### Step 3 (OPERATOR-GATED): the UNMERGED list.
Do NOT delete these. Present them to the operator with the ahead-count + subject; let them
decide keep/merge/delete each. (Some may be genuinely abandoned, some may be WIP.)

## Done criteria
- [ ] `docs/branch-cleanup.md` lists MERGED / ARCHIVE / UNMERGED with evidence
- [ ] All MERGED non-archive branches deleted (local via `-d`, remote via `--delete`); archives kept
- [ ] Stale `worktree-agent-*` refs + worktrees pruned
- [ ] UNMERGED branches NOT deleted — handed to the operator with ahead-count + latest subject
- [ ] `main` + `archive/*` untouched

## STOP conditions
- `git branch -d` refuses a branch you expected to be merged → it has unmerged commits; move it
  to the UNMERGED list, do NOT force-delete with `-D`.
- Any branch the operator is actively using (check `git worktree list` / recent commits) → leave it.

## Maintenance notes
- Future executor branches (`worktree-agent-*`, `advisor/*`) should be deleted after their
  merge lands — fold this into the merge routine so the list doesn't regrow.
- Keep `archive/*` as the convention for "preserved but inactive" directions.
