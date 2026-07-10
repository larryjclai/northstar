# Plan 141: Finish the custom-asset story — stale-price data-health rule + entry-flow gap check

> **Executor instructions**: Follow this plan step by step. FIRST read
> `docs/custom-assets-plan.md` (the Phase 1 design this completes). Run every
> verification command. On a STOP condition, stop and report. Update this
> plan's status row in `plans/README.md` when done — unless a reviewer told
> you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/domain/dataHealth.ts src/routes/InvestmentsAddSheet.tsx src/routes/HoldingEditModal.tsx src/routes/HoldingDetailRoute.tsx`
> Re-locate by grep; STOP on shape mismatch.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (finish half-shipped capability)
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Custom assets (manually-priced holdings — unlisted funds, real assets) shipped
their valuation engine in Phase 1 (`docs/custom-assets-plan.md`): the type,
snapshot CRUD, and `priceAssetOnDate` integration are built and tested.
**Planning-time correction**: the original audit finding claimed "no entry
UI exists" — that is STALE. Verified: `InvestmentsAddSheet.tsx:304` creates
holdings with `assetType: "custom"` (snapshot mode, ~:140), and
`HoldingEditModal.tsx` has a full manual-price snapshot form (date/price/note
→ `createManualPriceSnapshot`, ~:26-58), with `HoldingDetailRoute.tsx:74`
custom-aware. What remains from the design doc's own deferred list:

> **Deferred follow-up (NOT in Phase 1)**
> - The create-custom-asset UI and the "log a manual price" entry form ✅ (now exists)
> - A data-health rule flagging stale custom-asset prices ← **still missing**

A custom asset whose last snapshot is months old silently contributes a stale
value to net worth with no signal — the same silent-wrongness class as the FX
gap (plan 121). This plan adds the staleness rule and walks the existing
entry flow end-to-end to catch discoverability gaps.

## Current state

- `src/domain/dataHealth.ts` — the data-health rule engine (has a
  missing-FX-rate rule ~line 216). Read its rule shape (how rules produce
  issues: id, severity, message, affected entities) and its test file
  `dataHealth.test.ts` for the pattern.
- Where data-health issues surface in UI: grep `dataHealth` in src/routes —
  find the consuming surface (likely Dashboard or Settings) so the new rule
  appears there automatically.
- Custom-asset valuation: `priceAssetOnDate` path reads
  `manualPriceSnapshots` (see `src/domain/valuation.ts` usage of
  `manualPriceLookup`).
- Snapshot type: `ManualPriceSnapshot` in `src/data/repositories.ts` /
  domain types (has date/price/note/assetId — verify fields).

## Commands

`npx tsc` (exit 0), `npm test` (all pass), `npm run lint` (exit 0).

## Scope

**In scope**:
- `src/domain/dataHealth.ts` + `dataHealth.test.ts` — the new rule
- The flow walk (Step 3) — REPORT ONLY; small copy fixes (≤5 lines, e.g. a
  missing hint) allowed, anything bigger becomes a reported follow-up
- `docs/custom-assets-plan.md` — tick the deferred items with a dated note

**Out of scope**:
- New entry forms (exist); valuation math; snapshot CRUD; anything in
  InvestmentsAddSheet/HoldingEditModal beyond copy.

## Git workflow

Branch `feat/ai-custom-asset-staleness`; commits
`feat(data-health): stale custom-asset price rule` +
`docs(custom-assets): mark deferred items done`. No push/merge.

## Steps

1. **The rule**: in `dataHealth.ts`, add: for each non-deleted asset with
   `assetType === "custom"` and `totalQuantity > 0`, find its latest manual
   snapshot; if none, or `latest.date` older than a threshold, emit an issue.
   Threshold: 90 days (a quarter — manual assets reprice slowly; make it a
   named constant `CUSTOM_PRICE_STALE_DAYS = 90` so it's tunable). Severity:
   match the missing-FX rule's level. Message (zh-TW, match the file's
   voice): 「自訂資產「{name}」的價格已 {N} 天未更新」 / no-snapshot variant
   「自訂資產「{name}」尚未記錄任何價格」. "Today" must come from the
   function's existing clock/params — read how other rules get the current
   date (if they take a `now` param, use it; do NOT introduce a raw
   `new Date().toISOString()` — see plan 120's convention).
2. **Tests**: fresh snapshot → no issue; 91-day-old snapshot → issue;
   zero-quantity custom asset → no issue; non-custom asset with old
   snapshots → no issue; no snapshots → the no-snapshot variant. Model on
   existing `dataHealth.test.ts` cases.
   **Verify**: `npm test -- dataHealth` → all pass.
3. **Flow walk**: in the dev shell, create a custom asset via
   InvestmentsAddSheet's snapshot mode, log a price via HoldingEditModal,
   view HoldingDetail. Record in the report: can a user DISCOVER the
   custom-asset option without docs? Does the stale warning show where a user
   would see it? List concrete gaps as follow-up candidates (do not fix,
   except ≤5-line copy). If headless, do a code-path walk instead and mark
   the live walk for the operator.
4. **Docs tick** + full gates.
   **Verify**: `npm test`, `npx tsc`, `npm run lint` green.

## Done criteria

- [ ] Staleness rule with 5 passing tests; surfaces on the existing
      data-health UI
- [ ] No new raw-UTC date reads
- [ ] Flow-walk report with discoverability verdict + gap list
- [ ] custom-assets-plan.md deferred list updated
- [ ] `plans/README.md` updated

## STOP conditions

- dataHealth rules have no access to `manualPriceSnapshots` in their input
  shape — report the wiring needed (its callers assemble the inputs; adding
  a field there touches N call sites — count first).
- The data-health UI surface turns out to be unbuilt (rules computed but
  never rendered) — that's a bigger finding; report it.

## Maintenance notes

- If FIRE/projection features later consume custom assets, staleness matters
  more — the constant is the tuning knob.
- Reviewer: the "latest snapshot" pick must use string-date comparison
  consistent with the valuation path's pick (same ordering rules).
