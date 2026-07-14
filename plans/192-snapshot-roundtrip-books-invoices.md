# Plan 192: 修復快照 round-trip — SQLite exportSnapshot 漏 books（188 回歸）+ invoices/clients 全鏈路

> **Executor instructions**: Follow step by step, verify each step, honor
> STOP conditions, do not touch out-of-scope files. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA>..HEAD -- src/data/repositories.ts`

## Status

- **Priority**: P1 (data-integrity — a SHIPPED regression: desktop backup/restore silently drops books; invoices/clients would be lost the same way once 191 makes them user-facing)
- **Effort**: S
- **Risk**: LOW (additive to snapshot; guarded by a new round-trip test)
- **Depends on**: plan 190 MERGED (introduces Invoice/Client + insertInvoiceRow/insertClientRow that this uses). If 190 not merged, STOP.
- **Category**: bug
- **Planned at**: commit `<fill at dispatch: main SHA after 190 merges>`, 2026-07-13

## Why this matters

Two gaps in `RepositorySnapshot` round-trip, both on the **SQLite/desktop
path** (the real app; the browser path is unaffected):

1. **188 regression (shipped)**: the SQLite `exportSnapshot` override
   (`repositories.ts:3969-4004`) does NOT include `books`, even though its
   `importSnapshot` (`~4243`) deletes+reinserts books from the snapshot.
   Net effect on desktop: export a backup → the snapshot has no books →
   restore it → `delete from books` then insert **zero** → all company
   books + their 計入淨值/FIRE toggles are lost (accounts keep their
   `book_id` but now point at nothing; `ensureDefaultBook` only recreates
   個人帳). The browser `exportSnapshot` (`~1762`) already includes books,
   which is why tests + web don't catch it.
2. **190 gap**: `invoices` and `clients` are in neither export path nor the
   import path nor the `RepositorySnapshot` type. Once plan 191 makes
   invoices user-facing, a desktop backup/restore would silently drop every
   invoice + client (real financial records) — this must be fixed BEFORE or
   WITH 191.

## Current state (verify at dispatch)

- `RepositorySnapshot` (`repositories.ts:423`) has `books?: Book[]` (188) but
  no `invoices`/`clients`.
- Browser `exportSnapshot` (`~1758-1786`): includes `books: this.data.books`;
  no invoices/clients.
- Browser `importSnapshot` (`~1881`): restores `books: snapshot.books`; no
  invoices/clients.
- SQLite `exportSnapshot` (`3969-4004`): the returned object lists accounts,
  ledger, assets, investments, recurring, quotes, settings, fx, prices,
  goals, manualSnapshots — **no `books`, no invoices/clients**. (grep the
  return object: `sed -n '3986,4003p'`.)
- SQLite `importSnapshot` (`~4243-4310+`): has `delete from books` +
  `insert ... insertBookRow(book)`; no invoices/clients delete+insert.
- 190 provides: `listInvoices()`/`listClients()` (both repos),
  `insertInvoiceRow`/`insertClientRow` (SQLite), `this.data.invoices`/
  `this.data.clients` (browser in-memory arrays).

## Commands you will need

| Purpose   | Command              | Expected |
|-----------|----------------------|----------|
| Install   | `npm install`        | exit 0   |
| Typecheck | `npx tsc --noEmit`   | exit 0   |
| Tests     | `npm test`           | all pass |
| Lint      | `npm run lint`       | exit 0   |

## Scope

**In scope**:
- `src/data/repositories.ts` — `RepositorySnapshot` type; browser + SQLite
  `exportSnapshot`/`importSnapshot`; the `createInitialData`/normalizer that
  seeds empty `invoices: []`/`clients: []` if needed for the browser store.
- `src/data/repositories.snapshot.test.ts` (create, or extend an existing
  snapshot/backup test) — round-trip assertion.

**Out of scope**:
- The `localBackup.ts` layer (it calls export/import; no change needed).
- Sync push/pull (separate from snapshot).
- Any entity's shape.

## Steps

### Step 1: Round-trip test FIRST (fails on current SQLite path for books)
In a new `src/data/repositories.snapshot.test.ts`, using the SQLite harness
(the bug is SQLite-only — reuse `repositories.books.test.ts`'s harness
setup): create a company book (kind "company", toggles off), a client, and
an invoice; `exportSnapshot()`; wipe/reinit a fresh repo; `importSnapshot()`;
assert `listBooks()` includes the company book, `listClients()` the client,
`listInvoices()` the invoice — all fields intact. Also add the browser-repo
variant for invoices/clients (books already round-trip there).
**Verify**: `npm test -- repositories.snapshot` → the SQLite books/invoice/
client assertions FAIL before Step 2 (proving the gap), browser books pass.
(If books already pass on SQLite, the 188 regression was fixed elsewhere —
STOP and report.)

### Step 2: Add books to SQLite exportSnapshot (fix the 188 regression)
Add `this.listBooks()` to the `Promise.all` and `books` to the returned
object in the SQLite `exportSnapshot` (`3969-4004`), mirroring how the
browser export includes them.
**Verify**: `npm test -- repositories.snapshot` → the SQLite **books**
assertion now passes.

### Step 3: Add invoices + clients to the type + all four paths
- `RepositorySnapshot`: add `invoices?: Invoice[]`, `clients?: Client[]`.
- Browser `exportSnapshot`: `invoices: this.data.invoices, clients: this.data.clients`.
- Browser `importSnapshot`: restore both (mirror how it restores `books`).
- SQLite `exportSnapshot`: add `listInvoices()`/`listClients()` to Promise.all + object.
- SQLite `importSnapshot`: `delete from invoices`/`delete from clients` then
  `insertInvoiceRow`/`insertClientRow` for `snapshot.invoices ?? []` /
  `snapshot.clients ?? []` (mirror the books block; use `?? []` so
  pre-190 snapshots without these keys still import cleanly).
- If the browser in-memory store normalizer needs `invoices: []`/`clients: []`
  defaults for old stored data, add them (mirror `books: []` at ~5184/5325).
**Verify**: `npm test -- repositories.snapshot` → ALL round-trip assertions
pass (books + invoices + clients, both harnesses).

### Step 4: Full gate
**Verify**: `npx tsc --noEmit` 0; `npm run lint` 0; `npm test` all pass
(1214 + new).

## Done criteria
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0; `npm test` 0 failures
- [ ] SQLite `exportSnapshot` return object includes `books`, `invoices`, `clients` (grep `sed -n '3969,4010p'`)
- [ ] Both import paths restore invoices + clients with `?? []` guards
- [ ] New round-trip test asserts book+invoice+client survive export→import on the SQLite harness
- [ ] No entity shape changed; no UI file touched (`git status`)

## STOP conditions
- Books already round-trip on the SQLite path (regression fixed elsewhere since planning) — report.
- Plan 190 not merged (Invoice/Client/insertXRow absent).
- `exportSnapshot`/`importSnapshot` structure no longer matches the excerpts.

## Maintenance notes
- Any future synced entity must be added to BOTH export paths + BOTH import
  paths + the `RepositorySnapshot` type — this is a THIRD checklist item
  alongside 188's "4 sync files + 2 outbox arrays". Consider a follow-up to
  unify snapshot entity handling so it can't drift per-entity again.
- Reviewer scrutiny: the `?? []` guards (old snapshots must still import),
  and that the SQLite import order doesn't violate any FK (invoices
  reference ledger rows by id, but there's no enforced FK — insert order is
  not load-bearing; confirm).
