# Plan 045: Custom assets Phase 2 — manual-price valuation wiring + create/log-price UI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Touch
> only the files listed as in scope. If any STOP condition occurs, stop and
> report — do not improvise. Commit per phase following the git workflow.
> Update this plan's row in `plans/README.md` only if no reviewer told you they
> maintain the index (a reviewer does — so SKIP the index update).
>
> **This is the follow-up to plan 038 (custom assets Phase 1).** It depends on
> Phase 1's valuation engine. See "Base setup" — you must build on main **with
> Phase 1 merged in**, because the Phase-1 branch alone is stale (behind main).

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED–HIGH (threads manual pricing through `portfolioCalculator` — the canonical holdings valuation; finance-correctness sensitive)
- **Depends on**: plan 038 (branch `advisor/038-custom-assets`, commit `32ef08a3` — approved, NOT yet merged to main)
- **Category**: direction (feature)
- **Planned at**: main `5457d190` + Phase 1 (`advisor/038-custom-assets`) merged on top, 2026-06-20

## Why this matters

Plan 038 Phase 1 added the valuation **engine** for custom (manually-priced)
assets — `assetType: "custom"`, a `"manual"` `PriceSource`, an optional
`manualPriceLookup` on `priceAssetOnDate`/`holdingsMarketValue` — and unit tests.
But it is **not usable yet**, for two reasons:

1. **No caller passes a `manualPriceLookup`.** The holdings table and portfolio
   value come from `portfolioCalculator.ts`, which uses its *own*
   `resolveHoldingPrice` (quote → close → cost) and **never calls
   `priceAssetOnDate`**. The Dashboard net-worth trend and allocation call
   `priceAssetOnDate` but pass no manual lookup. So a custom asset still values
   at average cost everywhere in the real UI — the engine is dark.
2. **No UI to create a custom asset or log its price.** A user can't make an
   `assetType: "custom"` holding or write a `ManualPriceSnapshot`.

This plan finishes the feature: (A) thread the manual-price lookup through every
valuation caller so custom assets show their manual price; (B) let users create a
custom asset; (C) let users log/update its manual price. The storage
(`manual_price_snapshots` table + repository CRUD) and the per-unit branch in
`priceAssetOnDate` already exist from Phase 1 — this is wiring + two small UI
surfaces, but it touches the canonical valuation path, so Phase A ships tests and
a strict "non-custom valuation unchanged" guarantee.

## Base setup (do this FIRST, before any code)

The Phase-1 branch `advisor/038-custom-assets` is based on an older commit than
current `main` (main has since merged plans 041–044). Build on **main + Phase 1**:

```
git checkout -B advisor/045-custom-assets-ui main
git merge --no-ff advisor/038-custom-assets    # brings Phase 1; verified conflict-free
```

If that merge reports a conflict, STOP and report (it was simulated clean; a
conflict means main moved again). After the merge, confirm Phase 1 is present:

```
grep -n '"custom"' src/domain/types.ts            # AssetType has "custom"
grep -n 'manualPriceLookup' src/domain/valuation.ts   # Phase-1 option exists
```

Both must match. Then run `npm install` (fresh worktree) and revert any
`package-lock.json` version-string churn it causes.

## Current state (line numbers are on main `5457d190`; after the Phase-1 merge the valuation.ts lines shift — re-grep)

### Phase 1 engine already present (from the merge)
- `src/domain/valuation.ts` — `priceAssetOnDate` has a top branch:
  `if (asset.assetType === "custom") { … manual snapshot → cost … }`. The option
  type `PriceAssetOptions` has `manualPriceLookup?: (assetId, date) => { price; currency } | undefined`;
  `HoldingsValueOptions` has the same; `holdingsMarketValue` forwards it.
  `PriceSource` includes `"manual"`. `PriceableAsset` has optional `id`/`assetType`.
- `src/domain/types.ts` — `AssetType` includes `"custom"` (label 自訂資產).
- `ManualPriceSnapshot` = `{ id, assetId, date, price, note, createdAt }`;
  repository CRUD: `listManualPriceSnapshots(filter?)`, `createManualPriceSnapshot(input: ManualPriceSnapshotDraft)`, `deleteManualPriceSnapshot(id)`.
  `ManualPriceSnapshotDraft = { assetId, date, price, note }`.

### The valuation caller that bypasses `priceAssetOnDate`
`src/domain/portfolioCalculator.ts` — `resolveHoldingPrice` (lines ~31-46) does
quote → close → cost with **no** manual branch:

```ts
function resolveHoldingPrice(ticker, averageCost, quote, lookup, asOf): { marketPrice; valuePrice } {
  const quotePrice = quote?.price ?? null;
  const closePrice = lookup && asOf ? findDailyPriceAtOrBefore(lookup, ticker, asOf)?.close ?? null : null;
  const marketPrice = quotePrice ?? closePrice;
  const valuePrice = marketPrice ?? (lookup ? averageCost : 0);
  return { marketPrice, valuePrice };
}
```

`HoldingValuation` opts (lines ~18-22): `{ dailyPrices: DailyPrice[]; asOf: string }`.
Both `buildHoldingPositions` (line ~48, call at ~78) and
`buildHoldingPositionsByAccount` (line ~112, call at ~133) call `resolveHoldingPrice`
with `(asset.ticker, asset.averageCost, quote, lookup, asOf)`.

### The valuation call sites (on main `5457d190` — re-grep after merge, lines drift)
- `src/routes/DashboardRoute.tsx:274` — `buildHoldingPositions(assetRows, recordRows, quoteMap, { dailyPrices: dailyPriceRows, asOf: todayIso })` (net-worth breakdown).
- `src/routes/DashboardRoute.tsx:444` — `priceAssetOnDate(asset, todayIso, { todayIso, dailyPriceLookup, quote: quoteFor(asset.ticker) })` (allocation/breakdown of `filteredAssets`).
- `src/routes/DashboardRoute.tsx:1453` and `:1469` — `priceAssetOnDate(...)` inside `buildNetWorthTrend` (net-worth trend series).
- `src/routes/InvestmentsRoute.tsx:118` — `buildHoldingPositionsByAccount(assetRows, recordRows, quoteMap, { dailyPrices: dailyPriceRows, asOf: valuationToday })`.
- `src/routes/HoldingDetailRoute.tsx:46` — `priceAssetOnDate(asset, today, { todayIso: today, dailyPriceLookup, quote })`.
- All these routes already load `manualPriceSnapshots` via `useFinanceData()`
  (`src/data/hooks.ts:87` query, returned in the bundle). DashboardRoute already
  destructures `manualPriceSnapshots` (used by `stripData`). Confirm each route
  destructures it; add it to the `useFinanceData()` destructure if missing.

### The create path
- `src/routes/InvestmentsAddSheet.tsx` — the add sheet has two modes: a
  **snapshot** (manual holding) form (`snapshotForm: PortfolioAssetDraft`, line ~136)
  and a transaction form. Snapshot submit (line ~272) currently throws
  `請輸入 ticker。` if no ticker, then `createHolding.mutateAsync(snapshotForm)`
  (mutation at ~154 → `repository.createManualHolding`).
- `PortfolioAssetDraft` has `assetType?: AssetType | null` (and `ticker`, `name`,
  `currency`, `totalQuantity`, `averageCost`, `acquisitionDate`, `accountId`, …).
  `createManualHoldingRow` spreads `manualHoldingFields(input)` — verify it
  carries `assetType` (it should, since the draft has it; if not, that's a
  one-line fix in `manualHoldingFields`, in scope).

### The holding-detail surface
- `src/routes/HoldingDetailRoute.tsx` — values via `priceAssetOnDate` (line 46),
  shows `marketPrice` (line ~159/231). `priced.source` is read at line ~97
  (`!== "cost"`), which already treats `"manual"` as a real market value. This is
  where the "log a manual price" form + a 手動價格 indicator go for custom assets.

### Conventions to follow
- **Finance correctness invariant**: calculations explainable + tested; do not
  silently change financial math. Non-custom valuation must stay byte-for-byte
  identical — Phase A ships tests proving it.
- Mutations: mirror the existing pattern in `InvestmentsAddSheet.tsx:154`
  (`(repository, input) => repository.createManualHolding(input)` via the repo
  mutation helper) and invalidate the relevant React Query keys
  (`queryKeys`/`keys` in `src/data/hooks.ts`, e.g. `manualPriceSnapshots`,
  `assets`, `accounts`) after a successful write so the UI refreshes.
- UI copy: zh-TW, via the project's copy workflow where the file already uses it;
  inline zh-TW matching the surrounding code is acceptable for new inline strings.
- Inline `style={{}}` + `--ns-*` tokens + `Button` from `./coss/button`; reuse
  existing field components (`DrawerField`, `Field`, `NumberField`, `DateTimeField`).

## Commands you will need

| Purpose   | Command                                            | Expected            |
|-----------|----------------------------------------------------|---------------------|
| Install   | `npm install`                                       | exit 0 (revert lockfile churn) |
| Typecheck | `npx tsc --noEmit`                                  | exit 0              |
| Test one  | `npx vitest run src/domain/portfolioCalculator.test.ts src/domain/valuation.test.ts` | all pass |
| Tests     | `npm test`                                           | all pass            |
| Lint      | `npm run lint`                                       | exit 0 (0 errors)   |
| Dev server| `npm run dev`                                        | serves on localhost |

## Scope

**In scope:**
- `src/domain/valuation.ts` — add a `buildManualPriceLookup(snapshots)` helper (latest-at-or-before resolver), exported.
- `src/domain/valuation.test.ts` — tests for the helper.
- `src/domain/portfolioCalculator.ts` — manual branch in `resolveHoldingPrice` + thread `manualPriceLookup` through `HoldingValuation` and both builders.
- `src/domain/portfolioCalculator.test.ts` — custom-asset valuation cases + non-custom regression.
- `src/routes/DashboardRoute.tsx`, `src/routes/InvestmentsRoute.tsx`, `src/routes/HoldingDetailRoute.tsx` — build the lookup from `manualPriceSnapshots` and pass it to every valuation call listed above.
- `src/routes/InvestmentsAddSheet.tsx` — the "custom asset" creation option.
- `src/data/hooks.ts` — only if a `createManualPriceSnapshot` mutation hook needs adding (mirror existing hooks); and route destructuring of `manualPriceSnapshots` if missing.
- `src/data/repositories.ts` — only if `manualHoldingFields` doesn't already copy `assetType` (one-line fix).

**Out of scope (do NOT touch):**
- The per-unit branch in `priceAssetOnDate` (Phase 1 — already done; only call it).
- Cost-basis / FIFO math (`portfolioMetrics.ts`, `fifoCalculator.ts`).
- Sync, benchmark/Alpha, quote refresh.
- Any non-valuation change to the routes beyond passing the lookup + the two new UI surfaces.

## Git workflow
- Base setup as above (`advisor/045-custom-assets-ui` = main + Phase 1 merged).
- Commit per phase: A (wiring+tests), B (create UI), C (log-price UI). Short imperative messages.
- Do NOT push or open a PR.

## Steps

### Phase A — valuation wiring (correctness; do first, with tests)

**A1.** In `src/domain/valuation.ts`, add and export:
```ts
export function buildManualPriceLookup(
  snapshots: { assetId: string; date: string; price: number; currency?: string }[],
): (assetId: string, date: string) => ManualPriceLike | undefined
```
It returns the latest snapshot with `date <= requested date` for that `assetId`
(mirror `findDailyPriceAtOrBefore` semantics), as `{ price, currency }` (default
currency to the asset's — but since snapshots may lack currency, return the
snapshot currency if present, else let the caller's asset currency win; simplest:
return `{ price, currency: snap.currency ?? "" }` and rely on `priceAssetOnDate`'s
`manual.currency || asset.currency`). Pure function.
**Verify**: `npx vitest run src/domain/valuation.test.ts` → pass (add helper tests:
latest-at-or-before, none-before → undefined, empty → undefined).

**A2.** In `src/domain/portfolioCalculator.ts`:
- Extend `HoldingValuation` with `manualPriceLookup?: (assetId: string, date: string) => { price: number; currency: string } | undefined`.
- Give `resolveHoldingPrice` access to the asset's `id`, `assetType`, and the
  `manualPriceLookup`. Add a branch at the top: if `assetType === "custom"`,
  `marketPrice = manualPriceLookup?.(id, asOf)?.price ?? null`, `valuePrice =
  marketPrice ?? averageCost`, and **never** consult quote/close. Non-custom path
  unchanged.
- Pass `asset.id` / `asset.assetType` / `valuation?.manualPriceLookup` from both
  `buildHoldingPositions` and `buildHoldingPositionsByAccount` call sites.
**Verify**: `npx vitest run src/domain/portfolioCalculator.test.ts` → pass.

**A3.** Wire the route callers. In each route, build the lookup once:
`const manualPriceLookup = useMemo(() => buildManualPriceLookup(manualPriceSnapshots), [manualPriceSnapshots])`
(ensure `manualPriceSnapshots` is destructured from `useFinanceData()`), then:
- DashboardRoute `:274` — add `manualPriceLookup` to the `buildHoldingPositions` valuation opts.
- DashboardRoute `:444` — add `manualPriceLookup` to the `priceAssetOnDate` opts (and the memo deps).
- DashboardRoute `buildNetWorthTrend` (`:1453`/`:1469`) — `buildNetWorthTrend` is a
  module function; thread `manualPriceLookup` in as a parameter and pass it to its
  `priceAssetOnDate` calls (add the arg at the call site `:355`-ish). If threading
  it widens the signature awkwardly, an acceptable alternative is to accept a
  `manualPriceSnapshots` array param and call `buildManualPriceLookup` inside —
  pick one, keep it tidy.
- InvestmentsRoute `:118` — add `manualPriceLookup` to the `buildHoldingPositionsByAccount` valuation opts.
- HoldingDetailRoute `:46` — add `manualPriceLookup` to the `priceAssetOnDate` opts (+ memo deps).
**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → all pass.

### Phase B — create a custom asset (InvestmentsAddSheet)

In `src/routes/InvestmentsAddSheet.tsx`, in the snapshot (manual holding) form,
add a toggle/checkbox **「自訂資產（無報價）」**. When ON:
- Do not require a ticker (skip the `請輸入 ticker。` throw at ~272 and the
  `assertExplicitMarketSuffix` call); leave `ticker: ""`.
- Require a `name` instead (throw a clear zh-TW error if empty).
- Set `assetType: "custom"` on the submitted draft.
- Keep the existing quantity / average cost / account fields.
Submit through the existing `createHolding.mutateAsync`. When OFF, the form behaves
exactly as today.
**Verify**: `npx tsc --noEmit` → exit 0. Browser (if available): toggling 自訂資產
hides the ticker requirement; creating one adds a holding with no ticker that
appears in the holdings list (valued at cost until a price is logged).

### Phase C — log / update a manual price (HoldingDetailRoute)

In `src/routes/HoldingDetailRoute.tsx`, when `asset.assetType === "custom"`:
- Render an **「更新價格」** action that opens a small form (price + optional date,
  default today + optional note) and on submit calls
  `repository.createManualPriceSnapshot({ assetId: asset.id, date, price, note })`
  via a mutation hook (mirror `InvestmentsAddSheet.tsx:154`), then invalidates the
  `manualPriceSnapshots` (+ `assets`, `accounts`) query keys so the value refreshes.
- Show the current 手動價格 + its date near the market price (the `priced.source`
  is `"manual"` for custom assets with a snapshot — you can surface a 手動價格 label).
For non-custom assets, render nothing new.
**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → 0 errors. Browser (if
available): on a custom asset, 更新價格 writes a snapshot and the holding's market
value updates to price × quantity.

### Phase D — full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` exit 0.

## Test plan

**`src/domain/valuation.test.ts`** (helper): `buildManualPriceLookup` returns
latest at-or-before; undefined when only later/none.

**`src/domain/portfolioCalculator.test.ts`** (the load-bearing tests — model after
existing cases in that file):
- A custom asset (`assetType: "custom"`, empty ticker) with a manual lookup
  returning a price → `marketPrice`/`marketValue` use that price (not cost, not quote).
- A custom asset with no manual price → values at `averageCost` (not 0, not a quote).
- A custom asset is **not** valued by a passing quote/daily-close even if one
  exists for its (empty) ticker.
- **Regression**: a normal tickered asset is unaffected by adding the
  `manualPriceLookup` option (quote → close → cost order intact) — copy an existing
  case, add a `manualPriceLookup` that returns a price, assert it's ignored.
**Verify**: `npx vitest run src/domain/portfolioCalculator.test.ts src/domain/valuation.test.ts` → all pass.

## Done criteria
ALL must hold:
- [ ] Base = `advisor/045-custom-assets-ui` = main + Phase 1 merged (Phase-1 markers present)
- [ ] `buildManualPriceLookup` exists + tested
- [ ] `portfolioCalculator` values custom assets from manual snapshots → cost; non-custom byte-for-byte unchanged (regression test passes)
- [ ] All listed route call sites pass a `manualPriceLookup`
- [ ] InvestmentsAddSheet can create an `assetType:"custom"` holding without a ticker
- [ ] HoldingDetailRoute can log a manual price for a custom asset and the value updates
- [ ] `npx tsc --noEmit` exit 0; `npm test` exit 0; `npm run lint` 0 errors; `npm run build` exit 0
- [ ] No files outside the in-scope list modified (`git status`)

## STOP conditions
Stop and report (do not improvise) if:
- The Phase-1 merge in Base setup conflicts (was simulated clean — a conflict means main moved).
- Any **existing** `portfolioCalculator.test.ts` or `valuation.test.ts` case changes its expected value (you altered non-custom behavior — regression, not allowed).
- Threading `manualPriceLookup` forces edits outside the in-scope file list.
- A phase's verification fails twice after a reasonable fix attempt. (If Phase A is green but B or C is stuck, COMMIT Phase A, then STOP and report — the tested wiring is independently valuable.)

## Maintenance notes
- For the reviewer: the load-bearing property is **non-custom valuation unchanged** — scrutinize `resolveHoldingPrice` (the custom branch must be gated strictly on `assetType === "custom"`) and that no existing valuation/portfolioCalculator test expectation was edited. Confirm every valuation call site now passes the lookup (a missed one = custom assets silently value at cost there).
- This depends on plan 038 Phase 1; merge order is **038 then 045** (045's branch already contains 038, so merging 045 brings both — or merge 038 first, then 045 fast-forwards the rest).
- Deferred: editing/deleting individual manual price snapshots (history view); a data-health rule for stale custom-asset prices (mirror 報價過期 in `dataHealth.ts`); custom-asset support in the CSV import wizard.
