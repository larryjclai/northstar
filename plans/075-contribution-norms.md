# Plan 075: Contribution norms for the public repo (PR template, CoC, issue/CONTRIBUTING polish)

> **Executor instructions**: Documentation/config only — NO source/behavior change. Match the
> repo's zh-TW-first convention (English secondary). Touch only the files listed. Commit in the
> worktree. SKIP plans/README.md. Reply with EXACTLY the report format.

## Status
- **Priority**: P2 (public repo — sets the bar for incoming issues/PRs)
- **Effort**: S
- **Risk**: LOW (docs only)
- **Depends on**: 072 (GPLv3 + CLA already landed: `CLA.md`, `.github/workflows/cla.yml`,
  `CONTRIBUTING.md` updated). This fills the remaining gaps.
- **Planned at**: commit `23b6982d`, 2026-06-26

## Why this matters
The repo is public; outside contributors will file issues and PRs. **Issue templates already
exist** (`.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml` with a
Security-report contact link). What's MISSING for a clean contributor experience:
1. **No pull-request template** → PRs arrive without the CLA reminder, the checklist, or links
   to the repo's gates (tests/lint/typecheck, the copy.csv workflow, etc.).
2. **No `CODE_OF_CONDUCT.md`** → expected on a public OSS repo.
3. `CONTRIBUTING.md` exists (072 added the GPLv3 + CLA note) — verify it actually tells a
   newcomer how to build/test and what the PR gates are.

## Current state
- `.github/ISSUE_TEMPLATE/`: `bug_report.yml`, `feature_request.yml`, `config.yml`
  (`blank_issues_enabled: true`; Security contact → the private advisory URL). These are fine —
  light polish only.
- `.github/workflows/cla.yml`: the CLA bot gates PRs (contributor must sign).
- `CONTRIBUTING.md`: exists, states GPLv3 + the one-time CLA signature requirement.
- **No** `.github/PULL_REQUEST_TEMPLATE.md`. **No** `CODE_OF_CONDUCT.md`.
- Repo gates (from CLAUDE.md/AGENTS.md): `npm test` (vitest), `npm run lint`, `tsc` typecheck,
  `npm run check:tauri` (cargo fmt+check), and UI copy is edited via `copy.csv` round-trip
  (`npm run copy:export/import`) — NOT hand-edited in `.tsx`.

## Decision (implement this)
- **Add `.github/PULL_REQUEST_TEMPLATE.md`** — zh-TW first + English, with: a one-line summary
  prompt, a "linked issue" line, and a checklist covering the repo's real gates:
  - [ ] 已簽署 CLA / Signed the CLA (bot will prompt)
  - [ ] `npm test` 通過、`npm run lint` 無錯、`tsc` 無錯、（碰到 Rust 時）`npm run check:tauri` 通過
  - [ ] UI 文案經 `copy.csv` round-trip（未直接改 `.tsx` 字串）
  - [ ] 無金融計算語意的非預期變更（correctness-first）；必要時附測試
  - [ ] 未提交機密 / 個人財務資料 / 未遮蔽截圖
- **Add `CODE_OF_CONDUCT.md`** — the standard **Contributor Covenant v2.1**, with the
  operator's contact placeholder flagged (don't invent an email).
- **Polish `CONTRIBUTING.md`** if needed: ensure it has a concise "build & test" section
  (the commands above) + "how to propose a change" (open an issue first for big changes; PRs
  go through the CLA bot) + the copy.csv note. Don't duplicate the whole AGENTS.md — link it.
- **Light-touch issue templates**: confirm they reference GPLv3/public-repo reality and the
  not-financial-advice + no-sensitive-data note; small wording only.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| YAML validity (issue templates) | `python3 -c "import yaml; [yaml.safe_load(open(f)) for f in __import__('glob').glob('.github/ISSUE_TEMPLATE/*.yml')]"` | no error |
| Build unaffected | `npm run build` | exit 0 |

## Scope
**In scope:** `.github/PULL_REQUEST_TEMPLATE.md` (new), `CODE_OF_CONDUCT.md` (new),
`CONTRIBUTING.md` (polish), `.github/ISSUE_TEMPLATE/*.yml` (light wording only).
**Out of scope:** any source/feature change; the CLA mechanism (072 owns it); README i18n
(plan 076).

## Git workflow
- Branch from current main: `git checkout -B advisor/075-contribution-norms main`.
- Short imperative commit. Do NOT push/PR.

## Steps
### Step 1: add `.github/PULL_REQUEST_TEMPLATE.md` (zh-TW + EN, the checklist above).
### Step 2: add `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1; flag the contact placeholder).
### Step 3: polish `CONTRIBUTING.md` (build/test + propose-a-change + copy.csv) and the issue
templates' wording. Verify issue-template YAML still parses; `npm run build` 0.

## Test plan
- Issue-template YAML parses. PR template + CoC render as valid Markdown.
- (Manual/visual) the PR template checklist matches the repo's actual gates.

## Done criteria
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` exists with the CLA reminder + the real-gates checklist (zh-TW + EN)
- [ ] `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1) added; contact placeholder FLAGGED for operator
- [ ] `CONTRIBUTING.md` has build/test + propose-a-change + copy.csv guidance
- [ ] Issue templates parse + reflect GPLv3/public reality
- [ ] No source/behavior change; `npm run build` 0
- [ ] Only the listed files changed

## STOP conditions
- A "gate" in the checklist doesn't match reality (e.g. the copy.csv workflow changed) — verify
  against AGENTS.md/package.json before writing it.

## Maintenance notes
- Keep the PR-template checklist in sync with the real gates (AGENTS.md "Common commands").
- The CoC contact + the SECURITY disclosure contact should be the same channel the operator
  actually monitors.
