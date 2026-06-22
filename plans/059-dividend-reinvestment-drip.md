# Plan 059: 股息再投入 (DRIP) — record a dividend + its reinvestment in one entry

> **Executor instructions**: This is a **feature with a small design gate**.
> Phase 0 records two decisions; get operator sign-off before building. The data
> layer has **two implementations** (browser + Tauri SQLite) — keep them
> identical. Run every verification command and confirm the expected result. If
> anything in "STOP conditions" occurs, stop and report. When done, update this
> plan's row in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/routes/InvestmentsAddSheet.tsx src/data/repositories.ts src/domain/dividendAnalysis.ts src/domain/portfolioMetrics.ts`
> If these changed since this plan was written, compare the "Current state"
> excerpts against live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (creates two linked records + cash legs; must keep dividend
  analysis + cost basis correct, and cash net-neutral)
- **Depends on**: none (composes cleanly with plan 058 if both land)
- **Category**: feature
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Operator-reported: when recording a dividend, they want a 「股息再投入」(dividend
reinvestment / DRIP) option like Wealthfolio (screenshot: Dividend type =
Cash / DRIP / In kind, with *Reinvested quantity*, *Reinvestment price*,
*Dividend amount*) — so a reinvested dividend can be logged **once** instead of
recording it twice (a 現金股利 and then a 買進).

The good news: Northstar already has every primitive. A DRIP is just **a cash
dividend (income) + a reinvestment buy** on the same asset:
- `cashDividend` records the income (counts toward `dividendAnalysis` TTM/yield).
- `buy` adds shares and blends into moving-average cost.
- The dividend credits account cash (+amount) and the buy debits it
  (−qty×price) → **net cash ≈ 0** when fully reinvested.
So DRIP needs **no new finance math** — it's a UI mode + a helper that creates the
two existing records together. This reuses dividend analysis, cost basis, and the
net-worth trend unchanged.

## Current state

`src/routes/InvestmentsAddSheet.tsx` — the entry sheet. The 股利 side already has a
**現金股利 / 股票股利 sub-toggle** (so adding a third DRIP mode is natural):

```ts
// line 47-52
type TxSide = "buy" | "sell" | "dividend" | "split" | "reduction";
const SIDE_TO_ACTION: Record<TxSide, InvestmentAction> = { buy: "buy", /*…*/ dividend: "cashDividend", /*…*/ };
// line 97-101 — per-action normalization:
//   cashDividend: `price` holds the TOTAL dividend amount; quantity = 0
//   stockDividend (配股): `quantity` = shares received; price/fee = 0
// line 584-595 — the 現金股利 vs 股票股利 ToggleGroup
// line 295-312 — submitTransaction(): validates then createRecord.mutateAsync(payload)
```

`src/data/repositories.ts` — `createInvestmentRecord(input)` (browser, `:977`)
creates ONE investment record (+ an optional linked ledger cash leg via
`createInvestmentLedgerRow`), then `recompute()`. The Tauri SQLite override is at
`:2290`. There is **no** method that creates two linked records atomically today.

`src/domain/dividendAnalysis.ts` — counts `cashDividend` records (`:59`); a DRIP's
cash-dividend leg will be counted automatically.

`src/domain/portfolioMetrics.ts` — `buildPositionMetrics` blends `buy` records into
moving-average cost; the reinvestment buy leg works automatically.

`InvestmentAction` (`src/domain/types.ts:3`):
`"buy" | "sell" | "cashDividend" | "stockDividend" | "capitalReduction" | "stockSplit"`.

### Conventions to follow

- **Finance correctness invariant**: explainable + tested; don't change cost-basis
  or dividend math. DRIP must (a) count the dividend in `dividendAnalysis`, (b)
  blend the reinvestment into average cost, (c) net cash to ~0 (no phantom
  external cash), (d) increase shares by the reinvested quantity.
- **Two impls in lockstep** (browser + SQLite) for any new repository method.
- The two legs should be **linked** (so editing/deleting one is coherent) — mirror
  how an investment record links its ledger leg (`linkedLedgerTransactionId`); for
  the two investment records, add/reuse a link field or a shared group id.
- zh-TW copy; reuse the existing 股利 sub-toggle UI pattern. English eyebrow ok.
- Cash purchasing-power check (`validateInvestmentDraft` buy path) must pass — the
  dividend (credit) must be applied before the buy (debit), or the pair recorded
  as a single cash-neutral unit. Decide in Phase 0.

## Decision gate (Phase 0 — REQUIRED before building)

Write a short note at `docs/drip-plan.md`; get operator sign-off.

**Decision A — data shape of a DRIP entry.**
- **(Recommended)** Two linked records on the asset: a `cashDividend` (amount) +
  a `buy` (reinvested qty @ reinvestment price), created atomically by a new
  repository helper `createDividendReinvestment(input)` (browser + SQLite), with a
  link between them so edit/delete handles the pair. Pros: reuses ALL existing
  math (dividend analysis, cost basis, cash). Cons: a new repo method in two impls.
- (Alternative) A new `InvestmentAction` (e.g. `"drip"`). Rejected unless the
  operator insists — it forces every action-switch site (cost basis, dividend
  analysis, UI labels, CSV import/export) to learn a new case, for no math benefit.

**Decision B — cash semantics & the reinvestment price.**
- The dividend credits the account (+amount); the reinvestment buy debits it
  (−qty×price). If the user enters all three (amount, qty, price), residual cash =
  amount − qty×price stays in the account (correct: brokers leave the unreinvested
  remainder as cash). Confirm: do we require amount, or derive it? **Recommend**:
  require *reinvested quantity* + *reinvestment price* (the buy) and *dividend
  amount* (the income); residual = amount − qty×price (can be 0). Order the writes
  dividend-then-buy so the buy's purchasing-power check passes, OR mark the pair
  cash-neutral. State the chosen ordering.

**Gate**: STOP after the note; get sign-off before Phase 1.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Test (repo) | `npx vitest run src/data/repositories.investments.test.ts` | all pass |
| Test (div) | `npx vitest run src/domain/dividendAnalysis.test.ts` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev server (visual) | `npm run dev` | serves on 127.0.0.1 |

## Scope

**Phase 1 (after the gate) — In scope:**
- `src/data/repositories.ts` — `createDividendReinvestment` (or chosen shape) in
  the browser impl AND the Tauri SQLite override; the link between the two
  records; coherent edit/delete of the pair.
- `src/routes/InvestmentsAddSheet.tsx` — a third 股利 mode 「股息再投入 (DRIP)」
  with fields for reinvested quantity, reinvestment price, dividend amount;
  validation; submit calls the new helper.
- Tests: `src/data/repositories.investments.test.ts` (+ a DRIP case);
  `src/domain/dividendAnalysis.test.ts` if needed.

**Out of scope (do NOT touch):**
- `buildPositionMetrics` cost-basis math / `dividendAnalysis` aggregation — they
  consume the two records as-is; no change.
- The existing 現金股利 / 股票股利 behaviors — additive only.
- "In kind" dividends (Wealthfolio's third type) — not requested; note as a
  possible follow-up, don't build.
- CSV import/export of DRIP — follow-up (note it).

## Git workflow

- Branch from current main: `git checkout -B advisor/059-drip main`.
- Commit the design note separately from code. Match the repo's short imperative
  commit style. Do NOT push/PR unless told.

## Steps

### Step 0 (gate): design note + sign-off
Write `docs/drip-plan.md` (Decisions A/B). **STOP for sign-off.**

### Step 1: repository helper (both impls)
Add `createDividendReinvestment(input)` creating a linked `cashDividend` + `buy`
on the same asset (resolve the asset the same way `createInvestmentRecord` does),
ordered so the buy's purchasing-power check passes; mirror in the SQLite override.
Make edit/delete of the pair coherent (deleting the DRIP removes both legs).

**Verify**: `npx vitest run src/data/repositories.investments.test.ts` → all pass,
including a NEW DRIP test (see Test plan).

### Step 2: DRIP mode in the entry sheet
Add 「股息再投入 (DRIP)」to the 股利 sub-toggle. Show reinvested quantity,
reinvestment price, dividend amount; validate (qty>0, price>0, amount≥qty×price or
per Decision B); submit via the new helper. Keep 現金股利 / 股票股利 unchanged.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors; visually, selecting
DRIP shows the right fields and submitting creates one position increase + a
counted dividend with ~net-zero cash.

### Step 3: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0.

## Test plan

In `src/data/repositories.investments.test.ts`:
- A DRIP entry (amount A, qty Q @ price P, fully reinvested A=Q×P) creates a
  `cashDividend` (+A) and a `buy` (Q@P); the position quantity rises by Q with
  blended cost; `dividendAnalysis` counts A; the linked account's cash net change
  ≈ 0.
- Partial reinvestment (A > Q×P): residual cash = A − Q×P remains; dividend still
  counts A in full.
- Deleting the DRIP removes BOTH legs (no orphan dividend or buy).
- Editing the DRIP updates both legs coherently (if edit is supported per
  Decision A; if deferred, assert it's not silently half-editable).

## Done criteria

ALL must hold:

- [ ] `docs/drip-plan.md` records the operator's A/B choices
- [ ] A DRIP entry records the dividend (counted in `dividendAnalysis`) AND the
      reinvestment buy (blended into cost), in one action, cash net ≈ 0
- [ ] Delete removes both legs; browser ≡ SQLite behavior
- [ ] `buildPositionMetrics` / `dividendAnalysis` math unchanged (no existing
      test's expected value edited)
- [ ] `npx tsc --noEmit` exits 0; `npm test` all pass; `npm run lint` 0 errors;
      `npm run build` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `8f2e90bd`).
- Implementing DRIP appears to require a new `InvestmentAction` rippling into cost
  basis / dividend analysis / CSV — that's the rejected alternative; stop and
  confirm Decision A before widening scope.
- You cannot order the two writes so the buy's purchasing-power check passes
  without a phantom balance — report; the cash-neutral pairing needs an operator
  decision.
- Browser and SQLite impls would diverge — report (sync drift risk).

## Maintenance notes

- For the reviewer: the elegance is **no new math** — verify DRIP is just a linked
  `cashDividend` + `buy`, dividend analysis + cost basis untouched, cash net ≈ 0,
  and the two legs are deleted/edited as a unit.
- Deferred follow-ups: "In kind" dividend type; CSV import/export of DRIP rows;
  surfacing DRIP distinctly in the 交易紀錄 list (it'll currently show as two
  rows — acceptable for v1; note if the operator wants them grouped).
- Composes with plan 058 (asset identity): DRIP resolves its asset the same way a
  normal trade does, so it benefits from 058's merge fix automatically.
