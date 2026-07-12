# Plan 178: Roadmap reality-sync — mark shipped Phase-6 / 5.2 items so intent docs stop misleading direction decisions

> **Executor instructions**: Docs-only plan. Follow the steps; every claim you
> write into ROADMAP.md must carry the evidence this plan provides (or better,
> re-verified). If anything in "STOP conditions" occurs, stop and report.
> When done, update the status row in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ac63576..HEAD -- ROADMAP.md src/domain/northstarMetrics.ts src/state/uiPreferences.ts src/features/local-backup/`
> On drift, re-verify each evidence line below before writing.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (docs only)
- **Depends on**: none (but coordinate wording with plan 170: JSON-import and
  sync-backup restore previews are NOT yet shipped — only local-backup preview is)
- **Category**: docs (stale intent docs actively wrong — flagged during the
  2026-07-12 direction audit, which itself was nearly misled by them)
- **Planned at**: commit `4ac63576`, 2026-07-12

## Why this matters

ROADMAP.md is the repo's primary intent document — `/improve` direction
audits, product decisions, and release notes all read it. Today it lists
Phase 6.1/6.2/6.3/6.5 and item 5.2 as planned/in-progress when they are
**shipped and merged**. The 2026-07-12 direction audit initially selected
"build the restore preview" as a top finding before code-vetting revealed
plan 047 had already shipped it — that near-miss is the concrete cost of the
drift. This plan brings the roadmap back to reality and retires one stale
follow-up in the plans index.

## Current state — the verified evidence to write in

All verified at `4ac63576`:

| Roadmap item | Listed as | Actually | Evidence |
|---|---|---|---|
| 6.1 北極星指標 | 規劃中 | Shipped | `src/domain/northstarMetrics.ts` (+ test); `northstarMetric` pref in `src/state/uiPreferences.ts:56,149`; hero picker in `DashboardRoute.tsx` (`allMetrics`, `activeMetric` ~:612) |
| 6.2 被動收入覆蓋率 | 規劃中 | Shipped | `coverageRatioPct` (`northstarMetrics.ts:140`), wired at `DashboardRoute.tsx:330` (TTM dividends ÷ 12×trailing monthly expense) |
| 6.3 底氣 Runway | 規劃中 | Shipped | `runwayMonths` (`northstarMetrics.ts:156`), wired at `DashboardRoute.tsx:341` (all-accounts liquid cash) |
| 6.5 長期視角模式 | 規劃中 | Shipped | `longViewMode` + `milestoneReached` prefs (`uiPreferences.ts:58-60,150-151`); `src/domain/trendSmoothing.ts`; design doc `docs/long-view-mode-plan.md` (plan 040) |
| 5.2 還原前預覽 | 進行中/短期 (unbuilt) | Shipped for **local backups** (plan 047): counts diff + typed「還原」 in `GeneralSection.tsx:96-170` via `src/features/local-backup/backupDiff.ts`. JSON-import and sync-backup paths still lack it — plan 170 covers those | see file:line refs |

Also stale: the 進度總覽's「🧭 依初衷的新方向（已納入 Phase 6）」block implies
the Phase-6 metrics are future work, and the「🟡 進行中 / 短期」summary lists
還原前預覽 as pending.

In `plans/README.md` → "Open follow-ups (surfaced, not yet planned)": the
entry「**Analytics usefulness review** — product-direction critique of
AnalyticsTab…」predates plan 167 (global period control + 5-section reorder,
merged in v0.1.0-alpha.57) and the 2026-07-12 direction audit, which found no
remaining analytics-direction gap worth planning. Retire it.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Verify an evidence line | `grep -n <symbol> <file>` | matches at the cited lines |
| Nothing else | — | docs-only |

## Scope

**In scope**:
- `ROADMAP.md`
- `plans/README.md` (retire the analytics follow-up; your own status row)

**Out of scope**:
- Any `src/` file.
- Rewriting roadmap *plans* or priorities — you update **status**, not
  strategy. Keep every 未完成 item's Problem/Action/驗收 wording intact.
- README.md / PRODUCT.md.

## Git workflow

- Branch: `fix/ai-roadmap-reality-sync` (or fold into a docs commit if the
  operator prefers — default: own branch)
- One commit: `docs(roadmap): mark shipped Phase-6 + 5.2 items, retire stale follow-up`

## Steps

### Step 1: Re-verify, then update ROADMAP.md

For each table row above, run the evidence grep first. Then edit following the
roadmap's own documented convention (line 14:「已完成項只留一行摘要」):

- Move 6.1/6.2/6.3/6.5 content into ✅-style shipped state: keep each section
  heading, replace Problem/Action with「✅ 已實作（〈date from git log of the
  implementing commit〉）」+ a one-to-three-line summary naming the modules
  (mirror how 6.4 already does it — it's the in-file exemplar of a shipped
  Phase-6 section).
- 6.6 stays as-is (genuinely unbuilt; note「規格待決 — 見 plans/172」).
- 5.2: mark the local-backup preview shipped (plan 047 wording per the table)
  and rescope the remaining bullet to the JSON-import + sync-backup paths,
  referencing plan 170.
- Update 進度總覽: move the shipped items into the 🟢/已成熟 phrasing where
  the section's style puts them; fix the 🧭 line so it no longer implies all
  of Phase 6 is future.

**Verify**: `grep -n "6.1" ROADMAP.md` region no longer contains an unshipped
Action block; `grep -c "northstarMetrics" ROADMAP.md` ≥ 1.

### Step 2: Retire the stale follow-up in plans/README.md

In "Open follow-ups", replace the Analytics-usefulness-review entry with a
one-liner in "Findings considered and rejected":「Analytics usefulness review
— addressed by plan 167 (global period + reorder, v0.1.0-alpha.57) and the
2026-07-12 direction audit found no further analytics-direction gap; retired.」

**Verify**: `grep -c "Analytics usefulness review" plans/README.md` → appears
only in the rejected ledger.

## Test plan

None — docs only. `npm test` must remain untouched-and-green (`git status`
shows only the two files).

## Done criteria

- [ ] ROADMAP.md: 6.1/6.2/6.3/6.5 read as shipped with module names; 6.6
      untouched except the plans/172 pointer; 5.2 rescoped to the two
      remaining paths
- [ ] 進度總覽 consistent with the sections below it
- [ ] plans/README.md analytics follow-up retired into the rejected ledger
- [ ] `git status` shows only `ROADMAP.md` + `plans/README.md`
- [ ] Status row for this plan updated

## STOP conditions

- Any evidence grep from the table fails (the feature moved or was reverted) —
  report which row; do not write a shipped claim you couldn't re-verify.
- Plan 170 landed first and already rewrote the 5.2 section — reconcile with
  its wording instead of duplicating.

## Maintenance notes

- Root cause worth a habit, not a mechanism: implementing plans (like 040/047)
  shipped features without touching ROADMAP.md. Future feature plans should
  include a "roadmap line updated" done-criterion when they close a named
  roadmap item — reviewers of future plans, look for that.
