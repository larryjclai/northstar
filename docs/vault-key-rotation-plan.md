# Vault-key rotation on device revocation — design spike (Plan 238)

> **Doc-only design spike.** Deliverable is this decision document, zero code changes. This
> is the highest-risk surface in the app (crypto + sync + relay + multi-device version skew in
> a finance product) — the BUILD is deliberately NOT this plan. A build plan is cut from this
> doc in a dedicated session, after the operator answers §7.
> Status: **options laid out, recommendation given, awaiting operator decision on §7's open
> questions** (2026-07-19).

## Why this exists

Plan 132 (per-device credentials + revocation, shipped) made revoking a device cut its RELAY
access — a revoked device's bearer token 401s on every authenticated route because revocation
hard-deletes its `devices` row (`worker/migrations/0005_device_credentials.sql:9–11`,
`worker/src/index.ts:399–408`). Plan 132's own maintenance notes explicitly deferred the
cryptographic half of revocation:

> *"a revoked device that already synced ciphertext it captured can still decrypt THAT; future
> data is cut off by per-device auth"* (`plans/132-per-device-credentials-revocation.md:103–106`)
>
> *"new vault key, re-encrypt local data, re-wrap to remaining devices via the /keys mailbox.
> Requires plan 131's machinery; substantial."* (`plans/132-per-device-credentials-revocation.md:163–165`)

This spike designs that rotation. It re-verifies every claim against the actual shipped code
(not against plan 131/132's own prose, which may have drifted) and cites `file:line` throughout.

**Drift check** (run at spike time): `git diff --stat 82839b85..HEAD -- src/features/connect/crypto
src/features/connect/devices worker/src` → empty except this spike's own commit adding this file.
`src/features/connect/devices/` contains only a stale `README.md` stub (a Supabase sign-in flow
that predates the shipped ECDH design — already flagged as vestigial by
`docs/shared-books-plan.md:149–151`); the real pairing/crypto code lives in
`src/features/connect/crypto/` and `src/features/connect/sync/`, confirmed below.

## Current state — re-verified against the actual repo

### Crypto (client) — `src/features/connect/crypto/`

- **`vault.ts`** (67 lines): the vault key. `generateVaultKey`/`exportVaultKey`/`importVaultKey`
  (13–31), `saveVaultKey`/`loadVaultKey` (34–46) persist through the `SecretStore` under a
  **single fixed key** `"northstar.vault.key.v1"` (line 11) — **there is no versioning today; one
  vault key slot, full stop.** `encryptPayload`/`decryptPayload` (49–67): AES-GCM 256, random
  12-byte IV prefixed to the base64 ciphertext, no key-id anywhere in the envelope format.
- **`secretStore.ts`** (247 lines): pluggable secret storage — Stronghold on device (Tauri,
  encrypted-at-rest via argon2-derived key, `createStrongholdStore` 112–153), localStorage
  fallback (web shell / jsdom tests, 76–88). `SECRET_KEYS` (40–47) lists exactly the vault key,
  device keypair, sync account, and device relay credential — **a closed, fixed list**; adding a
  second vault-key slot means extending this list (see §2).
- **`pairing.ts`** (270 lines): ECDH primitives (plan 131).
  - `generateDeviceKeyPair` (34–38): P-256 ECDH keypair, persisted via `saveDeviceKeyPair`/
    `loadDeviceKeyPair` (40–59) under **one fixed key** `"northstar.device.keypair.v1"` (line 27)
    — **a device's own ECDH keypair is generated once and never rotated itself.** This is fine for
    vault-key rotation (the keypair only WRAPS/UNWRAPS symmetric keys; reusing a static keypair
    across many wrap operations is the same pattern pairing already uses for every new device it
    approves).
  - `deriveSharedKey`/`deriveSharedKeyExtended` (73–104): ECDH → AES-GCM 256 shared key, usable
    for `wrapKey`/`unwrapKey` and (extended) `encrypt`/`decrypt`.
  - `wrapVaultKey`/`unwrapVaultKey` (123–149): wrap an arbitrary `CryptoKey` under a derived
    shared key for relay as opaque ciphertext. **Already generic — takes any `CryptoKey`, not
    vault-key-specific by construction.** Rotation reuses this verbatim.
  - `fingerprintPublicKey` (112–120): SAS-style 8-hex-char fingerprint of a public key, for
    out-of-band user confirmation during pairing.
- **`pairing-flow.ts`** (357 lines): orchestration.
  - Device B (joiner): `startJoinSession` (115–152) **always** generates+persists a device
    keypair (line 119–120) before publishing its bundle. `completeJoin` (163–195) unwraps the
    vault key and calls `saveVaultKey` (line 178) — **overwrites the single vault-key slot.**
  - Device A (approver): `approveJoiningDevice` (237–280) — loads its OWN keypair, **lazily
    generating one if it has none yet** (`if (!pair) { pair = await generateDeviceKeyPair();
    await saveDeviceKeyPair(pair); }`, lines 242–246) — meaning **a device that has never
    approved anyone and was never a joiner has no persisted keypair.** In practice this is moot
    for rotation: rotation only matters once ≥2 devices exist, and by construction every device
    involved has by then gone through `startJoinSession` (as a joiner) or `approveJoiningDevice`
    (as an approver, lazily generating) at least once — so **every device that could plausibly
    receive a re-wrapped key already has a persisted keypair by the time rotation is relevant.**
    No new keypair-generation trigger is needed.
  - Crucially: `approveJoiningDevice` uses the joining device's public key (`approval.publicKeyB64`,
    obtained transiently from the pairing bundle) **only within that function call** — it wraps
    and deposits, then discards it. **Device A never persists Device B's public key anywhere.**
    This is the load-bearing gap for rotation — see "Orphaned/missing primitives" below.
- **`recovery-kit.ts`** (124 lines): the Recovery Kit **is the vault key**, printed as 64 hex
  chars (46–55 `generateRecoveryKit`, 84–94 `restoreFromRecoveryKit`). It round-trips through the
  SAME single-slot `saveVaultKey`/`loadVaultKey`. **A rotation silently stales any
  previously-generated Recovery Kit** — restoring from the old kit would reinstate the OLD vault
  key and desync the restoring device from every post-rotation envelope. `isRecoveryKitConfirmed`
  (76–78) gates cloud-backed sync (`policies.ts`, `sync-manager.ts:64`).

### Sync engine — the two moving pieces rotation must compose with

- **`push.ts`** (77 lines): `pushPendingChanges` calls `loadVaultKey()` **fresh at push time**
  (line 26) — not a cached key from session start — so installing a new vault key before the next
  push naturally causes that push to encrypt under the new key. Each envelope gets a **fresh
  random `id`** (`crypto.randomUUID()`, line 56); the **dedup key is `(entity, entityId, revision,
  deviceId)`**, not the envelope id (see worker schema below).
- **`sync-manager.ts`** (194 lines):
  - `runSync`/`_doSync` (43–100): push, then pull-and-apply, decrypting with `loadVaultKey()`
    (single current key).
  - `forceFullResync` (117–161): recovery path for a wiped/reinstalled device — **drains the
    relay from sequence 0**, ignoring the stored cursor, decrypting every envelope with
    `loadVaultKey()`. **If any envelope in that full history was encrypted under a vault key this
    device no longer holds, decryption fails for that envelope with no versioning to fall back
    on** — this is the concrete mechanism by which "the old key must never simply vanish" becomes
    a hard requirement, not a nice-to-have (§2).
  - `forceFullRepush` (173–188): **already-shipped machinery for "re-push everything under the
    current vault key"** — `repo.requeueAllPendingChanges()` + `setLocalPushCursor(null)` +
    `_doSync()`. This looks, at first read, like the ready-made tool for "re-encrypt history under
    the new key after rotation." **It is not, as currently implemented** — see the critical finding
    below.
- **`pull.ts`**: `pullAndApply`'s LWW compare (`shouldApply`, line 152) and conflict surfacing
  (only on an exact same-revision-same-`updatedAt` tie, lines 113–136) are reused verbatim by this
  design — rotation doesn't touch the merge logic at all, only what key decrypts an envelope
  before it reaches that logic.

### Worker (relay) — `worker/src/index.ts`, `worker/migrations/`

- **`devices`** table (`0001_initial.sql:10–17`, `+device_secret_hash` in `0005`): `id, user_id,
  name, platform, trusted_at, created_at, device_secret_hash`. **No public-key column.**
  `handleAddDevice` (329–345), `handleListDevices` (390–397) — `DeviceRecord` returned to the
  client (`client.ts:21–27`) has no `publicKeyB64` field either.
- **`key_envelopes`** table (`0001_initial.sql:36–46`, `+source_public_key` in `0004`): `id,
  user_id, target_device_id, source_device_id, key_type, wrapped_key, wrapped_key_version INTEGER
  NOT NULL DEFAULT 1, source_public_key, created_at`, **`UNIQUE(user_id, target_device_id,
  key_type)`**. `handleStoreKey` (509–544) is an **UPSERT** —
  `ON CONFLICT(user_id, target_device_id, key_type) DO UPDATE SET wrapped_key = excluded.wrapped_key, ...`
  — **re-storing the same `(target_device_id, key_type)` pair cleanly overwrites the prior
  envelope.** `wrapped_key_version` is declared in the schema but **never read or written by any
  handler** (`grep -n "wrapped_key_version" worker/src/index.ts` → zero hits) — an orphaned
  column, ready but unwired.
- **`sync_envelopes`** table (`0001_initial.sql:21–32`): `id, user_id, device_id, entity,
  entity_id, revision, encrypted_payload, updated_at, relay_sequence`, **`UNIQUE(user_id, entity,
  entity_id, revision, device_id)`**. `handlePushEnvelopes` (421–471) is `INSERT ... ON
  CONFLICT(...) DO NOTHING` (463) — **the opposite of `key_envelopes`: a push that repeats an
  already-stored `(entity, entityId, revision, deviceId)` tuple is silently dropped, not
  overwritten.**
- **`authenticate()`** (99–146): resolves exactly one `(userId, deviceId | null)` per bearer
  token; a revoked device's row is hard-deleted so its token 401s (122–134, matches 0005's own
  comment). Nothing here needs to change for rotation — rotation is orthogonal to WHO can push,
  only to WHAT KEY the ciphertext is under.
- **Router** (150–265): `GET /devices`, `POST /devices`, `DELETE /devices/:id`, `POST/GET
  /keys/:targetDeviceId`, `POST/GET /envelopes` — all present exactly as plan 131/132 shipped
  them. **No STOP condition triggered**: the `/keys` mailbox exists precisely as plans 130–132
  describe it.

### Orphaned / missing primitives — the load-bearing gaps rotation must close

Re-grepped explicitly, since these are exactly the kind of half-finished thought
`docs/shared-books-plan.md:157–165` already found once in this same subsystem (`KeyEnvelopeMetadata`/
`HouseholdSpace` in `src/features/connect/types.ts:10–24` — confirmed still dead, zero other
references, not this spike's problem to fix but worth knowing it's a repeat pattern):

1. **No durable per-device public-key directory.** As shown above, a device's ECDH public key is
   only ever visible to the relay *transiently* — inside an in-flight pairing session's encrypted
   bundle, or as `key_envelopes.source_public_key` for a SPECIFIC envelope that device happened to
   author. **There is no way for device C, months after C and D were both independently paired by
   device A, to look up D's public key in order to wrap a rotated vault key to it.** This is the
   single biggest missing piece — see §5.
2. **`key_envelopes.wrapped_key_version` is schema-present but code-orphaned.** Exactly the column
   a key-versioning scheme needs (§2) already exists and defaults to 1; nobody reads or writes it.
3. **`fetchKeyEnvelopes` (the authenticated device path, `client.ts:151–156`, backed by
   `handleFetchKey`, `worker/src/index.ts:551–563`) is defined but never called in production
   code** (`grep -rn "fetchKeyEnvelopes\b" src --include="*.ts" --include="*.tsx"` outside its own
   definition and tests → zero call sites). Only `fetchKeyEnvelopesWithToken` (the unauthenticated,
   pairing-token-scoped variant) is wired into the live join flow. This is exactly the primitive a
   rotation recipient needs to poll "is there a new wrapped vault key waiting for me?" — it already
   exists, just needs a caller.
4. **No key-id/version stamp on `sync_envelopes`.** An envelope's ciphertext gives no signal about
   which vault key decrypts it. Required for any lazy/versioned rotation scheme (§2).

These four gaps, not any missing crypto primitive, are what make this a genuine spike rather than
a five-line wiring change — `docs/shared-books-plan.md:230–231`'s framing ("no new crypto
primitives, only a new scope for a mechanism that already exists") holds here too: **every crypto
operation rotation needs (`generateVaultKey`, `wrapVaultKey`/`unwrapVaultKey`,
`deriveSharedKeyExtended`, `encryptPayload`/`decryptPayload`) is already shipped and tested.** The
work is entirely in directory/versioning/polling plumbing around those primitives.

### A critical finding: `forceFullRepush` does NOT actually replace stale-key ciphertext

This matters enough to call out on its own before §3's protocol design, because it invalidates the
"just call the existing repush machinery" shortcut that looks obviously available at first glance.

`forceFullRepush` (`sync-manager.ts:173–188`) requeues every local record and pushes it again.
`pushPendingChanges` (`push.ts:22–77`) reads each record's **current, unchanged `revision`**
(`repositories.ts`'s `collectPendingChanges` does not bump revision — `bump()`,
`repositories.ts:584–585`, is only called by actual local mutations) and encrypts it under
whatever vault key `loadVaultKey()` returns **at push time** — so far, so good, this WOULD use the
new key. But the push lands on the relay as `INSERT ... ON CONFLICT(user_id, entity, entity_id,
revision, device_id) DO NOTHING` (`worker/src/index.ts:463`). Since the revision hasn't changed,
the `(entity, entityId, revision, deviceId)` tuple is **identical to the row already stored from
before rotation** — the insert is a silent no-op, and the OLD-key-encrypted row remains on the
relay, unreplaced. **A record must have its revision bumped for a repush to actually land a
new-key envelope; today nothing in the repush path bumps revisions.** This is a real, previously
unnoticed implication of running `forceFullRepush` and expecting it to "clean up" stale ciphertext
— it silently doesn't, for any record unmodified since its last real push.

## 1. Threat model, honestly bounded

**What rotation does NOT protect, ever, regardless of design:**
- **Already-captured ciphertext under the old key is not retroactively protected.** Any party who
  already holds the old vault key (a revoked device, or an attacker who separately obtained it)
  can decrypt anything encrypted under it — past OR future, until the DATA ITSELF also gets
  re-encrypted (which, per the finding above, this design deliberately does NOT attempt at scale;
  see §3). Rotation changes what key NEW pushes use going forward; it does not "revoke" the old
  key's mathematical ability to decrypt old data.
- **Local plaintext on a revoked device is unrecoverable regardless of scheme.** By the time a
  device is revoked, it has (by definition — it was trusted) already decrypted and displayed
  whatever data it pulled while trusted. Rotating the vault key doesn't un-decrypt what's already
  resident on that device's disk. This mirrors `docs/shared-books-plan.md:596–600`'s identical,
  already-accepted conclusion for the shared-books case — the mechanism differs, the honest
  limitation is the same.

**What rotation DOES add over plan 132's credential cut:**
- Plan 132 already stops a revoked device from **fetching NEW envelopes via the relay** (its token
  401s). Rotation additionally makes the **key material itself** stop being useful for future data,
  which matters in scenarios 132 alone doesn't cover:
  - **Vault-key leak independent of device compromise** — e.g. the key is extracted from a
    Stronghold snapshot backup, a crash dump, or a bug (not the normal "device is physically
    stolen" case 132 already handles via credential revocation). Without rotation, that leaked key
    remains valid to decrypt every envelope pushed for the rest of the account's life. With
    rotation, its blast radius is capped at "everything pushed before the next rotation."
  - **A future relay compromise correlated with an old leaked key.** If the relay's D1 database is
    ever exfiltrated, an attacker holding a previously-leaked vault key can decrypt every envelope
    still encrypted under it. Rotation limits how much of the total history remains readable with
    any single leaked key version — but (§3) does NOT eliminate the pre-rotation portion, which is
    the honest limitation restated above.
  - **Defense-in-depth for the revoked-device scenario itself**: even though 132 cuts relay access,
    rotation removes the (smaller, secondary) residual risk that the revoked device's cached key
    could be used against envelopes pushed by OTHER devices that the revoked device somehow still
    receives out-of-band (e.g., a shared local backup file, per `docs/local-backup-plan.md`-style
    export/import — not this spike's problem to solve, but rotation narrows the window).

**Bottom line, stated plainly for the operator and eventually the user-facing copy**: rotation is
a going-forward containment measure, not a data-erasure tool. It should be framed to the user
identically to how `docs/shared-books-plan.md:596–600` frames book-key rotation: *"removing a
device stops it from receiving new data; anything it already has stays with it."*

## 2. Key versioning

**Recommendation: monotonic integer version per vault key, stamped on every envelope, every key
version retained locally forever.**

**Local storage shape (client change, `vault.ts` + `secretStore.ts`).** Replace the single fixed
slot (`"northstar.vault.key.v1"`) with a per-version slot plus a "current version" pointer:

- `northstar.vault.key.v{n}` for each version `n` the device has ever held (extends `SECRET_KEYS`,
  `secretStore.ts:40–47`, from a closed list to a small versioned family — the `SecretStore`
  interface itself, `get`/`set`/`remove` by arbitrary string key, already supports this with zero
  interface change).
- `northstar.vault.key.current` (or reuse a lightweight marker) — an integer pointing at which
  version is used for NEW encryption (`encryptPayload` at push time) and for the Recovery
  Kit/pairing-approval paths (§3).
- **Never delete an old version locally.** Cost is negligible — a 256-bit AES key is 44 bytes
  base64; a device could hold hundreds of historical versions before this becomes measurable. The
  ONLY reason to ever delete a local key copy is if the operator later wants a "some data becomes
  permanently unreadable even by trusted devices" feature — explicitly out of scope for v1 (§7 asks
  the operator whether an old-key retention window is wanted; the recommendation is "unbounded,
  never delete").
- Rationale for "never delete": `forceFullResync` (`sync-manager.ts:117–161`) drains the relay from
  sequence 0 and must be able to decrypt EVERY envelope ever pushed, including pre-rotation ones
  under old keys. Losing an old key version breaks recovery for any device that ever needs to
  rebuild from scratch — a strictly worse outcome than the near-zero storage cost of keeping it.
  Deleting old local key copies also buys nothing extra: the plaintext they'd protect is already
  resident, decrypted, on every device that pulled it before rotation (§1's honest limitation) —
  destroying the KEY locally doesn't destroy the PLAINTEXT already on disk, so there's no real
  security benefit to local deletion, only a recovery-breaking cost.

**Envelope key-id scheme (relay + wire format change).** Add `key_version INTEGER NOT NULL DEFAULT
1` to `sync_envelopes` (additive migration, §5). `pushPendingChanges` (`push.ts`) stamps the
CURRENT vault key version on every envelope it pushes; `pullAndApply` (`pull.ts`) reads it back and
selects the matching locally-held key version before calling `decryptPayload`. Existing rows
implicitly get `key_version = 1` (the DEFAULT), which is correct — everything pushed before
rotation ships was, by definition, encrypted under version 1, the only version that has ever
existed. **No backfill migration needed** — the default is already the right historical value.

**When may an old key be destroyed?** Per the "never delete" rationale above: **never, in this
design.** If the operator later wants a stronger guarantee (e.g. contractual/compliance
requirement to make old data provably unreadable after N days), that requires actually
re-encrypting and replacing relay-side ciphertext (not just deferring to "the local copy is
already gone") — a materially bigger feature explicitly deferred to Maintenance notes, not
designed here.

## 3. Rotation protocol

**Reuses 100% of shipped primitives — `generateVaultKey`, `wrapVaultKey`/`unwrapVaultKey`,
`deriveSharedKeyExtended`, `encryptPayload`/`decryptPayload`, the `key_envelopes` UPSERT mailbox
— exactly the same shape `docs/shared-books-plan.md:267–271` already used for its own key-rotation
sketch ("it's `generateVaultKey()` + N `wrapVaultKey()` calls, the same shape as today's per-device
key relay just run N times instead of once"). No new cryptography anywhere in this protocol.**

### Initiator

**Any currently-trusted device may initiate a rotation** — not necessarily the specific device
that clicked "revoke" in `ConnectSection.tsx` (though that is the natural, expected trigger point;
`revokeDevice` is called from `ConnectSection.tsx:418`). Any trusted device already holds the
current vault key and, once §5's public-key directory ships, can look up every OTHER remaining
device's public key via `GET /devices`. This flexibility matters for the failure modes in §4 (the
revoker device is not guaranteed to be the one online when rotation actually needs to complete).

### New-key generation

1. Initiator calls `generateVaultKey()` (unchanged, `vault.ts:13`), assigns it the next version
   number (`currentVersion + 1`), and saves it locally under `northstar.vault.key.v{n+1}` (§2) —
   the OLD version stays in its own slot, untouched.
2. Initiator does **not** yet flip its "current version" pointer to the new key — see step 5's
   ordering, which flips it only after re-wrap deposits succeed, so a crash mid-rotation leaves the
   initiator still consistently using the OLD key (safe) rather than half-migrated.

### Re-wrap to each remaining device

3. Initiator calls `GET /devices` (`listDevices`, `client.ts:128–130`, extended per §5 to return
   `publicKeyB64`) to enumerate every currently-trusted device (the just-revoked device is already
   gone from this list — revocation is a hard DELETE, `worker/src/index.ts:404–406` — so it
   structurally cannot receive the re-wrap; this is the mechanism, not a policy check).
4. For each remaining device (including itself, for consistency — the initiator "re-wraps to
   itself" trivially by already holding the plaintext key, but conceptually every device converges
   through the same mailbox path):
   - `deriveSharedKeyExtended(initiatorPrivateKey, targetPublicKeyB64)` (existing primitive,
     `pairing.ts:93–104`).
   - `wrapVaultKey(shared, newVaultKey)` (existing primitive, `pairing.ts:123–133`).
   - `storeKeyEnvelope(...)` (existing primitive, `client.ts:138–148`) with **`keyType:
     "vault-v1"` unchanged** (the key TYPE doesn't need to encode the version — the already-present
     `wrapped_key_version` column does that job) and `wrappedKeyVersion: n+1`. Because
     `key_envelopes` UPSERTs on `(user_id, target_device_id, key_type)` (`worker/src/index.ts:525`),
     this **cleanly overwrites** any envelope already sitting in that device's mailbox slot — no
     accumulation, no cleanup needed, and a device that was mid-poll for an OLDER pending rotation
     simply picks up the latest one instead (see §4 for the "two rotations race" case this
     property resolves).
5. Only after every remaining device's deposit succeeds (or, per §4, after a bounded best-effort
   attempt with explicit UI feedback on partial failure), the initiator flips its own "current
   version" pointer to `n+1` and begins stamping `n+1` on new pushes.

### Recipient side (every remaining device, including a device that was offline during steps 3–4)

6. **Wire `fetchKeyEnvelopes` (the currently-unused authenticated path, `client.ts:151–156`) into
   `runSync`'s cycle** — on every `runSync`/`_doSync` (`sync-manager.ts:54–100`), after
   authenticating, call `fetchKeyEnvelopes(authToken, myDeviceId)`, find the `vault-v1` entry, and
   compare its `wrappedKeyVersion` against the locally-held current version.
7. If newer: `unwrapVaultKey` (existing primitive) using this device's own persisted keypair +
   the envelope's `sourcePublicKeyB64`, save the unwrapped key under its OWN versioned slot
   (`northstar.vault.key.v{n+1}`), and flip the local current-version pointer.
8. This makes rotation pick-up **pull-driven and idempotent** — a device that was offline for
   three rotations simply sees the LATEST envelope (thanks to the UPSERT-overwrite property in
   step 4) next time it syncs, applies it once, and is caught up — it never needs to replay
   intermediate rotations one at a time.

### Recovery Kit regeneration (required, not optional)

9. Because the Recovery Kit is literally the vault key (`recovery-kit.ts:46–55`), the rotation
   initiator MUST prompt regeneration of the Recovery Kit immediately after step 5 succeeds — an
   un-regenerated kit becomes a landmine: using it later to "recover" a lost-all-devices scenario
   would restore the STALE pre-rotation key, silently desyncing the recovering device from every
   post-rotation push. This is a client-UX requirement, not a crypto requirement, but it is
   load-bearing enough to name here rather than leave implicit.

### Relay-data strategy: evaluated BOTH, recommending (a) lazy

**(a) Lazy — recommended.** Old envelopes stay under the old key forever (§2's versioning makes
this safe to decrypt correctly); only NEW pushes use the new key. Zero extra relay writes beyond
the mailbox re-wrap itself. This is what §1's threat model already commits to honestly: rotation
contains FUTURE exposure, it does not erase PAST ciphertext. Cost: **O(remaining devices)** key
wraps per rotation — cheap, matches `docs/shared-books-plan.md:273–275`'s own cost analysis for the
structurally identical book-key case ("O(members × devices), same as re-pairing every remaining
member's every device").

**(b) Full re-push under the new key — evaluated, rejected as the default.** Per the critical
finding above, this is NOT free even to attempt correctly: it requires bumping every record's
revision (a change `forceFullRepush` does not make today) so the new push doesn't get silently
dropped by the relay's `ON CONFLICT DO NOTHING` dedup (`worker/src/index.ts:463`). Even done
correctly, it does **not** delete the OLD envelope rows — this schema has no "supersede and delete"
operation on `sync_envelopes`, only append. So (b) would leave BOTH the old-key AND new-key
ciphertext for every record sitting on the relay simultaneously, achieving nothing beyond (a)'s
lazy approach except extra relay storage and a revision-number bump that ripples into every other
device's next pull (each remaining device would see a phantom "this record changed" event for
literally every record in the account, at every rotation — a pull-volume and conflict-surfacing
cost with no compensating security benefit, since the old ciphertext remains readable regardless).
**Rejected.** If the operator later wants a genuine "make old ciphertext unreadable" guarantee,
that requires an explicit delete-and-compact operation on `sync_envelopes` — a materially different,
riskier feature (breaks `forceFullResync`/straggler-catch-up for any device that hasn't caught up
past the deleted range) that this spike declines to design speculatively; flagged in Maintenance
notes as a distinct, larger follow-up if ever requested.

## 4. Failure modes & version skew

Cautionary precedent for this section: the duplicate-books merge-on-pull saga
(`plans/207-default-book-convergence-spike.md`, built as `plans/211-default-book-merge-build.md`)
is the concrete example in this codebase of a "looks like straightforward deterministic merge"
design that had two real gaps only found on post-hoc review — race conditions between devices
acting on stale local state, and a merge policy that wasn't specified precisely enough (which
value wins for divergent metadata). Both lessons apply directly here.

| Failure mode | Detection | Recovery |
|---|---|---|
| **A remaining device is offline during rotation** | The device's next `runSync` naturally calls `fetchKeyEnvelopes` (step 6) and finds a newer `wrappedKeyVersion` than it holds. | Automatic — no special handling needed. This is the entire point of making pickup pull-driven (step 8) rather than requiring the offline device to be reachable at rotation time. |
| **Two rotations race** (e.g. two devices both revoke a different stale device at nearly the same moment and both self-appoint as initiator) | `key_envelopes`'s UPSERT on `(user_id, target_device_id, key_type)` means the SECOND deposit for any given target device simply overwrites the FIRST — there is no accumulation or conflict error. Both rotations "succeed" from the relay's point of view; only the LAST-written envelope per device survives. | **This is a genuine gap, not automatically safe**: if rotation A wraps key-version-2 to device X, then rotation B (racing) wraps its OWN independently-generated key-version-2 (version numbers are locally assigned by each initiator, not centrally allocated — two concurrent initiators can independently mint the same integer for two DIFFERENT actual keys) to device X, device X ends up applying whichever arrived last, and the OTHER rotation's initiator now has a vault key that no other device will ever converge to. **Mitigation for the build plan**: version numbers must be allocated centrally (relay-side, e.g. `SELECT MAX(wrapped_key_version)+1 FROM key_envelopes WHERE user_id=? AND key_type='vault-v1'`, mirroring the EXACT pattern `handlePushEnvelopes` already uses for `relay_sequence` — `worker/src/index.ts:452–457` — a per-user monotonic counter read-then-increment, not client-assigned) so two racing rotations get DISTINCT version numbers even if they can't yet see each other's in-flight write. The initiator whose deposit lands LAST per device simply "wins" that device (same accept-last-write semantics `sync_envelopes` already uses everywhere else) — the LOSING rotation's initiator must detect the mismatch (its own re-wrap round didn't stick for at least one device) via a mandatory post-rotation confirmation ping (an initiator, after depositing, should re-fetch `GET /devices`'s current envelope for at least one target and verify the version its wrote matches what's live — cheap, one extra read) and re-run rotation if it lost the race, rather than silently believing it succeeded. |
| **A device never picks up the mailbox** (permanently offline / lost / user simply never opens the app again) | Indistinguishable, from the relay's perspective, from "temporarily offline" — there is no liveness signal. | No special recovery needed FOR ROTATION specifically — this device was either (a) still trusted, in which case it will pick up the new key whenever it next syncs (possibly months later, which is fine — §2's "never delete old key versions" ensures the old key is still there for anything pushed before it catches up), or (b) should itself be revoked if the operator considers "hasn't synced in months" suspicious — a UX/policy question for `ConnectSection.tsx`, out of this spike's crypto scope. |
| **Partial re-wrap** (initiator successfully deposits to devices A and B but crashes/loses network before reaching device C) | Per step 5's ordering, the initiator has NOT yet flipped its own current-version pointer, so it is still consistently pushing under the OLD key — no data gets pushed under a key that C can't eventually receive. Devices A and B, however, now hold a NEWER key than the initiator itself is using. | This is safe but inconsistent: A and B can decrypt anything the initiator pushes (still under the OLD key, since the initiator hasn't flipped yet) — no data loss. The gap resolves itself the next time ANY device (the original initiator, or A, or B, since any trusted device can initiate per this protocol) runs rotation again and re-attempts C's deposit. **Build-plan requirement**: a rotation must be resumable/retryable — track "which target device ids still need this version" client-side (or re-derive it via the version-mismatch check any device can perform against `GET /devices`) rather than assuming one deposit round always reaches everyone in one pass. |
| **A device is mid-`forceFullResync`** when a rotation happens elsewhere | `forceFullResync` walks the relay from sequence 0 with whatever key versions it locally holds. If a rotation completes DURING the drain, later-sequence envelopes may be stamped with a version this device hasn't received yet (it's mid-recovery, not mid-normal-sync, so it may not be running the `fetchKeyEnvelopes` check from step 6 concurrently). | The existing `pull.ts` skip-on-decrypt-failure path already handles "can't decrypt this envelope" gracefully (`SyncResult.skipped`, `sync-manager.ts:28`) rather than aborting the whole resync — envelopes it can't yet decrypt are simply skipped and will be picked up on the device's NEXT ordinary sync after it fetches the new key envelope. No new mechanism needed; confirm this skip-path is exercised for "wrong/missing key version," not just "malformed ciphertext," when the build plan implements decrypt-by-version (§2). |

## 5. Worker delta

Additive only — mirrors this codebase's established convention (`docs/shared-books-plan.md:386–389`
citing `src/data/migrations.ts`'s own additive-column pattern; every migration in
`worker/migrations/` to date, 0001 through 0007, only adds tables/columns, never alters or drops).

```sql
-- 0008_vault_key_rotation.sql (illustrative — exact naming is a build-time decision)

-- Durable per-device public-key directory (closes the gap in "Orphaned/missing
-- primitives" §above): lets ANY trusted device look up another trusted device's
-- ECDH public key long after their original pairing session, so a rotation
-- initiator can re-wrap to a device it never itself paired.
ALTER TABLE devices ADD COLUMN public_key TEXT;

-- Envelope key-id stamp (§2): which vault key version encrypted this envelope.
-- DEFAULT 1 is correct for every existing row without a backfill migration —
-- everything pushed before this ships was, by construction, encrypted under
-- the one vault key that has ever existed.
ALTER TABLE sync_envelopes ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1;
```

**No change needed to `key_envelopes`** — `wrapped_key_version` already exists
(`0001_initial.sql:43`), it just needs `handleStoreKey`/`handleFetchKey` to actually read/write the
client-supplied value instead of silently defaulting it, and (per §4's race-condition mitigation)
the value should be **allocated relay-side**, not trusted from the client body — analogous to how
`handlePushEnvelopes` already computes `relay_sequence` server-side rather than trusting a
client-supplied sequence (`worker/src/index.ts:452–457`).

**New/changed endpoints:**
- `GET /devices` response gains `publicKeyB64` per device (reads the new `devices.public_key`
  column) — purely additive to the existing `DeviceRecord` shape.
- `POST /devices` (device registration, both the joiner's own self-registration during pairing and
  the approver's `addDevice` call) gains an optional `publicKeyB64` field, stored into the new
  column. Existing callers that omit it leave the column `NULL` (a pre-rotation-ship device that
  hasn't synced since) — see below for the migration path.
- **A new self-provision endpoint, `POST /devices/:id/public-key`**, mirroring the EXACT
  already-shipped pattern of `POST /devices/:id/credential` (plan 132's migration path,
  `client.ts:115–125`, `worker/src/index.ts:365–388`: guarded by "only set if currently NULL," so a
  device already carrying a value can't be silently re-keyed). This is how an EXISTING install
  (paired before this ships, whose device row has `public_key IS NULL`) backfills its own public
  key the first time it syncs post-upgrade — composes with the already-shipped
  `ensureDeviceCredential`-style one-time-upgrade call in `runSync` (`sync-manager.ts:68`).
- `POST /keys/:targetDeviceId` (`handleStoreKey`) and `GET /keys/:targetDeviceId`
  (`handleFetchKey`) start reading/writing `wrapped_key_version`, with the version number computed
  server-side (per §4) rather than trusted from the request body — the ONLY behavioral change to
  an existing handler; no new route.

**Migration numbering**: `0008_vault_key_rotation.sql`, following directly from the last shipped
migration `0007_rate_limits.sql`.

## 6. Phased build outline

| Phase | Scope | Effort | STOP-worthy unknowns |
|---|---|---|---|
| **A — Directory + versioning plumbing** | §5's migration (both new columns); wire `wrapped_key_version` read/write with server-side allocation; extend `GET/POST /devices` for `publicKeyB64`; the `POST /devices/:id/public-key` self-provision endpoint. Client: generate+upload public key at the existing keypair-generation points (`startJoinSession`, lazy path in `approveJoiningDevice`); one-time backfill call in `runSync` for pre-upgrade installs. | S–M | Whether the server-side version-allocation query needs the SAME per-user-scoped-`MAX()` race fix `0006_per_user_relay_sequence.sql` already applied to `relay_sequence` — almost certainly yes, by direct analogy, but verify under concurrent-rotation load before shipping (this spike didn't load-test it). |
| **B — Versioned local key storage** | `vault.ts`/`secretStore.ts`: replace the single fixed slot with the per-version-slot + current-pointer shape (§2). `sync_envelopes.key_version` stamped on push, read on pull, used to select the decrypt key. Recovery Kit regeneration prompt wiring (§3 step 9). | M | Whether `pull.ts`'s existing decrypt-failure skip path (`SyncResult.skipped`) cleanly distinguishes "wrong key version, will resolve itself next sync" from "genuinely corrupt/malformed" for user-facing messaging — today it's one undifferentiated bucket; a rotation-aware build may want to surface these differently in the sync status UI. |
| **C — Rotation protocol itself** | `pairing-flow.ts`-adjacent new module: `rotateVaultKey()` implementing §3 steps 1–8 (generate, enumerate devices via `GET /devices`, re-wrap-and-deposit loop, flip pointer). Wired to fire automatically (or with a confirm prompt — §7 Q1) from `ConnectSection.tsx`'s existing `revokeDevice` call site (line 418). Recipient-side pickup: wire `fetchKeyEnvelopes` into `runSync` (§3 steps 6–7). | M–L | §4's partial-re-wrap resumability — does a v1 build accept "re-run rotation manually if it partially failed" (simpler, exposes the gap to the user) or does it need automatic retry/resume state? Recommend the former for v1, revisit if it proves painful in practice. |
| **D — Race-condition hardening + UX polish** | §4's post-rotation confirmation-ping check (initiator verifies at least one deposit stuck); ConnectSection UI feedback for partial-failure and Recovery-Kit-stale states; copy for the honest §1 threat-model framing shown to the user at rotation time. | S–M | None identified — this phase is mostly UX/hardening on top of B/C's already-designed mechanism. |

**Total estimate**: comparable to plan 131 (M–L) plus a Recovery-Kit UX slice — realistic given this
spike found the crypto primitives are 100% already shipped and the work is directory/versioning/
protocol plumbing, not new cryptography.

## 7. Open questions for the operator

1. **Auto-rotate on every revocation, or prompt first?** *Recommended: auto-rotate, no prompt* —
   mirrors `docs/shared-books-plan.md:316–328`'s own conclusion for the structurally identical
   book-key case ("mandatory rotation... costs nothing extra... strictly safer than leaving it
   optional"). A prompt only adds a step a user will reflexively click through, and an optional
   rotation risks the exact "revoked but key never rotated" limbo state that doc explicitly
   designed against. Counter-consideration: rotation touches every remaining device and requires
   them to be eventually online to pick it up — for a user with many rarely-synced devices this
   could feel like background churn. Recommend auto-rotate regardless, since §4 already shows
   pickup is safe and lazy for offline devices.
2. **Old-key retention window: unbounded, or time-boxed?** *Recommended: unbounded (never delete
   locally)* — §2's full rationale: deleting a local key copy buys no real security (the plaintext
   it protected is already resident wherever it was ever decrypted) and breaks `forceFullResync`
   for that device. If the operator wants a compliance-driven retention policy instead, that's a
   different, bigger feature (actual relay-side ciphertext deletion/compaction, deferred to
   Maintenance notes) — flag here only so the operator can confirm "unbounded" is acceptable as the
   v1 answer, not to re-open the mechanism.
3. **Does a solo-device account (never paired a second device) need any of this?** *Recommended:
   no-op* — rotation only has meaning when ≥1 device remains after a revocation to re-wrap to; a
   single-device account revoking its only OTHER device (down to itself) has nothing to re-wrap to
   and should simply skip the rotation protocol entirely (§3's step 3 enumerates zero remaining
   devices; the build should short-circuit rather than run a zero-target rotation).
4. **Should rotation ALSO be user-triggerable outside of revocation** (a "I think my key may have
   leaked" panic button in Settings, independent of removing any device)? *Recommended: yes, as a
   thin follow-up once phases A–D ship* — the protocol in §3 doesn't care WHY a rotation started;
   exposing it as a standalone action in `ConnectSection.tsx` is a small UI addition once the
   mechanism exists, valuable for the "credential leaked independent of device compromise" case
   §1 names explicitly. Not required for v1, but cheap enough to flag now rather than rediscover
   later.
5. **Server-side version-allocation trust**: is it acceptable that the RELAY (not the client)
   allocates `wrapped_key_version` numbers (§4/§5), meaning the relay operator technically learns
   how many times an account has rotated its vault key (a small metadata signal, no more revealing
   than the account's existing envelope-count metadata it already sees)? *Recommended: yes* —
   consistent with this codebase's existing posture (`docs/shared-books-plan.md:277–283`: "the relay
   already learns per-user activity metadata today"); rotation-count is a strictly smaller signal
   than what's already exposed, and centralized allocation is the only correct fix for §4's race
   condition — the alternative (client-assigned versions) is actively unsafe.

## Maintenance notes

- This spike's crypto conclusions rely on the shipped primitives in `pairing.ts`/`vault.ts`/
  `secretStore.ts` being unchanged from what's cited here — re-run the drift check at build time.
- **Deferred by design, not solved here**: relay-side ciphertext deletion/compaction (the
  "genuinely make old data unreadable" feature §2 and §3(b) both explicitly decline to design) —
  a materially larger, riskier feature (breaks straggler-catch-up / `forceFullResync` for any
  device that hasn't caught up past a deleted range) that should get its own spike if the operator
  ever wants that guarantee, rather than being folded into this build.
- The build plan(s) for phases A–D must be cut in a dedicated session with the operator's answers
  to §7 — per this plan's own instructions, do not let a future misc batch absorb this. Phase A is
  a reasonable first slice to build standalone (it's useful infrastructure — the public-key
  directory — even before the rotation protocol itself ships).
- If the operator rejects any recommendation recorded here as final, record the rejection in
  `plans/README.md`'s rejected-findings ledger per this repo's established convention (matching
  `docs/shared-books-plan.md`'s own maintenance-notes convention).
