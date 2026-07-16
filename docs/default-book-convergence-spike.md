# Default 帳本 convergence — design spike (plan 207)

Status: **design spike, no code shipped**. This document is the deliverable.
It answers whether/how to fix the root cause of "two identical 個人帳 on both
devices," verified live at commit `96e3d12a` (repo HEAD at spike time).

## §1 The mechanism

**Every device mints its own default 個人帳 with a random UUID, and does so
before it has ever pulled from sync — so two devices that pair before either
has synced each create their own, and sync then shows both, forever.**

The mint happens in `ensureSqliteDefaultBook` (`src/data/repositories.ts:2538-2560`):

```ts
private async ensureSqliteDefaultBook(): Promise<string> {
  const existing = await this.db.select<Array<{ id: string }>>(
    `select id from books where kind = 'personal' and deleted_at is null order by created_at, id limit 1`,
  );
  let defaultId = existing[0]?.id;
  if (!defaultId) {
    defaultId = createId("book");                    // random UUID, see below
    ...insert 個人帳...
  }
  // Backfill orphan accounts...
  return defaultId;
}
```

`createId` (`repositories.ts:558-560`) is `` `${prefix}_${crypto.randomUUID()}` ``
— a **random** id, not derived from anything stable. There is an in-memory
twin with the identical shape, `ensureDefaultBookInMemory`
(`repositories.ts:693-715`): `this.data.books.find((book) => book.deletedAt === null && book.kind === "personal")`,
same "insert if none found" logic. Any design must handle both.

**The crux — mint-before-pull ordering.** `ensureSqliteDefaultBook` is called
from `initialize()` (`repositories.ts:2511`), which is awaited inside
`createFinanceRepository()` (`repositories.ts:540-547`) before that function
returns the repository instance at all. Every sync entry point —
`runSync(repo)`, `forceFullResync(repo)` (`sync-manager.ts:43,117`) — takes an
**already-constructed** `repo` as its first argument, meaning
`getFinanceRepository()` must have already resolved (and therefore
`initialize()` → `ensureSqliteDefaultBook()` must have already run) before the
very first pull can be issued. There is no code path where a pull happens
before the local default book is minted. This ordering is structural, not
incidental — fixing it means changing what `initialize()` guarantees, not
patching a call-site.

Confirmed the other three callers exactly match the plan's table (only line
numbers shifted, from plan 206's `deleteBook` merge landing after the plan was
written — see Step 1 verification below): `createAccount` (`:2741`),
post-`importSnapshot` (`:4459`), `backfillUnassignedAccount` (`:5148`).

**`personalSpace` is a fixed constant**: `repositories.ts:451`,
`"space_personal_default"` — every device already agrees on this. That's why
a deterministic *book* id looks tempting (§3a) — the *space* it lives in is
already deterministic.

**The sync contract that constrains every option:**
- Outbox trigger only fires `when new.revision <> old.revision`
  (`repositories.ts:4952`) — any tombstone or re-point needs a revision bump
  or it never syncs.
- Apply is **delete-then-insert per entity**, keyed by primary key
  (`repositories.ts:5052`, confirmed verbatim): `` delete from ${table} where id = $1 `` then an
  entity-specific insert. Two books with different ids can never merge by
  themselves — this is why the current bug is permanent, not self-limiting.
- Conflict rule (`pull.ts:152-158`, `shouldApply`): higher revision wins;
  same revision + newer `updatedAt` wins; only an exact tie on both
  surfaces to the conflict centre (`pull.ts:119-136`). This is materially
  relevant to §3(c) below: a book tombstone with a bumped revision **always**
  wins over an untouched duplicate on every other device, without needing
  that device to run any new code.
- `insertAccountRow` writes `row.bookId ?? ""` (confirmed, `repositories.ts:4529,4555`
  for insert paths and `:2735` for the browser-repo read path) — the empty-string
  sentinel is real and `ensureSqliteDefaultBook`'s backfill
  (`` where book_id = '' or book_id is null ``) is the only place that heals it today.

⚠ Out of scope, not investigated further per the plan's instruction: the
operator's separately-observed 公司帳-not-syncing symptom. Nothing in this
spike's tracing touched or explains that path.

### Step 1 verification — every "Current state" claim

All claims in the plan's "Current state" section **hold at HEAD**, confirmed
by direct read of the cited code (not the plan's summary):

| Claim | Verified against | Result |
|---|---|---|
| `initialize()` calls `ensureSqliteDefaultBook()` before pull | `repositories.ts:2511`, `sync-manager.ts:43-58` (runSync takes a pre-built `repo`) | **HOLDS** |
| Guard is `kind='personal' and deleted_at is null` | `repositories.ts:2540` | **HOLDS** |
| Mint id is `createId("book")` = random UUID | `repositories.ts:544`, `:558-560` | **HOLDS** |
| In-memory twin has the same shape | `repositories.ts:693-715` | **HOLDS** |
| `personalSpace` is the fixed constant `"space_personal_default"` | `repositories.ts:451` | **HOLDS** |
| `book` is in the pull allowlist | `pull.ts:194`, `VALID_ENTITIES` set | **HOLDS** |
| Outbox trigger fires on revision change, includes `books`/`book` | `repositories.ts:4936,4952,5006` | **HOLDS** |
| Apply is delete-then-insert, keyed by id | `repositories.ts:5040-5052` | **HOLDS** |
| Conflict/LWW rule as described | `pull.ts:113-158` (`shouldApply`) | **HOLDS** |
| `insertAccountRow` writes `''` sentinel when unset | `repositories.ts:4529,4555,2735` | **HOLDS** |

**One drift found, immaterial**: `git diff --stat 087a9b2e..HEAD -- src/data/repositories.ts`
shows 53 lines changed — this is plan 206's `deleteBook` (both repo
implementations), which the plan itself already names as merged and as the
current interim mitigation. It shifted line numbers (e.g. `ensureSqliteDefaultBook`
moved from `:2514-2536` to `:2538-2560`) but changed no claim's truth value.
No other claim failed.

## §2 Blast radius — is it cosmetic or does it break the math?

**Definite answer: cosmetic. An extra empty personal book does not distort any
KPI.** Traced through `src/domain/bookScope.ts` in full:

- `bookAccountIdSet` (`bookScope.ts:38-43`) builds its Set by filtering
  **accounts**: `accounts.filter((a) => a.bookId === activeBookId)`. A book
  with zero accounts contributes zero members regardless of its own flags.
- `fireMetricAccountIdSet` (`bookScope.ts:68-71`) and
  `personalNetWorthAccountIdSet` (`bookScope.ts:78-81`) both do the same
  two-step: first compute `includedBookIds` from `books.filter(b => b.includeIn...)`,
  then filter **accounts** by `includedBookIds.has(a.bookId)`. Again: an
  account-less book id sits in `includedBookIds` but is never looked up by any
  account, so it adds nothing to the returned Set.
- Every consumer of these three functions — `DashboardRoute.tsx:226-228`,
  `GoalsRoute.tsx:32`, `InvestmentsRoute.tsx:115`, `CashFlowRoute.tsx:320`,
  `AnnualReportRoute.tsx:41`, `QuickAdd.tsx:60` — receives only an **account-id
  Set**, never a raw book list. None of them can be affected by a book that
  owns zero accounts, because the book itself never enters the calculation;
  only accounts do, and an empty book has none.

**The only place a duplicate book is actually visible is `BookSwitcher.tsx:41`**
(`const bookRows: Book[] = books.data ?? [];`), which lists `books.data`
directly for the switcher dropdown. That is where the operator's "two 個人帳"
report comes from — a UI list, not a calculation. **This is real UX clutter
(and gets worse per new device — a third device mints a third), but it is
provably not a numeric bug**, because `bookScope.ts` never lets a book's
existence alone move a total; only account membership does, and duplicates by
construction start with none.

This confirms the plan's stated prior. **Priority stays P1**, not P0 — the
"gets worse with more devices" clutter is real, but no KPI is at risk *from
today's mechanism as it stands*. (§3(c) below finds a **different**, new risk
that a naive merge fix could introduce — that risk is about the *fix*, not
about the *bug*, and is costed there.)

## §3 The options

### (a) Deterministic default-book id

Derive the id from the already-fixed `personalSpace` constant (e.g. a literal
`"book_default_personal"` instead of `createId("book")`).

- **Wins**: every device mints the *same* row from then on. Sync's
  delete-then-insert on identical ids is a no-op collision, not a duplicate —
  fixes the bug **for every device that has never yet minted a book**.
- **Loses, fatally, alone**: existing installs (including both of the
  operator's devices, today) already hold random-UUID books. A *third*, fresh
  device would mint `book_default_personal` **and** pull in both
  `book_<uuidA>` and `book_<uuidB>` from sync — now **three** books, not
  fewer. (a) alone only prevents *new* duplication going forward; it does
  nothing for the installed base, which is the operator's actual complaint.
- **Making it retroactive is a primary-key migration.** `books.id` is also the
  target of `accounts.book_id` / `invoices.book_id` / `clients.book_id`. Renaming
  an existing book's id means re-pointing every referencing row, on every
  device, under last-write-wins — functionally identical in risk to (c)'s
  re-pointing step, except it must run as a one-time irreversible migration
  rather than a self-healing routine. It inherits all of (c)'s risk (below)
  with none of its self-healing property.
- **Verdict: insufficient alone.** Only useful as a *component* bolted onto
  (b) or (c), never as a standalone fix.

### (b) Defer minting until after the first successful pull

Only mint the default book once the device has completed at least one pull
(i.e., is "caught up"); until then, leave no personal book.

- **Attacks the real root cause** — the mint happens before the device can
  possibly know a book already exists. In principle this is the cleanest fix.
- **The predicate is the entire difficulty, and it does not solve the
  operator's actual scenario.** A concrete, checkable predicate exists in this
  codebase: `runSync`'s own gate — `loadSyncAccount()` non-null, `loadVaultKey()`
  non-null, `isRecoveryKitConfirmed()` true (`sync-manager.ts:55-64`) — is
  exactly "this device is paired." So "defer mint until paired-and-pulled,
  mint immediately if unpaired" is expressible today.
  - **But**: pairing is a **user-initiated action taken from inside the
    running app**, which means `initialize()` (and therefore the mint) has
    **already run once**, on the very first launch, before the user has had
    any chance to pair. On a brand-new install, `loadVaultKey()` is
    necessarily null at `initialize()` time — the predicate says "unpaired →
    mint now" — so the fresh-install-then-pair race that produced the
    operator's actual bug **still happens under (b) exactly as it does
    today**. Deferring the mint only helps a device that is *already paired*
    before its local DB is created (e.g. a wipe-and-restore, or a from-scratch
    reinstall after the recovery kit / pairing flow already ran once, which
    this codebase doesn't currently support as a first-run choice).
  - To actually prevent the operator's reported case, (b) would need a
    **first-run onboarding gate** — "start fresh vs. join an existing
    synced account" asked *before* `initialize()` ever runs — so that a
    device chosen to join can complete its first pull before any book exists
    locally. That is a materially bigger change than the plan's phrasing
    ("defer minting") suggests: it moves a decision earlier than the current
    app boot sequence structurally allows today, touching onboarding UI, not
    just `ensureSqliteDefaultBook`.
  - Fallback also needs definition: offline-forever paired device, or a pull
    that never completes (network flake, revoked device) — must eventually
    mint locally or `createAccount` has nothing to assign to. That's a timeout
    or an explicit user override, not a detail (b) can leave implicit.
- **Verdict: correct in spirit, but as literally scoped it does not fix the
  reported bug** (both operator devices were fresh installs pairing to each
  other) **without a bigger onboarding restructure** than "defer minting"
  implies. Cost that restructure explicitly if this option is chosen — it is
  not a small change.

### (c) Deterministic merge-on-pull

After applying book changes, if more than one non-deleted personal book
exists, merge: keep the oldest (`created_at`, then `id` — see the PoC in
`src/domain/bookMerge.ts`), re-point every `accounts.book_id` /
`invoices.book_id` / `clients.book_id` from the losers to the survivor
(bumping each repointed row's revision), tombstone the losers with a revision
bump.

- **Self-healing, no migration** — fixes the operator's *existing* installs
  with no special-case one-time step; the exact same routine that prevents
  future duplication also cleans up the past.
- **Both devices independently pick the same survivor** — verified this is
  not a new invention: `ensureSqliteDefaultBook`'s own "pick the existing
  default" query already uses `order by created_at, id limit 1`
  (`repositories.ts:2540`) to decide which book new orphan accounts attach to,
  *today*, in production, whenever more than one personal book exists. (c)'s
  tiebreak reuses a rule already proven deterministic in this codebase, not a
  new risk. The PoC (`bookMerge.test.ts`) confirms order-independence and the
  `id` tiebreak on an exact `created_at` tie.
- **Version-skew reasoning, verified against `pull.ts`**: an old-version
  device does not run the merge, but it *receives* the tombstone (higher
  revision → `shouldApply` returns true, `pull.ts:156-157`) and the
  survivor's book row is unaffected. Its own `ensureSqliteDefaultBook` guard
  (`kind='personal' and deleted_at is null`) then finds only the survivor and
  does **not** re-mint. **This holds** — confirmed against the real
  `shouldApply`/apply code, not assumed. See §4 for the full matrix.
- **A genuine new risk this spike found, not in the plan's text — orphaned
  stragglers.** The merge routine re-points only the accounts/invoices/clients
  the merging device **currently has synced locally**. An account that exists
  on a *different*, not-yet-synced device (e.g. created offline, or simply
  hasn't reached the merging device's next sync cycle yet) still has
  `book_id` pointing at the loser when it eventually arrives — and the loser
  is now tombstoned (`deleted_at` set). `listBooks()` filters
  `where deleted_at is null` (`repositories.ts:2566`), so a tombstoned book
  **never appears** in the `books` array fed to `fireMetricAccountIdSet` /
  `personalNetWorthAccountIdSet`. Those functions build `includedBookIds` only
  from currently-active books (`bookScope.ts:68-71,78-81`) — an account whose
  `book_id` points to a dead id is silently **excluded from FIRE metrics and
  personal net worth**, with no existing self-heal: `ensureSqliteDefaultBook`'s
  backfill only catches `book_id = '' or book_id is null`
  (`repositories.ts:2555-2558`), never "points to a book that used to exist."
  **This is a numeric bug the fix would introduce that the original bug never
  had** — today's duplicates are cosmetic (§2); a naive version of (c) could
  silently drop an account from a KPI, which is strictly worse.
  - **This is fixable, and must be treated as part of (c), not an optional
    extra**: generalize the existing backfill self-heal from
    `` where book_id = '' or book_id is null `` to also catch
    `` book_id not in (select id from books where deleted_at is null) `` (any
    account whose book no longer exists, not just the empty sentinel) and
    reassign it to the current default/survivor. This runs on the same cadence
    `ensureSqliteDefaultBook` already runs on (every `initialize()`), so a
    straggler heals within at most one more app-start/sync cycle on the
    device that has it — bounded lag, not a permanent loss. **Recommendation
    below assumes this amendment ships together with the merge, not as a
    follow-up.**
- **Re-pointing bumps revisions on every repointed row** — a push/pull "storm"
  proportional to the loser book's account count. In the operator's own case
  this is 0 (their duplicate is empty), so the storm is zero-cost for the
  reported incident, but a book that legitimately gained accounts before
  discovery would cost one extra sync round-trip per account. This does **not**
  by itself increase the risk of the already-observed data-loss mode (a stale
  device's `book_id` overwriting a correct one) — that mode is caused by two
  devices both being *authoritative* about the same account's true owner while
  disagreeing, which re-pointing doesn't create; it only touches accounts that
  were, by definition, sitting in a book everyone now agrees is a duplicate.

**Verifying vs. destroying the prior**: the prior — self-healing, no
migration, deterministic, version-skew-safe — **holds**, but only with the
straggler-self-heal amendment above. Without it, (c) trades a cosmetic bug for
an intermittent numeric one, which would fail this codebase's "correctness
first for finance" invariant. With it, (c) is the strongest of the three.

## §4 Version skew — the full matrix, for recommended option (c) + straggler self-heal

"Old" = current shipped code (random-UUID mint, no merge, backfill only
catches the `''`/`null` sentinel). "New" = (c) with the straggler-self-heal
amendment.

| | B on old version | B on new version |
|---|---|---|
| **A on old** | Today's behavior: duplicates persist and grow by one per new device. No change. | Symmetric to the (A new / B old) cell below with roles swapped: B merges and heals; A passively converges as B's tombstone/re-point arrives, via plain LWW apply — A needs no new code to receive a correct outcome. **Converges.** |
| **A on new** | A's next pull/init that sees >1 active personal book runs the merge: picks the deterministic survivor, tombstones the loser (revision bump), re-points whatever accounts A currently knows about. A pushes the tombstone + re-pointed rows. B (old code, no merge awareness) receives them via ordinary per-record LWW apply — the tombstone wins on revision, B's local copy of the loser book becomes deleted, and B's own `ensureSqliteDefaultBook` guard now finds only the survivor (confirmed in §3) so B never re-mints. Any of B's own accounts still pointing at the loser, once they sync **to** A, land on A pointing at a dead book id — but A's straggler self-heal (part of "new," not a separate step) catches this on A's next init/pull cycle and re-points them, and that correction propagates back to B the same way. **Converges, with the straggler case bounded to one extra cycle rather than permanent** — this is the amendment's entire purpose. | Whichever device sees both books first computes the merge; the other either finds it already done (single survivor) or independently computes the identical survivor when it eventually sees both — deterministic-over-the-set means no coordination is needed and no thrash results from both computing it. Extra revision churn proportional to the loser's account count (zero for the operator's case). **Converges.** |

**No cell "gets worse."** The only failure mode that could plausibly turn one
duplicate into a worse state — the straggler-orphan risk in §3(c) — is present
in the (A new / B old) and (A old / B new) cells specifically, and is
neutralized by the self-heal amendment being shipped as part of "new," not as
a follow-on. If a team ships the merge **without** that amendment, the
(new/old) cells become genuinely disqualifying (silent, unbounded-duration
exclusion from FIRE/personal-net-worth for any account whose owning book was
merged away before that account's assignment finished syncing) — **flagging
this loudly since it's the one way this plan could still fail the "gets
worse" bar.**

## §5 Recommendation

**Ship (c) — deterministic merge-on-pull — together with the straggler
self-heal generalization described in §3, as one unit, not staged.**

- **(a) loses**: insufficient alone (fixes only greenfield installs, and the
  operator's actual devices are not greenfield); made retroactive it becomes a
  primary-key migration carrying (c)'s full re-pointing risk with none of its
  self-healing property.
- **(b) loses**: correct in spirit but, as scoped, does not fix the operator's
  actual reported scenario (both devices were fresh installs racing to pair)
  without a first-run onboarding restructure that is a materially larger
  change than "defer minting" suggests.
- **(c) wins**: self-healing (fixes the installed base with no migration
  step), deterministic without coordination (verified via the PoC and
  against the live `shouldApply`/apply code, not assumed), and — with the
  self-heal amendment — closes the one new risk this spike found that the
  plan's original text didn't anticipate.

**Effort estimate: M** (matches the plan's own sizing). Concretely: one new
merge routine (already prototyped as a pure function in
`src/domain/bookMerge.ts`) invoked from the same place `ensureSqliteDefaultBook`
already runs (`initialize()`, and after `importSnapshot`), plus the backfill
query's `where` clause broadened from the `''`/`null` sentinel to also match
"references a non-existent book," plus the re-pointing writes and the revision
bumps on each. No sync protocol change, no worker change.

**Riskiest step**: the re-pointing write — bumping revision on every account
row whose `book_id` moves from loser to survivor. It is not risky in the sense
of the already-observed data-loss mode (§3(c) argues this directly: re-pointing
only ever touches accounts inside a book everyone agrees is a duplicate, so it
doesn't create a new *disputed-ownership* scenario), but it is the step most
likely to be implemented incorrectly under time pressure — e.g. forgetting the
straggler self-heal (silently reintroducing the numeric risk this spike
specifically found) or forgetting to bump revision on the re-pointed rows
(silently failing to propagate the correction across devices at all, since the
outbox trigger only fires on revision change).

## §6 Open questions for the operator

1. **Silent or announced?** Should the merge run silently, or should the app
   surface something like "合併了 2 個重複的個人帳本" when it fires? This is
   automatic data movement (tombstoning a book, re-pointing account
   ownership) in a finance app — the product principle of explainable
   financial calculations arguably extends to explainable *structural* changes
   too, even though no balance changes.
2. **Auto-merge when both duplicates have accounts, not just one empty one?**
   The operator's case is 0-vs-25 (safe to auto-merge unambiguously). Is
   auto-merge still acceptable when both duplicates independently have
   accounts in them (a real merge of two populated books, not just tombstoning
   an empty one), or should that specific case require the user to review and
   confirm which survives before it commits?
3. **Is `deleteBook` (plan 206) sufficient for now?** It already lets the
   operator manually delete their empty duplicate today. Given §2's finding
   that the bug is cosmetic, is this spike's fix worth building immediately,
   or does it become a "prevent recurrence for future devices" backlog item
   rather than an urgent fix? (Priority stays P1 either way per §2 — this
   question is about scheduling, not severity.)
4. **Should (b)'s bigger onboarding idea be revisited separately?** A
   first-run "start fresh vs. join synced account" choice would prevent the
   race at its true origin (no device ever mints speculatively) rather than
   cleaning up after it, but it's a larger, cross-cutting onboarding change
   out of proportion to this specific bug. Worth a separate product
   conversation regardless of what ships for this plan.

## Scope note

Per the plan's Scope section, this document's only accompanying code is the
pure-domain PoC `src/domain/bookMerge.ts` + `src/domain/bookMerge.test.ts` —
no storage, no repository method, no sync path, no UI, no migration. Building
the recommendation in §5 is a separate, future implementation plan.
