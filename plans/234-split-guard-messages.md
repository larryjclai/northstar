# Plan 234: Render `incompleteSplitGroupIds` in the data-health consumers

> **Executor instructions**: Follow steps exactly; verify each. STOP on mismatch.
> Do NOT update `plans/README.md`.
>
> **Drift check**: `git diff --stat ba4bc966..HEAD -- src/routes/AccountsRoute.tsx src/routes/settings/GeneralSection.tsx`
> Non-empty = compare excerpts before proceeding.

## Status

- **Priority**: P3 · **Effort**: XS · **Risk**: LOW · **Depends on**: none
- **Category**: bug (computed-but-never-rendered report field; found by plan 232)
- **Planned at**: commit `ba4bc966`, 2026-07-19

## Why this matters

`incompleteSplitGroupIds` (半到達的拆分群組, `src/domain/ledgerTrust.ts:180-186`)
has been computed into the recalculation report since plan 221 widened it — but
NO consumer renders it. Plan 232 just wired `incompleteDripGroupIds` messages
into both consumers; the split guard needs the identical two lines.

## Current state

- `src/routes/AccountsRoute.tsx:258` area and
  `src/routes/settings/GeneralSection.tsx:300` area — plan 232's DRIP message
  wiring sits beside the transfer one (grep `incompleteDripGroupIds` in both
  files; that is the exemplar to copy).
- Message convention (232's): `發現 ${n} 筆股利再投入紀錄不完整（同步中，稍後會自動補齊）。`

## Steps

1. In BOTH files, beside the DRIP message, add the split message with the same
   pattern: `發現 ${report.incompleteSplitGroupIds.length} 筆拆分交易不完整（同步中，稍後會自動補齊）。`
   gated on length > 0, matching the neighboring ternary style exactly.

**Verify**: `npx tsc --noEmit` → 0 · `npm run lint` → 0 errors / 761 warnings ·
`npm test` → 1414 pass · `grep -rn "拆分交易不完整" src` → 2 hits.

## Scope

In: the two consumer files. Out: ledgerTrust, types, dashboard dataHealth.

## STOP conditions

- The DRIP wiring from 232 isn't where grep says (structure changed).

## Maintenance notes

- Third guard wired the same way; if a fourth appears, generalize the message
  row (three-strikes threshold now met — note for the next audit).
