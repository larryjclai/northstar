# Plan 149: Make device reset wipe the SecretStore, and route account.ts through the single shared store (130 follow-ups)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. SKIP updating `plans/README.md` — your reviewer
> maintains the index. SECURITY-SENSITIVE: never reproduce any secret VALUE in
> your report — reference file:line + credential type only.
>
> **Drift check (run first)**: `git diff --stat 6010c0b8..HEAD -- src/features/connect/sync/reset.ts src/features/connect/sync/account.ts src/features/connect/crypto/secretStore.ts`
> Written against main `6010c0b8`. If your worktree base is older, advance it
> (see dispatch preamble).

## Status

- **Priority**: P1 (reset gap is a real device-only security bug)
- **Effort**: S
- **Risk**: MED — touches the device-reset path; a wrong change could fail to
  clear (worse) or clear too much (lockout). The web/jsdom fallback exercises
  the same code, so tests cover the logic; the Stronghold branch is device-only.
- **Depends on**: 130 (MERGED — the cutover that created the gap)
- **Category**: security
- **Planned at**: commit `6010c0b8`, 2026-07-09

## Why this matters

Plan 130 routed the vault key + device keypair (and, earlier, the sync account
record) through the `SecretStore` — which on a Tauri device is Stronghold, not
localStorage. But two call sites still assume secrets live only in localStorage:

1. **`reset.ts` no longer fully wipes secrets on device.** It clears the three
   `SECRET_KEYS` from `localStorage` only. Post-130, `getSecretStore()` reads
   from Stronghold on device, so after a "reset this device" the vault key,
   device keypair, and account secret SURVIVE inside the Stronghold snapshot —
   the reset is ineffective, and the next `loadVaultKey()` returns the old key.
   (This partially pre-dated 130 for the account record via the earlier
   account.ts cutover; 130 widened it to the vault key + keypair.) Its comment
   ("today secrets live in localStorage … removing the SECRET_KEYS keys is
   sufficient") is now false.
2. **`account.ts` opens a second store instance.** It calls
   `createSecretStore()` directly (three functions + its own
   `migrateLocalStorageSecrets`), so on device it loads a Stronghold snapshot
   separate from the vault/pairing singleton created by `getSecretStore()` —
   two loads per session, and the "single store instance" guarantee 130
   established is not actually single.

## Current state

- `src/features/connect/crypto/secretStore.ts` (post-130):
  - `getSecretStore()` — memoized single store (Stronghold on device,
    localStorage fallback in web/tests), runs migration once. Reuse this.
  - `SECRET_KEYS` — the three secret key strings (`northstar.vault.key.v1`,
    `northstar.device.keypair.v1`, `northstar.sync.account.v1`).
  - `resetSecretStoreForTests()` — test-only reset of the memoized store.
  - `SecretStore` interface has `get`/`set`/`remove`.
- `src/features/connect/sync/reset.ts` (~lines 14-17 comment, ~33-36 clear
  logic) — removes `SECRET_KEYS` from `localStorage` directly. Read the whole
  reset function to see everything it clears (cursors, status flags, etc. — do
  NOT change those; only add the SecretStore wipe for the SECRET_KEYS).
- `src/features/connect/sync/account.ts` — calls `createSecretStore()` directly
  (grep it: ~3 call sites + a `migrateLocalStorageSecrets` in `loadSyncAccount`).
  Read `vault.ts` (post-130) for the `getSecretStore()` usage pattern to copy.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc` | exit 0 |
| Tests | `npm test` | all pass (921) |
| Targeted | `npm test -- reset account secretStore` (adjust to real filenames) | pass |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**:
- `src/features/connect/sync/reset.ts` — also remove each `SECRET_KEYS` entry
  from `getSecretStore()` (await `store.remove(key)` per key); fix the stale
  comment. Keep clearing localStorage too (harmless + covers the fallback).
- `src/features/connect/sync/account.ts` — replace direct `createSecretStore()`
  calls with `getSecretStore()` so there is one shared store/load per session;
  drop its now-redundant direct `migrateLocalStorageSecrets` call IF
  `getSecretStore()` already migrates (it does — verify) and removing it changes
  no behavior.
- Tests for both (reset clears the store; account reads/writes via the shared
  store).

**Out of scope**:
- The Stronghold password / Rust salt / snapshot format.
- Clearing localStorage copies elsewhere (130's deferred per-platform step).
- Pairing protocol (plan 131), device credentials (plan 132).
- Any crypto change.

## Git workflow

- Branch: `fix/ai-secretstore-reset-consistency`
- Commit: `fix(security): device reset wipes the SecretStore; account.ts uses the shared store`
- Do NOT push or merge to `main`.

## Steps

### Step 1: reset.ts also wipes the SecretStore
In the reset function, after (or alongside) the existing localStorage clear of
`SECRET_KEYS`, get `const store = await getSecretStore()` and
`await store.remove(key)` for each `SECRET_KEYS` entry. Update the stale comment
to state secrets now live in the SecretStore (Stronghold on device) and the
reset clears both the store and the localStorage fallback.
**Verify**: `npx tsc` → exit 0.

### Step 2: Test the reset wipe
Add/extend a reset test (jsdom → localStorage-backed store): set the three
secret keys via the store, run reset, assert `store.get(key)` is null for each.
Because tests use the localStorage backend, also assert the localStorage copies
are gone. Use `resetSecretStoreForTests()` in setup/teardown so the memoized
store doesn't leak between tests.
**Verify**: `npm test -- reset` → pass, including the new assertions.

### Step 3: account.ts uses the shared store
Replace `createSecretStore()` calls with `getSecretStore()`. Confirm the account
read/write still round-trips (existing account tests should stay green). Remove
the redundant direct migration call only if `getSecretStore()` covers it.
**Verify**: `npm test -- account` → pass.

### Step 4: Full gates
**Verify**: `npx tsc` → exit 0; `npm test` → 921+ pass; `npm run lint` → exit 0.

## Test plan
Reset-wipe test (Step 2) + the existing account/sync tests staying green. The
device Stronghold branch can't be unit-tested in jsdom; the logic is shared with
the localStorage backend, so covering the fallback covers the control flow.

## Done criteria

- [ ] `reset.ts` removes each `SECRET_KEYS` entry from the SecretStore (not just
      localStorage); comment corrected
- [ ] `account.ts` uses `getSecretStore()` (grep: no `createSecretStore(` left
      in account.ts)
- [ ] Reset-wipe test asserts store is empty after reset
- [ ] `npx tsc`, `npm test` (≥921), `npm run lint` all green
- [ ] Only reset.ts + account.ts (+ their tests) modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- The reset function clears secrets in a way that would also nuke non-secret
  device state if you route it through the store — keep the SECRET_KEYS wipe
  precise (only those three keys), report if the structure resists that.
- `getSecretStore()` does NOT migrate (contradicting 130) — then keep account's
  migration call and report the discrepancy.
- Removing account.ts's direct store changes an existing test's behavior — STOP
  and report which.

## Maintenance notes

- After this, "reset device" truly clears all secrets on every backend. This is
  the correctness partner to 130's cutover — they should ship together in any
  release.
- Reviewer: confirm the reset removes exactly the three SECRET_KEYS from the
  store and nothing else; confirm account.ts no longer double-loads Stronghold.
