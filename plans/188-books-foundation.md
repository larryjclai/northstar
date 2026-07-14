# Plan 188: 帳本 Phase 1a — Book 實體、accounts.book_id、同步接線與「純分割」特徵測試

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on.
> Touch only the files listed as in scope. If any STOP condition occurs,
> stop immediately and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Read first**: `docs/ledger-books-plan.md` (committed to main) — the
> design this plan implements. §2(a) is the decided data model; this plan
> is its schema/repository/sync slice. UI is plan 189, NOT here.
>
> **Drift check (run first)**:
> `git diff --stat 2377da34..HEAD -- src/domain/types.ts src/domain/sync.ts src/data/repositories.ts src/data/migrations.ts`
> If any changed since planning, compare the "Current state" excerpts
> against live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches sync-entity wiring; mitigated by dual-harness tests + characterization test)
- **Depends on**: none (independent of plan 187)
- **Category**: direction (books Phase 1a, per docs/ledger-books-plan.md phase table)
- **Planned at**: commit `2377da34`, 2026-07-13

## Why this matters

Operator-decided feature (design: `docs/ledger-books-plan.md`): 公司帳/個人帳
分離記帳 + 總帳合併檢視. This plan lands the invisible half: the `Book`
entity, `accounts.book_id`, migration/backfill (all existing data → 個人帳),
sync wiring, and the **characterization test proving books are a pure
partition** — no money appears or disappears when the column lands. Plan
189 then builds the switcher UI + query scoping on top. Nothing in this
plan changes any user-visible number or screen.

## Current state (verified at `2377da34`)

- **No book concept**: `grep -rn "book" src/data/repositories.ts` → 0 hits.
- `src/domain/types.ts:55-62` — `SyncFields` (id, spaceId, revision,
  createdAt, updatedAt, deletedAt). `Account extends SyncFields` at 64–90.
- `src/domain/sync.ts:18-26` — the `SyncEntity` union:

  ```ts
  export type SyncEntity =
    | "account" | "ledger" | "asset" | "investment"
    | "recurring" | "recurringInvestment" | "goal" | "settings";
  ```

- `src/data/repositories.ts` — two implementations:
  `BrowserFinanceRepository` (line 590, in-memory/browser) and
  `TauriSqlFinanceRepository extends BrowserFinanceRepository` (line 2062,
  SQLite). `tableByEntity` maps appear at **8 sites** (`grep -c
  tableByEntity src/data/repositories.ts` → 8) — every one enumerates
  `Record<Exclude<SyncEntity, "settings">, string>` and will fail to
  typecheck until `book: "books"` is added (this is the safety net: the
  compiler finds every switch for you).
- `AccountDraft` at `repositories.ts:81` — the create/update input type;
  `createAccount`/`updateAccount` interface at 254–255, Browser impl at 706.
- Additive columns use `ensureSqliteColumn` inside SQLite `initialize()`
  (idempotent `pragma table_info` guard) — exemplar calls at
  `repositories.ts:2107-2110`; the convention is documented at
  `src/data/migrations.ts:236-241`. New TABLES go in `migrations.ts`'s
  migration list (see the `recurring_investments` table migration ending
  ~line 233 for the exact shape).
- Dual-harness test pattern: `src/data/repositories.split.test.ts` runs the
  same behavioral suite against BOTH repos — model the new tests on it.
- Aggregation entry points for the characterization test:
  `buildNetWorthBreakdown` (`src/domain/dashboardSummary.ts:77`) and its
  existing test file `src/domain/dashboardSummary.test.ts` (seed-rows
  pattern to copy).
- Design decisions to honor verbatim (from `docs/ledger-books-plan.md` §2a
  and §5, operator-locked): `Book` = `{ id, name, kind: "personal" |
  "company", includeInPersonalNetWorth: boolean, includeInFireMetrics:
  boolean, color: string | null } & SyncFields`; defaults personal→both
  toggles ON, company→both OFF; default book name 「個人帳」; every book
  syncs per-record like any entity (per-book envelope namespacing is a
  LATER phase concern — v1 books ride the normal per-record sync).

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `npm install`        | exit 0 (fresh worktree) |
| Typecheck | `npx tsc --noEmit`   | exit 0              |
| Tests     | `npm test`           | all pass (1155 + new) |
| Lint      | `npm run lint`       | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `src/domain/types.ts` (Book interface, `bookId` on Account + AccountDraft pick source)
- `src/domain/sync.ts` (SyncEntity union + any payload normalizer it hosts)
- `src/data/repositories.ts` (books CRUD, account bookId plumbing, all 8 `tableByEntity` sites, getSyncPayload/applySyncChanges, SQLite table + ensureSqliteColumn + default-book backfill)
- `src/data/migrations.ts` (books table migration)
- `src/data/repositories.books.test.ts` (create — dual-harness)
- `src/domain/booksPartition.test.ts` (create — characterization test)
- `src/features/connect/sync/pull.ts` — ONE line only: add `"book"` to the
  `VALID_ENTITIES` set (line ~194). This is generic entity-list
  maintenance, not merge logic. (Amendment 2026-07-13 after executor STOP:
  the original plan wrongly assumed pull.ts was fully entity-generic; its
  whitelist is a literal `Set` the compiler cannot flag as incomplete —
  without this line, incoming book envelopes are silently skipped as
  格式不符.)
- `src/features/connect/sync/conflictSummary.ts` — ONE line only: add
  `book: "帳本",` to the `ENTITY_LABELS` `Record<SyncEntity, string>`
  (line ~8). (Amendment 2, 2026-07-13 after 2nd executor STOP: this is a
  compiler-caught exhaustive Record — tsc requires it once `"book"` joins
  the union; the call site at :67 already has a `?? conflict.entity`
  runtime fallback, so it is a pure compile fix, same mechanical class as
  the pull.ts line. Verified: these FOUR files — sync.ts, repositories.ts,
  pull.ts, conflictSummary.ts — are the COMPLETE set of non-test SyncEntity
  consumers.)
- `src/domain/sync.test.ts` / existing repo tests ONLY if a type change forces a fixture update (report any such edit in NOTES)

**Out of scope** (do NOT touch):
- ANY route/component/UI file — plan 189's job. Zero visible change.
- `src/features/connect/sync/push.ts` — verified entity-generic
  (`collectPendingChanges`/`getSyncPayload(change.entity, …)`, no
  hardcoded enumeration). Any other edit to `pull.ts` beyond the
  VALID_ENTITIES line above.
- `LedgerTransaction` — gets NO book field (design §2a: transactions
  inherit via account).
- Worker (`worker/`) — envelopes are opaque; no server change in Phase 1.

## Git workflow

- Branch: `feat/ai-books-foundation` off `main`
- Conventional commits per logical unit, e.g. `feat(books): Book entity + accounts.book_id + sync wiring (plan 188)`
- Do NOT push or open a PR.

## Steps

### Step 1: Characterization test FIRST (against current code)

Create `src/domain/booksPartition.test.ts`: seed a realistic dataset
(accounts of several types incl. credit; ledger rows incl. income/expense/
transfer pair/receivable; model the seeding on `dashboardSummary.test.ts`)
and snapshot-assert the outputs of `buildNetWorthBreakdown`,
`calculateAvailableCash`, and `calculateLiabilities` (import from
`src/domain/dashboardSummary.ts`). These assertions must be written against
TODAY's outputs and must still pass UNCHANGED at the end of this plan —
that is the "pure partition" proof (no book code path may alter any number
when no book filter is applied).

**Verify**: `npm test -- booksPartition` → new tests pass on the
UNMODIFIED codebase.

### Step 2: Domain types

`src/domain/types.ts`: add `Book` interface (fields per Current state,
`extends SyncFields`); add `bookId: string` to `Account` (non-optional in
the type — the repos backfill so no runtime null; hydration maps null →
default book id). Add `"book"` to the `SyncEntity` union in
`src/domain/sync.ts`. If `sync.ts` hosts a payload normalizer keyed by
entity (`normalizeSqliteSyncPayload` — find its definition), extend it for
`book` (booleans need the SQLite 0/1 → boolean hydration; see project
convention from plan 147).

**Verify**: `npx tsc --noEmit` → FAILS listing every site that must now
handle `book`/`bookId` (this is expected and is your worklist for Step 3).

### Step 3: Repositories — both classes

In `src/data/repositories.ts`:

1. `FinanceRepository` interface: `listBooks(): Promise<Book[]>`,
   `createBook(input)`, `updateBook(id, input)` (soft-delete deferred —
   deleting a book requires account reassignment UX, plan 189+; do NOT add
   deleteBook), and extend `AccountDraft` with `bookId`.
2. `BrowserFinanceRepository`: in-memory books array + CRUD + a
   `ensureDefaultBook()` that (idempotently) creates the 「個人帳」default
   book and assigns it to any account with a missing bookId. Call it from
   the same place the class hydrates/initializes accounts.
3. `TauriSqlFinanceRepository`: `books` table migration in
   `migrations.ts` (columns: id, space_id, revision, created_at,
   updated_at, deleted_at, name, kind, include_in_personal_net_worth
   integer, include_in_fire_metrics integer, color); `ensureSqliteColumn
   ("accounts", "book_id", "text not null default ''")`; in `initialize()`,
   after ensures, run the default-book backfill (insert default book if
   `books` empty; `update accounts set book_id = $default where book_id =
   ''`). Wire `book: "books"` into ALL 8 `tableByEntity` sites and the
   settings-style special cases (getSyncPayload/getSyncPayloads/
   applySyncChanges) — let the Step 2 compile errors guide you; when tsc is
   green again, `grep -c '"books"' src/data/repositories.ts` should be ≥ 8.
4. **NOT compiler-enforced — do by hand (amendment after executor STOP)**:
   two hardcoded `tables: Array<[string, Exclude<SyncEntity, "settings">]>`
   arrays enumerate the outbox-tracked tables and will NOT produce compile
   errors when `book` joins the union:
   - `ensureSyncInfrastructure()` (~line 4364) — drives the SQLite outbox
     insert/update triggers; missing here = book rows never enter the
     outbox (never pushed).
   - `backfillSyncOutbox()` (~line 4431) — same array shape.
   Add `["books", "book"]` to BOTH.
5. `src/features/connect/sync/pull.ts` line ~194: add `"book"` to
   `VALID_ENTITIES`.
6. Account row mapping (SQLite select → Account object) hydrates `bookId`.

**Verify**: `npx tsc --noEmit` → exit 0; `npm test` → all previous 1155
pass (especially `repositories.split.test.ts` untouched and green).

### Step 4: Dual-harness books tests

Create `src/data/repositories.books.test.ts` modeled on
`repositories.split.test.ts`'s dual-repo structure, covering: create/list/
update a book; default-book backfill (an account created without bookId —
or a pre-existing account — ends up in 個人帳); toggles round-trip
(booleans survive SQLite 0/1 hydration); account carries bookId through
create/update; sync payload for a book row (`getSyncPayload("book", id)`
returns the row with revision fields); **outbox tracking** — after
`createBook`, `collectPendingChanges()` (or the harness's equivalent)
includes an entry with `entity: "book"` (this is the test that would have
caught the missing trigger arrays; it must run in the SQLite harness).

**Verify**: `npm test -- repositories.books` → all new tests pass ×2 repos.

### Step 5: Characterization test still green + full gate

**Verify**: `npm test` → everything passes INCLUDING Step 1's
`booksPartition.test.ts` byte-unchanged; `npx tsc --noEmit` → 0;
`npm run lint` → 0.

## Test plan

Covered by Steps 1/4/5: characterization (pure partition), dual-harness
CRUD + backfill + boolean hydration + sync payload. No UI tests (no UI).

## Done criteria

- [ ] `npx tsc --noEmit` exits 0; `npm run lint` exits 0; `npm test` exits 0
- [ ] `booksPartition.test.ts` passes byte-identical to its Step-1 version (`git diff --stat` shows it added in one commit, never amended after Step 3)
- [ ] `grep -c '"books"' src/data/repositories.ts` ≥ 10 (8 tableByEntity sites + the 2 outbox-trigger arrays)
- [ ] `grep -n '"book"' src/domain/sync.ts` → in the SyncEntity union
- [ ] `grep -n '"book"' src/features/connect/sync/pull.ts` → in VALID_ENTITIES
- [ ] Dual-harness test asserts a created book appears in the pending-changes/outbox stream (SQLite harness)
- [ ] No UI/route/component file modified (`git status`)
- [ ] New tests: books dual-harness + partition characterization, all passing

## STOP conditions

- The `SyncEntity` union or `tableByEntity` shape no longer matches the
  excerpts (sync layer refactored since planning).
- `push.ts`/`pull.ts` turn out to need book-specific changes (they should
  be entity-generic — if not, the design assumption is wrong; report).
- The characterization test from Step 1 fails after Step 3 and the fix is
  not an obvious bug in YOUR new code (i.e. the book column genuinely
  perturbs an aggregate) — report the exact diff in numbers.
- `plugin-sql` migration ordering issues (db-locked, double-ALTER) you
  cannot resolve with the existing `ensureSqliteColumn` pattern.

## Maintenance notes

- Plan 189 consumes: `listBooks()`, `Account.bookId`, the default-book
  guarantee (every account always has a book after initialize).
- Book soft-DELETE is deliberately absent — requires account-reassignment
  UX; design it with the switcher iteration if requested.
- Phase 3 (shared books) will move book envelopes into per-book namespaces;
  nothing here may assume "exactly one local user" beyond what the current
  sync already assumes.
- Reviewer scrutiny: the 8 tableByEntity sites (compiler-guided, but check
  none was silenced with a cast), boolean hydration, and that
  `booksPartition.test.ts` wasn't weakened after Step 1.
