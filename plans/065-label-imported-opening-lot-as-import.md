# Plan 065: Show a manual-import opening lot as 「匯入」 (not 「買」) in the 交易紀錄

> **Executor instructions**: Follow this plan step by step. Run every verification
> command. Touch only in-scope files. If a STOP condition occurs, stop and report.
> Commit in the worktree. SKIP plans/README.md. Audit claims against tool results.
> Reply with EXACTLY the report format at the end.
>
> **Drift check (run first)**:
> `git diff --stat a2684392..HEAD -- src/routes/TransactionsRoute.tsx`
> Compare the "Current state" excerpts against live code first.

## Status
- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (display label only)
- **Depends on**: none
- **Category**: bug (UX/display)
- **Planned at**: commit `a2684392`, 2026-06-23

## Why this matters
Operator-reported: a manually-imported holding's opening lot shows in the 交易紀錄 as
「買」 (a buy) — misleading, since it's an import baseline, not a real purchase. It
should read 「匯入」. Its 總額 also shows a cash figure (e.g. −USD 1,433) even though the
opening lot is **cashless** (no cash leg) — that's misleading too.

## Current state
`src/routes/TransactionsRoute.tsx`:
- `actionShortLabels` maps actions to short labels (line ~40): `buy: "買"`, etc.
- `UnifiedTx` (line ~78) does NOT carry `cashless`. Its `actionKey` is the raw action.
- Investment rows are built (~line 132) from records:
```ts
const gross = record.action === "cashDividend" ? record.price : record.price * record.quantity;
const signed = record.action === "buy" ? -gross : gross;
// → UnifiedTx { id, actionKey: record.action, …, signed, … }   (no cashless field)
```
- A manual holding's opening lot is a record with `cashless === true` and
  `id === "inv_open_" + assetId` and `action === "buy"`.
- The row render (~line 595): the type badge is
  `actionShortLabels[tx.actionKey] ?? tx.actionKey`; the total cell renders `tx.signed`
  via `formatMoney` (and `isCash ? "—"` is used for the quantity cell).

## Decision (implement this)
1. Thread `cashless` (and/or an `isOpeningLot` boolean) into `UnifiedTx` from the source
   record (`record.cashless === true`, or `record.id === \`inv_open_${record.assetId}\``).
2. In the type badge: when the row is a cashless opening lot, show **「匯入」** instead of
   「買」 (e.g. a label override before `actionShortLabels`). Keep `actionKey` as-is so
   the type filter/sort are unaffected (an opening lot is still internally a buy).
3. In the total cell: when the row is a cashless opening lot, show **「—」** (no cash
   figure) instead of the −price×qty amount, since it's cashless. (Set `signed = 0` for
   the opening lot, or special-case the total render.)

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev (visual) | `npm run dev` | serves 127.0.0.1 |

## Scope
**In scope:** `src/routes/TransactionsRoute.tsx` — add `cashless`/`isOpeningLot` to
`UnifiedTx`, the 「匯入」 badge label, and the 「—」 total for cashless opening lots.
**Out of scope:**
- The data model / `record.cashless` (already correct) — just read it.
- `actionShortLabels` for real buys/sells/dividends (unchanged).
- The cash-flow ledger 近期動態 (different component).
- Cost-basis / valuation / dividend math.

## Git workflow
- Branch from current main: `git checkout -B advisor/065-import-opening-lot-label main`.
- Short imperative commit. Do NOT push/PR.

## Steps
### Step 1: thread the flag + relabel
Add `cashless` (or `isOpeningLot`) to `UnifiedTx` and set it in the investment-row
mapping from the source record. In the badge render, show 「匯入」 for a cashless
opening lot; in the total cell, show 「—」 for it. Keep `actionKey`/filters intact.
**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.
### Step 2: visual check
Run dev; 投資 → 交易紀錄, find an imported holding's opening lot → type reads 「匯入」,
total reads 「—」; real buys/sells/dividends are unchanged. (If no preview, code
inspection + gates; say so.)
### Step 3: full verification
`npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0.

## Test plan
- If you extract a tiny pure helper (e.g. `txTypeLabel(tx)` / `isImportOpeningLot(record)`),
  unit-test: a cashless opening-lot buy → 「匯入」 + neutral total; a normal buy → 「買」 +
  signed total; sell/dividend unchanged. Otherwise verify visually + gates.
- Existing tests stay green.

## Done criteria
- [ ] A manual-import opening lot shows type 「匯入」 (not 「買」) and total 「—」 in 交易紀錄
- [ ] Real buys/sells/dividends are unchanged (label + total)
- [ ] Type filter/sort still work (opening lots not broken out of the buy bucket)
- [ ] `npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0
- [ ] Only `src/routes/TransactionsRoute.tsx` (+ optional helper/test) modified

## STOP conditions
- Cited code doesn't match (drift since `a2684392`).
- `UnifiedTx`/records don't expose `cashless` and there's no reliable opening-lot signal
  — report (don't guess; the `inv_open_<assetId>` id is the fallback signal).

## Maintenance notes
- Reviewer: confirm only the DISPLAY changed for cashless opening lots; real trades
  untouched; filters still work.
- If opening lots later get their own filter chip, build on the flag added here.
