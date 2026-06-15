# Plan 001: Replace per-asset O(N·M) record filtering with a single Map-keyed lookup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9115a2b5..HEAD -- src/data/repositories.ts src/domain/portfolioCalculator.ts`
> If either in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `9115a2b5`, 2026-06-15

## Why this matters

Two hot functions group investment records by asset using `records.filter(...)`
**inside a per-asset loop**. With N assets and M records this is O(N·M) — it
re-scans the entire records array once per asset. `recomputeAssets` runs on every
portfolio mutation (buy/sell/dividend/edit), and `buildHoldingPositionsByAccount`
runs on every holdings render. Building a single `Map<assetId, InvestmentRecord[]>`
up front makes both O(N+M). This is a pure internal optimization: the inputs,
outputs, and observable behavior are identical — only the grouping strategy
changes.

## Current state

- `src/data/repositories.ts` — local SQLite-backed repository. `recomputeAssets`
  (lines 434–472) derives quantity/cost for each asset from its records.
  The hot line is the per-asset filter:

  ```ts
  // src/data/repositories.ts:434-438
  function recomputeAssets(assets: PortfolioAsset[], records: InvestmentRecord[]) {
    const activeRecords = active(records);
    return assets.map((asset) => {
      if (asset.deletedAt !== null) return asset;
      const assetRecords = activeRecords.filter((record) => record.assetId === asset.id);
  ```

  `active` (line 428) filters `deletedAt === null`. The rest of the function
  (the `missingOpening` self-heal, `buildPositionMetrics`) must be left exactly
  as-is — only the source of `assetRecords` changes.

- `src/domain/portfolioCalculator.ts` — pure holdings math.
  `buildHoldingPositionsByAccount` (lines 106–...) has the same pattern, but the
  filter also re-checks `deletedAt` inline:

  ```ts
  // src/domain/portfolioCalculator.ts:~120
  for (const asset of assets) {
    if (asset.deletedAt !== null) continue;
    ...
    const assetRecords = records.filter((record) => record.assetId === asset.id && record.deletedAt === null);
  ```

  The sibling function `buildHoldingPositions` in the **same file** uses the
  identical `records.filter((record) => record.assetId === asset.id ...)` pattern
  in a loop — apply the same fix there if and only if grep (Step 1) finds it.

- Repo conventions: TypeScript strict mode, `tsc --noEmit` is clean today. Domain
  modules are pure functions tested with vitest (`*.test.ts` next to the source).
  Use plain `Map`, `const`, arrow functions — match the existing style.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                                   | exit 0, no output   |
| Tests     | `npx vitest run`                                     | all pass (≥409)     |
| Focused   | `npx vitest run src/domain/portfolioCalculator.test.ts src/data` | all pass |
| Find sites| `grep -rn "records.filter" src/data/repositories.ts src/domain/portfolioCalculator.ts` | the loop sites above |

## Scope

**In scope** (the only files you may modify):
- `src/data/repositories.ts`
- `src/domain/portfolioCalculator.ts`

**Out of scope** (do NOT touch):
- `src/domain/portfolioAnalytics.ts` — it has a related linear-scan (`gridOnOrAfter`)
  but the fix there is a binary search with different correctness risk; deferred to
  a separate plan. Do not change it.
- `buildPositionMetrics`, `syntheticOpeningRecord`, and the `missingOpening`
  self-heal logic — behavior must not change.
- Any function signature exported from these files — callers must keep working
  unchanged. The Map is an internal local, not a new parameter.

## Git workflow

- Branch: `advisor/001-perf-asset-record-map` (per `.agentrules`, isolate AI work on a branch).
- Commit message style: conventional commits, e.g. `perf(portfolio): group records by asset in one pass`.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Confirm the exact filter sites

Run: `grep -rn "records.filter" src/data/repositories.ts src/domain/portfolioCalculator.ts`

Confirm you see the `recomputeAssets` site and the `buildHoldingPositionsByAccount`
site (and note whether `buildHoldingPositions` also matches). If the lines differ
materially from the excerpts above, STOP (drift).

### Step 2: Fix `recomputeAssets` in `src/data/repositories.ts`

Build the grouping once, before `assets.map`, and read from it inside the loop:

```ts
function recomputeAssets(assets: PortfolioAsset[], records: InvestmentRecord[]) {
  const activeRecords = active(records);
  const recordsByAsset = new Map<string, InvestmentRecord[]>();
  for (const record of activeRecords) {
    const list = recordsByAsset.get(record.assetId);
    if (list) list.push(record);
    else recordsByAsset.set(record.assetId, [record]);
  }
  return assets.map((asset) => {
    if (asset.deletedAt !== null) return asset;
    const assetRecords = recordsByAsset.get(asset.id) ?? [];
    // ...everything else in the function stays byte-for-byte identical...
```

Leave the rest of the function (comments included) unchanged.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Fix `buildHoldingPositionsByAccount` in `src/domain/portfolioCalculator.ts`

Because this site also filters `deletedAt === null` inline, build the Map from
**active** records up front so the inner lookup matches today's semantics exactly:

```ts
export function buildHoldingPositionsByAccount(/* unchanged signature */): HoldingPosition[] {
  const positions: HoldingPosition[] = [];
  const lookup = valuation ? buildDailyPriceLookup(valuation.dailyPrices) : null;
  const asOf = valuation?.asOf ?? null;

  const recordsByAsset = new Map<string, InvestmentRecord[]>();
  for (const record of records) {
    if (record.deletedAt !== null) continue;
    const list = recordsByAsset.get(record.assetId);
    if (list) list.push(record);
    else recordsByAsset.set(record.assetId, [record]);
  }

  for (const asset of assets) {
    if (asset.deletedAt !== null) continue;
    const quote = quotes[asset.ticker];
    const { marketPrice, valuePrice } = resolveHoldingPrice(/* unchanged */);
    const assetRecords = recordsByAsset.get(asset.id) ?? [];
    // ...rest of the loop body unchanged...
```

If Step 1 showed `buildHoldingPositions` matches the same pattern, apply the
identical Map-up-front treatment to it too (build from active records once, read
`recordsByAsset.get(asset.id) ?? []` in the loop).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Run the full suite

**Verify**: `npx vitest run` → all pass, count ≥ 409 (the count before this change).
No test file should need editing — behavior is unchanged. If a test fails, the
refactor altered behavior; STOP and report which assertion changed.

## Test plan

No new tests required — this is a behavior-preserving refactor and the existing
suites (`src/domain/portfolioCalculator.test.ts`, `src/data/repositories.investments.test.ts`,
`src/data/repositories.installments.test.ts`) already exercise both functions with
manual + transaction-based holdings, including the `missingOpening` self-heal path.
Their continued passing IS the verification. Use
`src/domain/portfolioCalculator.test.ts` as the reference for what is covered.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npx vitest run` exits 0; test count ≥ 409, no test files modified
- [ ] `grep -rn "records.filter((record) => record.assetId" src/data/repositories.ts src/domain/portfolioCalculator.ts` returns **no** matches inside a per-asset loop (the filters are gone)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift).
- Any existing test changes its pass/fail result after the refactor — that means
  the grouping subtly changed semantics; do not "fix" the test.
- Applying the fix appears to require changing a function signature or touching
  `portfolioAnalytics.ts`.

## Maintenance notes

- Future code that adds records with a different identity field (e.g. grouping by
  `accountId + assetId`) must update the Map key accordingly.
- A reviewer should confirm the Map is built from the **same** filtered set the old
  `.filter` used (active records in `repositories.ts`; `deletedAt === null` in
  `portfolioCalculator.ts`) — an off-by-one in the filter predicate is the only way
  this refactor can introduce a bug.
- Deferred: the linear `gridOnOrAfter`/`firstPricedGrid` scans in
  `portfolioAnalytics.ts` (binary-search candidate) are intentionally out of scope.
