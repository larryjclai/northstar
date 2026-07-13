# 帳本 (Books) design spike — 公司帳/個人帳/總帳 + 發票稅金 + 共同記帳的統一模型

> **Doc-only design spike (Plan 186).** Deliverable is this decision document; zero code
> changes. It gates any future books/invoice build plan — those plans must cite this file.
> Status: **decisions recorded per operator direction (2026-07-13)**, ready to be cut into
> phased build plans.

## Why this exists

Operator requirement (2026-07-13, verbatim intent): he runs a company and needs to keep
**company income/expense** separate from **personal income/expense**, while still being able
to see a **總帳 (consolidated ledger)**. The company book has two hard requirements: (1) 開發票
的**銷項營業稅** must be recorded and summarized, and (2) after issuing an invoice, track
whether the counterparty has **匯款結清** (paid). The operator also explicitly named 帳本
(books) and the previously-scoped **共同記帳** (household sharing, plan 143) as *the same
family of requirement* — they must be designed together, not as two mechanisms that later
collide.

Today Northstar has **no book concept anywhere**. Every route reads ALL accounts and ALL
ledger rows; the only scoping precedent is the per-route `selectedAccount` filter
(`src/routes/CashFlowRoute.tsx:216`, `src/routes/DashboardRoute.tsx:184`). Bolting "company
vs personal" on later — after sharing ships against a book-less model — would force a painful
re-scope of every aggregation. This spike decides the model now, on paper.

## Drift check (run at spike start)

```
git diff --stat bb051f59..HEAD -- src/domain/types.ts src/data/repositories.ts docs/split-legs-plan.md plans/143-household-sharing-spike.md
```

Result: **empty diff** — HEAD is exactly `bb051f59` (`chore: release 0.1.0-alpha.60`), the
commit this plan was authored at. No drift; the design below is against the code as it
actually is, verified during this spike (not copied from the plan file).

`git log --oneline -20` at spike time shows no books/workspace/multi-ledger feature has
started (most recent work is plans 179–182, all merged, plus reconciliation docs commits).
`docs/split-legs-plan.md` and `plans/143-household-sharing-spike.md` both exist, unmodified,
and are substantive (not stubs) — read in full for this spike.

## 1. Scoping surfaces

Every aggregation a book boundary would need to partition, with its current entry point and
the book scope it should default to. "目前帳本" = whichever book is active in the UI's book
switcher (see §5); "總帳" = the pseudo-book view unioning all books.

| # | Surface | Entry point | Default scope |
|---|---|---|---|
| 1 | Net worth breakdown (資產/負債/淨值) | `buildNetWorthBreakdown` (`src/domain/dashboardSummary.ts:77`), consumed by `DashboardRoute.tsx` | 目前帳本 (總覽 defaults to personal book; a 總帳 toggle unions all) |
| 2 | Available cash / alternative assets / liabilities | `calculateAvailableCash`/`calculateAlternativeAssets`/`calculateLiabilities` (`dashboardSummary.ts:22,33,41`) | 目前帳本 |
| 3 | Cash-flow stats + activity list | `CashFlowRoute.tsx` filters (`selectedAccount`, `dateRange` — lines 911–1036) | 目前帳本 (accounts already belong to exactly one book under option (a), so the existing per-account filter composes for free) |
| 4 | 未結清 (應收/應付) settlements card | `buildOutstandingSettlements` (`dashboardSummary.ts:247`), rendered `CashFlowRoute.tsx:1614–1653` | 目前帳本 — a company invoice receivable must not appear while viewing 個人帳 |
| 5 | Budgets / category rollover | `computeRolloverSeries`, `annualBudgetSummary` (`src/domain/budgetRollover.ts:50,90`) | 目前帳本 — budgets are a personal-finance concept; company book budgets (if ever used) are a separate series, never merged |
| 6 | Goals pace | `goalPace` (`src/domain/goalPace.ts:29`) | 個人帳 only — goals are not a company-book concept in v1 |
| 7 | FIRE projection / runway / coverage ratio | `calculateFireProjection` (`src/domain/fireGoal.ts:41`), `trailingMonthlyExpense`/`trailingMonthlyNet`/`coverageRatioPct`/`runwayMonths` (`src/domain/northstarMetrics.ts:51,95,140,156`) | 個人帳 by default, **per-book toggle** overrides (see §5 決定) |
| 8 | Annual report (年度報告) | `buildAnnualReport` (`src/domain/annualReport.ts:173`) | 目前帳本, with an explicit book selector at the top of the report (company book's 年度報告 becomes the shareholder-facing summary; personal stays personal) |
| 9 | Investment analytics (TWR/Sharpe/drawdown/sector/benchmark) | `src/domain/portfolioAnalytics.ts` (`buildPortfolioTwr:847`, `buildSectorBreakdown:361`, etc.), `InvestmentsAnalyticsTab.tsx` | 目前帳本 — a company's investment holdings (if any) must not blend into personal TWR |
| 10 | Reconciliation identity `assets − liabilities = net worth` | `assertLedgerInvariants`/`recompute` family (`src/domain/ledgerTrust.ts`) | **Both** — per-book identity must hold, AND the 總帳 sum-of-books identity must hold (see §2 reconciliation subsection) |
| 11 | Data-health report (stale prices, incomplete groups) | `buildDataHealthReport` (`src/domain/dataHealth.ts:148`) | 總帳 (a data-integrity report should not hide company-book problems from an operator who only glances at 個人帳) |
| 12 | Merchant / category detail pages | `MerchantDetailRoute.tsx`, `CategoryDetailRoute.tsx` | 目前帳本 — a merchant paid from both books (e.g. same landlord) shows per-book totals, not blended, to avoid double-counting rent as both personal and company spend in one number |

12 surfaces enumerated (≥8 required). Every one already reads `ledgerRows`/`accountRows` as
flat arrays with no book field to filter on today — confirming the "implicit single book"
finding above.

## 2. Data-model options

> **DECIDED (operator, 2026-07-13): option (a) — `bookId` on Account.** The operator confirmed
> his company money lives in dedicated company accounts (no mixed-use card), which is exactly
> option (a)'s precondition. Options (b) and (c) are recorded below for the historical record;
> they are **not** being pursued.

### (a) `bookId` on `Account` only — RECOMMENDED, fully specified

**Shape.** Add a nullable-then-backfilled `bookId: string` to `Account`
(`src/domain/types.ts:64–90`). A new lightweight `Book` entity (`id`, `name`, `kind: "personal"
| "company"`, `includeInPersonalNetWorth: boolean`, `includeInFireMetrics: boolean`, `color`,
`SyncFields`) is the join target. `LedgerTransaction` gets **no** new column — it inherits its
book transitively through `accountId → Account.bookId`. Every scoping query in §1 becomes: join
the row's `accountId` to `accounts.bookId`, filter to the active book (or skip the filter for
總帳). This is a pure **read-time partition** — no write-path branching beyond "which account
did the user pick," which QuickAdd/EntryDrawer already require.

**Cross-book money movement.** A cash-paid-company-expense-from-personal-wallet (股東代墊) is
recorded with the **existing 代墊 mechanism** — no new concept. Two sub-cases:

- **Owner's draw / capital contribution (帳戶到帳戶, no receivable)**: an ordinary `transfer`
  between a 公司戶 and a 個人戶 (`transferBuilder.ts:48`, `createTransfer`,
  `repositories.ts:895–930`). The transfer-group's two legs sit in two different books; the
  existing per-account posting model handles this with zero new code — it is definitionally
  what a transfer between any two accounts already does. The 總帳 net-worth identity is
  preserved because a transfer nets to zero **across the whole system** regardless of which
  book each leg belongs to (see reconciliation subsection below); the *per-book* identity for
  each of the two affected books is **not** zero-sum (money truly left one book and entered the
  other) — this must be shown as an explicit inter-book transfer line in each book's own report,
  not silently absorbed.
- **股東代墊 (the operator pays a company expense out of pocket, company owes him back)**: this
  is a receivable/payable exactly as documented at `types.ts:92–107` — `accountId` = the
  company's expense category posting (booked as a company-book expense so company P&L is
  correct), `counterAccountId` = the personal account that was actually charged (paid out now).
  `settlementStatus: "payable"` from the company's perspective (公司欠股東), settled later when
  the company reimburses the owner via an ordinary transfer. **No new field is needed** — this
  is the identical mechanism the codebase already uses for any 代墊, just with the two accounts
  belonging to two different books. The only new behavior: the 未結清 card (§1 surface 4) must
  show this row when viewing **either** book (it is a cross-book obligation), whereas same-book
  receivables only show in their own book.

**Migration.** Single additive column: `ALTER TABLE accounts ADD COLUMN book_id TEXT` via
`ensureSqliteColumn`, following the exact pattern already used for `installment_group_id`, etc.
(`src/data/migrations.ts` — migrations `id: 1` through `4`, comment at line 237 documents this
additive-column convention). Backfill: a system-created default book (`kind: "personal"`, name
"個人帳") is inserted first; every existing account gets `book_id = <default personal book id>`
in the same migration transaction. **All existing data becomes 個人帳** — zero rows change
meaning, zero money appears/disappears (this is the invariant the maintenance-notes
characterization test below must assert).

**Sync delta.** `Book` is a new syncable entity: new SQLite table, new envelope type, additive
row in `push.ts`/`pull.ts`'s entity-kind switch (same shape as any existing entity — no new
sync primitive). `Account.book_id` rides along as an ordinary column in the existing account
envelope (same pattern as `is_shared_to_household` today — see §4, this is exactly how that
field already syncs). No LWW change: books sync per-record like everything else.

**Reconciliation identity.** Per-book: `Σ(assets in book) − Σ(liabilities in book) = 淨值(book)`
holds for each book independently, because every account belongs to exactly one book (accounts,
not transactions, carry `bookId`, so there is no row that is "half in one book"). 總帳:
`Σ over all books of 淨值(book) = 淨值(總帳)` — a straight sum, because books partition the
account set with no overlap. Cross-book transfers (owner's draw) do not break either identity:
they are ordinary transfers, already excluded from income/expense via `isNeutralLedgerRow`
(`ledgerTrust.ts:22–24`), and each leg posts to its own book's account — the 總帳 total is
invariant under a transfer between any two accounts in the system by construction (money moves
from one posting to another, net-zero System-wide, same as today for same-book transfers). The
一個新東西: a per-book report that *only* sums its own accounts will show a cross-book transfer
as a real inflow/outflow of that book (e.g. 個人戶 shows −100,000 民 as "支出？" — no, it must be
labeled distinctly as "轉出至公司帳" not as an expense) — **this requires the existing
`entryType: "transfer"` + `isNeutralLedgerRow` exclusion to keep working per-book** (already
true, since it excludes by `entryType`, not by account/book), but the UI must still surface
cross-book transfers with a distinct label so the operator doesn't mistake an owner's draw for
company revenue leaking out. This is a UI/copy requirement, not a data-model gap.

### (b) `bookId` on both `Account` and `LedgerTransaction` (transaction override) — rejected, recorded

Handles a mixed-use account (e.g. one personal credit card used for both personal and
occasional company purchases) by letting a transaction's `bookId` override its account's.

- **Migration**: two additive columns instead of one; the transaction-level `bookId` needs a
  fallback rule (`row.bookId ?? account.bookId`) baked into every single query in §1 — every
  aggregation must resolve the effective book per-row instead of per-account-join.
- **Sync**: no new entity type needed (unlike (a) which adds a `Book` table either way), but
  every `LedgerTransaction` envelope now carries a book field that can silently disagree with
  its account's book, which is exactly the kind of drift class this spike exists to prevent
  (mirrors the four bespoke "linked record group" mechanisms `docs/split-legs-plan.md` found and
  unified — this would be a fifth divergent field).
- **Reconciliation identity — honestly stated**: `assets − liabilities = net worth` **still
  holds at the account level** (an account's balance is the sum of its own postings regardless
  of any transaction-level book override), but **"the company book's net worth" stops meaning
  anything coherent** — a single account's balance would be split across two books' reports by
  transaction-level tagging, so neither book's 資產 total corresponds to any real, checkable
  account balance. The per-book identity `assets(book) − liabilities(book) = 淨值(book)` **breaks**
  unless every consumer also re-derives a per-book "virtual account balance" by summing tagged
  transactions — real complexity for a case (mixed-use accounts) the operator confirmed he
  doesn't have.
- **Rejected because**: it buys mixed-use-account support the operator does not need, at the
  cost of the reconciliation identity's cleanest property (an account's own ledger rows always
  sum to its own balance) and a second field that can drift from the account's book.

### (c) Books as fully separate datasets (per-book SQLite namespaces) — rejected, recorded

Each book is a logically separate SQLite database/namespace (its own `accounts`/
`ledger_transactions` tables or a fully isolated schema prefix), with 總帳 constructed by a
federated read across namespaces.

- **Migration**: not additive — existing data would need to be *moved* into a "personal"
  namespace, which is a much heavier migration than one column, and this app's SQLite access
  (`plugin-sql`, single pool, `src/data/repositories.ts`) has no existing multi-database
  abstraction to build on.
- **Sync**: strongest isolation of the three — a shared book's envelope namespace is trivially
  separable from personal data (nice property for plan 143's privacy invariant, since no query
  can accidentally cross the boundary), but 總帳 aggregation (§1's #10) requires querying N
  databases and merging in application code, and every existing single-query aggregation (all
  of `dashboardSummary.ts`, `portfolioAnalytics.ts`, etc.) would need a "federate across books"
  wrapper — the most expensive option for the feature the operator actually asked for first
  (總帳 in one view).
- **Reconciliation identity**: cleanest in theory (each namespace is fully self-contained, no
  cross-namespace foreign keys possible even by accident) but 總帳 becomes an explicit
  federation step rather than a `WHERE bookId IN (...)` clause, and `plugin-sql`'s pool
  serialization already causes `db-locked` issues with **one** database (per project memory) —
  N databases multiplies that surface.
- **Rejected because**: most expensive for 總帳 (the feature that motivated this spike), and
  solves an isolation problem (mixed trust boundaries) that only actually matters for shared
  books, where option (a)'s per-book *sync envelope namespace* (see §4) achieves the same
  privacy property without a second SQLite engine.

## 3. 發票與營業稅 (Invoice & 營業稅 slice)

**v1 flow**: 開發票 → an income row with `settlementStatus: "receivable"` (existing mechanism,
`types.ts:121`) carrying invoice metadata → 匯款結清 → the existing settle flow
(`confirmSettle`, `CashFlowRoute.tsx:867–889`, toast "已收款結清") marks it `settled`. No new
settlement state machine — 發票 tracking rides entirely on the receivable/payable rails that
already exist and are tested.

### Tax model

**Worked example**: 開立含稅總額 105,000 的發票 (5% 營業稅, 統一發票 typical case).
`銷項稅額 = round(105,000 × 5 / 105) = round(5,000) = 5,000`；`未稅額 = 105,000 − 5,000 =
100,000`.

**Model A (recommended v1)** — one receivable income row of the 含稅 total, carrying two
additional nullable fields on that row: `taxExclusiveAmount` (未稅額) and `taxAmount` (稅額,
default `round(amount × 5/105)`, user-editable for invoice-level rounding disputes).

Ledger-row truth table (single row):

| accountId | amount | settlementStatus | taxExclusiveAmount | taxAmount |
|---|---|---|---|---|
| 應收帳款 (pending settle-account) | +105,000 | receivable → settled on 匯款 | 100,000 | 5,000 |

- 未稅口徑 revenue reports = `SUM(taxExclusiveAmount)` over settled+receivable company-book
  income rows.
- 「本期應繳營業稅」reminder card = `SUM(taxAmount)` over invoices issued in the current
  bimonthly period, regardless of settle status (稅 is owed on issuance under 開立統一發票 timing,
  not on collection — this must be called out in the UI copy so the operator isn't surprised the
  reminder includes unpaid invoices).
- Tax payment itself = an ordinary expense row, `category: "稅捐"`, no special mechanism.
- **Known honest limitation**: 調整後淨值 (adjusted net worth, which already lists
  receivables/payables per AGENTS.md's invariant) does **not** separately list unpaid 銷項稅額 as
  a distinct liability line between invoicing and payment — the 105,000 receivable already
  inflates 調整後淨值 correctly (money the business is owed), but the ~5,000 of that which will
  flow straight back out as a tax payment is not called out. v1 accepts this; the 應繳營業稅
  reminder card is the mitigation (visibility without a new liability line).

**Model B (v2 upgrade path)** — 未稅 revenue leg + a pass-through 代收營業稅 leg, using the same
sibling-legs shape `docs/split-legs-plan.md` designed for 分帳/多類別. Cash identity for the same
105,000 invoice: 帳戶 +105,000 = 收入 leg +100,000 (`category: 收入`) + 代收 leg +5,000
(`category: 代收營業稅`, net-zero pass-through shape — same idea as `counterAccountId` 代墊, but
this is a *held* liability, not a receivable from a counterparty, so it needs its own
lightweight flag rather than reusing `counterAccountId` verbatim). This is genuinely a new
`legKind` value (`"tax"`, alongside split-legs' `"category"`/`"share"`) because unlike a split
leg, this leg is not user-visible as a separate category choice — it's system-generated at
invoice creation and system-consumed at tax-payment time (marking it "paid" nets it out
of the `SUM(taxAmount owed)` query). **Mechanical A→B migration**: for each Model-A row,
synthesize two rows sharing a new `groupId` — a `category` leg for `amount − taxAmount` and a
`tax` leg for `taxAmount` — then null out the now-redundant `taxExclusiveAmount`/`taxAmount`
fields on the (now-parent-less, in the sibling-legs sense) original row, or simply retire the
original row via the same soft-delete + two-new-rows pattern `buildSplit` already establishes.
This migration is deferred to v2; v1 ships Model A because it needs **zero** new leg machinery
and the sibling-legs infrastructure (`legKind`, `buildSplit`, `incompleteSplitGroupIds`) is
still landing for 分帳/多類別 itself (split-legs-plan.md phases P2–P3) — reusing it for tax
before its own build is done would be sequencing risk, not savings.

### Invoice metadata storage

**Decision: a dedicated `invoices` table**, not additive fields sprayed on
`LedgerTransaction`. The operator's confirmed scope (客戶主檔, 帳齡, DSO) tips this: those
features need queries keyed on invoice-level fields (due date, client id, aging bucket) that
have no natural home on a ledger row, and a ledger row already carries `taxExclusiveAmount`/
`taxAmount` (Model A, above) — cramming client/due-date/status-history onto the same row starts
to look like the "four bespoke mechanisms" problem `docs/split-legs-plan.md` diagnosed, just one
level up. An `invoices` row (`id`, `bookId`, `clientId`, `invoiceNumber`, `issueDate`, `dueDate`,
`settledAt: string | null`, `amount`, `taxExclusiveAmount`, `taxAmount`,
`linkedLedgerTransactionId`, `SyncFields`) points at
its receivable ledger row via `linkedLedgerTransactionId` (same foreign-key shape already used
for `linkedInvestmentRecordId`, `types.ts` DRIP linkage) rather than the ledger row pointing
"up" — this mirrors the existing precedent of a ledger row optionally carrying a link to a
richer sibling record. **Sync delta**: one new entity type in `push.ts`/`pull.ts`'s switch (same
additive pattern as `Book` in §2); no change to `LedgerTransaction`'s envelope beyond the
already-decided `taxExclusiveAmount`/`taxAmount` columns.

### 客戶主檔 (client master)

Clients are first-class records: `id`, `bookId`, `name`, `taxId` (統編), `defaultPaymentTerms`
(days), `SyncFields`. Auto-filled via the **existing merchant-autocomplete pattern** — plan
180's `chooseMerchant` (`src/components/QuickAdd.tsx:247`, wired to `MerchantAutocomplete` at
line 358) is the direct precedent: typing a client name offers existing clients, selecting one
reuses its 統編/terms the same way merchant selection today reuses a merchant's learned
category. `MerchantDetailRoute.tsx`/`MerchantsTab.tsx` are the UI precedent for a "client
detail" page (invoices issued, total billed, current aging) mirroring "merchant detail"
(transactions, total spent).

### 帳齡 + 收款指標

Per-invoice: `dueDate` and `settledAt` both live on the `invoices` row (§"Invoice metadata
storage"). `settledAt` is an **explicit column**, stamped by the settle flow (`confirmSettle`,
`CashFlowRoute.tsx:867–889`) at the moment the linked ledger row's `settlementStatus` flips to
`"settled"`, and cleared back to `null` if a settle is ever reverted. It must NOT be derived
from the linked row's `updatedAt`: `updatedAt` is bumped by any subsequent edit (a note fix, a
category change, a sync-driven revision bump), so "the moment it flipped" is unrecoverable from
`updatedAt` later and every settled-date-based metric would silently corrupt after routine
edits. Aging buckets (30/60/90) = a query bucketing `today − dueDate` for every invoice with
`settledAt IS NULL` (equivalently, whose linked row is still `receivable`), grouped into
`<30 / 30–60 / 60–90 / >90` days overdue. DSO (平均收款週期) = mean of `(settledAt − issueDate)`
in days over all invoices with non-null `settledAt` falling inside a trailing window (default:
trailing 12 months), i.e. a straight
`AVG(julianday(settledAt) - julianday(issueDate))` query against `invoices` alone — no join to
the ledger row's timestamps needed. Same shape as any other trailing-window metric already in
the codebase (`trailingMonthlyExpense`, `northstarMetrics.ts:51`).

### Bimonthly 銷項稅額 summary (401 prep)

`SUM(taxAmount)` grouped by two-month period (1–2月, 3–4月, …), scoped to the company book,
over invoices whose `issueDate` falls in the period — issuance-based, not settlement-based
(matches 401 申報's legal timing: tax is owed on the invoice date, not the payment date, which
is exactly why the 「本期應繳營業稅」reminder in Model A must not filter to `settled` rows).

## 4. 共同記帳對齊

**DECIDED (operator, 2026-07-13): the end goal is 雙向共寫** (both members write into a shared
book) — not merely `plans/143-household-sharing-spike.md`'s read-only projections scope.

Book = the sharing boundary: a shared book is just a `Book` row (§2) whose sync envelopes live
in a per-book envelope namespace wrapped to multiple members' devices, instead of one person's
personal vault. The sync engine already resolves concurrent multi-device edits for **one**
person's several devices via per-row revisions/LWW (`src/features/connect/sync/pull.ts:1–9,
154–157`, cited in `docs/split-legs-plan.md` for the identical mechanism) — 雙向共寫 is
architecturally "multi-device sync where the devices belong to two people," reusing the same
per-record LWW apply loop. The genuinely new problems, per plan 143 (`plans/
143-household-sharing-spike.md`), are:

- **Key/privacy boundary**: a per-book envelope namespace with a book key wrapped to each
  member's device public keys, composing with whichever key-model option plan 143 ultimately
  picks (its §2, "Household Space Key" vs per-pair wrapping) — this spike does **not** preempt
  that choice, it only asserts that "book" is the right unit to wrap a key around (one wrapped
  key per shared book, not one per household — a household could in principle have a shared
  book AND keep other books private, which the household-space-key-per-household framing in 143
  would need to generalize to household-space-key-per-book).
- **Membership/revocation**: who is a member of a given shared book, and what happens to
  already-synced data on 移除成員 (matches 143's open question on revocation — this spike defers
  to 143's eventual answer, doesn't re-decide it).

**Sequencing** (honest, not optimistic): read-only shared projections first (143's scope, its
existing deliverable), 雙向共寫 as the explicit target named here with its extra risks stated
plainly:

- **Conflict UX**: two people editing the same shared-book transaction concurrently need a
  resolution UI beyond silent LWW (which is fine for one person's own devices, where the loser
  just re-edits, but surprising when the loser is a different human who didn't expect their
  edit to vanish).
- **Category/account references crossing vaults**: a shared-book transaction's `category` or
  `accountId` reference must resolve inside the shared book's own namespace, not leak into
  either member's personal category list — categories likely need to become book-scoped too
  (out of this spike's core decision but a direct consequence of "book is the sharing boundary"
  that a Phase 3/4 build plan must specify).

The company book is **just another non-shared book** — nothing about 公司帳 requires sharing
machinery; it's single-owner in the operator's case and stays local-only unless he later adds a
co-owner, at which point it becomes a shared book like any other. **Nothing in the books v1
build may hard-code "exactly 2 books" or "books are local-only"** — the `Book` table (§2) has no
cardinality limit and its sync envelope is per-book from day one (even for personal-only books,
which simply have a member list of size 1), so upgrading a book to shared later is "invite a
second member," not a schema migration.

## 5. UX sketch + phased build outline

**Book switcher**: sidebar placement, directly below the existing Search trigger and above the
Quick Add trigger (`src/components/AppShell.tsx:227–252` is Search, `254` onward is Quick Add —
the switcher sits between them so it's visible before every navigation action, matching how
Search is already the first interactive element under the logo). 總帳 renders as a pseudo-book
entry in the same switcher list (not a separate toggle elsewhere), with its own accent (neutral,
distinct from any real book's `color`). Each real book carries a per-book accent `color` (§2's
`Book.color`) used as a small dot/stripe in the switcher and echoed in 總覽's per-book
breakdown. QuickAdd (`src/components/QuickAdd.tsx`) and the ledger entry drawer default their
account picker to accounts belonging to the active book (falling back to "all accounts" only
when in 總帳 mode). 總覽 in 總帳 mode must visually separate company vs personal contributions
(e.g. a stacked/grouped breakdown by book, not just one blended number) so the operator never
has to wonder which portion of net worth is his personally-taxed money vs the company's.

**DECIDED (operator, 2026-07-13): FIRE/淨值 inclusion is a per-book toggle**, not a hard rule —
`Book.includeInPersonalNetWorth` / `Book.includeInFireMetrics` (§2's schema), defaulting
personal books to ON and company books to OFF; 總帳 view always shows everything regardless of
the toggles (the toggles only affect the *personal-scoped* dashboard/FIRE views, never 總帳).
Rationale: the app must serve both 行號 (sole proprietorship, personally taxed — such an owner
may rationally toggle company money ON since it legally *is* his personal wealth) and 有限/
股份有限公司 (legally separate entities — default OFF is correct) without the app encoding
entity law itself. The operator, a single-owner 有限公司, explicitly accepts the OFF default
given the toggle exists for those who need it flipped.

### Phases

| Phase | Scope | Effort | Plan files it would become |
|---|---|---|---|
| **Phase 1** | `Book` entity + migration (default personal book, `accounts.book_id` backfill) + book switcher UI + scope every §1 surface's query by active book/總帳 + characterization test (see Maintenance notes) | **L** (touches every aggregation consumer, even though each touch is small) | A schema+migration plan, a per-surface scoping plan (possibly split by domain area: dashboard, cash-flow, budgets/goals/FIRE, analytics, annual report) |
| **Phase 2** | Invoice/稅金/客戶主檔/帳齡+DSO on the company book: `invoices` + `clients` tables, Model-A tax fields on `LedgerTransaction`, 開發票 UI flow reusing the receivable/settle rails, bimonthly 401 summary, aging/DSO queries | **L** | An invoice-entity plan, a client-master plan (can share one plan file given both are additive tables with no cross-cutting query changes) |
| **Phase 3** | Shared books, read-only (blocked on plan 143's key-model decision) | **M** (mostly key-wrapping + read-only projection sync; UI reuses Phase 1's book switcher) | Executes plan 143's build estimate, scoped to "book" as the sharing unit per §4 |
| **Phase 4** | 雙向共寫: conflict UX for concurrently-edited shared-book rows, book-scoped categories, membership/revocation UI | **XL** (new conflict-resolution UX, category model change) | A dedicated build plan per §4's named risks — do not fold into Phase 3 |

### Open questions for the operator (numbered, each with a recommended answer)

1. **Do budgets/goals ever apply to a company book?** *Recommended: no for v1* — §1 surfaces 5–6
   default to personal-only; revisit only if the operator later runs a 行號-style company where
   "company budget" is a meaningful personal-finance concept for him.
2. **Should the 未結清 card (§1 #4) show cross-book 股東代墊 receivables when viewing either
   book, or only the company book?** *Recommended: both* — it's a real obligation from either
   party's point of view (spec'd in §2's cross-book 代墊 case); hiding it from the personal-book
   view risks the operator forgetting the company owes him money.
3. **Invoice numbering**: sequential per book, or does the operator need to match Taiwan's
   統一發票 numbering ranges (issued by the tax authority in blocks)? *Recommended: v1 is a free-
   text `invoiceNumber` field, no auto-sequencing* — this spike explicitly scoped out e-invoice/
   財政部 integration; auto-matching official number ranges is a v2+ concern if he moves off
   manual bookkeeping.
4. **Does the 401 bimonthly summary need to become a filed/locked snapshot** (so edits after
   filing don't silently change a past period's reported number), or is a live re-computed query
   sufficient? *Recommended: live query for v1* — he can screenshot/export at filing time; a
   locked-snapshot model is meaningfully more schema (a `taxFilingPeriods` table) for a problem
   that hasn't been reported yet.
5. **When Phase 3 lands, does an existing personal book ever get "converted" to shared, or is a
   shared book always created fresh (with data manually re-entered/imported)?** *Recommended:
   convert-in-place* (invite a member to an existing book, per §4's "upgrading a book to shared
   is not a schema migration") — re-entry would be a bad experience for an operator who has
   months of company-book history before ever inviting a co-owner/bookkeeper.

## Maintenance notes

- Any Phase 1 build plan must include a **characterization-test step first**: snapshot 總覽/
  記帳 aggregates on a seeded dataset, then assert 總帳 mode reproduces them exactly after the
  book column lands (books must be a pure partition — no money appears or disappears). This
  mirrors the "no data migration needed, legacy rows read `null`" backward-compat property
  `docs/split-legs-plan.md` established for `legKind`.
- Whoever executes plan 143 later must read this spike's §4 first — the sharing boundary is now
  "book," not "account" (though in practice, since every account belongs to exactly one book,
  the two are equivalent for the read-only-projection case 143 already scoped; the divergence
  only shows up at 雙向共寫, Phase 4).
- Deferred by design (unchanged from plan): 進項稅額 (expenses' input VAT), 營所稅, multi-company,
  e-invoice/財政部 APIs.
- If the operator rejects any decision recorded here as final, record the rejection in
  `plans/README.md`'s rejected-findings ledger so it isn't re-proposed, per this repo's
  convention (`docs/split-legs-plan.md`'s own maintenance notes establish the same pattern).
