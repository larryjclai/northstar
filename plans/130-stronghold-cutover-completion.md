# Plan 130: Finish the Stronghold secret-store cutover (vault key + device keypair) and reconcile flag/docs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/features/connect/crypto src/state/deviceIdentity.ts docs/secret-storage-plan.md`
> Re-locate excerpts by grep; STOP on shape mismatch.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — a bad cutover can lock a user out of their vault; the
  design's copy-don't-clear migration is the mitigation. NO localStorage
  clearing happens in this plan.
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

The app's E2EE story rests on the vault key. A pluggable `SecretStore` with a
Stronghold (encrypted-at-rest) backend exists and `USE_STRONGHOLD = true` is
committed — but only the sync **account record** was cut over. The vault key
(`crypto/vault.ts`) and the device ECDH keypair (`crypto/pairing.ts`) still
read/write plaintext `localStorage` directly, so the highest-value secrets sit
unencrypted on disk while comments and docs variously claim the flag is off,
the rollout is pending, or (DEVELOPMENT.md) that Stronghold already stores the
vault key. This plan finishes the cutover per the existing design doc and
makes every statement about it true.

## Current state

- `src/features/connect/crypto/secretStore.ts` (196 lines) — the abstraction.
  - `:17` `const USE_STRONGHOLD = true;` directly under a comment saying
    "Off by default … Do NOT commit as true until the rollout sequence".
  - `:22` `STRONGHOLD_PASSWORD` is a hardcoded constant; the adjacent comment
    explains effective security comes from the Rust-side per-install argon2
    salt file (`src-tauri/src/lib.rs` ~289–295) — an accepted, documented
    tradeoff; do NOT redesign it here.
  - `SECRET_KEYS` lists the three localStorage keys:
    `northstar.vault.key.v1`, `northstar.device.keypair.v1`,
    `northstar.sync.account.v1`.
  - `createSecretStore()` (~line 156): Stronghold in Tauri, localStorage
    fallback elsewhere (web dev shell keeps working).
  - `migrateLocalStorageSecrets(store)` (~line 185): copies the three keys
    into the store, idempotent, non-destructive (localStorage copies stay —
    clearing is a documented LATER step, out of scope).
- `src/features/connect/crypto/vault.ts` — `saveVaultKey`/`loadVaultKey` use
  `localStorage.setItem/getItem(STORAGE_KEY)` directly (~lines 28–39).
- `src/features/connect/crypto/pairing.ts` — `saveDeviceKeyPair`/
  `loadDeviceKeyPair` use localStorage directly (~lines 35–52), same
  `northstar.device.keypair.v1` key.
- Cut-over exemplar: `src/features/connect/sync/account.ts` (~line 27) already
  uses `createSecretStore()` — read it and copy its pattern (store acquisition,
  async shape, error handling).
- `src/features/connect/crypto/recovery-kit.ts` — check ~line 92: if it
  reads/writes the vault key via localStorage directly, route it through the
  new vault functions rather than its own access.
- Design doc: `docs/secret-storage-plan.md` — §4 rollout lists exactly this
  cutover; its status header still says "SPIKE — USE_STRONGHOLD=false".
- Wrong docs: `docs/DEVELOPMENT.md:13` lists "Stronghold（vault key 儲存）".

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc` | exit 0 |
| Tests | `npm test` | all pass |
| Targeted | `npm test -- secretStore vault pairing` (adjust to real test filenames) | pass |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**:
- `src/features/connect/crypto/vault.ts`, `pairing.ts` (storage plumbing
  ONLY — zero crypto changes), `recovery-kit.ts` (if it bypasses vault.ts),
  `secretStore.ts` (comment reconciliation + calling migrate at init)
- `src/state/deviceIdentity.ts` — check whether its localStorage usage
  (~line 55) holds a SECRET or just a device id/name; migrate only if secret
  (deviceId alone is an identifier, not a secret — likely leave it; record
  the decision)
- Tests for the changed modules
- Doc truth-sync: `docs/secret-storage-plan.md` status header,
  `docs/DEVELOPMENT.md:13`, `ROADMAP.md:78` one-liner

**Out of scope**:
- Clearing localStorage copies (explicit later step in the design doc —
  requires per-platform manual verification first).
- `STRONGHOLD_PASSWORD` scheme, Rust salt handling, snapshot format.
- Pairing PROTOCOL changes (plan 131) and device credentials (plan 132).

## Git workflow

- Branch: `fix/ai-stronghold-cutover`
- Commits: `fix(security): route vault key + device keypair through SecretStore`,
  `docs(security): reconcile stronghold flag/comments/docs with shipped state`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Make vault.ts async-store-backed

Convert `saveVaultKey`/`loadVaultKey` (already async) to use
`await createSecretStore()` + `get/set(SECRET_KEYS' vault entry)`. Cache the
store instance module-level (one `createSecretStore()` promise, reused) —
account.ts shows the shape. The localStorage KEY STRING must stay identical
(`northstar.vault.key.v1`) so the fallback store and migration keep working.

**Verify**: `npx tsc` → exit 0; `npm test` → all pass (jsdom path uses the
localStorage backend, so existing tests exercise the fallback).

### Step 2: Same for pairing.ts keypair and recovery-kit.ts

`saveDeviceKeyPair`/`loadDeviceKeyPair` → store-backed, same key string. In
`recovery-kit.ts`, replace any direct vault-key localStorage access with
`loadVaultKey`/`saveVaultKey` calls.

**Verify**: `npm test` → all pass.

### Step 3: Run migration at startup

Find the sync/connect initialization path (grep `migrateLocalStorageSecrets` —
check whether anything calls it today; the audit found no caller). Call
`migrateLocalStorageSecrets(store)` once during connect-feature init (the
place account.ts's store is first created), so existing installs' secrets get
copied into Stronghold before first read. It's idempotent by design.

**Verify**: `npm test` → all pass; add a unit test: seed localStorage with the
three keys, run migrate against a fake store, assert copied-not-cleared and
no overwrite of existing store values (the function's contract).

### Step 4: Reconcile comments and docs

- `secretStore.ts:6` header + `:15-16` + factory comment (~151): rewrite to
  state the truth (flag ON; Stronghold in Tauri; localStorage fallback in
  web shell; localStorage copies retained pending per-platform verification).
- `docs/secret-storage-plan.md`: status header → "IN ROLLOUT —
  USE_STRONGHOLD=true; vault key + keypair + account cut over as of this
  plan; localStorage clearing pending per-platform verification".
- `docs/DEVELOPMENT.md:13`: "Stronghold（vault key 儲存，localStorage 備援/
  遷移中）" or equivalent truth.
- `ROADMAP.md:78`: update the "flagged，預設關閉" wording.

**Verify**: `grep -rn "USE_STRONGHOLD" src docs` output is internally
consistent (no statement claims it's off/default-off).

### Step 5: Full gates

**Verify**: `npm test`, `npx tsc`, `npm run lint` all green.

## Test plan

Step 3's migration test + a vault round-trip test (save → load returns a key
that encrypts/decrypts — model on any existing vault/crypto test; if none
exists, write the round trip with the localStorage fallback store).

## Done criteria

- [ ] `grep -n "localStorage" src/features/connect/crypto/vault.ts src/features/connect/crypto/pairing.ts src/features/connect/crypto/recovery-kit.ts`
      → no direct hits (only via the localStorage-backend inside secretStore.ts)
- [ ] `migrateLocalStorageSecrets` is invoked on connect init
- [ ] Comments/docs all state the true rollout state
- [ ] `npm test`, `npx tsc`, `npm run lint` green
- [ ] `plans/README.md` updated — INCLUDING a note: "operator must run the
      per-platform verification checklist in docs/secret-storage-plan.md
      before the localStorage-clearing follow-up"

## STOP conditions

- `createSecretStore()` is called somewhere synchronously in a path that
  can't await (constructor/getter) — report the call chain.
- The Stronghold backend turns out to lazy-fail INSIDE get/set (not at
  create) — the fallback story changes; report.
- Any existing test asserts direct-localStorage behavior of vault/pairing.

## Maintenance notes

- The localStorage-clearing commit is the explicit follow-up, gated on the
  operator's device matrix (macOS + iOS at minimum).
- Plans 131/132 build on these functions — land this first.
- Reviewer: the store singleton must not race (two concurrent
  `createSecretStore()` calls during startup → two Stronghold loads).
