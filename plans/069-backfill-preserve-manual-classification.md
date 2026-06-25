# Plan 069: 回補分類 must not overwrite user-entered classification

> **Executor instructions**: Follow step by step. Run every verification command.
> Two repo impls (browser + Tauri SQLite) must stay consistent. If a STOP condition
> occurs, stop and report. Commit in the worktree. SKIP plans/README.md. Audit claims
> against tool results. Reply with EXACTLY the report format.
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA>..HEAD -- src/features/market-data/useMarketRefresh.ts src/data/repositories.ts src/domain/types.ts`
> This plan touches `useMarketRefresh.ts` (shared with plans 067 + 068). Execute AFTER
> 067 merges if both are taken; re-read the excerpts against live code first.

## Status
- **Priority**: P1 (data loss — backfill wipes the user's manual classification)
- **Effort**: M
- **Risk**: MED (schema-ish field + two impls; finance-adjacent classification)
- **Depends on**: none (but coordinate with 067/068 — shared file)
- **Category**: bug (data correctness)
- **Planned at**: commit `276de422`, 2026-06-25

## Why this matters
Operator-reported: 回補分類 (the "backfill asset profiles" action) **overwrites the
classification the user entered by hand**. A user who manually sets an asset's
類型/產業/行業 (e.g. correcting a wrong auto value, or classifying a custom asset) loses
it the next time profiles are backfilled. Classification drives the sector/industry
breakdowns, so silently clobbering a user's correction is a real data-loss bug.

Root cause (confirmed in code): `updateAssetClassification` spreads the new
classification over the asset unconditionally; and `backfillAssetProfiles` calls it for
every re-qualifying asset, with no notion of "this was user-set, don't touch it."

## Current state
- `src/data/repositories.ts` — `updateAssetClassification` (browser ~974; SQLite override ~2397):
```ts
async updateAssetClassification(id: string, input: AssetClassificationInput) {
  const classification = assetClassificationFields(input);
  this.data.portfolioAssets = this.data.portfolioAssets.map((asset) =>
    asset.id === id && asset.deletedAt === null
      ? bump({ ...asset, ...classification,   // ← OVERWRITES assetType/sector/industry unconditionally
          nameZh: input.nameZh ?? asset.nameZh ?? null,
          nameEn: input.nameEn ?? asset.nameEn ?? null })
      : asset)
  // …
}
```
- `src/features/market-data/useMarketRefresh.ts` — `backfillAssetProfiles` builds a
  candidate list and calls `repository.updateAssetClassification(asset.id, {assetType,
  sector, industry, nameZh, nameEn})` for each. **The same method is used by BOTH the
  user's manual edit AND the auto-backfill** — there's nothing distinguishing them.
- User's manual edit path: the holding edit modal (InvestmentsRoute inline modal +
  `HoldingEditModal.tsx`) calls an `updateClassification` mutation →
  `repository.updateAssetClassification(...)` with the user's values.
- `src/domain/types.ts` — `PortfolioAsset` has no "classification was set by the user"
  marker. (Add one, optional, backward-compatible — see Decision.)

### Conventions to follow
- New persisted fields are OPTIONAL so old data loads unchanged (see `rollover?`,
  `bankBrandDomain?`, `dripGroupId?`). Absent ⇒ treat as not-locked (auto).
- Two impls (browser + Tauri SQLite) stay behaviorally identical; the SQLite side needs a
  column via `ensureSqliteColumn` (see how `postDate`/`dripGroupId` were added).
- `bump()` revision on mutation. The field syncs as part of the asset row.
- Don't change the sector/industry breakdown math — only WHO is allowed to overwrite.

## Decision (implement this)
Add an optional **`classificationLocked?: boolean`** to `PortfolioAsset` (and the
classification input). Semantics:
- When the **user manually** saves a classification via the edit modal,
  `updateAssetClassification` is called with an explicit lock → set
  `classificationLocked = true`.
- The **backfill** (`backfillAssetProfiles`) must SKIP assets with
  `classificationLocked === true` — exclude them from the candidate list (so they're
  never re-fetched/overwritten), UNLESS `force` is set AND the operator explicitly opts
  to re-classify (keep `force` as today's "I really mean it" — but even under force,
  prefer not to silently wipe; if you keep force overriding the lock, say so in the UI).
- An absent/false lock behaves exactly as today (auto-classifiable).

(Alternative considered: only-fill-empty-fields. Rejected — it can't tell a user's
deliberate value from a stale auto one, and breaks legitimate re-classification. A
lock set on explicit user edit is the precise signal.)

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Test (repo) | `npx vitest run src/data/repositories.investments.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Rust | `npm run check:tauri` | exit 0 |

## Scope
**In scope:**
- `src/domain/types.ts` — `classificationLocked?: boolean` on `PortfolioAsset` (+ the
  `AssetClassificationInput` if you thread the lock through that).
- `src/data/repositories.ts` — set/persist `classificationLocked` in
  `updateAssetClassification` (browser + SQLite override + the `ensureSqliteColumn`
  migration + the row mappers/INSERT/UPDATE so it round-trips); only set it true when the
  caller passes the manual-lock signal.
- `src/features/market-data/useMarketRefresh.ts` — exclude
  `classificationLocked === true` assets from the `backfillAssetProfiles` candidate list.
- The manual-edit call sites (InvestmentsRoute inline modal + `HoldingEditModal.tsx`) —
  pass the manual-lock signal when the user saves a classification.
- Tests (see Test plan).
**Out of scope:**
- The sector/industry breakdown computation / analytics.
- Name backfill (plan 067) — names are a separate field; don't fold name logic in here.
- Auto-classification quality (plan 068).

## Git workflow
- Branch from current main: `git checkout -B advisor/069-preserve-manual-classification main`.
- Short imperative commit. Do NOT push/PR.

## Steps
### Step 1: model field + persistence (both impls + migration)
Add `classificationLocked?: boolean` to `PortfolioAsset`. In `updateAssetClassification`
(browser + SQLite), persist it: set `true` when the manual-lock signal is passed, else
preserve the existing value (don't clear it). Add the SQLite column via
`ensureSqliteColumn` and wire it through the row mapper + INSERT/UPDATE (mirror how
`dripGroupId`/`postDate` were threaded). **Verify**: `npx tsc --noEmit` → 0; `npm run check:tauri` → 0.
### Step 2: lock on manual edit
In the two holding-edit call sites, pass the manual-lock signal when the user saves a
classification (so user edits set `classificationLocked = true`). **Verify**: tsc 0.
### Step 3: backfill skips locked
In `backfillAssetProfiles`, exclude `classificationLocked === true` assets from the
candidate list (respecting the existing `force`/sector/name conditions; decide + document
how `force` interacts with the lock). **Verify**: tsc 0; the repo test below passes.
### Step 4: full verification
`npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0;
`npm run check:tauri` 0.

## Test plan
In `src/data/repositories.investments.test.ts` (or a focused test):
- A user-locked asset: calling `updateAssetClassification` from the backfill path does NOT
  change its assetType/sector/industry (or it's excluded from the candidate list — assert
  whichever mechanism you chose), and `classificationLocked` survives an export→import.
- An unlocked asset: backfill still classifies it (today's behavior).
- A manual edit sets `classificationLocked = true`.
- Existing tests stay green.

## Done criteria
- [ ] `classificationLocked?` exists (optional, backward-compatible); old data loads as unlocked
- [ ] A manual classification edit locks the asset; 回補分類 no longer overwrites it
- [ ] Unlocked assets still auto-classify; breakdown math unchanged
- [ ] browser ≡ SQLite (incl. the new column round-trip)
- [ ] tsc 0; `npm test` all pass; lint 0 errors; build 0; check:tauri 0
- [ ] No files outside scope modified

## STOP conditions
- Cited code doesn't match (drift — esp. if 067 restructured `backfillAssetProfiles`).
- Adding the column to SQLite isn't a clean `ensureSqliteColumn` addition — report.
- The manual-edit path turns out NOT to go through `updateAssetClassification` — re-point + report.

## Maintenance notes
- Reviewer: the load-bearing property is "a user-locked classification is never silently
  overwritten by backfill." Check both impls + the export/import round-trip of the flag.
- Decide + document the `force` interaction (a UI "re-classify even locked" should be a
  deliberate, separate action, not the default backfill).
- A name-lock (for plan 067 / user-edited names) is the analogous follow-up — out of scope here.
