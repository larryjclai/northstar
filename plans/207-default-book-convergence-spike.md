# Plan 207: Spike — how should the default 帳本 converge across devices?

> **Executor instructions**: This is a **design spike**. Its deliverable is a
> decision document, **not code** (one optional pure-domain PoC + tests is
> allowed — see Scope). Do not change any UI, repository method, or sync path.
> Follow the steps, run the verification commands, and when done update this
> plan's status row in `plans/README.md` — unless a reviewer dispatched you and
> told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 087a9b2e..HEAD -- src/data/repositories.ts src/features/connect/sync/`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (doc-only)
- **Depends on**: none. **Related**: plan 206 (`deleteBook`) is the manual escape
  hatch for the symptom; this spike designs the cure. 206 does not block this.
- **Category**: bug (root cause) / spike
- **Planned at**: commit `087a9b2e`, 2026-07-15
- **Source**: operator hit it live — two identical 個人帳 on both of their devices.

## Why this matters

**Every device mints its own default 帳本 with a random UUID, before it can
possibly know one already exists. Sync then shows all of them, forever.**

Confirmed at `087a9b2e`:

1. `initialize()` calls `ensureSqliteDefaultBook()` (`repositories.ts:2487`) —
   on **every app start**, and **before any sync pull**.
2. That method (`repositories.ts:2514-2536`) guards on
   `select id from books where kind = 'personal' and deleted_at is null` and, if
   none, inserts a book whose id is `createId("book")` →
   `` `${prefix}_${crypto.randomUUID()}` `` (`repositories.ts:554-556`). **A
   random UUID.**
3. `books` is a synced entity — outbox trigger at `repositories.ts:4885`
   (`["books", "book"]`), pull allowlist at
   `src/features/connect/sync/pull.ts:194` (includes `"book"`).

So: device A mints `book_<uuidA>` 「個人帳」. Device B, on its first run, finds no
local personal book — **because it has not pulled yet** — and mints
`book_<uuidB>` 「個人帳」. Sync merges. Both devices now show **two identical
個人帳**. The `kind = 'personal'` guard cannot help: it only prevents a *second
local* insert, never a *foreign* one arriving later.

**The operator's live report matches this exactly**: both of their devices show
two 個人帳. That is this mechanism's fingerprint.

**It gets worse with each device.** A third device mints a third.

**Why this is a spike and not a build plan**: the obvious fix (a deterministic
id) does not work on its own, and the migration that would make it work has a
cross-device version-skew failure mode that can turn one duplicate into three.
This is a **finance app with E2E-encrypted last-write-wins sync**; a migration
that reassigns account→book ownership across devices is the highest-risk change
in this codebase. It deserves a design, a decision, and the operator's sign-off
before a single line ships.

## Current state — the facts a design must satisfy

Read these yourself before designing; do not trust this summary alone.

### The minting path

`src/data/repositories.ts:2514-2536`:

```ts
  private async ensureSqliteDefaultBook(): Promise<string> {
    const existing = await this.db.select<Array<{ id: string }>>(
      `select id from books where kind = 'personal' and deleted_at is null order by created_at, id limit 1`,
    );
    let defaultId = existing[0]?.id;
    if (!defaultId) {
      defaultId = createId("book");
      const timestamp = nowIso();
      await this.db.execute(
        `insert into books (id, space_id, revision, created_at, updated_at, deleted_at, name, kind, include_in_personal_net_worth, include_in_fire_metrics, color)
         values ($1,$2,1,$3,$3,null,$4,'personal',1,1,null)`,
        [defaultId, personalSpace, timestamp, "個人帳"],
      );
    }
    // Backfill orphan accounts. Bump revision so the assignment propagates over
    // sync (a device that synced these accounts pre-books needs the higher
    // revision to accept book_id under last-write-wins).
    await this.db.execute(
      `update accounts set book_id = $1, updated_at = $2, revision = revision + 1 where book_id = '' or book_id is null`,
      [defaultId, nowIso()],
    );
    return defaultId;
  }
```

There is an in-memory twin, `ensureDefaultBookInMemory` (`repositories.ts:684-710`),
with the same shape (`find((book) => book.deletedAt === null && book.kind === "personal")`).
**Any design must work for both.**

### The callers

`grep -n "ensureSqliteDefaultBook()" src/data/repositories.ts` at `087a9b2e`:

| Line | Caller | Note |
|---|---|---|
| 2487 | `initialize()` | **every app start, before any sync pull** |
| 2690 | `createAccount` | `input.bookId \|\| (await this.ensureSqliteDefaultBook())` |
| 4408 | after `importSnapshot` | snapshot restore |
| 5097 | `backfillUnassignedAccount` | comment says ensureDefault "runs before this in initialize()" |

### `personalSpace` is a fixed constant — relevant to option (a)

`repositories.ts:447`: `const personalSpace = "space_personal_default";`

So a deterministic id *is* derivable today. That is why option (a) looks
attractive — and why the spike must explain why it is not sufficient alone.

### The sync contract any design must survive

- **Tombstones need a revision bump.** The outbox trigger only fires
  `when new.revision <> old.revision` (`repositories.ts:4899`).
- **Conflict rule** (`pull.ts:110-130`): same revision + different content is
  auto-resolved by `updatedAt` (newer wins); only an exact tie on both is
  surfaced to the conflict centre.
- **Apply is delete-then-insert** (`repositories.ts:5001-5003`):
  `delete from ${table} where id = $1` then `insertAccountRow(payload)`. **Two
  books with different ids can never merge by themselves** — different primary
  keys, both survive.
- **`accounts.book_id` is the ownership pointer** and syncs correctly (verified:
  `insertAccountRow` writes `row.bookId ?? ""` at `repositories.ts:4544`;
  `normalizeSqliteSyncPayload` does generic snake→camel so `book_id` → `bookId`).
- **The empty-string sentinel is dangerous.** `insertAccountRow` writes `""` when
  a payload has no `bookId`, and `ensureSqliteDefaultBook`'s backfill then claims
  **every** `book_id = ''` account for the local default. A design that strands an
  account's `book_id` — even briefly — can silently re-home it on the next start.

### The already-observed data-loss mode — the design must prevent it

The operator watched this happen live:

1. Device A: account X in 公司帳.
2. Device B still had X in its own 個人帳 (B never received the 公司帳 row).
3. B's copy pushed and, under last-write-wins, **overwrote A's correct
   assignment** — X became 個人帳 on A.

**A stale device's book assignment can silently overwrite a correct one.** Any
convergence design must not make this class of event more likely.

⚠ **Separately unexplained (not this spike's job, do not scope-creep into it)**:
that same operator's 公司帳 book row does not reach device B at all. Every link
in the book sync path has been audited and is correct — outbox trigger, payload
normalization, `push.ts`, the worker relay (which stores opaque ciphertext and
cannot filter by entity), `pull.ts`'s `VALID_ENTITIES` and `isValidPayload`, and
`applySqliteSyncChange`. `repositories.books.test.ts` even has a regression test
asserting a created book lands in the outbox. **No code defect was found**, so it
is believed to be runtime state, not a code path. If your design work happens to
explain it, say so loudly — but do not go looking.

## Deliverable

**`docs/default-book-convergence-spike.md`** — a decision document. Structure:

### §1 The mechanism
Explain the bug from the code, with `file:line` evidence. Include the
"mints-before-pull" ordering, since that is the crux and it is not obvious.

### §2 Blast radius
How many devices → how many books. What the user sees. What it costs them
(clutter, or real double-counting?). **Check whether an extra empty personal book
with `includeInPersonalNetWorth: true` actually distorts any KPI** — trace it
through `src/domain/bookScope.ts` (`bookAccountIdSet`, `fireMetricAccountIdSet`,
`personalNetWorthAccountIdSet`) and say plainly whether the math is affected or
it is purely cosmetic. **This determines the plan's real priority** — the advisor's
current belief is "cosmetic, because an empty book contributes 0", and confirming
or refuting that is worth more than the rest of the doc.

### §3 The options — evaluate at least these three

**(a) Deterministic default-book id** (e.g. derived from `personalSpace`, which is
the fixed constant `"space_personal_default"`).
- Every device mints the *same* id → the sync apply's delete-then-insert
  converges them to one row for free.
- **But**: existing installs already hold random ids. A fresh device would mint
  `book_default` *and* pull `book_<uuidA>` → **still two.** So (a) alone fixes
  only greenfield.
- Making it retroactive means changing an existing book's **primary key**, which
  is also `accounts.book_id`'s target — a delete+insert that must re-point every
  account, invoice, and client, on every device, under LWW. Cost that honestly.

**(b) Defer minting until after the first successful pull** (when the device is
paired).
- Attacks the actual root cause: the mint happens before the device can know.
- **But**: `initialize()` currently guarantees a default book exists, and
  `createAccount` (`repositories.ts:2690`) depends on it. What happens if the
  first pull fails, or the device is offline, or unpaired? Define the fallback.
- Does a fresh unpaired device still mint immediately? Almost certainly yes —
  specify the exact predicate.

**(c) Deterministic merge-on-pull** — after applying book changes, if >1
non-deleted personal book exists, merge: keep the oldest (`created_at`, then `id`
as tiebreak — the same ordering `ensureSqliteDefaultBook` already uses),
re-point every `accounts.book_id` / `invoices.book_id` / `clients.book_id` from
the losers to the survivor, tombstone the losers with a revision bump.
- Self-healing; fixes existing installs with no migration step.
- Both devices independently pick the *same* survivor (the rule is deterministic
  over the same set), so they converge without coordinating.
- **Version-skew check — do this explicitly**: an old-version device does not
  merge, but it *receives* the tombstones. Its `ensureSqliteDefaultBook` guard
  (`kind='personal' and deleted_at is null`) then finds the **survivor** → does
  not re-mint. Verify that reasoning against the real code and report whether it
  holds. **If it holds, (c) is version-skew-safe and that is a strong argument
  for it.**
- **The re-pointing bumps revisions on potentially many accounts** → a push storm,
  and every one of those is an ownership write that could collide with the
  data-loss mode in "Current state". Cost this.

**The advisor's prior is (c)** — self-healing, no migration, deterministic, and
apparently version-skew-safe. **Do not treat that as the answer.** Your job is to
verify or destroy it. If (b) is cleaner, say so.

### §4 Version skew — a required section, not an afterthought
The two devices will not update simultaneously. For your recommended option, walk
the matrix explicitly:

| | B on old version | B on new version |
|---|---|---|
| **A on old** | today's behavior | ? |
| **A on new** | ? | ? |

For each cell: does it converge, stay stuck, or get *worse*? **"Gets worse" is
the disqualifying outcome** — a fix that turns one duplicate into three when only
one device has updated is not shippable, however elegant.

### §5 Recommendation
One option. Say why the others lose. Include a rough effort estimate and the
riskiest step.

### §6 Open questions for the operator
Anything needing a product/tradeoff call. Candidates:
- Should the merge be automatic and silent, or should the app tell the user
  "合併了 2 個重複的個人帳本"? (Silent data movement in a finance app vs. noise.)
- If both books somehow have accounts, is auto-merging acceptable, or must the
  user choose? (The operator's case is 0-vs-25, so auto is safe *for them* — is it
  safe in general?)
- Is `deleteBook` (plan 206) enough for now, making this a low-priority
  prevent-recurrence job rather than a fix?

## Scope

**In scope**:
- `docs/default-book-convergence-spike.md` (create)
- **Optionally**, a pure-domain PoC of the merge rule + unit tests: a new
  `src/domain/bookMerge.ts` exporting something like
  `planBookMerge(books: Book[]): { survivorId, loserIds }` — a **pure function**,
  no storage, no repository, no UI — plus `src/domain/bookMerge.test.ts`.
  Precedent: plan 172's spike shipped `src/domain/indexNudge.ts` + tests with no
  UI. **Only if it clarifies the design.** If unsure, skip it — the doc is the
  deliverable.

**Out of scope** (do NOT touch — this is a spike):
- `src/data/repositories.ts` — **do not change `ensureSqliteDefaultBook`,
  `ensureDefaultBookInMemory`, or any book method.**
- `src/features/connect/sync/*` — no sync change.
- `src/routes/*`, `src/components/*` — no UI.
- Any migration.
- The 公司帳-not-syncing mystery (see the ⚠ in Current state).
- `deleteBook` — plan 206.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 121 files / 1252 tests |
| Lint | `npm run lint` | exit 0, 0 errors |

Revert `package-lock.json` churn from `npm install`; do not commit it.

## Git workflow

- Branch: `docs/ai-default-book-convergence-spike` off `main`.
- `git status` first; uncommitted work you did not create → **STOP**, never stash.
  `plans/` files are expected and not yours.
- Commit: `docs(sync): 預設帳本跨裝置收斂設計 spike`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Verify the mechanism yourself
Read `repositories.ts:2487`, `:2514-2536`, `:554-556`, `:447`, `:684-710`, and
`pull.ts:194`. Confirm every claim in "Current state". **Report any that do not
hold** — the spike's value is zero if built on a wrong premise.

**Verify**: state in your report which claims you confirmed and which (if any) failed.

### Step 2: Answer §2 — does the duplicate actually break the math?
Trace an extra empty personal book with `includeInPersonalNetWorth: true` through
`src/domain/bookScope.ts`. Cosmetic or numeric? **Answer this before designing** —
it sets the priority, and if it is numeric this plan is P0 rather than P1.

**Verify**: a definite answer with `file:line` reasoning, not a hedge.

### Step 3: Write §1–§6

### Step 4: Optional PoC
Only if it earns its place. Pure domain, no storage. `npm test` must stay green
and grow only by your new tests.

### Step 5: Gates
- `npx tsc --noEmit` → 0
- `npm run lint` → 0 errors
- `npm test` → 1252 (+ your PoC tests, if any)
- `git status --short` → only `docs/default-book-convergence-spike.md` (+ the two
  optional PoC files)

## Test plan

**Doc-only by default — no tests.** If you write the optional PoC, its tests are
pure-function unit tests (given N books, which survives?). Cover: single book;
two personal books with different `created_at`; **a `created_at` tie** (the `id`
tiebreak is what makes the rule deterministic across devices — this is the test
that matters); tombstoned books excluded; company books untouched.

Model after `src/domain/indexNudge.test.ts` (plan 172's spike) or any
`src/domain/*.test.ts`.

## Done criteria

ALL must hold:

- [ ] `docs/default-book-convergence-spike.md` exists with §1–§6
- [ ] §2 gives a **definite** answer on whether the math is affected
- [ ] §3 evaluates options (a), (b), (c) — each with why it wins/loses
- [ ] §4 fills in the full version-skew matrix, all four cells
- [ ] §5 recommends exactly one option with an effort estimate
- [ ] §6 lists the operator's open questions
- [ ] `git diff 087a9b2e..HEAD -- src/data/repositories.ts src/features/connect/ src/routes/` → **empty**
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` 0 errors; `npm test` at baseline (+PoC only)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:
- Any "Current state" claim does not hold at HEAD — especially if
  `ensureSqliteDefaultBook` no longer mints a random id, or no longer runs before
  the first pull. The whole spike is premised on those two.
- You find that **all three options are unshippable** — that is a real finding;
  report it rather than recommending the least-bad one.
- You conclude the fix requires a change to the sync protocol or the worker
  (`worker/`). That is a much bigger decision and needs the operator.
- You are tempted to implement the fix. **This is a spike.** The `src/` diff must
  stay empty apart from an optional pure-domain PoC.
- You find yourself investigating why the operator's 公司帳 does not sync. Out of
  scope; the advisor already audited that path end-to-end and found no defect.

## Maintenance notes

- **The deliverable gates the build plan.** No convergence code ships until the
  operator picks an option from §5 and answers §6. Precedent: plans 172/176/195
  all ended in operator decisions that then became build plans.
- **`deleteBook` (plan 206) is the interim mitigation** — the user can remove the
  duplicate by hand. That is why this is P1 and not P0 *unless* Step 2 finds the
  math is affected, in which case re-prioritize and say so.
- **The most dangerous thing in this design space** is the already-observed
  data-loss mode: a stale device's `accounts.book_id` overwriting a correct one
  under last-write-wins. Any option that re-points account ownership across
  devices must be measured against that, not just against "does it dedupe".
- Whoever builds the chosen option should re-read this doc's §4 first — version
  skew is the part that turns a clean fix into a support incident.
