# Plan 206: Add `deleteBook` — soft-delete a 帳本, with guards for accounts / invoices / clients

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 087a9b2e..HEAD -- src/data/repositories.ts src/routes/AccountsRoute.tsx src/data/repositories.books.test.ts`

## Status

- **Priority**: P0
- **Effort**: M
- **Risk**: MED (deletes user data — but soft-delete only, and heavily guarded)
- **Depends on**: none
- **Category**: bug (missing feature causing a stuck user)
- **Planned at**: commit `087a9b2e`, 2026-07-15
- **Source**: operator hit it live — a duplicate 個人帳 they cannot remove.

## Why this matters

**A user has a 帳本 they did not create and cannot delete.** There is no delete
path at all — not in the UI, not in the repository layer. Verified at `087a9b2e`:
`grep -rn "deleteBook" src/` returns **zero matches**.

This was a known, deliberate deferral. `src/data/repositories.ts:275-276` says so:

```ts
  /** 帳本 (Books). There is always at least the default 個人帳. No delete yet
   *  (soft-delete needs account-reassignment UX — deferred to a later phase). */
```

This plan is that later phase.

**Why it is urgent**: a separate, confirmed bug mints a duplicate default 個人帳
per device (each device calls `ensureSqliteDefaultBook()` in `initialize()`,
which generates a **random UUID** via `createId("book")`, and it runs *before*
any sync pull — so a second device mints its own before it can learn one already
exists; sync then shows both on both devices). Fixing that root cause is
plan 207 and needs design work. **`deleteBook` is the escape hatch that
unblocks the user today**, independent of 207.

## Current state

### There is no delete — verified

- `grep -rn "deleteBook\|removeBook" src/` → **0 matches**.
- The `FinanceRepository` interface (`src/data/repositories.ts:273-279`) has
  `listBooks` / `createBook` / `updateBook` and nothing else for books.

### The repo's precedent for "you may not delete this yet" — copy it

`src/data/repositories.ts:970-974` — `deleteAccount` **blocks** rather than
cascading, and throws a zh-TW message:

```ts
  async deleteAccount(id: string) {
    const hasRows = this.data.ledgerTransactions.some((row) =>
        (row.accountId === id || row.counterAccountId === id) && row.deletedAt === null)
      || this.data.investmentRecords.some((row) => row.linkedAccountId === id && row.deletedAt === null);
    if (hasRows) throw new Error("已有交易的帳戶不能刪除。");
```

**Match this shape**: check for referrers, throw a zh-TW `Error`, never cascade.

### Three tables reference a book — all three must be guarded

`book_id` is not only on accounts:

| Table | Where | Note |
|---|---|---|
| `accounts` | `repositories.ts:2374` (`ensureSqliteColumn("accounts", "book_id", ...)`) | the obvious one |
| `invoices` | `migrations.ts:266` (`book_id text not null default ''`) | 發票 belong to a 公司帳 |
| `clients` | `migrations.ts:290` (`book_id text not null default ''`) | 客戶主檔 likewise |

**Do not cascade or reassign any of them.** Invoicing is a 公司帳 concept;
silently moving an invoice into a 個人帳 is semantically wrong, and silently
moving 25 accounts changes every net-worth/FIRE scoping the user sees. Block
instead, and name what is in the way.

### The user CAN already move accounts out — so blocking is not a dead end

`src/routes/AccountsRoute.tsx:854-855` — the account editor already has a book
picker:

```tsx
                      value={form.bookId || (books[0]?.id ?? "")}
                      onChange={(bookId) => setForm({ ...form, bookId })}
```

So "empty the book first, then delete it" is a real workflow, not a wall.

### The two repository implementations you must keep in parity

`createBook` / `updateBook` exist twice. **Both need `deleteBook`.**

**In-memory** (`repositories.ts:783-812`) — mutates `this.data.books`, then
`await this.persist()`. `updateBook` uses the `bump()` helper
(`repositories.ts:558`) which does `revision + 1` and refreshes `updatedAt`:

```ts
  async updateBook(id: string, input: BookDraft) {
    this.data.books = this.data.books.map((book) =>
      book.id === id ? bump({
        ...book,
        name: input.name,
        ...
      }) : book,
    );
    await this.persist();
```

**SQLite** (`repositories.ts:2559-2564`):

```ts
  override async updateBook(id: string, input: BookDraft) {
    await this.db.execute(
      `update books set revision = revision + 1, updated_at = $1, name = $2, kind = $3, include_in_personal_net_worth = $4, include_in_fire_metrics = $5, color = $6 where id = $7`,
      [nowIso(), input.name, input.kind, Number(input.includeInPersonalNetWorth), Number(input.includeInFireMetrics), input.color ?? null, id],
    );
  }
```

### Soft delete, not hard delete — this is load-bearing for sync

`books` has a `deleted_at` column and **is a synced entity**. The outbox trigger
(`repositories.ts:4885`, `["books", "book"]`) fires on `after update ... when
new.revision <> old.revision`.

So the delete **must** be `set deleted_at = <now>, revision = revision + 1` — the
revision bump is what makes the trigger fire and the tombstone propagate to the
other device under last-write-wins. A hard `delete from books` would fire no
trigger, sync nothing, and the book would come back on the next pull.

`listBooks` already filters `where deleted_at is null` (`repositories.ts:2542`),
so a tombstoned book disappears from the UI for free.

### The default-book guard interacts with this — read carefully

`ensureSqliteDefaultBook()` (`repositories.ts:2514-2536`) runs on **every**
`initialize()` and does:

```sql
select id from books where kind = 'personal' and deleted_at is null order by created_at, id limit 1
```

If none exists, it mints a new one. **So deleting the last personal book is
pointless** — the next app start silently re-mints one with a new id. Worse, its
backfill (`update accounts set book_id = $1 ... where book_id = '' or book_id is
null`) only rescues accounts whose book_id is empty, so accounts stranded in a
tombstoned book would **not** be rescued. Guard 3 below exists for exactly this.

### The UI component

`src/routes/AccountsRoute.tsx:574-583` — `BookManager`:

```tsx
function BookManager({
  books, accounts, onCreate, onUpdate, creating, onClose,
}: {
  books: Book[];
  accounts: Account[];
  onCreate: (draft: BookDraft) => Promise<unknown>;
  onUpdate: (id: string, draft: BookDraft) => Promise<unknown>;
  creating: boolean;
  onClose: () => void;
}) {
```

It already computes a per-book account count (`repositories`-free, at
`AccountsRoute.tsx:591`):

```tsx
    for (const a of accounts) map.set(a.bookId, (map.get(a.bookId) ?? 0) + 1);
```

Mutation wiring lives at `AccountsRoute.tsx:117-118`:

```tsx
  const createBook = useRepositoryMutation((repository, input: BookDraft) => repository.createBook(input), ["books"]);
  const updateBook = useRepositoryMutation((repository, input: BookDraft & { id: string }) => repository.updateBook(input.id, input), ["books"]);
```

### Conventions to match

- `AGENTS.md` 樣式撰寫優先序: (1) COSS components; (2) `ns-*` / Tailwind utilities;
  (3) inline `style={{}}` **only for dynamic values**.
- Error messages are zh-TW sentences ending in 。 — see `"已有交易的帳戶不能刪除。"`
- Conventional commits. Example: `feat(investments): 日結 grouping mode with per-day 小計`
- DESIGN.md §12.2: destructive actions need a confirm gate.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (fresh worktree) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 121 files / **1252** tests pass |
| Books tests only | `npm test -- repositories.books` | pass |
| Lint | `npm run lint` | exit 0, **0 errors** (762 warnings pre-existing) |
| Build | `npm run build` | exit 0 |
| Dev | `npm run dev` | Vite dev server |

`npm install` will rewrite `package-lock.json` (known stale lockfile). Revert it:
`git checkout -- package-lock.json`. Do not commit it.

## Scope

**In scope**:
- `src/data/repositories.ts` — interface + both implementations
- `src/data/repositories.books.test.ts` — new tests
- `src/routes/AccountsRoute.tsx` — `BookManager` delete UI + mutation wiring

**Out of scope** (do NOT touch):
- **`ensureSqliteDefaultBook` / `ensureDefaultBookInMemory`** — do **not** try to
  fix the duplicate-default-book root cause here. That is **plan 207** and it has
  version-skew risk across devices that needs design first. This plan only lets
  the user remove a book.
- **The sync layer** (`src/features/connect/sync/*`) — the tombstone propagates
  through the existing outbox trigger. No sync change is needed. If you think one
  is, STOP.
- **Cascading deletes of accounts / invoices / clients.** Guard, never cascade.
- **Reassigning accounts on delete.** Tempting, and explicitly rejected: it would
  silently re-scope the user's net-worth and FIRE numbers. The account editor
  already has a book picker (`AccountsRoute.tsx:854`); make the user move them.
- `src/domain/bookScope.ts` — read-time scoping is unaffected.

## Git workflow

- Branch: `feat/ai-delete-book` off `main`.
- `git status` first. Uncommitted work you did not create → **STOP and report**;
  never stash (per `.agentrules`). Files under `plans/` are expected and not yours.
- Commit: `feat(books): 帳本可刪除（soft-delete + 帳戶/發票/客戶守衛）`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add `deleteBook` to the interface

`src/data/repositories.ts:273-279`. Add after `updateBook`, and **update the
stale comment** — it currently says "No delete yet":

```ts
  /** 帳本 (Books). There is always at least the default 個人帳 —
   *  `deleteBook` refuses to remove the last personal book. Delete is a
   *  soft-delete (deletedAt + revision bump) so the tombstone syncs. */
  listBooks(): Promise<Book[]>;
  createBook(input: BookDraft): Promise<void>;
  updateBook(id: string, input: BookDraft): Promise<void>;
  /** Soft-delete a 帳本. Throws (zh-TW) if the book still has accounts,
   *  invoices, or clients, or if it is the last personal book. Never cascades. */
  deleteBook(id: string): Promise<void>;
```

**Verify**: `npx tsc --noEmit` → **errors expected** (both implementations now
missing `deleteBook`). That is the point — it proves the interface drives both.

### Step 2: Implement the three guards + soft delete (in-memory)

Add to the in-memory repo, next to `updateBook` (~`repositories.ts:801`). Model
the guard style on `deleteAccount` (`repositories.ts:970`).

Guards, in this order (cheapest/clearest first):

1. **Book must exist and not already be deleted** → if not, return silently or
   throw; pick one and be consistent with `deleteAccount`'s behavior for a
   missing id (read it and match).
2. **No accounts** → `此帳本還有 N 個帳戶，請先將它們移到其他帳本。`
3. **No invoices, no clients** → `此帳本還有發票或客戶資料，不能刪除。`
4. **Not the last personal book** → `這是最後一個個人帳本，不能刪除。`
   Compute exactly as `ensureDefaultBookInMemory` does: books with
   `kind === "personal" && deletedAt === null`. If deleting this one would leave
   zero, refuse.

Then soft-delete with a revision bump. Use the existing `bump()` helper
(`repositories.ts:558`) so `revision`/`updatedAt` move together:

```ts
    this.data.books = this.data.books.map((book) =>
      book.id === id ? bump({ ...book, deletedAt: nowIso() }) : book,
    );
    await this.persist();
```

**Verify**: `npx tsc --noEmit` → in-memory error gone; SQLite error remains.

### Step 3: Implement the same in SQLite

Add next to `updateBook` (~`repositories.ts:2559`). Same four guards, same
messages — query the DB instead of arrays:

```ts
  override async deleteBook(id: string) {
    const accounts = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from accounts where book_id = $1 and deleted_at is null`, [id],
    );
    // ... invoices, clients, last-personal-book checks ...
    await this.db.execute(
      `update books set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
      [nowIso(), id],
    );
  }
```

**The `revision = revision + 1` is mandatory** — the outbox trigger
(`repositories.ts:4899`) only fires `when new.revision <> old.revision`. Without
it the tombstone never syncs and the book returns on the other device's next pull.

Guard messages must be **byte-identical** to the in-memory ones — the dual-harness
tests assert against both implementations.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Tests — dual harness

`src/data/repositories.books.test.ts` already exists and runs against **both**
implementations via `describeEachRepo` (see its header comment). It has 6 tests.
Add to it, following its existing style (read the whole file first):

1. `deleteBook` soft-deletes: the book vanishes from `listBooks()`, and a direct
   read still shows `deletedAt !== null` **and a bumped revision**.
2. **The tombstone reaches the outbox** — the file's header calls the existing
   outbox assertion "the trigger-array regression guard". Mirror it: after
   `deleteBook`, the pending-changes / outbox stream contains the book at its new
   revision. **This is the test that proves the delete actually syncs**; without
   it, a hard-delete regression would pass every other test.
3. Refuses with 帳戶: create a book, put an account in it, expect the zh-TW throw.
4. Refuses the last personal book: expect the zh-TW throw.
5. Deleting a book with 0 accounts succeeds (**this is the operator's exact case**).

Invoice/client guards: add coverage **only if** creating an invoice/client in the
test harness is straightforward (`createInvoice` / `createClient` exist —
`repositories.ts:282`, and see `repositories.books.test.ts`'s `accountDraft`
helper for the fixture style). If it needs significant scaffolding, skip it, say
so in your report, and note it as a coverage gap.

**Verify**: `npm test -- repositories.books` → all pass, ≥4 new tests.
**Verify**: `npm test` → 121 files, **1252 + N** tests, zero failures.

### Step 5: UI — delete affordance in BookManager

`src/routes/AccountsRoute.tsx`:

**5a.** Wire the mutation next to the others (~line 118):

```tsx
  const deleteBook = useRepositoryMutation((repository, id: string) => repository.deleteBook(id), ["books"]);
```

**5b.** Add `onDelete: (id: string) => Promise<unknown>` to `BookManager`'s props
(line 574-583) and pass it at the call site (~line 554).

**5c.** Add a delete button to each book row. Requirements:
- Use the COSS `<Button>` — **do not hand-roll a raw `<button>`**.
- It is destructive: `variant="destructive-outline"` if that variant exists in
  `src/components/coss/button.tsx` (it does, though it is currently unused
  app-wide); otherwise `variant="ghost"` with `style={{ color: "var(--ns-neg)" }}`.
  **Check the component first.**
- Icon: `<Trash size={14} />` — `Trash` is this repo's unambiguous delete glyph
  (37 uses, zero collisions).
- **Both** `aria-label="刪除帳本"` **and** `title="刪除帳本"`.
- **Confirm gate** (DESIGN.md §12.2): click → the button becomes 確定刪除 /
  取消 in place. **Do NOT use `window.confirm`** — it does not work in Tauri
  (a documented gotcha in `AGENTS.md`). Model the in-place confirm on
  `HoldingEditModal.tsx:194-224`'s `confirmDelete` state pattern.
- **Surface the guard errors.** The repository throws zh-TW messages; catch and
  show them. `BookManager` already has an `error` state (`AccountsRoute.tsx:587`)
  — reuse it. **A silently-swallowed guard error is the worst outcome here**: the
  user clicks 刪除, nothing happens, and they are exactly as stuck as before.

**Verify**: `npx tsc --noEmit` → exit 0.
**Verify**: `npm run lint` → 0 errors.

### Step 6: Gates + live check

- `npm test` → baseline + new tests, zero failures
- `npm run build` → exit 0
- `git status --short` → only the three in-scope files

**Live** (`npm run dev`, 帳戶 → 帳本):
1. A book with **0 accounts** → delete → confirm → **it disappears**. (The
   operator's case.)
2. A book **with accounts** → delete → the zh-TW guard message is **visible in
   the UI**, and the book stays.
3. The **last** 個人帳 → delete → refused with the zh-TW message.
4. **Restart the app** and confirm the deleted book has **not** come back. This
   catches a missing revision bump / hard-delete: `ensureSqliteDefaultBook` runs
   on every start.

Report which of 1–4 you verified and which you could not.

## Test plan

Covered in Step 4. The load-bearing one is **the outbox assertion** — it is the
only test that proves the tombstone will actually reach the other device. The
repo's existing books test already guards the create path this way ("the
trigger-array regression guard"); mirror it for delete.

Baseline: `npm test` → 121 files / 1252 tests at `087a9b2e`. Record before/after.

## Done criteria

ALL must hold:

- [ ] `grep -rn "deleteBook" src/data/repositories.ts | wc -l` → ≥4 (interface + 2 impls + …)
- [ ] `grep -rn "deleteBook" src/routes/AccountsRoute.tsx` → ≥2 (mutation + prop)
- [ ] `grep -n "No delete yet" src/data/repositories.ts` → **no matches** (stale comment gone)
- [ ] `grep -rn "delete from books" src/data/repositories.ts` → only the pre-existing one in `importSnapshot` (~line 4285). **Your delete must be an `update`, not a `delete`.**
- [ ] `grep -rn "window.confirm" src/routes/AccountsRoute.tsx` → no matches
- [ ] `git diff 087a9b2e..HEAD -- src/features/connect/` → **empty** (no sync change)
- [ ] `git diff 087a9b2e..HEAD -- src/domain/bookScope.ts` → **empty**
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0, 0 errors
- [ ] `npm test` exits 0; ≥4 new tests in `repositories.books.test.ts` pass on **both** harnesses
- [ ] `npm run build` exits 0
- [ ] Only the 3 in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- `deleteBook` already exists (someone built it since `087a9b2e`).
- `repositories.books.test.ts`'s `describeEachRepo` harness does not actually run
  both implementations, or you cannot make a new test run on both.
- The outbox assertion (Step 4 #2) **fails** — the tombstone is not reaching the
  outbox. That means the trigger is not firing and the whole design is wrong;
  report rather than working around it.
- `invoices` or `clients` turn out **not** to have `book_id` (contradicting
  `migrations.ts:266,290`) — then guard 3 is unnecessary and you should say so.
- Making the delete sync appears to require touching `src/features/connect/sync/`.
- `npm test` was already failing before you started (baseline 1252).
- You conclude the guards should cascade or reassign instead of blocking. That is
  an operator decision, explicitly made the other way — report, do not switch.

## Maintenance notes

- **This is the escape hatch, not the cure.** The duplicate 個人帳 that motivated
  it is minted by `ensureSqliteDefaultBook()` using a **random UUID**, on every
  device, *before* the first sync pull. Deleting the duplicate works today, but a
  **third device will mint a third one**. Plan 207 owns the root cause.
- **`deleteBook` and `ensureSqliteDefaultBook` are coupled.** The last-personal-
  book guard exists because `ensureDefault` would silently re-mint one — with a
  *new random id* — while accounts stayed stranded in the tombstoned book (its
  backfill only rescues `book_id = '' or null`). If 207 changes how the default
  book is minted, re-check this guard.
- **Soft-delete + revision bump is the contract.** Anyone who "optimizes" this to
  a hard `delete from books` breaks sync silently: no trigger, no tombstone, and
  the book resurrects from the other device's next pull. The Step 4 outbox test
  is what catches that — do not delete it.
- A reviewer should scrutinize: that it is an `update` not a `delete`; that the
  revision is bumped; that the zh-TW guard messages actually reach the UI rather
  than being swallowed; and that nothing in `src/features/connect/sync/` moved.
- Deferred: reassign-on-delete (rejected — silently re-scopes net worth); a
  "move all accounts to…" bulk action, which would make the accounts guard much
  less annoying for a book with 25 accounts.
