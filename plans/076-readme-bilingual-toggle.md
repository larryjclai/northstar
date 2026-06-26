# Plan 076: README language toggle (繁體中文 ⇄ English)

> **Executor instructions**: Documentation only — NO source/behavior change. Preserve the
> repo's zh-TW-first convention: `README.md` stays Traditional Chinese (that's what GitHub
> shows by default). Touch only README files. Commit in the worktree. SKIP plans/README.md.
> Reply with EXACTLY the report format.

## Status
- **Priority**: P2 (public repo — English reach for contributors)
- **Effort**: S–M (mostly a faithful translation)
- **Risk**: LOW (docs only)
- **Depends on**: none (pairs with 075)
- **Planned at**: commit `23b6982d`, 2026-06-26

## Why this matters
The repo is public, but `README.md` is a single **繁體中文** file with only a small embedded
"In English (summary)" section (~lines 97-130). Non-Chinese visitors get a partial summary
buried below the Chinese content. Give a proper **two-file language toggle** so each language
is first-class and one click apart — the standard GitHub OSS pattern.

## Current state
- `README.md` (138 lines), zh-TW. Section headers: `# Northstar`, `## 功能總覽`,
  `## 下載與安裝` (+ `### macOS 首次開啟`), `## 目前是 Alpha，請注意`, `## 回報問題與許願`,
  `## 授權與貢獻狀態`, `## In English (summary)` (+ `### Build from source`), `## 想參與開發？`.
- So an English *summary* already exists embedded — it must become the seed of a FULL English
  README, not stay as a sub-section.

## Decision (implement this)
Two files + a language nav line at the top of each (the common pattern):
- **`README.md`** — stays **繁體中文** (GitHub's default view). Add, as the very first line
  under the `# Northstar` title (or just above it), a language switcher:
  `**繁體中文** · [English](README.en.md)`
  Then REMOVE the embedded `## In English (summary)` + `### Build from source` sections (their
  content moves to README.en.md) — or replace them with a one-line pointer to `README.en.md`.
- **`README.en.md`** (new) — a **full English** translation of `README.md` (all sections:
  overview/features, download & install incl. the macOS Gatekeeper note, Alpha caveat, reporting
  issues, license & contribution status, build from source, how to contribute). Top line:
  `[繁體中文](README.md) · **English**`
- Keep the two in the SAME order/structure so they're easy to keep in sync. Both must keep the
  **not-financial-advice** note and the **GPLv3 + CLA** license/contribution summary (link
  `LICENSE`, `CLA.md`, `CONTRIBUTING.md`, `THIRD-PARTY-LICENSES.md`).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Links resolve | `for f in LICENSE CLA.md CONTRIBUTING.md THIRD-PARTY-LICENSES.md README.en.md; do test -e "$f" && echo "ok $f" || echo "MISSING $f"; done` | all ok |
| Build unaffected | `npm run build` | exit 0 |

## Scope
**In scope:** `README.md` (add toggle line, remove the embedded English section), `README.en.md`
(new full translation).
**Out of scope:** any source/feature change; CONTRIBUTING/templates (plan 075); translating
other docs (docs/ stays as-is for now).

## Git workflow
- Branch from current main: `git checkout -B advisor/076-readme-bilingual main`.
- Short imperative commit. Do NOT push/PR.

## Steps
### Step 1: create `README.en.md` — full English translation mirroring README.md's structure,
with the `[繁體中文](README.md) · **English**` nav at the top.
### Step 2: in `README.md`, add the `**繁體中文** · [English](README.en.md)` nav at the top and
remove the now-redundant embedded `## In English (summary)` / `### Build from source` sections.
### Step 3: verify all cross-links resolve; `npm run build` 0; both files render as valid Markdown.

## Test plan
- The link-check command above passes (README.en.md exists; all referenced files exist).
- Eyeball: both files have the toggle line; section structure matches between them; no broken
  links; the English file is a complete translation (not a stub).

## Done criteria
- [ ] `README.en.md` is a FULL English README (not a summary), structure-parallel to `README.md`
- [ ] Both files have the language-toggle line at the top, linking to each other
- [ ] `README.md` stays zh-TW default; its old embedded English section is removed/replaced
- [ ] not-financial-advice + GPLv3/CLA summary present in BOTH; all cross-links resolve
- [ ] No source/behavior change; `npm run build` 0
- [ ] Only README files changed

## STOP conditions
- A referenced file (e.g. `THIRD-PARTY-LICENSES.md`) doesn't exist — note it; don't link a 404.

## Maintenance notes
- The two READMEs must be kept in sync on edits — keep identical section order so a diff is
  obvious. A future `docs/` i18n is out of scope but the same two-file pattern applies.
- GitHub shows `README.md` by default regardless of viewer locale; the toggle line is the
  discovery mechanism — keep it on line 1.
