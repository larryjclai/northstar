# 共享帳本 (Shared Books) — key/membership/revocation design spike

> **Doc-only design spike (Plan 195).** Deliverable is this decision document, zero code
> changes. Supersedes `plans/143-household-sharing-spike.md`. It gates any Phase 3/4 build
> plan — those plans must cite this file.
> Status: **options laid out, recommendation given, awaiting operator decision on §7's open
> questions** (2026-07-14).

## Why this exists

`docs/ledger-books-plan.md` §4 (共同記帳對齊, operator-locked 2026-07-13) decided the framing:
**book is the sharing boundary**, the end goal is **雙向共寫** (both members write into a
shared book), and read-only shared projections come first. That decision explicitly deferred
two "genuinely new problems" to this spike: (a) the key/privacy boundary, (b)
membership/revocation. Nothing can be BUILT until those are decided — you cannot create an
E2E-encrypted shared book without knowing how its key is wrapped to each member's devices, how
membership changes, and what the relay is allowed to learn. This spike produces those
decisions as concrete options + a recommendation.

This spike explicitly supersedes plan 143 (`plans/143-household-sharing-spike.md`), which was
written **before** 帳本 (Books) existed and designed against `Account.isSharedToHousehold` — a
per-account toggle with no book concept. That toggle is now vestigial (confirmed below); this
spike designs against the SHIPPED foundation as it actually exists today, not against 143's
target state or its own since-superseded assumptions. 143's investigation-input list (read
architecture.md, read the ECDH pairing plans, read worker schema) is reused as a checklist, but
every conclusion below is independently re-verified against real files, re-cited with
file:line.

## Current state — re-verified against the actual repo at this spike's HEAD

Drift check run first: `git diff --stat 8a40e8f4..HEAD -- src/features/connect worker/migrations
src/domain/types.ts docs/ledger-books-plan.md` → **empty** (the only commit between 8a40e8f4 and
this spike's HEAD is `cc8edb6d`, which added plan 195 itself as a doc — no code moved). `npm
test` → 120 files / 1245 tests passed, confirming a clean baseline before this doc-only change.

### Crypto (client) — `src/features/connect/crypto/`

- **`pairing.ts`** (270 lines): ECDH device pairing.
  - `generateDeviceKeyPair()` (line 34): P-256 ECDH keypair per device, persisted via
    `secretStore.ts` under key `northstar.device.keypair.v1`.
  - `deriveSharedKey`/`deriveSharedKeyExtended` (lines 73–104): ECDH → AES-GCM 256 shared key,
    usable for `wrapKey`/`unwrapKey` (73–84) and additionally `encrypt`/`decrypt` (93–104).
  - `wrapVaultKey`/`unwrapVaultKey` (123–149): wrap an arbitrary `CryptoKey` (today: the vault
    key) under a derived shared key, for relay via the server as opaque ciphertext.
  - `generatePairingCode`/`deriveBundleKey` (157–208): 8-char pairing code, PBKDF2-derived
    bundle key, per-session salt (`generateBundleSalt`, line 170) — used to bootstrap the ECDH
    exchange itself (the code protects the *public-key handshake*, not the vault key, per the
    file's own top-of-file comment, lines 1–20).
  - `PublicPairingBundle` (217–226): what the JOINING device publishes — device id, ECDH public
    key, name, platform, optional `secretHash`. Deliberately worthless alone (no secret
    derivable from it).
- **`secretStore.ts`** (247 lines): `SecretStore` interface (55–59) + `SECRET_KEYS` (40–47) +
  `getSecretStore()` (230–239, memoized singleton). Two backends: Stronghold (Tauri, on-device
  encrypted-at-rest, `createStrongholdStore` 112–153) and localStorage (web dev shell / jsdom
  tests, `createLocalStorageStore` 76–88). `USE_STRONGHOLD = true` (line 25) — Stronghold is the
  **shipped, active** backend on device.
- **`vault.ts`** (67 lines): the vault key itself — `generateVaultKey`/`saveVaultKey`/
  `loadVaultKey` (13–46), `encryptPayload`/`decryptPayload` (49–67), AES-GCM 256, IV-prefixed
  base64 envelopes. One vault key per user today, stored at `secretStore` key
  `northstar.vault.key.v1`.
- **`recovery-kit.ts`** (124 lines): the vault key re-encoded as a printable 64-hex-char code
  (8 groups of 8), `generateRecoveryKit`/`restoreFromRecoveryKit` (46–93). Gates cloud-backed
  sync (`isRecoveryKitConfirmed`, line 76 — referenced from `policies.ts`'s
  `canEnableCloudBackedFeature`).
- All four files have adjacent `*.test.ts` files (`pairing.test.ts`, `secretStore.test.ts`,
  `vault.test.ts`, `recovery-kit.test.ts`) — this is a working, tested, per-user multi-device
  E2E stack, not a stub.

### Worker (relay) — `worker/migrations/`, `worker/src/index.ts`

Migrations, re-read in full:
- `0001_initial.sql`: `users` (id, `api_secret_hash`), `devices` (id, `user_id` FK, name,
  platform), `sync_envelopes` (id, `user_id` FK, `device_id`, entity, `entity_id`, revision,
  `encrypted_payload`, `updated_at`, `relay_sequence`, unique on
  `(user_id, entity, entity_id, revision, device_id)`), `key_envelopes` (id, `user_id` FK,
  `target_device_id`, `source_device_id`, `key_type`, `wrapped_key`, unique on
  `(user_id, target_device_id, key_type)`).
- `0002_pairing_sessions.sql`: `pairing_sessions` (code, `encrypted_bundle`, `attempt_count`,
  `expires_at`, `claimed_at`) — legacy code-encrypted bundle path.
- `0003_relay_sequence.sql`: renames `sync_envelopes` → `sync_envelopes_v2` → back to
  `sync_envelopes` (a sequence-migration artifact, not a schema-namespace signal — the plan
  file's "Current state" description of this migration as introducing `sync_envelopes_v2` as a
  *distinct* table is imprecise; it is a rename-in-place, same table, same name today).
- `0004_pairing_ecdh.sql`: adds `target_device_id`/`pairing_token_hash`/
  `pairing_token_expires_at`/`pairing_token_consumed` to `pairing_sessions`, and
  `source_public_key` to `key_envelopes` — the ECDH pairing flow (Plan 131).
- `0005_device_credentials.sql`: adds `device_secret_hash` to `devices`. Comment (re-quoted,
  verified verbatim in the migration file): *"Revocation is a hard DELETE of the row, so a
  device-token lookup for a revoked device returns no row -> 401."*
- `0006_per_user_relay_sequence.sql`: makes `relay_sequence` uniqueness **per-user**
  (`(user_id, relay_sequence)`), fixing a cross-tenant collision bug. Confirms: **every
  sequence/cursor concept in this schema is already scoped to exactly one `user_id`.**
- `0007_rate_limits.sql`: `rate_limits` table, unrelated to sharing.

`worker/src/index.ts` (only file besides its test), re-read:
- `authenticate()` (99–146): resolves **exactly one `userId`** per bearer token — either a
  per-device credential (`<deviceId>.<deviceSecret>`, hashed and matched against
  `devices.device_secret_hash`, line 118) or the legacy account-secret. **There is no code path
  in this file that resolves more than one owning user for a single token.** This is the
  central fact the shared-book design must work around: today, "who can read this data" is
  identical to "who authenticated," 1:1.
- `handlePushEnvelopes`/`handlePullEnvelopes` (421–498): `relay_sequence` cursor is a per-user
  monotonic integer (`WHERE user_id = ? AND relay_sequence > ?`, line 486); push assigns
  sequences from `MAX(relay_sequence) WHERE user_id = ?` (452–457).
- `handleStoreKey`/`handleFetchKey` (509–563): the key-envelope relay — device A wraps a key
  (any `keyType` string, opaque to the server) to device B's id; B fetches it by
  `(user_id, target_device_id)`. This is a **general-purpose "wrap a symmetric key to a device"
  relay already in production** — not vault-key-specific by construction (`keyType` is a free
  string on the wire, line 503).
- Router (148–...): `POST /users`, `POST /pairing/join`, `GET /pairing/:code`,
  `GET /pairing/:token` (key fetch by pairing token), `POST/GET /devices`, `POST /devices/:id`
  (credential claim), `DELETE /devices/:id` (revoke), `POST/GET /envelopes`,
  `POST/GET /keys/:device`, `POST /pairing` (legacy bundle). **No household/shared/multi-user
  route exists.**

**Conclusion, re-verified**: everything in the relay is scoped to ONE `user_id`. There is no
multi-user / household / shared-namespace concept anywhere in `worker/`. This is exactly the gap
`docs/ledger-books-plan.md` §4 named and this spike must fill.

### Books (client) — shipped, Phase 1/2 complete (188–194)

- `Book` entity, `src/domain/types.ts:74–82`: `{ name, kind: "personal"|"company",
  includeInPersonalNetWorth, includeInFireMetrics, color } & SyncFields`. **No sharing field.**
- `Account.bookId`, `types.ts:140`: every account belongs to exactly one book (never null at
  rest, per the doc comment at line 71–72).
- `src/domain/bookScope.ts` (82 lines): the two-axis scoping rule — `bookAccountIdSet` (switcher
  axis, line 38), `fireMetricAccountIdSet`/`personalNetWorthAccountIdSet` (switcher-independent
  axis, lines 68/78). Pure read-time partition, no storage writes.
- `src/components/BookSwitcher.tsx` (111 lines) + `AppShell.tsx:255–257` (comment: *"帳本
  (Books) switcher — between Search and Quick Add per docs/ledger-books-plan.md §5"*) — the
  switcher is shipped exactly where §5 specified.
- `AccountsRoute.tsx:301,554–624`: `BookManager` modal ("帳本管理") — create books, edit
  per-book `includeInPersonalNetWorth`/`includeInFireMetrics` toggles. This is the natural home
  for a future "共享此帳本" action (see §6).
- `Client`/`Invoice` entities (`types.ts:91–98,115–130`) also shipped, both `bookId`-scoped.
- `SyncEntity` (`src/domain/sync.ts:18`, enumerated at `pull.ts:194`) already includes `"book"`,
  `"invoice"`, `"client"` as full sync entity kinds riding the same generic push/pull path as
  `"account"`/`"ledger"` — confirming "new entity kind" is a proven-cheap addition (see §4).

### Vestigial pre-books/pre-Worker stubs (confirmed dead, not a STOP condition)

Re-grepped explicitly because the plan's STOP condition is "shared-book/household code has
already started" — none of the following is live feature code, all are unwired scaffolding from
an earlier era (some predate the Worker relay entirely):

- `src/features/connect/household/README.md` — a 5-line prose stub ("Household sharing uses a
  separate Household Space Key..."), present since the initial Tauri scaffold commit
  (`42a5d540`, confirmed via `git log --follow`). No `.ts` file in that directory.
- `src/features/connect/devices/README.md` — a stale stub describing a **Supabase Auth** sign-in
  flow; the shipped pairing flow (`pairing.ts`, `pairing-flow.ts`) uses ECDH + the Worker, not
  Supabase. Confirms this stub predates plan 130's actual design and was never updated.
- `Account.isSharedToHousehold` (`types.ts:149`) + `is_shared_to_household` SQLite column
  (`src/data/migrations.ts:26`) — schema plumbing only. Grepped every consumer: it round-trips
  through `repositories.ts` (read/write columns) but is never read by any aggregation, UI
  component, or sync-filtering logic. Confirmed vestigial, exactly as `docs/ledger-books-plan.md`
  §4 characterized it ("the old `Account.isSharedToHousehold` is vestigial").
- `KeyEnvelopeMetadata.keyType: "personalVault" | "householdSpace"` and `HouseholdSpace`
  (`src/features/connect/types.ts:10–24`) — type declarations with **zero other references**
  anywhere in `src/` (confirmed via grep). Notably, the keyType strings actually used at runtime
  (`pairing-flow.ts:262,269`: `"vault-v1"`, `"account-v1"`) don't even match this union — the
  type was never wired to the real implementation. Still, its *existence* is a useful signal:
  whoever wrote plan 130/131 already anticipated a second key namespace for household data and
  named the wrapping mechanism correctly (relay a wrapped key per target device) — this spike's
  recommendation (§2) is the natural completion of that half-finished thought, generalized from
  "household" to "book."
- `conflictSummary.ts:25` includes `"householdId"` in `IGNORED_FIELDS` — another small vestige
  of the pre-books plan; harmless (an unused field name in an ignore-list), noted for
  completeness.

**None of this is a build in progress.** No STOP condition applies.

## 1. Product slice — what a shared book v1 IS

A `Book` (today: `personal` or `company` kind) becomes **shareable**: it gains a member list of
size ≥ 1 (every book, even a private one, is "shared to a member list of exactly its owner" —
per `docs/ledger-books-plan.md` §4's explicit requirement that "books are local-only" must never
be hard-coded). When a book has ≥ 2 members, its accounts and ledger rows sync through a
**per-book envelope namespace** wrapped to every member's devices, instead of (or alongside) the
owner's personal vault.

**What crosses the boundary (v1, read-only-projection scope — see §7 Phase 3):**
- The shared book's `Account` rows (name, type, balance, currency — full fidelity, not a
  reduced projection; see rationale below).
- The shared book's `LedgerTransaction` rows scoped to those accounts (via the existing
  `accountId → bookId` join, `bookScope.ts:38`).
- For a company book: its `Client`/`Invoice` rows (both already `bookId`-scoped,
  `types.ts:91,115`) — a bookkeeper co-owner needs these to be useful at all.
- `Book` metadata itself (name, kind, color, the two FIRE/net-worth toggles).

**Why full-fidelity accounts/rows, not a reduced "balance + name" projection** (departing from
143's more conservative default): 143 was designed for a household sharing *some* accounts out
of a personal vault, where the non-shared remainder needed protecting — hence its instinct
toward a minimal projection. Books already solve that isolation problem structurally: the
*book itself* is the boundary, and a member simply has no key for any book they're not a member
of. There is no "reduced view of a book" requirement in 186 §4 — the operator's own framing is
雙向共寫 (both members fully write into it), which is incompatible with a reduced read-only
projection as the *steady state* (only as the Phase 3 stepping stone, see §7).

**What NEVER crosses the boundary:**
- A member's OTHER books (personal or otherwise) — no cross-book key material exists; a member
  of the company book who also has a private 個人帳 never wraps that book's key to their
  co-member's device.
- Any data not scoped to the shared book: goals (`goalPace`, per-book-independent per
  `bookScope.ts:78`'s FIRE axis is explicitly NOT book-scoped — goals stay 個人帳-only per
  `docs/ledger-books-plan.md` §1 surface 6, unaffected by this spike), personal recurring rules,
  personal budgets/rollover state (§1 surface 5, same doc: budgets are personal-only, never a
  company-book concept even when shared).
- Notes/attachments: `LedgerTransaction.note` and `receiptAttachmentId`
  (`types.ts:193,223`) are ordinary row fields with no separate privacy tier today — v1 does
  **not** invent a "private note within a shared row" concept (that's a real product gap worth
  flagging as an open question, see §7 Q5, but out of scope to solve here).

**Read-only-projection vs 雙向共寫, defined precisely:**
- **Read-only projection (Phase 3)**: a member other than the book's original owner can
  **decrypt and view** the book's accounts/rows on their own device, but their client refuses to
  push new envelopes into that book's namespace (a pure client-side write-gate — the relay
  cannot enforce this cryptographically without a signature scheme it doesn't have; see §5's
  honest caveat). This is a deliberately weaker guarantee, acceptable because it's a stepping
  stone, not a security boundary against the invited member themselves (who is trusted by
  definition — they hold the book's key).
- **雙向共寫 (Phase 4, the named target)**: any member's device can push envelopes into the
  book's namespace; the existing per-record LWW merge (`pull.ts:152–158`) resolves concurrent
  writes exactly as it does for one person's multiple devices today, with the conflict-UX
  delta described in §5.

## 2. Key model options

All three options build on the shipped `pairing.ts` (ECDH keypairs, `deriveSharedKey`,
`wrapVaultKey`/`unwrapVaultKey`) and the shipped `key_envelopes` relay (`handleStoreKey`/
`handleFetchKey`, `worker/src/index.ts:509–563`) — no new crypto primitives, only a new
scope for a mechanism that already exists.

### (a) Book Space Key — RECOMMENDED

**Shape.** Each shareable `Book` gets its own AES-GCM 256 symmetric key ("Book Space Key"),
generated once (by whoever first shares the book) exactly like `generateVaultKey()`
(`vault.ts:13`) generates the personal vault key today. The key is wrapped to each member's
**device** public key using the exact same `wrapVaultKey`/`deriveSharedKey` primitives
(`pairing.ts:73–84,123–133`) — the only change is calling them with the book key instead of
the vault key, and relaying the wrapped result through a new per-book-scoped key-envelope row
(reusing `key_envelopes`' shape: `target_device_id`, `source_device_id`, `key_type`,
`wrapped_key` — `key_type` already carries an opaque string on the wire per
`worker/src/index.ts:503`, so `key_type = "book-space-v1:<bookId>"` or a new `book_id` column
slots in with zero primitive changes, only a schema column — see §4).

Shared-book envelopes are encrypted under the Book Space Key and relayed through a new
namespace (new columns/table, §4) — never mixed into `sync_envelopes`, which stays exactly
"one owning `user_id`'s personal data" as it is today.

**Invite flow**: reuses the pairing UX almost verbatim. Instead of "wrap the vault key to a new
device of MINE," it's "wrap the Book Space Key to a new device belonging to SOMEONE ELSE" — the
existing `PublicPairingBundle`/fingerprint-confirmation flow (`pairing.ts:212–226,106–120`)
already assumes the target device's owner is unverified at pairing time (it's designed for a
brand-new device with no prior trust), which is structurally identical to "a new member's
device, sight-unseen." The SAS-style fingerprint confirmation (`fingerprintPublicKey`,
`pairing.ts:112–120`) is the natural "confirm you're inviting who you think you're inviting"
step.

**Revocation**: remove a member → stop wrapping future key ROTATIONS to their devices (see
below); their existing local copy of the Book Space Key still decrypts everything they already
pulled — **honest answer: a removed member CAN read all data synced before removal, forever,
unless the key is rotated AND old envelopes are deleted from the relay** (deleting envelopes
breaks other members' pull cursors / offline devices that haven't caught up — a real cost, not
a free operation). v1 recommendation: **removal stops future sync only; past-data
retention by the removed member is accepted as inherent to any symmetric-key sharing scheme**
(same honest limitation plan 143 already flagged for the household case) — communicated
plainly in the invite/remove UI copy, not hidden. Key **rotation** (generate a new Book Space
Key, re-wrap to remaining members, re-encrypt going-forward envelopes under it) is the
mitigation for "I want a truly clean break" — expensive (touches every remaining member's
devices) but no new primitive: it's `generateVaultKey()` + N `wrapVaultKey()` calls, the same
shape as today's per-device key relay just run N times instead of once.

**Key-rotation cost**: O(members × devices), same as re-pairing every remaining member's every
device. Acceptable at the "N=2, occasionally N=3-4" scale this spike is scoped to (deferred:
performance at large N, per the plan's Maintenance notes).

**What the relay learns**: same as today — ciphertext only, never balances or plaintext. It
DOES learn the **member graph** (which `user_id`s share a `book_id`, via who holds key-envelope
rows for that book) and coarse activity metadata (envelope counts/timestamps per shared book,
same as it already learns per-user today). This is a strictly larger metadata surface than
personal-only sync (today the relay learns nothing about relationships between users at all) —
stated honestly, not swept aside. It does NOT learn book names, account names, amounts, or
anything else that requires decryption.

### (b) Per-pair wrapping (no shared key)

**Shape.** No book-level key at all. Every envelope a member's device pushes is wrapped
individually to every OTHER member's every device's public key (N-1 wrap operations per
envelope, for N members with possibly multiple devices each — so really `Σ(other members'
device counts)` wraps per envelope). Uses `wrapVaultKey`-equivalent per-recipient, no new key
type — literally the `key_envelopes` mechanism run per-envelope instead of once-per-key.

**Invite flow**: same pairing-UX reuse as (a).

**Revocation**: genuinely better — remove a member, and every envelope pushed AFTER removal is
simply never wrapped to them. They retain past data they already decrypted (unavoidable with
any scheme, symmetric or not — once plaintext is on a device, revocation can't retroactively
un-decrypt it), but there's no "old key still works" residual risk the way (a) has before a
rotation.

**Key-rotation cost**: not applicable — there's no shared key to rotate. But the steady-state
cost is much higher: **every push fans out to every recipient device**, not once per key. For
N=2 people × 2 devices each, that's 3 wraps per envelope instead of (a)'s zero (the book key is
wrapped once per device at invite time, not per envelope). At books' typical churn (routine
personal/company bookkeeping, dozens of rows/day, not high-frequency chat), this fan-out cost is
tolerable at N=2-4 but scales badly and defeats the "reuse the existing LWW pull-cursor batch
pull" efficiency the sync engine already has (`handlePullEnvelopes` pulls N envelopes in one
query; per-pair wrapping means each envelope is genuinely different ciphertext per recipient,
so batch pull still works, but PUSH work multiplies by recipient count).

**What the relay learns**: same member-graph leak as (a) (who wraps to whom is visible via
key-envelope target ids), plus a slightly finer signal — it can infer *when* someone was
removed from the exact push where fan-out drops from N-1 to N-2 wraps, vs (a) where removal is
a discrete, deliberately-timed rotation event that doesn't leak from ordinary traffic patterns.

### (c) Hybrid: Book Space Key + forced rotation on every removal

A variant of (a) where the client makes rotation NOT optional — every `removeMember` action
synchronously triggers a rotation as part of the same user-facing action, so there's no
"revoked but key never rotated" limbo state a UI could leave the user in by mistake. Same
mechanics as (a)'s rotation path, just policy-enforced rather than a separately-offered action.

**Rejected as the v1 baseline, recommended as a v1 POLICY on top of (a)**: forcing rotation on
every removal is strictly safer than leaving it optional, and costs nothing extra in the
crypto/relay design — it's a client-side UX decision (always call the rotation path from the
"remove member" button, never expose a "remove but don't rotate" option). This spike recommends
folding (c)'s policy into (a)'s mechanism rather than treating them as separate options: **(a)
+ mandatory rotation-on-removal is the actual v1 recommendation.**

### Recommendation

**Option (a), Book Space Key, with rotation mandatory on every member removal (folding in (c)'s
policy).** It reuses 100% of the shipped crypto primitives with zero new ones, costs O(1) key
wraps per invite (not per envelope), and its honest revocation limitation (past data retained
by a removed member, mitigated by mandatory rotation) matches the limitation any symmetric
scheme has and is communicable in one sentence of UI copy. Option (b) is rejected for v1 as a
higher-complexity, worse-scaling mechanism that buys a revocation property (b) mostly loses
anyway once you account for "plaintext already on a removed member's disk is unrecoverable
regardless of scheme."

## 3. Membership + revocation

**Membership model.** A new `book_members` concept (client-visible as part of `Book`, or a
sibling entity — see §4 for the exact shape) lists, per shared book: `bookId`, `userId`
(the OTHER party's account — not a device id; a member may pair multiple devices to the same
book key, composing with the existing per-device key-envelope fan-out), `role` (deferred: v1
has no roles, every member reads+writes equally, per 雙向共寫's "both members write" framing —
role-based permissions are explicitly out of scope, a Phase 4+ nice-to-have if ever requested),
`invitedAt`, `joinedAt`.

**Invite/accept**: mirrors `pairing.ts`'s existing two-device flow but between two ACCOUNTS
(two different `user_id`s) instead of one account's two devices:
1. Inviting member (from the book owner's `BookManager` UI, `AccountsRoute.tsx:554–624`)
   generates a pairing code exactly like device pairing does (`generatePairingCode`,
   `pairing.ts:157`), scoped to "join book `<bookId>`" instead of "join my account."
2. Invited member enters the code on THEIR device, which generates (if it doesn't have one yet)
   its own device ECDH keypair and publishes a `PublicPairingBundle` — same shape, same
   worthless-alone property.
3. Inviting member's device wraps the Book Space Key to the invited device's public key
   (§2(a)) and relays it via the book-scoped key-envelope path.
4. Invited member's device unwraps, saves the Book Space Key locally (via `secretStore.ts`,
   a new `SECRET_KEY` per shared book — e.g. `northstar.book.key.<bookId>.v1`, following the
   exact naming convention `SECRET_KEYS` already uses, `secretStore.ts:41–46`), and the book now
   appears in their `BookSwitcher`.

**Composing with `device_credentials` (0005)**: a shared book's sync auth reuses the SAME
per-device credential every device already has for its own account's relay access
(`device_secret_hash`, `worker/src/index.ts:118`) — a shared-book push/pull request
authenticates as "this device, which belongs to user X" exactly as today; the NEW check the
relay needs is "and is user X a member of book B" (a `book_members` row lookup, §4), not a new
credential type. This is the cleanest integration point: **membership is a relay-side
authorization check layered on top of the existing per-device auth, not a parallel auth
system.**

**Revocation — the honest answer, restated from §2**: removing a member from a shared book
(1) deletes their `book_members` row (relay stops authorizing their devices for that book's
namespace — mirrors the existing hard-delete-`devices`-row revocation pattern from 0005's own
comment), and (2) triggers mandatory Book Space Key rotation (§2's recommended policy) so their
cached key stops decrypting anything pushed AFTER removal. **They keep everything already
synced to their device before removal** — this is stated as a locked, honest limitation, not
deferred as an open question (unlike 143, which left it open; this spike closes it because the
symmetric-key mechanics make the answer unavoidable regardless of which option is chosen).

## 4. Worker / relay schema delta

New tables/columns, alongside the existing single-user `sync_envelopes`/`key_envelopes`
(re-verified schema above — nothing existing is modified, this is purely additive, matching the
codebase's established migration convention, `src/data/migrations.ts`'s additive-column
pattern cited in `docs/ledger-books-plan.md` §2a):

```sql
-- 0008_shared_books.sql (illustrative — exact column list is a build-time decision)

-- One row per user granted access to a shared book's namespace.
CREATE TABLE shared_book_members (
  book_id TEXT NOT NULL,       -- matches the client-side Book.id (opaque to relay)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  joined_at TEXT,               -- null until the invited member's device completes pairing
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (book_id, user_id)
);

-- Shared-book envelopes: same shape as sync_envelopes, but keyed by book_id
-- instead of a single owning user_id, and relay_sequence is scoped PER BOOK
-- (not per user) so N members share one cursor space for that book.
CREATE TABLE shared_book_envelopes (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  device_id TEXT NOT NULL,      -- still identifies the pushing device (existing device_secret_hash auth)
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  encrypted_payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  relay_sequence INTEGER NOT NULL,
  UNIQUE(book_id, entity, entity_id, revision, device_id)
);
CREATE UNIQUE INDEX idx_shared_envelopes_book_sequence ON shared_book_envelopes(book_id, relay_sequence);

-- Book Space Key relay: same shape as key_envelopes, but the (source, target)
-- pair now spans two different users' devices, and it's keyed by book_id
-- instead of the implicit "my vault key" assumption key_envelopes carries.
CREATE TABLE shared_book_key_envelopes (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  target_device_id TEXT NOT NULL,
  source_device_id TEXT NOT NULL,
  wrapped_key TEXT NOT NULL,
  wrapped_key_version INTEGER NOT NULL DEFAULT 1,  -- bumped on every mandatory rotation (§3)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(book_id, target_device_id)
);
```

**Cursor model for a stream readable by N members**: `relay_sequence` becomes per-`book_id`
(not per-`user_id`) — mirrors exactly the fix `0006_per_user_relay_sequence.sql` already made
for the personal case (that migration's own comment explains WHY per-tenant sequencing matters:
a global `MAX()` read races across concurrent pushers). The identical fix generalizes directly:
`WHERE book_id = ?` instead of `WHERE user_id = ?` in both the push `MAX()` read and the pull
`WHERE ... > cursor` filter. Each member's device tracks its OWN pull cursor per shared book
(client-side `localStorage`/device-identity state, same mechanism `deviceIdentity.ts`'s
`localPushCursor` already uses per personal account — extended to be keyed per book instead of
being a single global value).

**Device authentication to a shared stream**: reuses the exact same bearer-token
`<deviceId>.<deviceSecret>` scheme (`authenticate()`, `worker/src/index.ts:99–146`) — **no new
credential type**. The delta is entirely in AUTHORIZATION, not authentication: a new check,
"does `shared_book_members` contain `(book_id, resolved_userId)`?", gates access to
`shared_book_envelopes`/`shared_book_key_envelopes` for that `book_id`. This composes cleanly
with `authenticate()`'s existing `AuthContext { userId, deviceId }` return shape (line 94–97) —
the shared-book handlers take the resolved `userId` from the same auth path personal-envelope
handlers already use, and add one extra `SELECT` to check membership before proceeding.

**Migrations implied**: one new migration file (`0008_shared_books.sql` above) — three new
tables, zero changes to any existing table. This preserves the codebase's additive-migration
convention (no existing `sync_envelopes`/`key_envelopes`/`devices` row changes shape or
meaning).

## 5. Sync-protocol delta + 雙向共寫 conflict UX

**What's reused vs what's new.** The LWW merge core — `pullAndApply`'s per-record
revision/`updatedAt` comparison (`pull.ts:152–158`, `shouldApply`) — is reused **verbatim**. A
shared-book pull is structurally identical to a personal pull: decrypt envelopes, compare
against local state, apply the newer one. The only change is the SOURCE of the envelope stream
(`shared_book_envelopes` filtered by `book_id`+cursor, instead of `sync_envelopes` filtered by
`user_id`+cursor) and the KEY used to decrypt (the Book Space Key, loaded the same way
`loadVaultKey()` loads the personal vault key today, just keyed per book). This directly
confirms `docs/ledger-books-plan.md` §4's claim: *"雙向共寫 is architecturally 'multi-device
sync where the devices belong to two people,' reusing the same per-record LWW apply loop."*
Re-verified true at the code level, not just asserted.

**The conflict UX gap, concretely.** The codebase ALREADY has a conflict-surfacing mechanism for
the case LWW can't silently resolve — same revision, same `updatedAt`, different content
(`pull.ts:113–136` builds a `SyncConflictRecord`; `conflictSummary.ts`'s `summarizeConflict`
turns it into a human-readable diff with a `newer: "local"|"incoming"|"tie"` verdict and
per-field diffs). This is a real, tested, shipped "conflict centre." For 雙向共寫, the minimal
resolution surface is: **reuse `conflictSummary.ts`'s diff rendering unchanged, but widen WHEN
a conflict is surfaced to the user.** Today, `pull.ts:119–124` only records a conflict on an
exact tie (same revision AND same `updatedAt`) — everything else auto-resolves silently, which
is fine when the "loser" is your own other device (you just re-edit) but surprising when the
loser is a different human's edit that vanishes without their ever seeing it happen.

**Proposed minimal delta (design-level, not a build spec)**: for shared-book entities
specifically (not personal ones — this must not change behavior for personal sync, which stays
silent-LWW as today), widen the conflict-surfacing condition from "exact tie" to "any
same-revision content difference where the LOSING edit came from a DIFFERENT user than the
device applying it" — i.e., compare the incoming envelope's originating `user_id` (resolvable
server-side at push time via `authenticate()`'s `AuthContext.userId`, and worth stamping onto
the envelope the same way `device_id` already is, `handlePushEnvelopes:438`) against the local
device's own `user_id`. Same-user-different-device losses stay silent (current behavior,
correct — it's still "you" who loses); different-user losses get surfaced via the EXISTING
conflict centre UI, just fed a wider set of conflicts for shared-book entities. This needs one
new field (originating `user_id` per envelope, or derivable from `device_id → devices.user_id`
already stored server-side) and one changed condition in `pull.ts` — genuinely minimal, not a
new conflict-resolution UI.

**Book-scoped categories/accounts.** `docs/ledger-books-plan.md` §4 already names this as a
direct consequence, not a re-decision: a shared-book `LedgerTransaction.category` /
`.accountId` must resolve inside the shared book's own namespace. Today `category` is a free
string (no foreign key, confirmed via `types.ts:188` — `category: string`), so it ALREADY
doesn't leak into another book's structured category list (there is no shared category
registry to leak into — categories are per-row strings, not references to a `Category` entity).
The actual risk is narrower than "categories need to become book-scoped" suggests: it's that a
**category-autocomplete suggestion list** (wherever QuickAdd/EntryDrawer source their category
suggestions from) must filter to the active book's own historical rows, not the whole
account's/user's history, so a company-book bookkeeper isn't shown the owner's personal
category vocabulary as autocomplete noise. `accountId`, by contrast, IS a real reference
(`Account.id`) and already resolves correctly by construction — a shared book's ledger rows can
only ever reference that book's own accounts (per `bookScope.ts`'s account-to-book membership
invariant), so no additional scoping work is needed there. This narrows what looked like an open
design question into a confirmed non-issue for `accountId` and a small UI-autocomplete-source
concern for `category` — a Phase 4 build plan's job, not this spike's.

## 6. Client UX sketch

**Where sharing lives**: a "共享此帳本" action inside the existing `BookManager` modal
(`AccountsRoute.tsx:554–624`, titled 「帳本管理」) — each book row in that modal gets a new
action alongside its existing edit/toggle controls. This is the natural home per the plan's own
framing (sharing is a per-book property, and 帳本管理 is already "the place you configure a
book's properties").

**Invite flow** (from the owner's side): click "共享此帳本" on a book row → generates a pairing
code (reusing the existing pairing-code UI component the device-pairing flow already has, just
retitled/recontextualized: "邀請成員加入《{book.name}》" instead of "配對新裝置") → shows the
code + QR, same as today's device pairing screen. **Accept flow** (invited member's side):
existing "輸入配對碼" entry point, but landing in a "加入帳本" mode instead of "配對裝置" mode
(the SAME code-entry UI, gated by a discriminator in the pairing-session payload — e.g. the
session's `target_device_id` vs a new `target_book_id` column distinguishes "this code joins a
device to MY account" from "this code joins a device to a SHARED BOOK," reusing
`pairing_sessions`' existing shape rather than inventing a parallel table).

**How a shared book renders in the switcher for the invited member**: appears in their
`BookSwitcher` (`BookSwitcher.tsx`) exactly like any of their own books — same list, same
`Check`-icon active-state pattern (`BookSwitcher.tsx:90,104`) — with one visual delta: a small
shared-member-count badge/icon next to shared books (distinguishing "a book only I can see" from
"a book N people can see"), since the operator's own 帳本管理 UI already shows each book with
its `color` dot (per `docs/ledger-books-plan.md` §5) — a shared-badge is an additive marker on
the same row, not a new UI surface.

**Convert-in-place (186 §5 open Q5, re-affirmed here)**: inviting a member to an EXISTING book
with months of history is the ONLY flow — there is no "create a shared book from scratch"
special case needed, because §2's Book Space Key is generated once and wrapped to whoever joins,
regardless of whether the book is brand-new or has years of rows. The existing book's already-
pushed personal-vault-encrypted envelopes (if the book was previously personal-only, its rows
synced under the OWNER's personal vault key, not a Book Space Key) present a real migration
question: **do pre-share rows get re-encrypted under the new Book Space Key, or does the book
"start sharing" only from the invite moment forward, leaving pre-share history un-synced to the
new member (visible locally to the owner, but never relayed)?** This spike flags it explicitly
as open question §7-Q5 below — it wasn't resolved by simply asserting convert-in-place works,
because the KEY change is the actual hard part, not the UI.

## 7. Phased build outline + open questions

### Phase 3: shared books, READ-ONLY projection

**Scope**: §2(a)'s Book Space Key + §3's invite/pairing flow + §4's three new relay tables +
client-side pull-only sync for shared books (client refuses to push into a shared-book
namespace it's a non-owning member of — a client-side gate, not a relay-enforced one; see the
honest caveat in §1). No conflict UX needed yet (nothing but the owner writes).

**Effort**: M — mostly key-wrapping (reuses `pairing.ts` primitives) + relay schema (§4, three
tables, additive) + one new pull path in `pull.ts` parameterized by `book_id` instead of
`user_id`. UI reuses Phase 1's `BookSwitcher`/`BookManager` almost unchanged (§6). Matches
`docs/ledger-books-plan.md` §5's own Phase 3 effort estimate (M) and this spike doesn't revise
it — the re-verified code confirms the M estimate is realistic (no primitive is missing, only
new schema + wiring).

**Becomes**: a relay-schema plan (§4's migration + worker handlers), a crypto plan (§2(a)'s
book-key generation/wrap/invite flow), a client-sync plan (parameterize `pull.ts`/`push.ts` by
book namespace), a UX plan (§6's invite/accept screens).

### Phase 4: 雙向共寫

**Scope**: lift the client-side push-gate from Phase 3 (any member's device can push), §5's
conflict-UX widening (surface cross-user same-revision losses via the existing conflict
centre), §5's category-autocomplete book-scoping, §3's mandatory-rotation-on-removal enforcement
(Phase 3 can ship with revocation as "stop syncing," since read-only members write nothing
worth protecting via rotation urgency the same way; Phase 4 raises the stakes since a removed
member could otherwise still WRITE if the gate were ever bypassed — rotation becomes load-
bearing, not just cleanup).

**Effort**: XL — new conflict-resolution UX surfacing rules (even though it reuses
`conflictSummary.ts`'s rendering, the TRIGGER logic and the "what does the user do about a
cross-user conflict" interaction is new product surface, not just a query change), the
category-scoping UI work, and the "is the push-gate actually safe" hardening work that read-only
Phase 3 could defer. Matches `docs/ledger-books-plan.md` §5's own XL estimate for this phase.

**Becomes**: a conflict-UX build plan (§5's widening logic + a "what do I do with this
conflict" resolution flow, which today's conflict centre may only support as "pick one side" —
verify against the ACTUAL conflict-centre resolution UI, not assumed, before scoping this plan),
a category-scoping plan, a revocation-hardening plan.

### Open questions for the operator

1. **Does a removed member keep past data?** *Recommended answer: yes, permanently, for
   anything synced before removal* (§2/§3) — inherent to symmetric-key sharing; mandatory
   rotation on removal (§2's folded-in policy (c)) is the mitigation for FUTURE data, not past.
   This spike closes the question 143 left open, rather than re-opening it — flag here only for
   the operator to confirm the answer is acceptable, not to re-litigate the mechanism.
2. **Is the member graph acceptable metadata for the relay to hold?** *Recommended: yes, with
   it stated plainly in-product* (§2) — the relay already learns per-user activity metadata
   today; learning "these two users share book X" is a strictly larger but still
   non-financial leak (no balances, no names, no categories). If the operator considers this
   unacceptable, option (b) (per-pair wrapping) doesn't actually remove the leak either (§2(b)'s
   own metadata analysis) — there is no option among (a)/(b)/(c) that hides the member graph
   from the relay; that would require a different architecture entirely (e.g., a
   mix-network-style relay), explicitly out of scope.
3. **Recovery-kit for shared keys**: today's Recovery Kit (`recovery-kit.ts`) restores ONE
   vault key from a 64-hex-char printable code. Does a shared book need its OWN recovery kit
   (a second printable code per shared book, so a member who loses all devices can still
   rejoin without asking a co-member to re-invite them), or is "ask a remaining member to
   re-invite you" (equivalent to normal Phase 3 invite flow) an acceptable recovery path?
   *Recommended: the latter (no per-book recovery kit in v1)* — a shared book, by definition,
   has another live member who can re-invite; the single-vault-key Recovery Kit exists because
   a personal vault has no "other member" to fall back to. Printing N recovery kits (one per
   shared book) is real UX clutter for a recovery path that's already covered by re-invite.
4. **Does Phase 3's "client refuses to push" gate need ANY relay-side enforcement**, or is
   trusting every client's own gate acceptable for v1? *Recommended: trust the client gate for
   v1* — the invited member already HOLDS the Book Space Key (they could decrypt anything
   regardless of a relay-side push block), so a malicious/modified client bypassing the
   read-only gate is equivalent to that member simply being a Phase-4 write member early; it's
   not a privacy leak (they already have full read access), only a premature-feature-access
   question, which this spike judges low-stakes enough to defer relay-side enforcement to
   Phase 4 (where a push-gate needs to be more principled anyway, since Phase 4's default IS
   "everyone can push").
5. **Convert-in-place and pre-share history** (§6): when an existing personal-only book (months
   of rows encrypted under the OWNER's personal vault key) is shared for the first time, do
   those historical rows get RE-ENCRYPTED under the new Book Space Key and re-pushed (so the new
   member sees full history), or does sharing only cover rows created AFTER the invite (new
   member sees an empty book that fills in going forward)? *Recommended: re-encrypt and re-push
   history at share time* (matches the operator's own convert-in-place expectation from
   `docs/ledger-books-plan.md` §5 Q5 — "re-entry would be a bad experience") — this is a
   nontrivial migration step (decrypt every existing row with the personal vault key, re-encrypt
   with the Book Space Key, push as new envelopes under the shared namespace) that a Phase 3
   build plan must budget for explicitly; it is NOT free, and this spike flags it as the
   likely-most-expensive single step in Phase 3's implementation, bigger than the key-wrapping
   work itself.
6. **Private notes within a shared row** (§1): does the operator want any per-row privacy tier
   (e.g. a note visible only to its author, even within an otherwise-shared row), or is "the
   whole row is shared, no exceptions" acceptable for v1? *Recommended: no per-row privacy tier
   in v1* — real complexity (a note field would need its OWN encryption key, separate from the
   Book Space Key, defeating "the whole row decrypts with one key") for a use case not named in
   186 §4's locked framing. Flagged only because it's the kind of thing that's much cheaper to
   decide against now than to retrofit later.

## Maintenance notes

- Supersedes plan 143 in full; 143's investigation-input checklist was reused, but every
  conclusion here is independently re-verified against the current repo, not copied from 143's
  now-superseded findings (143 predates Books entirely).
- Phase 3/4 build plans are cut from this doc AFTER operator review of §7's six open questions
  — exactly like 186 → 188–193.
- Deferred by design (unchanged scope from the parent plan): multi-household (a user belonging
  to >1 shared-book "graph" simultaneously — actually already naturally supported since sharing
  is per-book, not per-household, but multi-household PERFORMANCE at scale is untested),
  >2 members performance (key-rotation cost analysis in §2 assumed small N), cross-household
  sharing (a shared book with members who are themselves in different unrelated households —
  no such concept exists in this design since "household" isn't a first-class entity at all,
  only "book membership" is, which sidesteps the question rather than answering it).
- If the operator rejects any decision recorded here as final, record the rejection in
  `plans/README.md`'s rejected-findings ledger per this repo's established convention (per
  `docs/ledger-books-plan.md`'s own maintenance notes, echoing `docs/split-legs-plan.md`).
