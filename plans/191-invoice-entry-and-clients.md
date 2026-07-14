# Plan 191: 帳本 Phase 2b-1 — 開發票流程、客戶主檔、結清時蓋章 settledAt

> **Executor instructions**: Follow step by step, verify each step, honor
> STOP conditions, touch only in-scope files. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Read first**: `docs/ledger-books-plan.md` §3 (發票與營業稅). Committed to
> main. This plan builds the CORE flow (create → track → settle); the
> reporting layer (帳齡/DSO/401/應繳稅 card) is plan 193.
>
> **Drift check (run first)**:
> `git diff --stat 50419301..HEAD -- src/routes/CashFlowRoute.tsx src/components/QuickAdd.tsx`
> Also REQUIRED: plan 190 merged — `grep -n "createInvoice" src/data/repositories.ts` must succeed. If absent, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Depends on**: 190 (MERGED — Invoice/Client + createInvoice/stampInvoiceSettled/computeSalesTax/invoiceNumbering), 189 (MERGED — active book / kind==="company")
- **Category**: direction (books Phase 2b-1)
- **Planned at**: commit `50419301`, 2026-07-13

## Why this matters

This delivers the operator's two hard Phase-2 requirements (design §3): the
**company book** must let you 開發票 (record an invoice with 銷項營業稅) and
**track whether the counterparty has paid (匯款結清)**. Plan 190 built the
data + math; this wires the UI: an 開發票 entry that creates a receivable
+ a linked invoice with auto-computed tax, a client master with
autocomplete, and — critically — stamping `invoice.settledAt` when the
receivable settles. Reporting (帳齡/DSO/401) is plan 193.

## Current state (verified at `50419301`)

- **Entry-type model** (`CashFlowRoute.tsx:82-86`): `CashType` = `expense |
  income | transfer | ar | ap`. `ar` (應收帳款) ALREADY creates a receivable
  income row (`settlementStatus` via `settlementFor(drawerType)`, save logic
  ~688-715). 開發票 is `ar` + invoice metadata + auto tax — extend, don't
  reinvent. `drawerType` state at :182; `openCreate(type)` at :428.
- **Settle flow** (`CashFlowRoute.tsx:876-905`): `markSettled(row)` →
  `confirmSettle(settleAccountId)` flips the row to `settled` via
  `updateLedger.mutateAsync`. THIS is where `stampInvoiceSettled` must be
  called after a successful settle (with the row's id + `nowIso()`).
- **未結清 card** (`CashFlowRoute.tsx:1627+`): lists receivables/payables —
  invoices-awaiting-payment already appear here once created as `ar`.
- **Client autocomplete precedent**: `chooseMerchant` (`QuickAdd.tsx:262`) +
  `MerchantAutocomplete` (`QuickAdd.tsx:556`). Mirror this shape for a
  `ClientAutocomplete` fed by `listClients()`.
- **190 API (all on `FinanceRepository`, both repos)**: `createInvoice(input:
  InvoiceDraft)`, `updateInvoice(id, input)`, `listInvoices()`,
  `createClient(input: ClientDraft)`, `listClients()`, `updateClient(id,
  input)`, `stampInvoiceSettled(linkedLedgerTransactionId, settledAt)`,
  `findInvoiceByLedgerId(ledgerId)`. `InvoiceDraft = Pick<Invoice, "bookId"|
  "clientId"|"invoiceNumber"|"issueDate"|"dueDate"|"amount"|
  "taxExclusiveAmount"|"taxAmount"|"linkedLedgerTransactionId">`. `ClientDraft
  = Pick<Client, "bookId"|"name"|"taxId"|"defaultPaymentTerms">`.
- **190 pure logic**: `computeSalesTax(taxInclusiveTotal, rate=0.05) →
  {taxExclusive, tax}` (`src/domain/salesTax.ts`); `validateInvoiceNumber`,
  `nextInvoiceNumber`, `INVOICE_NUMBER_PRESETS` (`TW_UNIFORM`/`FREE_TEXT`),
  `NextInvoiceNumberResult` (`src/domain/invoiceNumbering.ts`).
- **Active book** (189): `useUiPreferences(s => s.activeBookId)`; books via
  `useFinanceData` (hooks.ts `books` query). A book's `kind === "company"`.
- **Repo mutation pattern**: `useRepositoryMutation` (see `createLedger` at
  `CashFlowRoute.tsx:309`). No combined "createInvoiceWithReceivable" method
  exists — compose: create the ledger row FIRST (get its id), THEN
  `createInvoice({ ..., linkedLedgerTransactionId: ledgerId })`. Sequencing
  matters (see Step 3 orphan note).

## Commands you will need

| Purpose   | Command              | Expected |
|-----------|----------------------|----------|
| Install   | `npm install`        | exit 0   |
| Typecheck | `npx tsc --noEmit`   | exit 0   |
| Tests     | `npm test`           | all pass (1216 + new) |
| Lint      | `npm run lint`       | exit 0   |

## Scope

**In scope**:
- `src/routes/CashFlowRoute.tsx` — 開發票 entry mode (extends `ar`), invoice
  fields in EntryDrawer, the create-ledger-then-invoice mutation, and the
  `stampInvoiceSettled` call in `confirmSettle`.
- `src/components/ClientAutocomplete.tsx` (create — mirror MerchantAutocomplete)
- A 客戶主檔 management surface: `src/components/ClientManager.tsx` (create —
  mirror the 帳本管理 `BookManager` modal shape from plan 189), reachable
  from a 客戶 button (place near the 開發票 affordance).
- `src/domain/invoiceEntry.ts` (+ `.test.ts`) — pure helper assembling an
  `InvoiceDraft` + `LedgerDraft` from form state (number/tax/dates), so the
  logic is unit-tested outside the component.

**Out of scope**:
- 帳齡 / DSO / 本期應繳營業稅 card / 401 bimonthly summary — plan 193.
- Any repository/sync/migration/schema change — 190 finished that. Needing
  one = STOP.
- Editing an existing invoice's number after settle; 進項稅額; e-invoice.
- Non-company books showing 開發票 (gate the affordance to `kind==="company"`).

## Git workflow
- Branch `feat/ai-invoice-entry` off `main`. Conventional commits per piece. Do NOT push or open a PR.

## Steps

### Step 1: Pure entry-assembly helper + tests FIRST
`src/domain/invoiceEntry.ts`: `buildInvoiceDrafts(form: {
  bookId, clientId, invoiceNumber, issueDate, dueDate,
  taxInclusiveTotal, rate?, account/category/... for the ledger row
}): { ledger: LedgerDraft; invoice: Omit<InvoiceDraft, "linkedLedgerTransactionId"> }`
— uses `computeSalesTax` to fill `taxExclusiveAmount`/`taxAmount`, sets the
ledger row as an `ar` receivable income of `taxInclusiveTotal`. Tests: the
105000 case splits to 100000/5000 on the invoice while the ledger amount
stays 105000 (含稅); a validation error surfaces for a TW number failing the
preset. Keep it pure (no repo).
**Verify**: `npm test -- invoiceEntry` → passes; `npx tsc --noEmit` → 0.

### Step 2: 開發票 entry mode in EntryDrawer
Add an 開發票 affordance (only when the active book `kind === "company"`) —
either a new `CashType` `"invoice"` that reuses the `ar` save path plus
invoice fields, or an "開發票" toggle inside the `ar` drawer. Fields: 發票號碼
(with a preset selector 統一發票(TW)/自由格式; validate via
`validateInvoiceNumber`; offer `nextInvoiceNumber` from the last invoice as a
suggestion), 客戶 (ClientAutocomplete), 開立日 (issueDate), 到期日 (dueDate,
optional, default = issueDate + client.defaultPaymentTerms when set),
含稅總額, and a read-only derived 未稅/稅額 line from `computeSalesTax`.
**Verify**: `npx tsc --noEmit` → 0; reviewer live pass (drawer renders in a company book).

### Step 3: Create-ledger-then-invoice mutation
On save: create the `ar` receivable `LedgerDraft` first; from the created
row's id, call `createInvoice({ ...invoiceDraft, linkedLedgerTransactionId:
ledgerId, bookId: activeCompanyBookId })`. **Orphan note**: do the ledger
create FIRST so that if `createInvoice` fails, you're left with a valid plain
receivable (recoverable), NOT an invoice pointing at a missing row. Surface a
toast on invoice-create failure telling the user the receivable was created
but invoice metadata failed. (A combined transactional repo method is a
future refinement — out of scope here.)
**Verify**: `npm test` still green; reviewer live pass creates an invoice and
sees it in 未結清.

### Step 4: Stamp settledAt on settle
In `confirmSettle` (`CashFlowRoute.tsx:876-905`), after the successful
`updateLedger.mutateAsync(... settlementStatus:"settled" ...)`, call
`stampInvoiceSettled(row.id, nowIso())` (only meaningful when an invoice
links to the row — `stampInvoiceSettled` is a no-op if none matches, per
190). Guard it so a settle of a non-invoice receivable still works unchanged.
**Verify**: `npm test` green; reviewer live pass: create invoice → settle →
`findInvoiceByLedgerId(row.id)` shows non-null `settledAt`.

### Step 5: 客戶主檔 management
`ClientManager.tsx` modal (mirror `BookManager`): list clients (name/統編/
terms), create/edit. Reachable via a 客戶 button placed near 開發票. Clients
are book-scoped (`bookId = active company book`).
**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0.

### Step 6: Full gate
**Verify**: `npm test` all green; `npx tsc --noEmit` 0; `npm run lint` 0.

## Test plan
- `invoiceEntry.test.ts`: tax split + number validation (Step 1).
- Component flows are route-level (untested by convention); protection =
  invoiceEntry units + 190's repo tests + reviewer live pass.

## Done criteria
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0; `npm test` 0 failures
- [ ] `invoiceEntry.test.ts` proves 含稅 105000 → invoice {未稅 100000, 稅 5000} + ledger amount 105000
- [ ] `grep -n "stampInvoiceSettled" src/routes/CashFlowRoute.tsx` → called in confirmSettle
- [ ] 開發票 affordance gated to `kind === "company"` books
- [ ] No repository/sync/migration file modified (`git status`)

## STOP conditions
- 190's API (createInvoice/stampInvoiceSettled/computeSalesTax/invoiceNumbering) missing or renamed.
- A surface needs a repository/schema change to work (should not — 190 is complete).
- The EntryDrawer / settle-flow structure no longer matches the excerpts.
- The 開發票 flow appears to need editing `LedgerTransaction`'s shape (it must not — invoice data lives on the `invoices` row).

## Maintenance notes
- Plan 193 (reporting) consumes: `listInvoices()` + `settledAt`/`dueDate`/
  `taxAmount` for aging, DSO, 401 summary, and the 本期應繳營業稅 card.
- Orphan-invoice risk (Step 3): a future combined transactional
  `createInvoiceWithReceivable` repo method would remove it.
- Reviewer scrutiny: the settle→stamp wiring (the one cross-entity coupling),
  the company-book gate, and that a plain (non-invoice) 應收 still settles.
