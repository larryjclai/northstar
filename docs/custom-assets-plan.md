# Custom (manually-priced) assets — design note

Status: Phase 1 (valuation wire-up). Created under Plan 038.

## Chosen decisions

### Decision A — asset identity: empty ticker + `assetType` sentinel
A custom asset is identified by `assetType === "custom"`. `"custom"` is added as a new
value to the `AssetType` union/label map in `src/domain/types.ts`. We do **not** add an
`isManualPriced` field — the existing `assetType` discriminator carries the signal, keeping
the schema and sync surface unchanged. A custom asset typically has an empty `ticker`
(nothing for Yahoo to resolve), which is already excluded from quote refresh.

### Decision B — valuation order: manual snapshot → cost, custom-only
For a custom asset (`assetType === "custom"`), `priceAssetOnDate` resolves:
1. The latest `ManualPriceSnapshot` at-or-before the requested date → `source: "manual"`.
2. Fall back to `averageCost` → `source: "cost"`.

Custom assets **never** consult a live quote or daily close. `"manual"` is a new
`PriceSource` union member.

Non-custom assets keep the existing resolution order **byte-for-byte unchanged**:
live quote (current dates) → daily close at-or-before → average cost.

## Exclusion / participation rules
- **Excluded** from benchmark / Alpha computation.
- **Excluded** from quote refresh (`useMarketRefresh` already skips empty tickers).
- **Still participate** in moving-average cost, realized/unrealized P/L, and the
  net-worth trend (they value through the same canonical `priceAssetOnDate` path).

## Deferred follow-up (NOT in Phase 1)
- The create-custom-asset UI and the "log a manual price" entry form
  (will reuse the existing `createManualPriceSnapshot` repository CRUD).
- A data-health rule flagging stale custom-asset prices.

Phase 1 stops once the valuation math reads manual snapshots correctly and is unit-tested.
