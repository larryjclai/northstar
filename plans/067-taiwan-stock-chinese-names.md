# Plan 067: Taiwan stocks show English names — re-qualify them for the TWSE Chinese-name backfill

> **Executor instructions**: Follow this plan step by step. Run every verification
> command. Touch only in-scope files. Keep browser + Tauri SQLite consistent. If a STOP
> condition occurs, stop and report. Commit in the worktree. SKIP plans/README.md.
> Audit claims against tool results. Reply with EXACTLY the report format at the end.
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA>..HEAD -- src/features/market-data/useMarketRefresh.ts src/domain/assetName.ts`
> This plan touches `useMarketRefresh.ts`, which **plan 066 also edits** — execute 067
> ONLY after 066 has merged to main, and re-read the "Current state" excerpts against
> live code first (the candidate-filter region 067 changes is separate from 066's
> fund-routing region, but confirm).

## Status
- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW–MED (changes which assets re-fetch profiles; no finance math)
- **Depends on**: plan 066 (shared file `useMarketRefresh.ts` — merge 066 first)
- **Category**: bug (UX/i18n)
- **Planned at**: commit `6138ca74`, 2026-06-23 (re-stamp against post-066 main before executing)

## Why this matters
Operator-reported: Taiwan stocks (`*.TW`) display **English** names even though the app
is zh-TW and a Chinese-name source exists. The infrastructure is already there (Yahoo is
queried with `lang: "zh-Hant-TW"`; the app stores `nameZh`/`nameEn`; the display prefers
Chinese), but TW stocks are stuck on English.

Root cause (confirmed in code): Yahoo's **chart** endpoint returns the **English** name
even in the zh-Hant locale for many TW tickers, and that English value gets saved as
`nameZh`. The `backfillAssetProfiles` mutation — which fetches the **real** Chinese name
from the TWSE open-data provider and would fix this — only re-qualifies a TW ticker when
its `nameZh` is **missing** (`!asset.nameZh`). A stock that already has an *English*
`nameZh` is treated as "already named" and is **never re-fetched**, so the TWSE Chinese
name never lands. The display then sees `nameZh === nameEn` (both English) and, per
`resolveAssetName`'s guard, falls back to the English name.

(US/foreign stocks have NO Chinese name in any source — out of scope; they stay English.)

## Current state
- `src/features/market-data/useMarketRefresh.ts` — `backfillAssetProfiles` mutation:
```ts
const candidates = assets.filter((asset) => {
  if (!asset.ticker.trim()) return false;
  const ticker = asset.ticker.trim().toUpperCase();
  const taiwanNeedsProfile = isTaiwanTicker(ticker) && (!asset.nameZh || !asset.industry || !asset.sector);
  //                                                     ^^^^^^^^^^^^^^ ← the bug: only when nameZh is MISSING
  const equityNeedsSector = asset.assetType === "equity" && (!asset.sector || !asset.industry);
  return force || !asset.assetType || equityNeedsSector || taiwanNeedsProfile;
});
// …
const [taiwanResult, yahooProfiles] = await Promise.all([ taiwanProvider.fetchAssetProfiles(symbols)…, provider.fetchAssetProfiles(symbols, onProgress) ]);
const profiles = { ...yahooProfiles, ...taiwanResult };   // ← TWSE (taiwanResult) wins; correct
// …
await repository.updateAssetClassification(asset.id, { assetType, sector, industry, nameZh: profile.nameZh ?? null, nameEn: profile.nameEn ?? null });
```
  `TaiwanMarketDataProvider.fetchAssetProfiles` returns the real Chinese `nameZh` (from
  TWSE/TPEx open data) for listed TW tickers. `updateAssetClassification`
  (`repositories.ts` browser ~974 + SQLite override ~2397) persists `nameZh` (writes
  `input.nameZh ?? asset.nameZh`).
- `src/domain/assetName.ts` — `resolveAssetName` already has a guard: if
  `nameZh === nameEn` (a provider returned English in both) it falls back to the
  user-entered `name`. So once `nameZh` holds the real Chinese name (≠ nameEn), the
  display flips to Chinese automatically — no display change needed.

### Conventions to follow
- Two repo impls stay consistent (`updateAssetClassification` already exists in both).
- A "real Chinese name" = contains CJK characters (and isn't equal to the English name).
  A small pure helper (e.g. `hasChineseName(s)` via a CJK Unicode-range regex) is
  testable and reusable.
- Don't touch US/foreign equities — they have no Chinese source.

## Step 0 — confirm (cheap)
Confirm on a real (or test) stuck TW stock that its `nameZh` is the English string (=
`nameEn`), not missing. (Code reading already strongly indicates this; a quick assertion
in the new test suffices — you don't need the operator's DB.)

## Decision (implement this)
Re-qualify a TW ticker for the profile backfill when it **lacks a REAL Chinese name**,
not merely when `nameZh` is missing. I.e. change the `taiwanNeedsProfile` condition's
name check from `!asset.nameZh` to "no real Chinese name" — e.g.
`!hasChineseName(asset.nameZh)` (a `nameZh` that is null OR has no CJK chars OR equals
`nameEn` re-qualifies). Then the existing TWSE fetch + `{ ...yahoo, ...taiwan }` merge +
`updateAssetClassification` write the real Chinese name. No display change (resolveAssetName
already prefers a real `nameZh`).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |

## Scope
**In scope:**
- `src/features/market-data/useMarketRefresh.ts` — the `taiwanNeedsProfile` candidate
  condition (re-qualify when no real Chinese name).
- A tiny pure helper for "has a real Chinese name" (CJK regex) — put it where it's
  testable (e.g. `src/domain/assetName.ts` next to `resolveAssetName`, or a small
  module) + a co-located unit test.
**Out of scope:**
- US/foreign equities (no Chinese source).
- `resolveAssetName` display logic (already correct — it prefers a real nameZh).
- Yahoo provider's fetch (the TWSE provider is the Chinese-name source; don't rework Yahoo).
- `valuation.ts` / any finance math.

## Git workflow
- Branch from current main (post-066): `git checkout -B advisor/067-tw-chinese-names main`.
- Short imperative commit. Do NOT push/PR.

## Steps
### Step 1: the helper + re-qualify
Add `hasChineseName(name: string | null | undefined): boolean` (true iff it contains a
CJK char, e.g. `/[一-鿿]/`). In `backfillAssetProfiles`, change the TW name check
so a TW ticker re-qualifies when `!hasChineseName(asset.nameZh)` (covers null, English,
and nameZh===nameEn-English). Keep the `force` and sector/industry conditions.
**Verify**: `npx tsc --noEmit` → 0; the helper unit test passes.
### Step 2: full verification
`npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0.

## Test plan
- `hasChineseName` unit test: `"台積電"` → true; `"Taiwan Semiconductor"` → false; `""`/null → false.
- A test (or focused reasoning) that a TW asset with `nameZh === nameEn === <English>`
  now satisfies `taiwanNeedsProfile` (re-qualifies), while a TW asset with a real Chinese
  `nameZh` does NOT (avoids needless re-fetch).
- Existing tests stay green.

## Done criteria
- [ ] TW tickers with an English-only `nameZh` re-qualify for the TWSE profile backfill;
      after a profile refresh they show the real Chinese name (display unchanged — it
      already prefers a real nameZh)
- [ ] TW tickers that already have a real Chinese name do NOT needlessly re-fetch
- [ ] US/foreign equities unaffected
- [ ] `npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0
- [ ] Only the in-scope files modified

## STOP conditions
- Cited code doesn't match (drift — esp. if 066 restructured the candidate filter).
- The stuck TW stocks turn out to have `nameZh` actually NULL (not English) — then the
  bug is elsewhere (TWSE provider not matching the symbol); investigate + report.
- Fixing this requires changing `resolveAssetName` display logic — it shouldn't; report.

## Maintenance notes
- After this lands, existing English-named TW stocks correct themselves on the next
  profile backfill (it re-qualifies them). Note in review: the user may need to trigger a
  profile refresh (the "回補分類" / backfill action) once, or it happens on the normal cadence.
- US equities have no Chinese-name source — keep the manual rename path for those.
- `hasChineseName` could also tighten `resolveAssetName`'s guard later (out of scope).
