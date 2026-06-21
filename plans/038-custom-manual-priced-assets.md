# Plan 038: Custom (manually-priced) assets — track funds/holdings not on Yahoo

> **Executor instructions**: This is a **design-first plan with a decision
> gate**. Phase 0 produces a short design note and requires operator sign-off
> on two decisions before any code is written. Do NOT skip to Phase 1 until the
> gate is resolved. Follow the plan step by step; run every verification command
> and confirm the expected result. If anything in "STOP conditions" occurs, stop
> and report. When done, update this plan's row in `plans/README.md` unless a
> reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 13f6a723..HEAD -- src/domain/valuation.ts src/domain/types.ts src/features/market-data/useMarketRefresh.ts src/data/marketDataStore.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (design + phase-1 wire-up; the full UI is a follow-up)
- **Risk**: MED (touches the canonical valuation path — finance correctness)
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `13f6a723`, 2026-06-20

## Why this matters

`ROADMAP.md` 規劃中 lists: *"投資可自訂資產代號（或自訂投資資產），才可以支援一些不在
Yahoo API 的基金類型資產"*. Today every priced holding resolves its value from a
Yahoo-backed quote or daily close (`src/domain/valuation.ts`); a holding with no
recognized ticker silently falls back to **average cost** and never reflects its
real value. Taiwanese users hold mutual funds, insurance-linked products, 儲蓄險,
private positions, and foreign funds that Yahoo doesn't quote — these appear
frozen at cost, which quietly breaks the net-worth picture the whole app exists
to give. This also honors invariant #3 (market-data providers are replaceable):
a value should be representable without *any* provider.

The good news from recon: **the storage layer already exists.** There is a
`manual_price_snapshots` table, a `ManualPriceSnapshot` type, and full
repository CRUD (`listManualPriceSnapshots` / `createManualPriceSnapshot` /
`deleteManualPriceSnapshot`). It is simply **not read by valuation and has no
UI.** So this is mostly a wire-up + a clean identity decision, not new infra.

## Current state

Files and roles:

- `src/domain/types.ts` — `PortfolioAsset` (line 152) is a held position;
  `ManualPriceSnapshot` (line ~364) is `{ id, assetId, date, price, note,
  createdAt }`. `AssetType` is the enum on `PortfolioAsset.assetType`.
- `src/domain/valuation.ts` — **the canonical per-unit valuation**.
  `priceAssetOnDate(asset, date, opts)` resolves: live quote (if `date >=
  today`) → daily close at-or-before `date` → `asset.averageCost` (source
  `"cost"`). There is **no** manual-snapshot branch here today.
- `src/features/market-data/useMarketRefresh.ts` — builds the quote-refresh
  symbol set from `assets.map(a => a.ticker)` and **already skips assets whose
  `ticker.trim()` is empty** (line ~86: `if (!asset.ticker.trim()) return false`).
  So an asset with no ticker is already excluded from Yahoo refresh.
- `src/data/marketDataStore.ts` — manual-snapshot CRUD lives here (lines
  149–168), surfaced on the repository (`repositories.ts:1330-1332`,
  interface at 278–280). `manualPriceSnapshots` is part of `RepositoryData`.
- `src/data/migrations.ts:197-206` — the `manual_price_snapshots` table +
  `idx_manual_price_snapshots_asset_date`.

`PortfolioAsset` (types.ts:152-181) — relevant fields:

```ts
export interface PortfolioAsset extends SyncFields {
  ticker: string;
  name: string;
  nameZh: string | null;
  currency: CurrencyCode;
  totalQuantity: number;
  averageCost: number;
  holdingSource: "manual" | "transactions";
  assetType: AssetType | null;
  accountId: string | null;
  baseQuantity: number | null;
  // ...
}
```

`priceAssetOnDate` today (`valuation.ts`, around line 92):

```ts
export function priceAssetOnDate(asset, date, opts): AssetPrice {
  const d = date.slice(0, 10);
  const isCurrent = d >= opts.todayIso;
  if (isCurrent && opts.quote && Number.isFinite(opts.quote.price) && opts.quote.price > 0) {
    return { value: opts.quote.price, currency: opts.quote.currency || asset.currency, source: "quote" };
  }
  const close = findDailyPriceAtOrBefore(opts.dailyPriceLookup, asset.ticker, d);
  if (close) {
    return { value: close.close, currency: close.currency || opts.quote?.currency || asset.currency, source: "close" };
  }
  return { value: asset.averageCost, currency: asset.currency, source: "cost" };
}
```

### Conventions to follow

- **Finance correctness invariant** (`AGENTS.md` #1, `ROADMAP.md` 執行原則 #1):
  calculations must be explainable and testable; every domain change ships unit
  tests; do not silently change financial math. `valuation.ts` is the single
  source of truth that keeps trend, holdings value, and net worth in agreement —
  adding a branch here is exactly the kind of change that needs tests + a clear
  `source` label.
- `AssetPrice.source` is a typed union `"quote" | "close" | "cost"`
  (`valuation.ts:73`). If manual pricing becomes a distinct source, extend that
  union and handle the new value everywhere it's switched on (grep for it).
- Manual snapshots are already a synced entity (in `RepositoryData`); reuse the
  existing CRUD — do NOT add a new table.

## Decision gate (Phase 0 — REQUIRED before any code)

Write a short design note at `docs/custom-assets-plan.md` and get operator
sign-off on these two decisions. Recommend the first option of each; let the
operator override.

**Decision A — how is a "custom / manually-priced" asset identified?**
- **(Recommended) By empty ticker + `assetType` sentinel.** A custom asset has
  no Yahoo ticker; mark it with a dedicated `AssetType` value (e.g. `"custom"`)
  so the UI and valuation can detect it explicitly rather than inferring from a
  blank string. Pros: no schema change to `PortfolioAsset` beyond an enum value;
  `useMarketRefresh` already skips empty tickers. Cons: enum migration for old
  rows (none exist yet → trivial).
- (Alternative) Add an explicit `isManualPriced: boolean` field to
  `PortfolioAsset`. Clearer flag, but a schema/sync field addition + backfill.

**Decision B — valuation resolution order for a custom asset.**
- **(Recommended)** For a custom asset, resolve: latest `ManualPriceSnapshot`
  at-or-before `date` (new source `"manual"`) → `averageCost` (`"cost"`). Never
  consult quote/daily-close for custom assets (they have no ticker). For
  non-custom assets, the existing order is unchanged.
- (Alternative) Let manual snapshots override *any* asset (even tickered ones)
  when present. More flexible but muddies "where did this number come from"; not
  recommended for v1.

The note must also state: custom assets are **excluded from benchmark/Alpha and
quote-refresh** (they have no market series), and must still participate in
moving-average cost, realized/unrealized P/L, and the net-worth trend.

**Gate**: STOP after writing the note and present both decisions to the operator.
Do not proceed to Phase 1 until they pick. Record the chosen options at the top
of the design note.

## Commands you will need

| Purpose   | Command                                  | Expected on success   |
|-----------|------------------------------------------|-----------------------|
| Typecheck | `npx tsc --noEmit`                       | exit 0                |
| Tests     | `npm test`                               | all pass              |
| Test one  | `npx vitest run src/domain/valuation.test.ts` | all pass         |
| Lint      | `npm run lint`                           | exit 0 (0 errors)     |

## Scope

**Phase 1 (after the gate) — In scope:**
- `src/domain/valuation.ts` — add the custom-asset branch + (if chosen) the
  `"manual"` `PriceSource`.
- `src/domain/valuation.test.ts` — new cases (see Test plan).
- `src/domain/types.ts` — only the minimal identity change chosen in Decision A
  (an `AssetType` value, or an `isManualPriced` field).
- Wherever `PriceSource` / `AssetPrice.source` is switched on — grep
  (`grep -rn '"cost"\|"close"\|"quote"' src/domain src/routes`) and update any
  exhaustive switch/label map so the new source renders.

**Out of scope (deferred to a follow-up plan — do NOT build here):**
- The full create-custom-asset UI and the "update manual price" entry form.
  Phase 1 stops at: the math reads manual snapshots correctly and is tested. The
  UI to *create* a custom asset and *log* a price is a separate plan (note it in
  the design doc). Rationale: the valuation correctness change is the risky part
  and must land independently with tests before any UI rides on it.
- Any change to benchmark/Alpha computation, quote refresh (it already skips
  empty tickers), or sync (manual snapshots already sync).
- FIFO/cost-basis math (`portfolioMetrics.ts`, `fifoCalculator.ts`) — untouched.

## Git workflow

- Branch from current main: `git checkout -B advisor/038-custom-assets main`.
- Commit the design note separately from Phase 1 code.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 0 (gate): design note + operator decision
Write `docs/custom-assets-plan.md` covering Decisions A and B above, with the
recommended options and the exclusion rules. **STOP and get sign-off.**

### Step 1: encode the identity (per Decision A)
Apply the minimal chosen change in `types.ts`. If adding an `AssetType` value,
add it to the enum and confirm no exhaustive switch breaks (`npx tsc --noEmit`
will flag any). If adding `isManualPriced`, follow the existing optional-field
convention (e.g. `bankBrandDomain?` on `Account`) so old data loads.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: teach `priceAssetOnDate` to read manual snapshots
Add a manual-snapshot lookup to `PriceAssetOptions` (a
`manualPriceLookup?: (assetId: string, date: string) => { price: number;
currency: string } | undefined`, mirroring the existing `dailyPriceLookup`
seam), and branch at the **top** of `priceAssetOnDate`: if the asset is custom
(per Decision A), return the latest manual snapshot at-or-before `date` with
`source: "manual"`, else fall through to `averageCost`. Do **not** alter the
existing quote/close/cost order for non-custom assets.

Wire `holdingsMarketValue` (and any other caller that builds `PriceAssetOptions`)
to pass the manual lookup, sourced from `repo.listManualPriceSnapshots()`.

**Verify**: `npx vitest run src/domain/valuation.test.ts` → all pass.

### Step 3: surface the new source label
Update any place that renders `AssetPrice.source` or switches on
`PriceSource` so `"manual"` shows a sensible zh-TW label (e.g. 「手動價格」).
Find them: `grep -rn 'source === "cost"\|PriceSource\|"close"' src/`.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → 0 errors.

### Step 4: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0 errors.

## Test plan

Add to `src/domain/valuation.test.ts` (model new cases after the existing
`priceAssetOnDate` tests there):

- custom asset **with** a manual snapshot at-or-before the date → price = that
  snapshot's price, `source === "manual"`.
- custom asset with snapshots **only after** the date → falls back to the most
  recent at-or-before; if none, `source === "cost"` (= averageCost).
- custom asset with **no** snapshots → `source === "cost"`.
- **regression**: a normal tickered asset is unaffected — quote still wins for
  today, daily close for past dates, cost as last resort (copy an existing case
  and assert it still passes).
- `holdingsMarketValue` with a mix of one tickered + one custom asset sums both
  correctly in primary currency.

Verification: `npx vitest run src/domain/valuation.test.ts` → all pass,
including the new cases.

## Done criteria

ALL must hold:

- [ ] `docs/custom-assets-plan.md` exists and records the operator's chosen A/B options
- [ ] `priceAssetOnDate` returns a manual-snapshot price (`source` per Decision B)
      for a custom asset that has one; non-custom assets are byte-for-byte
      unaffected in behavior
- [ ] New `valuation.test.ts` cases exist and pass
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] No files outside the Phase-1 in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The operator has not signed off on Decisions A and B (do not guess the
  identity model — it shapes sync and migrations).
- The code at the cited lines doesn't match the excerpts (drift since `13f6a723`).
- Adding the `"manual"` source forces changes in files outside the in-scope grep
  set (e.g. it ripples into sync or cost-basis) — stop and report; that means
  the seam is wider than planned.
- Any existing `valuation.test.ts` case changes its expected value (you've
  altered non-custom behavior — that's a regression, not allowed).

## Maintenance notes

- For the reviewer: the load-bearing property is that **non-custom valuation is
  unchanged**. Scrutinize that the custom branch is gated tightly (only fires
  for assets identified per Decision A) and that no existing test's expectation
  was edited.
- Deferred follow-up (write as plan 0xx): the create-custom-asset UI and the
  "log a manual price" form (reuse `createManualPriceSnapshot`); a data-health
  rule that flags custom assets whose latest manual price is stale (mirror the
  existing 報價過期 rule in `dataHealth.ts`).
- If sync ever introduces field-level merge (ROADMAP 5.3 ③), manual snapshots
  are already synced entities and need no special handling, but custom-asset
  identity (the enum value / flag) must survive a round-trip — add it to any
  sync normalizer test.
