# Plan 073: Clean up release.yml for the now-public repo

> **Executor instructions**: Follow step by step. This edits a CI workflow — be precise; a
> broken workflow only surfaces on dispatch. Validate YAML. Touch only `.github/workflows/release.yml`
> (+ its doc references). If a STOP condition occurs, stop and report. Commit in the worktree.
> SKIP plans/README.md. Reply with EXACTLY the report format.

## Status
- **Priority**: P3 (housekeeping; the local script is the working release path)
- **Effort**: S–M
- **Risk**: LOW (workflow_dispatch-only; doesn't auto-run; local script unaffected)
- **Depends on**: the repo move to public + releases publishing to `larryjclai/northstar`
  (already done: `tauri.conf.json` endpoint + `release-local.sh` repointed)
- **Planned at**: commit `23b6982d`, 2026-06-26

## Why this matters
The repo is now **public** (GPLv3), and releases moved from the separate `northstar-releases`
repo back to `larryjclai/northstar`. Two consequences for `release.yml`:
1. The **`mirror-to-public` job is obsolete** — it copied the private-repo release into the
   public `northstar-releases` feed (rewriting latest.json URLs). With the source public and
   releases published directly here, there's nothing to mirror.
2. **Public repos get free, unlimited GitHub Actions** — the elaborate cost-avoidance
   (`MACOS_RUNNER` self-hosted indirection, the "10× on private repos" comments, the
   `workflow_dispatch`-only "don't burn minutes" framing) is no longer needed for cost, though
   `workflow_dispatch`-only is still fine to KEEP (avoids surprise runs).

## Current state
- `.github/workflows/release.yml`:
  - `on: workflow_dispatch` (manual, input `tag`). Comment (lines 3-6) calls it a "manual
    fallback" because the local mac script is default.
  - `notes` job (lines 25-40): extracts CHANGELOG body via `node scripts/changelog-notes.mjs`.
  - `publish-tauri` job (lines 42-~150): 4-platform matrix (macOS arm64/x86_64, ubuntu-22.04,
    windows-latest); `runs-on` uses the `MACOS_RUNNER` self-hosted indirection (lines 69-75);
    builds + publishes a GitHub Release. Comments reference "private repos" + notarization.
  - `mirror-to-public` job (≈ lines 164-220): downloads the release assets, rewrites
    latest.json URLs `/larryjclai/northstar/releases/download/` →
    `/larryjclai/northstar-releases/releases/download/`, then `gh release ... --repo
    larryjclai/northstar-releases` using a `RELEASES_TOKEN` PAT secret.
- `scripts/release-local.sh` is the everyday mac path (now publishes to `larryjclai/northstar`,
  with a `LEGACY_MIRROR_REPO` transition option). CI's real remaining value = **Windows/Linux
  artifacts**, which the mac-only local script can't build.

## Decision (implement this)
Simplify `release.yml` to publish **directly to `larryjclai/northstar`**, drop the mirror:
1. **Delete the entire `mirror-to-public` job** and its `RELEASES_TOKEN`/URL-rewrite logic.
   `publish-tauri` already creates the release on THIS repo via `tauri-action` (which generates
   `latest.json` with the correct same-repo URLs) — confirm it does, and that it marks the
   release `latest`/non-prerelease so the updater's `releases/latest/download/latest.json`
   resolves. (If `tauri-action`'s `tagName`/`releaseId` config needs adjusting to publish on
   this repo with the right URLs, do that.)
2. **Update the stale comments**: remove "private repo / 10× billing / mirror feed" framing;
   note the repo is public so Actions is free and releases live on this repo. Keep
   `workflow_dispatch`-only (a deliberate "don't auto-run on every tag" choice) — state that as
   the reason rather than the old cost reason.
3. **`MACOS_RUNNER` indirection**: KEEP the `runs-on` expression as-is (harmless, still works,
   defaults to hosted), but update the comment (no longer about private-repo 10× cost; just
   "optionally use a self-hosted mac runner"). OR simplify to plain `runs-on: ${{ matrix.platform }}`
   if you're confident — but the safe choice is keep + re-comment.
4. **Security re-confirm**: the workflow stays `workflow_dispatch`-only (no `pull_request` /
   `pull_request_target`), so fork PRs never get secrets. Confirm no secret is `echo`-ed into
   logs. Do NOT add any PR trigger.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| YAML validity | `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"` (or `npx yaml-lint`) | no error |
| actionlint (if available) | `actionlint .github/workflows/release.yml` | no errors (or skip if not installed) |

## Scope
**In scope:** `.github/workflows/release.yml` only (delete mirror job, fix comments, confirm
direct-publish). Optionally a one-line note in `RELEASING.md`/`docs` if it references the mirror.
**Out of scope:** `release-local.sh` (already repointed — don't touch). `tauri.conf.json`.
Reviving/expanding CI beyond removing the mirror. Any source/feature change.

## Git workflow
- Branch from current main: `git checkout -B advisor/073-release-yml-cleanup main`.
- Short imperative commit. Do NOT push/PR.

## Steps
### Step 1: delete the `mirror-to-public` job + any now-unused `RELEASES_TOKEN` reference in the workflow.
### Step 2: confirm `publish-tauri` publishes to THIS repo as `latest` (non-prerelease) with
correct latest.json URLs; adjust `tauri-action` inputs if needed. Verify YAML parses.
### Step 3: update the stale private-repo/mirror/billing comments to the public-repo reality.
### Step 4: validate — YAML parses; (actionlint if available) no errors.

## Done criteria
- [ ] `mirror-to-public` job removed; no reference to `northstar-releases` or `RELEASES_TOKEN`
      remains in `release.yml`
- [ ] `publish-tauri` publishes a `latest` (non-prerelease) GitHub Release on
      `larryjclai/northstar` with same-repo `latest.json` URLs (so the updater resolves)
- [ ] Stays `workflow_dispatch`-only; no PR trigger added; no secret echoed
- [ ] Comments reflect the public-repo reality (free Actions, releases on this repo)
- [ ] YAML parses; actionlint clean (if available)
- [ ] No file other than `release.yml` (+ optional RELEASING.md note) changed

## STOP conditions
- `publish-tauri` turns out to depend on the mirror for the updater feed in a way that isn't a
  clean same-repo publish — report what you found before guessing.
- Removing the mirror would require touching `release-local.sh` or `tauri.conf.json` — out of
  scope; report.

## Maintenance notes
- Now that Actions is free, CI release (Windows/Linux) can be USED again — but mac is still
  simplest via the local script. Document which platform goes which path in `RELEASING.md`.
- The `northstar-releases` repo stays alive until existing installs migrate (see the release
  memory / plan around the endpoint move), then archive it.
