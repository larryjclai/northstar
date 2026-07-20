# Plan 240: Rotation Phase B — versioned local key storage + envelope key stamps

> **Executor instructions**: Follow step by step; verify each. STOP conditions
> are binding — this phase decides whether historical data stays decryptable.
> Do NOT update `plans/README.md`.
>
> **REQUIRED READING first**: `docs/vault-key-rotation-plan.md` **§2 Key
> versioning** (the whole section) and the **"critical finding:
> `forceFullRepush` does NOT replace stale-key ciphertext"** subsection. This
> plan is Phase B of that spike's §6 table.
>
> **Drift check**: `git diff --stat b4fbe894..HEAD -- src/features/connect/crypto src/features/connect/sync`

## Status

- **Priority**: P2 · **Effort**: M · **Risk**: **HIGH** (a mistake here makes
  synced history undecryptable — the one place in this build where data can be
  lost)
- **Depends on**: **plan 239 merged** (needs `sync_envelopes.key_version`'s
  migration and the directory plumbing)
- **Category**: security (phase B of 4)
- **Planned at**: commit `b4fbe894`, 2026-07-19

## Operator decision this phase depends on

**Old key versions are retained locally FOREVER — never deleted.** (Operator
answered 2026-07-19, matching the spike's recommendation.) Rationale to honor:
`forceFullResync` drains the relay from sequence 0 and must decrypt EVERY
envelope ever pushed, including pre-rotation ones. Deleting an old key breaks
rebuild-from-scratch and buys no security (the plaintext it protected is
already resident; the threat is someone else's leaked copy, not yours).
**Any code path that deletes a versioned key slot is a bug in this design.**

## Why this matters

Today one fixed key slot exists (`"northstar.vault.key.v1"`) and envelopes
carry no signal about which key decrypts them. Rotation needs both: a device
must hold every key version it has ever had, and every envelope must say which
version encrypted it. Without the stamp, a post-rotation pull cannot tell a
"wrong key version, resolves next sync" envelope from a corrupt one.

## Current state

- `src/features/connect/crypto/vault.ts:11` — `const STORAGE_KEY = "northstar.vault.key.v1";`
  and `loadVaultKey()` at `:41`. Read the whole file.
- `src/features/connect/crypto/secretStore.ts:40-49` — `SECRET_KEYS` is a
  closed literal list including `"northstar.vault.key.v1"`, with
  `export type SecretKey = (typeof SECRET_KEYS)[number]`. `:200` iterates
  `SECRET_KEYS` (read what that loop does — likely a wipe/enumerate path that
  must keep working with a versioned family). The `SecretStore` interface's
  `get`/`set`/`remove` already take arbitrary string keys, so per spike §2 **no
  interface change is needed** — only the key-name family and the type widen.
- Push/pull: `src/features/connect/sync/push.ts` (`pushPendingChanges`) and
  `pull.ts` (`pullAndApply`) — where the stamp is written/read. Spike §2 says:
  push stamps the CURRENT version; pull reads it and selects the matching
  locally-held key before `decryptPayload`.
- Existing rows implicitly get `key_version = 1` via the migration DEFAULT —
  **correct, no backfill** (everything pre-rotation was encrypted under v1).
- `pull.ts`'s decrypt-failure skip path (`SyncResult.skipped`) — spike's
  STOP-worthy unknown for this phase: it's ONE undifferentiated bucket today
  ("wrong key version" vs "genuinely corrupt"). See step 4.
- Recovery Kit: `src/features/connect/crypto/recovery-kit.ts` — §3 step 9 wants
  a regeneration prompt once the current key version changes (the Kit encodes a
  key; after rotation the old Kit is stale).

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 |
| Lint | `npm run lint` | 0 errors / 761 warnings |
| Crypto suites | `npx vitest run src/features/connect/crypto` | pass |
| Tests | `npm test` | prior + new pass |

## Scope

**In scope**: `src/features/connect/crypto/vault.ts`, `secretStore.ts`,
`src/features/connect/sync/push.ts`, `pull.ts`, their tests, and the Recovery
Kit regeneration prompt wiring.
**Out of scope**: the rotation protocol / `rotateVaultKey()` (Phase C), the
worker (Phase A shipped it), any `ConnectSection.tsx` UI beyond the Kit-stale
prompt hook, and — emphatically — **any deletion of key material**.

## Steps

### Step 1: Versioned key slots

Per spike §2: replace the single fixed slot with `northstar.vault.key.v{n}` per
version + a current-version pointer. Widen `SECRET_KEYS`/`SecretKey` from a
closed list to accommodate the versioned family (the spike notes the interface
supports it already). **Migration of existing installs**: an install holding
`northstar.vault.key.v1` must keep working untouched — v1 IS version 1; do not
rewrite or move it. Verify the `:200` `SECRET_KEYS` loop still behaves
correctly with a dynamic family (if it wipes secrets on reset, it must wipe ALL
versions).

**Verify**: `npx vitest run src/features/connect/crypto` → pass, plus new tests:
loading a pre-existing v1 install still returns its key; storing v2 leaves v1
intact and readable.

### Step 2: `loadVaultKey` gains version awareness

`loadVaultKey()` returns the CURRENT version's key (for new encryption);
add a sibling that loads a SPECIFIC version (for decrypting old envelopes).
Never delete; never overwrite an existing version's slot.

**Verify**: unit tests for both paths.

### Step 3: Stamp on push, select on pull

`pushPendingChanges` stamps the current version onto each envelope;
`pullAndApply` reads `key_version` and selects the matching local key before
`decryptPayload`. An envelope whose version this device does NOT hold must go
to the skip path (step 4), never crash the sync loop.

**Verify**: tests covering push-stamps-current and
pull-selects-matching-version; `npm test` → all pass.

### Step 4: Differentiate the skip reason

The spike's flagged unknown: make the skip path distinguish "unknown key
version (may resolve after the next key pickup)" from "malformed/corrupt".
Minimum: a distinct reason on the skip record so Phase D's UI can message them
differently. Do NOT build UI here.

**Verify**: a test asserting the two reasons are distinguishable.

### Step 5: Recovery Kit staleness

When the current version changes, the previously exported Recovery Kit no
longer encodes the live key → surface a "regenerate your Recovery Kit" signal
(state/flag; Phase D renders it). Read `recovery-kit.ts` for the existing
export flow before wiring.

**Verify**: full gates.

## Test plan

Crypto tests: pre-existing-v1 compatibility, multi-version coexistence, load-by-
version, never-delete invariant. Sync tests: stamp on push, select on pull,
unknown-version skip reason. Model after the existing `vault.test.ts` /
`secretStore.test.ts` structure.

## Done criteria

- [ ] Gates green; new crypto + sync tests
- [ ] A pre-upgrade install (only `northstar.vault.key.v1` present) syncs
      normally with zero user action — assert in a test
- [ ] `grep -rn "remove(" src/features/connect/crypto/vault.ts` shows no path
      deleting a versioned key slot
- [ ] Unknown-version skips are distinguishable from corrupt-payload skips
- [ ] No files outside scope modified

## STOP conditions

- Making `SECRET_KEYS` dynamic breaks a consumer that relies on it being a
  closed literal union (report the consumers).
- The pull path can't select a key per-envelope without restructuring the batch
  decrypt loop beyond this phase's scope.
- Any design pressure to delete old keys — that contradicts the operator's
  decision; STOP and report instead of complying.

## Maintenance notes

- Phase C (`rotateVaultKey()`) assumes this phase's contract: current-version
  pointer for new encryption, load-by-version for old envelopes, nothing ever
  deleted.
- The `forceFullRepush` finding (spike): repushing does NOT re-encrypt old
  relay rows, because unchanged revisions hit `ON CONFLICT DO NOTHING`. Do not
  add a "repush to clean up" path here believing it re-keys anything.
