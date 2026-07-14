# Plan 190: 帳本 Phase 2a — Invoice/Client 實體、發票號碼與營業稅純函式、同步接線

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on.
> Touch only files in scope. If any STOP condition occurs, stop and report —
> do not improvise. Do NOT update `plans/README.md` — the reviewer maintains
> the index.
>
> **Read first**: `docs/ledger-books-plan.md` §3 (發票與營業稅 — the design
> this implements) and its §2a (bookId model, already built in plan 188).
> Committed to main.
>
> **Drift check (run first)**:
> `git diff --stat 41d44e04..HEAD -- src/domain/types.ts src/domain/sync.ts src/data/repositories.ts src/data/migrations.ts src/features/connect/sync/pull.ts src/features/connect/sync/conflictSummary.ts`
> If any changed since planning, compare the "Current state" excerpts before
> proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (two new synced entities; mitigated by the 188 sync-wiring playbook now being fully known + dual-harness tests + characterization)
- **Depends on**: plans/188 (MERGED — bookId model + sync playbook), plans/189 (MERGED — active book / kind==="company")
- **Category**: direction (books Phase 2a, per docs/ledger-books-plan.md phase table)
- **Planned at**: commit `41d44e04`, 2026-07-13

## Why this matters

Operator requirement (design: `docs/ledger-books-plan.md` §3): the company
book must record 開發票 with 銷項營業稅 and track 匯款結清. This plan lands
the **data + pure-logic half**: `Invoice` and `Client` entities, the
invoice-numbering rules (generic 字軌+序號 with a 台灣統一發票 preset), the
5% 營業稅 math, and full sync wiring — with zero UI. Plan 191 builds the
開發票 flow, client master, aging/DSO, and 401 summary on top.

**Locked design decisions (advisor, grounded in §3 + operator answers):**
1. **Tax fields live on the `invoices` table ONLY — `LedgerTransaction`
   gets NO new field.** The doc's §3 mentions tax fields "on the row" AND a
   dedicated `invoices` table; that is redundant. Resolution: the `invoices`
   row is the source of truth (`taxExclusiveAmount`, `taxAmount`); the
   linked receivable ledger row just carries the 含稅 total in its existing
   `amount`. This keeps the sync-critical `LedgerTransaction` shape untouched.
2. **Model A** (§3): 開發票 = a normal receivable income `LedgerTransaction`
   (existing `settlementStatus: "receivable"`, created via the existing
   `createLedgerTransaction`) PLUS an `invoices` row linking to it via
   `linkedLedgerTransactionId`. No new settlement state machine. This plan
   does NOT create ledger rows itself (that's 191's flow) — it provides the
   entities + the repo method to stamp `settledAt`.
3. **Invoice numbering** (operator-confirmed): a generic `{prefix}{sequence}`
   structure; a `統一發票 (TW)` preset validates 字軌 = 2 letters + 8 digits
   and auto-increments; free-text mode also allowed. Pure module, no UI here.

## Current state (verified at `41d44e04`)

- `src/domain/types.ts` — `SyncFields` (55-62); `Book` (63-81, from 188);
  `Account.bookId` (from 188); `LedgerTransaction` (92-160).
- `src/domain/sync.ts` — `SyncEntity` union now `"account" | "ledger" |
  "asset" | "investment" | "recurring" | "recurringInvestment" | "goal" |
  "book" | "settings"` (book added by 188). `normalizeSqliteSyncPayload`
  lives here (188 extended it for `book`'s booleans).
- **The COMPLETE sync-wiring surface set (from plan 188 — 4 non-test files +
  2 outbox arrays):**
  1. `src/domain/sync.ts` — the `SyncEntity` union.
  2. `src/data/repositories.ts` — the 4 `Record<Exclude<SyncEntity,
     "settings">, string>` `tableByEntity` maps + the browser `keyByEntity`/
     `rowsByEntity` maps + `getSyncPayload`/`getSyncPayloads`/
     `applySqliteSyncChange` switch (+ a new `insertXRow`) + `allSyncRecords`
     + the TWO outbox trigger arrays in `ensureSyncInfrastructure()` (~4364)
     and `backfillSyncOutbox()` (~4431). Grep `book: "books"` /
     `["books", "book"]` to see every site 188 touched — copy that exact
     pattern for `invoice`/`invoices` and `client`/`clients`.
  3. `src/features/connect/sync/pull.ts` — the `VALID_ENTITIES` Set (~194).
  4. `src/features/connect/sync/conflictSummary.ts` — the `ENTITY_LABELS`
     `Record<SyncEntity, string>` (~8).
- `src/data/migrations.ts` — migration list; `books` table is migration
  `id: 5` (188). New tables append as `id: 6`, `id: 7`. Additive COLUMNS use
  `ensureSqliteColumn` in `initialize()` (not needed here — no column adds).
- Settle flow: `markSettled` → `confirmSettle(settleAccountId)`
  (`CashFlowRoute.tsx:876-902`) flips a receivable to `settled`. Plan 191
  will call this plan's `stampInvoiceSettled` from there — this plan just
  provides the method.
- `LedgerDraft` (`repositories.ts:55-81`) — the receivable-creation input
  (191 uses it; unchanged here).
- Dual-harness test pattern: `src/data/repositories.books.test.ts` (188) is
  the closest model — copy its structure.
- Client-master autocomplete precedent (for 191, not here):
  `chooseMerchant` + `MerchantAutocomplete` in `QuickAdd.tsx:262/556`.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `npm install`        | exit 0 (fresh worktree) |
| Typecheck | `npx tsc --noEmit`   | exit 0              |
| Tests     | `npm test`           | all pass (1178 + new) |
| Lint      | `npm run lint`       | exit 0              |

## Scope

**In scope**:
- `src/domain/types.ts` — `Invoice` + `Client` interfaces
- `src/domain/sync.ts` — `"invoice"`, `"client"` in `SyncEntity` + normalizer
- `src/domain/invoiceNumbering.ts` (+ `.test.ts`) — numbering rules, pure
- `src/domain/salesTax.ts` (+ `.test.ts`) — 營業稅 math, pure
- `src/data/repositories.ts` — Invoice/Client CRUD (both repos), sync wiring
  at ALL surfaces listed in Current state, `stampInvoiceSettled`,
  `findInvoiceByLedgerId`, `insertInvoiceRow`/`insertClientRow`
- `src/data/migrations.ts` — `invoices` (id 6) + `clients` (id 7) tables
- `src/data/repositories.invoices.test.ts` (create — dual-harness)
- `src/domain/invoicesPartition.test.ts` (create — characterization: existing
  aggregates unchanged when invoices/clients exist)
- `src/features/connect/sync/pull.ts` — add `"invoice"`,`"client"` to VALID_ENTITIES
- `src/features/connect/sync/conflictSummary.ts` — add labels (發票 / 客戶)
- existing test fixtures ONLY if a type change forces it (report in NOTES)

**Out of scope**:
- ANY route/component/UI — plan 191. Zero visible change.
- `LedgerTransaction` shape (decision #1: no new field).
- The 開發票 flow, client UI, aging/DSO, 401 report — all 191.
- Auto-coupling ledger-settle → invoice.settledAt (191 wires the call).
- `push.ts` — entity-generic, verified in 188. If it needs an edit, STOP.
- Worker.

## Git workflow
- Branch `feat/ai-invoices-foundation` off `main`. Conventional commits per logical unit. Do NOT push or open a PR.

## Steps

### Step 1: Characterization test FIRST
Create `src/domain/invoicesPartition.test.ts`: seed accounts + ledger rows
INCLUDING a receivable income row (an "invoice" scenario), assert
`buildNetWorthBreakdown` / `calculateAvailableCash` / adjusted-net-worth
receivable totals produce the SAME numbers whether or not a parallel
`Invoice`/`Client` record exists — invoices/clients are additive metadata,
they must not perturb any money aggregate. (You can only assert the ledger
side here since invoices aren't wired yet; write the assertions against
current outputs and keep them byte-frozen through the plan.)
**Verify**: `npm test -- invoicesPartition` → passes on unmodified code.

### Step 2: Pure logic modules (no repo, no types-coupling)
- `src/domain/salesTax.ts`: `computeSalesTax(taxInclusiveTotal: number, rate =
  0.05): { taxExclusive: number; tax: number }` where `tax =
  Math.round(total * rate / (1 + rate))`, `taxExclusive = total - tax`.
  Tests: 105000 → { taxExclusive: 100000, tax: 5000 }; rounding edge (e.g.
  100 → tax 5 (round(4.76)) ... assert the exact rounding); rate override.
- `src/domain/invoiceNumbering.ts`: a preset registry. `TW_UNIFORM` preset:
  validate `^[A-Z]{2}\d{8}$` (字軌 2 letters + 8 digits), and
  `nextInvoiceNumber(prev: string | null, preset): string` incrementing the
  8-digit numeric part (carry into... keep simple: increment numeric suffix,
  do NOT roll the letter track — return an error/flag if the numeric part
  overflows 99999999 so 191 can prompt for a new 字軌). A `FREE_TEXT` preset:
  no validation, no auto-increment. Tests for validate + increment + overflow.
**Verify**: `npm test -- salesTax invoiceNumbering` → pass; `npx tsc --noEmit` → 0.

### Step 3: Domain types + SyncEntity
`types.ts`:
```ts
export interface Client extends SyncFields {
  bookId: string; name: string; taxId: string; // 統編; "" when none
  defaultPaymentTerms: number | null; // days
}
export interface Invoice extends SyncFields {
  bookId: string; clientId: string | null;
  invoiceNumber: string; issueDate: string; dueDate: string | null;
  amount: number;             // 含稅 total (matches the linked receivable's amount)
  taxExclusiveAmount: number; // 未稅
  taxAmount: number;          // 稅額
  settledAt: string | null;   // stamped when the linked ledger row settles
  linkedLedgerTransactionId: string | null;
}
```
`sync.ts`: add `"invoice"`, `"client"` to the union; extend
`normalizeSqliteSyncPayload` for both (no booleans, but numbers/nulls — mirror
an existing numeric entity, not `book`'s boolean case).
**Verify**: `npx tsc --noEmit` → FAILS listing the sync surfaces to wire (Step 4 worklist).

### Step 4: Repository wiring — mirror 188's `book` exactly
For BOTH `invoice`→`invoices` and `client`→`clients`, at every surface 188
touched for `book` (grep `"books"` and `["books", "book"]` in repositories.ts
to enumerate them): the 4 `tableByEntity` maps, browser `keyByEntity`/
`rowsByEntity`, `getSyncPayload`/`getSyncPayloads`, `applySqliteSyncChange`
switch (+ `insertInvoiceRow`/`insertClientRow`), `allSyncRecords`, and BOTH
outbox trigger arrays (`ensureSyncInfrastructure` ~4364, `backfillSyncOutbox`
~4431). Plus:
- `migrations.ts`: `invoices` (id 6) + `clients` (id 7) tables — columns
  matching the interfaces (snake_case; `settled_at`/`due_date`/`client_id`
  nullable `text`; numeric amounts `real not null`).
- `FinanceRepository` interface + both impls: `listInvoices()`,
  `createInvoice(input: InvoiceDraft)`, `updateInvoice(id, input)`,
  `listClients()`, `createClient(input: ClientDraft)`, `updateClient(id,
  input)`, `stampInvoiceSettled(linkedLedgerTransactionId: string, settledAt:
  string | null): Promise<void>` (find the invoice whose
  `linkedLedgerTransactionId` matches; set/clear `settledAt`; bump revision),
  `findInvoiceByLedgerId(ledgerId: string): Promise<Invoice | null>`.
  Drafts: `InvoiceDraft = Pick<Invoice, "bookId"|"clientId"|"invoiceNumber"|
  "issueDate"|"dueDate"|"amount"|"taxExclusiveAmount"|"taxAmount"|
  "linkedLedgerTransactionId">` (NO settledAt — starts null);
  `ClientDraft = Pick<Client, "bookId"|"name"|"taxId"|"defaultPaymentTerms">`.
- pull.ts VALID_ENTITIES: add `"invoice"`, `"client"`.
- conflictSummary.ts ENTITY_LABELS: `invoice: "發票"`, `client: "客戶"`.
**Verify**: `npx tsc --noEmit` → 0; `npm test` → previous 1178 pass
(esp. `repositories.books.test.ts` + `booksPartition.test.ts` untouched).

### Step 5: Dual-harness tests
`src/data/repositories.invoices.test.ts` (model on `repositories.books.test.ts`):
create/list/update invoice + client; drafts round-trip; `stampInvoiceSettled`
sets and clears `settledAt` on the matching invoice; `findInvoiceByLedgerId`;
sync payload for both entities (`getSyncPayload("invoice"|"client", id)`);
**outbox tracking** — after `createInvoice`, `collectPendingChanges()`
includes an `entity: "invoice"` entry (SQLite harness — the trigger-array
guard); same for `client`.
**Verify**: `npm test -- repositories.invoices` → all pass ×2 repos.

### Step 6: Full gate
**Verify**: `npm test` all green incl. Step-1 characterization byte-unchanged
+ Step-2 pure tests; `npx tsc --noEmit` 0; `npm run lint` 0.

## Done criteria
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0; `npm test` 0 failures
- [ ] `invoicesPartition.test.ts` byte-identical to Step-1 version
- [ ] `grep -c '"invoices"' src/data/repositories.ts` and `'"clients"'` each ≥ the count 188's `"books"` got (parity with the book wiring)
- [ ] `grep -n '"invoice"\|"client"' src/domain/sync.ts` → both in the union
- [ ] `grep -n '"invoice"\|"client"' src/features/connect/sync/pull.ts` → both in VALID_ENTITIES
- [ ] `salesTax.test.ts` proves 105000 → {100000, 5000}; `invoiceNumbering.test.ts` proves TW validate + increment + overflow
- [ ] Dual-harness outbox-tracking assertions for BOTH invoice + client (SQLite harness)
- [ ] No UI/route/component file modified; `LedgerTransaction` shape unchanged (`git diff main..HEAD -- src/domain/types.ts | grep -A30 "interface LedgerTransaction"` shows no field added)

## STOP conditions
- The `SyncEntity` union / `tableByEntity` / outbox-array shapes no longer match 188's pattern (sync layer refactored).
- A NEW non-test SyncEntity surface appears beyond the 4 files + 2 arrays 188 established — report it (do not silently edit).
- `push.ts` needs a book/invoice/client-specific change (should be generic).
- The Step-1 characterization numbers shift.
- `plugin-sql` migration ordering issues unresolvable with the existing pattern.

## Maintenance notes
- Plan 191 consumes: `createInvoice`/`InvoiceDraft`, `listClients`/client
  autocomplete, `stampInvoiceSettled` (wire into `confirmSettle`),
  `computeSalesTax`, `nextInvoiceNumber`, `findInvoiceByLedgerId`.
- `settledAt` is stamped by 191 calling `stampInvoiceSettled` from the settle
  flow — NOT auto-derived from the ledger row's `updatedAt` (plan 186
  amendment: updatedAt is bumped by any edit).
- 進項稅額 / 營所稅 / e-invoice remain deferred (design doc "future work").
- Reviewer scrutiny: sync-wiring parity with `book` (grep counts), the tax
  rounding rule, and that `LedgerTransaction` truly gained no field.
