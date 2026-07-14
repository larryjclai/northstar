# Plan 193: 帳本 Phase 2b-2 — 發票報表：帳齡/DSO、本期應繳營業稅卡、雙月 401 彙總

> **Executor instructions**: Follow step by step, verify each step, honor
> STOP conditions, touch only in-scope files. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Read first**: `docs/ledger-books-plan.md` §3 (帳齡 + 收款指標 · Bimonthly
> 銷項稅額 summary). Committed to main.
>
> **Drift check (run first)**:
> `git diff --stat 96f56bfa..HEAD -- src/routes/CashFlowRoute.tsx src/domain/types.ts`
> Also REQUIRED: plan 191 merged — `grep -n "listInvoices" src/routes/CashFlowRoute.tsx` must succeed. If absent, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Depends on**: 190 (MERGED — Invoice fields), 191 (MERGED — invoice creation + `listInvoices` wired into CashFlow), 194 (MERGED — unsettled rows visible)
- **Category**: direction (books Phase 2b-2 — the reporting layer; completes Phase 2)
- **Planned at**: commit `96f56bfa`, 2026-07-13

## Why this matters

Plan 191 lets the operator 開發票 and track settle. This adds the numbers he
asked for (design §3, operator-confirmed): **帳齡** (aging 30/60/90),
**DSO** (平均收款週期), a **本期應繳營業稅** reminder, and the **雙月 401
彙總** (bimonthly 銷項稅額 for tax filing). All read the `invoices` already
created by 191 — no new entity, no schema change. This completes 帳本 Phase 2.

## Current state (verified at `96f56bfa`)

- `Invoice` (`src/domain/types.ts:~115-130`): `bookId, clientId,
  invoiceNumber, issueDate, dueDate: string|null, amount, taxExclusiveAmount,
  taxAmount, settledAt: string|null, linkedLedgerTransactionId`. `settledAt`
  is stamped by 191's settle wiring; `dueDate` set at 開發票.
- `listInvoices()` is already fetched in `CashFlowRoute.tsx` (191 added a
  local `useQuery(["invoices"], ...)` — grep `listInvoices` there). The
  active book + `kind === "company"` gate exists (191: `isActiveCompanyBook`).
- The 未結清 card sits in the CashFlow right column (`~1627`). The new
  reporting cards belong near it, gated to company books.
- Annual report (`AnnualReportRoute.tsx`) is INVESTMENT tax (證交所得/股利) —
  do NOT put 營業稅 there; it's a different tax. 401 lives in CashFlow's
  company-book view.
- Date helpers: `todayInTimezone`, date utils in `src/domain` (grep). Bimonthly
  periods: 1-2月, 3-4月, 5-6月, 7-8月, 9-10月, 11-12月.

## Commands you will need

| Purpose   | Command              | Expected |
|-----------|----------------------|----------|
| Install   | `npm install`        | exit 0   |
| Typecheck | `npx tsc --noEmit`   | exit 0   |
| Tests     | `npm test`           | all pass (1228 + new) |
| Lint      | `npm run lint`       | exit 0   |

## Scope

**In scope**:
- `src/domain/invoiceReporting.ts` (+ `.test.ts`) — ALL the math, pure:
  - `agingBuckets(invoices, todayIso): { bucket: "current"|"d30"|"d60"|"d90"|"over90"; count; total }[]`
    over invoices with `settledAt === null` (unpaid), bucketing `today −
    dueDate` (invoices with no dueDate → a "no-due" bucket or "current" —
    pick one, document it).
  - `daysSalesOutstanding(invoices, { windowMonths = 12, todayIso }): number | null`
    — mean of `(settledAt − issueDate)` in days over invoices settled within
    the trailing window; null when none.
  - `outstandingSalesTax(invoices, periodOf(todayIso)): number` — SUM
    `taxAmount` of invoices issued in the current bimonthly period
    (issuance-based, NOT settle-based — §3).
  - `bimonthly401Summary(invoices, year): { period: string; taxableSales:
    number; salesTax: number }[]` — SUM `taxExclusiveAmount` and `taxAmount`
    grouped by the 6 two-month periods, over invoices whose `issueDate` is in
    that period+year.
- `src/routes/CashFlowRoute.tsx` — render, gated to `isActiveCompanyBook`:
  a 帳齡 card (buckets + DSO), a 本期應繳營業稅 reminder card, and a 401 雙月
  彙總 table (current year). Read from the existing `listInvoices` query.

**Out of scope**:
- Any repository/sync/schema/migration change (all data exists).
- Editing invoices, client management (191), the 開發票 flow (191).
- Non-company-book surfaces (gate everything to `isActiveCompanyBook`).
- 進項稅額 / 營所稅 / e-invoice / a printable 401 form (future work).

## Git workflow
- Branch `feat/ai-invoice-reporting` off `main`. Conventional commits (math, then UI). Do NOT push/PR.

## Steps

### Step 1: Pure reporting module + tests FIRST
Implement `invoiceReporting.ts` and test each function with a fixed invoice
fixture + a fixed `todayIso`:
- aging: an unpaid invoice 45 days past due → the `d30` (30–60) bucket; a
  settled invoice is excluded; a not-yet-due invoice → `current`.
- DSO: two settled invoices (issue→settle 10 and 20 days) → 15; none settled
  → null.
- outstandingSalesTax: two invoices issued this bimonthly period, tax 5000 +
  3000 → 8000; an invoice from a prior period excluded even if unpaid.
- 401 summary: invoices across two periods bucket correctly by issueDate;
  taxExclusive + tax summed per period.
**Verify**: `npm test -- invoiceReporting` → all pass; `npx tsc --noEmit` → 0.

### Step 2: 本期應繳營業稅 reminder card (company book only)
In CashFlow's right column near 未結清, gated to `isActiveCompanyBook`, a card
showing `outstandingSalesTax(invoices, currentPeriod)` with copy noting it's
issuance-based (includes unpaid invoices — §3). Show nothing when no company
book / no invoices.
**Verify**: `npx tsc --noEmit` → 0; reviewer live pass (company book).

### Step 3: 帳齡 + DSO card
A card (company book only) with the aging buckets (count + total per bucket)
and the DSO figure. Reuse the app's existing card + number formatting.
**Verify**: `npx tsc --noEmit` → 0.

### Step 4: 401 雙月彙總 table
A small table (company book only), current year, 6 rows (or only periods with
data), columns 期間 / 未稅銷售額 / 銷項稅額, plus a total row. Copy: 供 401
申報參考.
**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0.

### Step 5: Full gate
**Verify**: `npm test` all green (incl. 188/190 characterization unchanged);
`npx tsc --noEmit` 0; `npm run lint` 0.

## Test plan
- `invoiceReporting.test.ts`: the four functions (Step 1) — the load-bearing
  correctness. UI is route-level (untested by convention) → reviewer live pass.

## Done criteria
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0; `npm test` 0 failures
- [ ] `invoiceReporting.test.ts` proves aging bucketing, DSO mean, outstanding-tax SUM, 401 per-period grouping
- [ ] All three UI surfaces gated to `isActiveCompanyBook` (grep the render)
- [ ] No repository/sync/migration/schema file modified (`git status`)
- [ ] 188 `booksPartition` + 190 `invoicesPartition` tests unchanged and green

## STOP conditions
- `Invoice` shape or `listInvoices` wiring no longer matches (190/191 changed since planning).
- A report needs a field the `Invoice` row doesn't carry (would need a 190 schema change — report; do NOT add columns here).
- The company-book gate (`isActiveCompanyBook`) from 191 is missing.

## Maintenance notes
- Aging uses `dueDate`; invoices created without one need a documented
  fallback (Step 1) — revisit if the operator wants "days since issue" aging.
- 401 is a live query (operator decision — no locked filing snapshot); a
  future `taxFilingPeriods` table would add locking.
- This completes 帳本 Phase 2. Phase 3 (shared books) remains blocked on
  spike 143.
