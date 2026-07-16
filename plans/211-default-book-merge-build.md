# Plan 211: Build the default-帳本 convergence fix — merge untouched system mints on pull, with announce + kind-aware self-heal

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> Commit per the Git workflow section. When done, update this plan's status
> row in `plans/README.md` — unless a reviewer dispatched you and told you
> they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 72142685..HEAD -- src/data/repositories.ts src/domain/bookMerge.ts src/domain/bookScope.ts src/features/connect/sync/`
> If in-scope files changed since `72142685`, compare "Current state" excerpts
> against live code; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: HIGH for this codebase (writes that re-point account ownership and
  tombstone books, propagating over E2E sync under last-write-wins). Mitigated
  by: pure-function core already prototyped + tested, conservative trigger
  (only untouched system mints), and the straggler self-heal shipping in the
  same unit.
- **Depends on**: plan 207 (spike, DONE — `docs/default-book-convergence-spike.md`),
  plan 206 (`deleteBook`, merged — supplies the soft-delete/tombstone precedent)
- **Category**: bug (root cause of the duplicate 個人帳)
- **Planned at**: commit `72142685`, 2026-07-15
- **Gates satisfied**: all four operator decisions taken 2026-07-15 (verbatim below)

## The operator's decisions — these are the spec, do not re-litigate

1. **告知 (announce)**: when a merge fires, the app tells the user — not silent.
2. **Auto-merge scope**: 「如果是使用者自己新增的不用自動合併，但這次是因為
   系統突然幫我新增了一個 0 帳戶的帳本」→ **only system-minted, never-edited
   duplicates are auto-merged. User-created or user-edited books are NEVER
   auto-merged**, even if they look duplicated. Manual `deleteBook` (plan 206)
   remains the path for those.
3. **Survivor-wins metadata**: accepted. (Decision 2 largely defuses the risk —
   losers are by definition untouched mints carrying only default metadata, so
   nothing customized is ever discarded.)
4. **Kind-aware straggler self-heal**: accepted as recommended — an account
   pointing at a dead **company** book resurrects the book; pointing at a dead
   **personal** book (or an unknown id) re-homes to the current default.

## Why this matters

Root cause (verified in the 207 spike, `docs/default-book-convergence-spike.md` §1):
every device mints its own default 個人帳 with a **random UUID** in
`initialize()`, **before its first sync pull can possibly run** — the ordering
is structural. Two fresh devices pairing → two mints → sync shows both,
forever; a third device mints a third. `deleteBook` (206) is the manual escape
hatch; this plan is the cure: duplicates converge automatically, and future
mints self-annihilate.

The spike also proved (§2) the duplicate itself is **cosmetic** — an empty book
moves no KPI — but a **naive merge would create a numeric bug worse than the
cosmetic one**: an account syncing in late, still pointing at a tombstoned
loser, silently vanishes from FIRE / personal-net-worth
(`bookScope.ts:68-81` builds `includedBookIds` from active books only, and
today's backfill heals only `book_id = '' or null`). **That is why the
straggler self-heal ships in this same plan, not as a follow-up.** Shipping the
merge without it fails this repo's first invariant (correctness first for
finance) — and fails review.

## Current state

Read these yourself; excerpts were taken at `72142685`.

### The mint — `src/data/repositories.ts:2538-2560` (`ensureSqliteDefaultBook`)

```ts
    const existing = await this.db.select<Array<{ id: string }>>(
      `select id from books where kind = 'personal' and deleted_at is null order by created_at, id limit 1`,
    );
    let defaultId = existing[0]?.id;
    if (!defaultId) {
      defaultId = createId("book");
      ...
      await this.db.execute(
        `insert into books (id, space_id, revision, created_at, updated_at, deleted_at, name, kind, include_in_personal_net_worth, include_in_fire_metrics, color)
         values ($1,$2,1,$3,$3,null,$4,'personal',1,1,null)`,
        [defaultId, personalSpace, timestamp, "個人帳"],
      );
    }
    // Backfill orphan accounts...
    await this.db.execute(
      `update accounts set book_id = $1, updated_at = $2, revision = revision + 1 where book_id = '' or book_id is null`,
      [defaultId, nowIso()],
    );
```

In-memory twin: `ensureDefaultBookInMemory` (`repositories.ts:693-715`).
**Both implementations get every change in this plan** — the dual-harness test
suite (`describeEachRepo`) enforces parity.

### Why `revision === 1` means "never user-edited" — verified

Books' revision is bumped in exactly two places: `updateBook`
(`repositories.ts:2585`) and `deleteBook`'s tombstone (`:2614`). Tombstoned
books are excluded from everything anyway. Sync apply preserves the payload's
revision. The account backfill bumps **account** revisions, never the book's.
So an active book with `revision === 1` has never been touched by the user, on
any device — and `revision` is a synced field, so all devices converge on it.

### The untouched-mint fingerprint (decision 2's implementation)

A book is an **untouched system mint** iff ALL of:
`kind === "personal"` ∧ `deletedAt === null` ∧ `revision === 1` ∧
`name === "個人帳"` ∧ `color === null` ∧ `includeInPersonalNetWorth === true` ∧
`includeInFireMetrics === true`.

`revision === 1` alone should suffice; the remaining fields are belt-and-
suspenders (they are exactly what the mint INSERT writes — see excerpt above).
**The bias is deliberate: false negatives leave cosmetic clutter (the user can
`deleteBook` it); false positives would destroy user data. Under-merge, never
over-merge.**

### The merge rule (composing decisions 2 + 3)

- **Trigger**: ≥ 2 untouched mints exist among active books.
- **Domain**: untouched mints ONLY. Customized personal books and company
  books are never survivors-by-force, never losers, never touched.
- **Survivor**: the oldest mint (`created_at`, then `id` — the same ordering
  `ensureSqliteDefaultBook` already uses at `:2540`, proven deterministic).
- **Losers**: every other untouched mint. Tombstone (deletedAt + revision
  bump), re-point their accounts/invoices/clients to the survivor (revision
  bump on each re-pointed row).
- One mint + one customized personal book → **no merge** (no duplicate-mint
  pair exists; that shape is a user choice, not the bug).

### The existing pure-function core — `src/domain/bookMerge.ts` (207's PoC)

`planBookMerge(books): { survivorId, loserIds } | null` — selects over ALL
active personal books. **This plan narrows it** to the untouched-mint domain
(decision 2). Extend the module; keep it pure (no storage, no async). Its 7
tests (`bookMerge.test.ts`) cover order-independence and the `created_at`-tie
`id` tiebreak — keep them passing, add mint-domain cases.

### Sync facts that constrain the implementation (all verified in the spike)

- Outbox trigger fires only `when new.revision <> old.revision`
  (`repositories.ts:4952`) — every tombstone and re-point MUST bump revision
  or it never propagates.
- **`applySyncChanges` wraps its work in `withOutboxSuppressed`**
  (`repositories.ts:4278-4301`). ⚠ **THE TRAP OF THIS ENTIRE PLAN**: if the
  merge runs inside that suppression, its tombstones and re-points are applied
  locally but **never enter the outbox — the other device never converges,
  and the fix silently doesn't work across devices.** The merge must run
  AFTER the suppressed block, alongside the existing post-apply
  `recomputeSqliteAccounts()` calls (`:4304-4305`).
- Old-version devices receive the tombstone + re-points via plain LWW apply
  with zero new code (spike §4 — all four version-skew cells converge).

### Where the routine runs

Same cadence as `ensureSqliteDefaultBook` plus the pull path:
1. `initialize()` (`repositories.ts:2511` calls ensure; merge+heal runs right after)
2. after `importSnapshot` (`:4459`)
3. **after `applySyncChanges`** (outside the suppression — see the trap above)

### The announce (decision 1)

DESIGN.md §12.5: user-facing mutation feedback goes through the toast system
(`src/components/Toast.tsx`) — find a call-site exemplar with
`grep -rn "toast" src/features/connect/sync/useAutoSync* src/routes/DashboardRoute.tsx | head`.
Message: `已自動合併 ${n} 個重複的個人帳本。` Fire only when a merge actually
tombstoned ≥1 book **on this device's own run** (receiving someone else's
tombstone via sync is not a local merge — do not announce those).
⚠ The repository layer has no UI access — the merge routine must **return**
what it did (e.g. `{ mergedCount: number }` or the plan object) and the caller
in the UI/sync layer raises the toast. Do not import Toast into repositories.

### The kind-aware straggler self-heal (decision 4)

Generalize the backfill. For every active account whose `book_id` is
non-empty but references no **active** book:

- Look the id up **including tombstoned rows** (`select kind from books where id = $1` — no `deleted_at` filter).
- Dead book found, `kind = 'company'` → **resurrect**: `update books set deleted_at = null, revision = revision + 1, updated_at = ... where id = ...`.
  Resurrection can never move a KPI (the account's scoping returns to exactly
  what the user set); if the resurrected book is somehow an untouched mint,
  the next merge cycle cleans it again — stable, not a loop, because a
  company book can never be an untouched mint (`kind` mismatch).
- Dead book found, `kind = 'personal'` → **re-home** the account to the
  current default (`ensureSqliteDefaultBook()`'s return), bumping the
  account's revision.
- **Id entirely unknown** (book row never synced here) → re-home to default —
  we cannot know its kind, and the personal default matches the existing
  `''`-sentinel behavior. Comment this case; it is a judgment call, not an
  accident.

Run it in the same routine as the merge (all three call sites). In-memory twin
gets the same logic over `this.data`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (revert `package-lock.json` churn; do not commit it) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | **123 files / 1285 tests** at `72142685`; grows by yours |
| Books tests | `npm test -- repositories.books` | pass |
| Merge tests | `npm test -- bookMerge` | pass |
| Lint | `npm run lint` | 0 errors (762 warnings pre-existing) |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/domain/bookMerge.ts` + `bookMerge.test.ts` — narrow to the mint domain
- `src/data/repositories.ts` — the merge+heal routine, both implementations,
  wired at the three call sites
- `src/data/repositories.books.test.ts` — dual-harness coverage
- ONE thin UI/sync-layer touch to raise the toast (whichever file owns the
  post-sync/init hook you wire the announce through — name it in your report)

**Out of scope** (do NOT touch):
- `src/features/connect/sync/pull.ts`, `push.ts`, `sync-manager.ts` internals,
  the worker — **no sync-protocol change**. If the design seems to need one, STOP.
- `ensureSqliteDefaultBook`'s mint itself (still mints with a random UUID —
  option (a) was rejected; the merge makes mint collisions self-annihilating)
- `deleteBook` (206) — unchanged; it remains the manual path for user books
- `bookScope.ts` — read-time scoping stays pure
- Any migration
- The 公司帳-not-syncing mystery (still unexplained; still out of scope)

## Git workflow

- Branch: `feat/ai-default-book-merge` off `main`.
- `git status` first; uncommitted work you did not create → STOP, never stash.
- Commits: (1) domain (`bookMerge` narrowing + tests), (2) repositories
  (routine + wiring + dual-harness tests), (3) the announce touch. Conventional
  style: `fix(books): 系統鑄造的重複個人帳本於同步後自動合併（告知 + kind-aware self-heal）`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Narrow the domain function
Extend `bookMerge.ts`: `isUntouchedMint(book)` (the fingerprint above) and
narrow `planBookMerge` (or add `planMintMerge`) to operate on untouched mints
only, returning `null` unless ≥2 exist. Keep the module pure. Tests to add:
mint + customized personal book → `null` (decision 2's core case); customized
book NEVER appears in `loserIds` even when older/newer; `revision > 1` exempts;
non-default name/color/flags exempt; ≥2 mints → oldest mint survives.
**Verify**: `npm test -- bookMerge` → old 7 + new all pass.

### Step 2: The repository routine (SQLite)
One private method (e.g. `mergeAndHealBooks()`): load active books → plan via
the domain function → if a plan exists: tombstone losers (deletedAt +
`revision = revision + 1`), re-point `accounts`/`invoices`/`clients` rows whose
`book_id` is a loser to the survivor (revision bump each) → then the
kind-aware straggler heal (above) → return `{ mergedCount }`.
**Verify**: `npx tsc --noEmit` → 0.

### Step 3: The in-memory twin
Same semantics over `this.data`, using the `bump()` helper. Byte-identical
observable behavior — the dual-harness tests are the proof.

### Step 4: Wire the three call sites
`initialize()` (after `ensureSqliteDefaultBook`), after `importSnapshot`, and
after `applySyncChanges` — **outside `withOutboxSuppressed`** (the trap).
**Verify**: read the wired code aloud in your report: state explicitly where
the applySyncChanges call sits relative to the suppression block.

### Step 5: Dual-harness tests (`repositories.books.test.ts`)
Model on the existing style. Required cases:
1. Two untouched mints → one survives (oldest), loser tombstoned **with bumped
   revision**, loser's accounts re-pointed to survivor.
2. **The outbox assertion** (the load-bearing one — mirror 206's): after a
   merge, the outbox contains the loser's tombstone AND a re-pointed account at
   its new revision. This is the only test that proves cross-device propagation.
3. Mint + user-edited personal book (rev > 1) → **no merge** (decision 2).
4. Straggler heal, personal flavor: account pointing at a tombstoned personal
   book → re-homed to default, revision bumped.
5. Straggler heal, company flavor: account pointing at a tombstoned company
   book → **book resurrected** (deletedAt null again, revision bumped),
   account untouched.
6. Unknown book id → re-homed to default.
7. Idempotence: running the routine twice changes nothing the second time.
**Verify**: `npm test -- repositories.books` → all pass on BOTH harnesses;
`npm test` → 1285 + yours.

### Step 6: The announce
The routine's return value reaches one UI/sync-layer caller that raises
`已自動合併 ${n} 個重複的個人帳本。` via the existing toast system. Local
merges only (a received tombstone is not announced).
**Verify**: `npm run lint` → 0 errors; name the file you touched.

### Step 7: Gates + live check
All commands green. Then `npm run dev` with demo data: fabricate a duplicate
mint (insert a second `revision=1` 個人帳 via the debug path or a direct
repository call in the console), reload → confirm: one 個人帳 remains in the
switcher, the toast fired, and no account changed its displayed balance.
⚠ **Worktree hazard, confirmed three times this session**: verify your dev
server's cwd is YOUR worktree before trusting anything you see — the shared
preview server has silently served the main checkout to three executors.
Report plainly anything you could not check.

## Test plan

Covered in Steps 1 and 5. The two load-bearing tests are the **outbox
assertion** (cross-device propagation is the entire point; a suppressed-outbox
regression passes every other test) and **decision 2's no-merge case** (the
user-data-safety property). Do not skip either.

## Done criteria

ALL must hold:
- [ ] `isUntouchedMint` exists in `src/domain/bookMerge.ts`; module still pure (no imports from data/, no async)
- [ ] Merge domain = untouched mints only: the mint+customized test proves no-merge
- [ ] Routine wired at all three call sites; the applySyncChanges one demonstrably outside `withOutboxSuppressed`
- [ ] Outbox test proves tombstone + re-point propagate
- [ ] Kind-aware heal: company-resurrect and personal-re-home tests pass on both harnesses
- [ ] Idempotence test passes
- [ ] Toast fires on local merge only; repositories.ts does not import Toast
- [ ] `git diff 72142685..HEAD -- src/features/connect/sync/ worker/` → empty
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` 1285 + new, all pass; `npm run build` 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `withOutboxSuppressed` structure at `applySyncChanges` differs from the
  excerpt such that "run after the suppression" has no clean seam.
- Implementing the heal seems to require touching `pull.ts`/`push.ts`/worker.
- The idempotence test won't stabilize (routine keeps finding work on rerun) —
  that means the fingerprint or the heal is re-triggering itself; report, do
  not special-case around it.
- You are tempted to widen the merge domain beyond untouched mints ("this
  customized book is obviously a duplicate too") — decision 2 forbids it.
- `npm test` was already failing at your base.

## Maintenance notes

- **The under-merge bias is the contract.** Any future "smarter" duplicate
  detection must preserve: a book the user has ever edited is never auto-
  tombstoned. The manual path for those is `deleteBook`.
- The random-UUID mint deliberately remains — dedupe-by-merge, not
  prevent-by-id. If someone later ships option (a) (deterministic id) for
  greenfield installs, it composes fine with this; the merge simply stops
  finding work.
- The spike doc (`docs/default-book-convergence-spike.md`) + its review
  addendum in `plans/207-*.md` are the design record, including the version-
  skew matrix a reviewer should re-read before approving changes here.
- Reviewer should scrutinize: the suppression seam (the plan's #1 trap), that
  no sync file moved, and that the announce cannot fire from a received
  tombstone.
