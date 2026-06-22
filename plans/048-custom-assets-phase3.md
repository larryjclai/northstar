# Plan 048: Custom assets Phase 3 — stale-price data-health rule, snapshot history, CSV import

> **Executor instructions**: This plan has three **independent sub-features**
> (A/B/C). They can be done together or one at a time; each has its own steps,
> tests, and done-criteria checkboxes. Run every verification command and confirm
> the expected result before moving on. If anything in "STOP conditions" occurs,
> stop and report — do not improvise. When done, update this plan's row in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/domain/dataHealth.ts src/routes/HoldingDetailRoute.tsx src/data/marketDataStore.ts src/domain/valuation.ts`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (three small, independent features on an already-shipped base)
- **Risk**: MED (touches valuation-adjacent surfaces, but math itself is done)
- **Depends on**: plans/045 (custom-asset valuation + create/log-price UI) — **MERGED**
- **Category**: direction (feature follow-up)
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Plans 038 (custom-asset valuation) and 045 (custom-asset create + log-price UI)
shipped Phases 1–2 of `ROADMAP.md` 規劃中「自訂投資資產」. Plan 045's
maintenance note explicitly **deferred three follow-ups**:

1. **A stale-price data-health rule** — a custom asset is valued at its latest
   manual `ManualPriceSnapshot`; if the user stops logging prices, the asset
   silently drifts to a stale value with no warning. The 報價過期 rule in
   `dataHealth.ts` covers Yahoo-quoted tickers but **not** manual prices.
2. **Snapshot edit/delete history** — `createManualPriceSnapshot` and
   `deleteManualPriceSnapshot` exist in the repository, but the HoldingDetail UI
   only *adds* a price; there's no way to **see the history or fix/delete a
   mistyped price**.
3. **Custom-asset CSV import** — the investment CSV import wizard handles
   tickered trades; there's no path to bulk-import manual price points for a
   custom asset.

These are the tail of a known, designed feature — low ambiguity, each independent.

## Current state

Files and roles:

- `src/domain/dataHealth.ts` — `buildDataHealthReport(input)` emits
  `DataHealthIssue`s. Existing rules are numbered in a comment block; each pushes
  an issue with `{ id, severity, kind, message, affected }`. The stale-quote rule
  is the pattern to mirror:

  ```ts
  // ── Rule 1: stale-quote ──
  const staleQuoteTickers: string[] = [];
  // ... compares each held ticker's quote age against a 5-day threshold ...
  if (staleQuoteTickers.length > 0) {
    issues.push({
      id: "stale-quote",
      severity: "warn",
      kind: "stale-quote",
      message: `以下持倉報價已超過 5 天未更新：${staleQuoteTickers.join("、")}`,
      affected: staleQuoteTickers,
    });
  }
  ```
  `DataHealthKind` is a union (`dataHealth.ts:8`): add `"stale-manual-price"` to
  it. `DataHealthSeverity = "warn" | "error"`. `BuildDataHealthReportInput`
  (line 55) is what the report receives — it has `today` (YYYY-MM-DD) for
  staleness math; you'll need the custom assets + their latest manual snapshot
  date threaded in (mirror how quotes are passed).

- `src/routes/HoldingDetailRoute.tsx` — already (plan 045) reads
  `manualPriceSnapshots` from `useFinanceData()`, builds `manualPriceLookup`,
  shows a 手動價格 indicator, and has an inline 更新價格 form calling
  `createManualPriceSnapshot` (around lines 41, 50, 59, 268, 278):

  ```ts
  const manualSnapshotRows = manualPriceSnapshots.data ?? [];
  // ... createManualPriceSnapshot mutation invalidates ["manualPriceSnapshots","assets","accounts"]
  ```
  `deleteManualPriceSnapshot` exists on the repository but is **not wired** in
  this route.

- `src/data/marketDataStore.ts` — manual-snapshot CRUD:
  `listManualPriceSnapshots` / `createManualPriceSnapshot` /
  `deleteManualPriceSnapshot`. `manualPriceSnapshots` is part of
  `RepositoryData`/`RepositorySnapshot` (already synced).

- `src/routes/InvestmentImportWizard.tsx` + `src/data/investmentImport.ts`
  (+ `investmentImport.test.ts`) — the existing CSV import: column-mapping UI +
  a pure parse/validate layer in `investmentImport.ts`. **This is the exemplar
  to mirror for sub-feature C** (pure parser + co-located test, wizard UI on top).

- `src/domain/types.ts` — `ManualPriceSnapshot` =
  `{ id, assetId, date, price, note, createdAt }`. Custom assets are identified
  per plan 038's Decision A (an `AssetType` value `"custom"` — confirm by reading
  `normalizeAssetType` / the `assetType` checks 045 added).

### Conventions to follow

- **Data-health rules** are pure and tested (`dataHealth.test.ts`); each new rule
  adds a `kind`, a zh-TW `message`, and an `affected` list. The Dashboard health
  card + one-tap fix renders from the report — adding a rule auto-surfaces it.
- **Pure parse/validate layers** are separated from wizard UI (see
  `investmentImport.ts` vs `InvestmentImportWizard.tsx`). Match that split for C.
- Mutations use the repo + invalidate the relevant query keys (the 045 pattern:
  `["manualPriceSnapshots","assets","accounts"]`). zh-TW copy throughout.
- Manual snapshots already sync — no schema/table changes needed for any sub-feature.

## Commands you will need

| Purpose   | Command                                          | Expected on success |
|-----------|--------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                               | exit 0              |
| Tests     | `npm test`                                        | all pass            |
| Test (DH) | `npx vitest run src/domain/dataHealth.test.ts`   | all pass            |
| Lint      | `npm run lint`                                    | exit 0 (0 errors)   |
| Build     | `npm run build`                                   | exit 0              |

## Scope

**Sub-feature A (stale-manual-price rule) — In scope:**
- `src/domain/dataHealth.ts` — new `"stale-manual-price"` kind + rule.
- `src/domain/dataHealth.test.ts` — new cases.
- The call site that builds `BuildDataHealthReportInput` (grep
  `buildDataHealthReport(` — likely `dashboardSummary.ts` or a route) — thread in
  custom assets + their latest manual-snapshot date. Keep this diff minimal.

**Sub-feature B (snapshot history + delete) — In scope:**
- `src/routes/HoldingDetailRoute.tsx` — render the manual-snapshot history
  (date / price / note, newest first) for a custom asset, each with a delete
  (two-click inline confirm — no `window.confirm`), wiring
  `deleteManualPriceSnapshot` + invalidation.

**Sub-feature C (CSV import of manual prices) — In scope:**
- `src/data/manualPriceImport.ts` (create) — pure parse/validate (mirror
  `investmentImport.ts`): CSV rows → `ManualPriceSnapshotDraft[]` for one asset.
- `src/data/manualPriceImport.test.ts` (create).
- A wizard/entry point to run it (mirror `InvestmentImportWizard.tsx`); keep it
  reachable from the custom-asset HoldingDetail page.

**Out of scope (do NOT touch):**
- `src/domain/valuation.ts` valuation math (done in 038/045) — unchanged.
- Cost-basis / `portfolioMetrics.ts` / `fifoCalculator.ts`.
- Non-custom (tickered) assets — none of these features apply to them.
- The `manual_price_snapshots` table / migrations (already exist).

## Git workflow

- Branch from current main: `git checkout -B advisor/048-custom-assets-phase3 main`.
- Commit per sub-feature (A, B, C) for a reviewable history.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Sub-feature A — stale-manual-price data-health rule

**Step A1**: Add `"stale-manual-price"` to `DataHealthKind`. Thread the custom
assets and each one's latest manual-snapshot date into
`BuildDataHealthReportInput` (mirror how quotes/`today` are passed). Add the rule
after the existing ones: for each **custom** asset with `totalQuantity > 0`,
compute days since its latest manual snapshot (or "no snapshot" → stale); if
> threshold (use the same 5-day basis as stale-quote, or a longer one if the
operator prefers — default 5), collect it. Push a `warn` issue:

```ts
issues.push({
  id: "stale-manual-price",
  severity: "warn",
  kind: "stale-manual-price",
  message: `以下自訂資產的手動價格已超過 N 天未更新：${names.join("、")}`,
  affected: names,
});
```

**Verify**: `npx vitest run src/domain/dataHealth.test.ts` → all pass.

### Sub-feature B — snapshot history + delete on HoldingDetail

**Step B1**: In `HoldingDetailRoute.tsx`, for a custom asset, render
`manualSnapshotRows` sorted newest-first as a list (date / price / note). Add a
delete control per row using the existing two-click inline confirm pattern (see
plan 047 / `GeneralSection.tsx` for the `confirmId === row.id` idiom), calling a
`deleteManualPriceSnapshot` mutation that invalidates
`["manualPriceSnapshots","assets","accounts"]` (same keys as the create
mutation). Do not touch the non-custom branch.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → 0 errors.

### Sub-feature C — CSV import of manual prices

**Step C1**: Create `src/data/manualPriceImport.ts`: a pure function that takes
raw CSV rows + a column mapping (date, price, optional note) + the target
`assetId`, validates (parseable date `YYYY-MM-DD`, positive finite price), and
returns `{ drafts: ManualPriceSnapshotDraft[]; errors: RowError[] }`. Mirror the
shape and error-reporting of `investmentImport.ts`.

**Step C2**: Add a minimal wizard (mirror `InvestmentImportWizard.tsx`) reachable
from the custom-asset HoldingDetail page; on confirm, loop `createManualPriceSnapshot`
over the drafts and invalidate the manual-snapshot keys.

**Verify**: `npx vitest run src/data/manualPriceImport.test.ts` → all pass;
`npx tsc --noEmit` → exit 0.

### Final verification (whichever sub-features you did)
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0.

## Test plan

- **A** (`dataHealth.test.ts`): custom asset with a snapshot older than the
  threshold → emits `stale-manual-price`; custom asset with a recent snapshot →
  no issue; custom asset with **no** snapshot but qty>0 → flagged; a **tickered**
  asset with an old quote → still only `stale-quote`, never `stale-manual-price`
  (regression: rules don't cross-fire).
- **C** (`manualPriceImport.test.ts`, model after `investmentImport.test.ts`):
  well-formed rows → drafts; bad date / non-numeric / negative price → row
  errors, no draft; empty input → empty drafts, no crash.
- **B** is UI; verify by code inspection + the build/lint gates (the underlying
  `deleteManualPriceSnapshot` is already exercised by repository tests).

## Done criteria

Per sub-feature attempted, ALL of its boxes must hold:

- [ ] **A**: `stale-manual-price` kind + rule + tests; flagged in the data-health
      report for a custom asset with a stale/missing manual price
- [ ] **B**: custom-asset HoldingDetail shows manual-price history with a working
      two-click delete; non-custom branch unchanged
- [ ] **C**: `manualPriceImport.ts` pure parser + tests; a reachable import path
      creates snapshots from CSV
- [ ] `npx tsc --noEmit` exits 0; `npm test` exits 0; `npm run lint` 0 errors;
      `npm run build` exits 0
- [ ] `src/domain/valuation.ts` is unchanged (`git diff --stat` shows it absent)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated (note which sub-features landed)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `8f2e90bd`),
  especially if plan 045's manual-price wiring is absent from `HoldingDetailRoute.tsx`
  (then 045 isn't merged — this plan depends on it).
- Custom-asset identity is **not** an `assetType === "custom"` check (the 038/045
  design changed) — confirm the actual sentinel before writing rule A / the import.
- A sub-feature requires editing `valuation.ts` or cost-basis math — it must not;
  stop and report.

## Maintenance notes

- For the reviewer: A and C are pure + tested (easy to verify); for B, confirm the
  non-custom HoldingDetail branch is untouched and the delete uses inline confirm
  (no `window.confirm`).
- The stale-manual-price threshold is a judgment call — if the operator finds 5
  days too noisy for slow-moving funds, make it a longer constant (it's a
  one-line change in the rule).
- These three are independent; partial completion is fine — record which landed.
