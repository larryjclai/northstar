# DRIP (股息再投入) — design note

> Records the resolved decisions for Plan 059. The operator pre-approved the
> recommended options before implementation began; this note exists to document
> what was chosen and why, per the plan's Step 0.

## What DRIP is

A 「股息再投入 (Dividend Reinvestment Plan)」entry lets the user log a reinvested
dividend **once** instead of recording a 現金股利 (cash dividend) and a 買進 (buy)
separately. Northstar already has every primitive — DRIP is composed from the two
existing investment actions, with **no new finance math**:

- a `cashDividend` record — the dividend amount (income; counted by
  `dividendAnalysis` toward TTM / yield), and
- a `buy` record — the reinvested shares at the reinvestment price (blended into
  moving-average cost by `buildPositionMetrics`).

The dividend credits account cash (+amount); the buy debits it (−qty × price).
Net cash ≈ residual = dividend amount − (qty × price), which stays in the account.

## Decision A — two linked records (RECOMMENDED, CHOSEN)

A DRIP entry is **a `cashDividend` record PLUS a `buy` record on the same asset**,
created atomically by a new repository method `createDividendReinvestment(input)`
(browser + Tauri SQLite), with a **link** between the two records so edit/delete
handles the pair coherently.

- We do **NOT** add a new `InvestmentAction` (`"drip"`). A new action would ripple
  into cost-basis math, dividend analysis, CSV import/export, and every switch over
  `InvestmentAction` — the rejected alternative.
- The link is a new `dripGroupId: string | null` field on `InvestmentRecord`
  (mirroring how a record links its ledger leg via `linkedLedgerTransactionId`).
  Both legs of one DRIP share the same `dripGroupId`. Legacy / non-DRIP records
  have `dripGroupId === null`.
- Delete of either leg deletes **both** legs (and their ledger legs). This keeps
  the dividend and its reinvestment from ever being half-present.
- Edit of a DRIP pair is **deferred** for this plan (no UI path edits a DRIP as a
  unit yet). The legs remain individually deletable-as-a-pair; a future plan can
  add coherent pair editing. This is called out so nothing is silently
  half-editable.

## Decision B — three fields + keep residual (RECOMMENDED, CHOSEN)

The DRIP form captures three numbers:

1. **Reinvested quantity** (Q) — shares bought with the dividend.
2. **Reinvestment price** (P) — price per reinvested share.
3. **Dividend amount** (A) — the total cash dividend received.

Residual cash = `A − (Q × P)` stays in the account (can be 0 for a fully reinvested
dividend). Validation: `Q > 0`, `P > 0`, `A ≥ Q × P`.

**Write order: DIVIDEND FIRST, THEN BUY.** Posting the +A dividend before the
−(Q×P) buy means the buy's purchasing-power check sees the dividend already in the
account, so a fully-reinvested dividend never trips「購買力不足」on a zero-balance
account.

## Out of scope (follow-ups, not built)

- "In kind" dividends (Wealthfolio's third dividend type).
- CSV import/export of DRIP entries.
- Coherent in-place editing of an existing DRIP pair.
