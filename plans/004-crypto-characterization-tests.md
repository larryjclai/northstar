# Plan 004: Add characterization tests for the E2EE crypto + pairing primitives

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9115a2b5..HEAD -- src/features/connect/crypto`
> If any crypto module changed since this plan was written, compare its exported
> signatures against "Current state" before writing tests against them.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (adds tests only; touches no production code)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `9115a2b5`, 2026-06-15

## Why this matters

The end-to-end-encryption primitives are the core of Northstar's data-trust promise
("Supabase is infrastructure, not a readable finance backend"), yet
`src/features/connect/crypto/` has **zero unit tests**. These functions encrypt every
sync envelope, wrap the vault key for device pairing, and encode the Recovery Kit that
restores access when all devices are lost. A silent regression here — a broken
round-trip, a changed key-derivation salt, an IV-handling bug — would corrupt or expose
financial data and would not be caught until a user could no longer decrypt their own
vault. Characterization tests lock in the current correct behavior so later refactors
(notably plan 006, moving the vault key to Stronghold) have a safety net. This plan adds
tests only; it changes no production code.

## Current state

Three untested modules (full signatures verified at commit `9115a2b5`):

- `src/features/connect/crypto/vault.ts` — AES-GCM vault key. Exports:
  `generateVaultKey()`, `exportVaultKey(key)→b64`, `importVaultKey(b64)→key`,
  `saveVaultKey(key)` / `loadVaultKey()→key|null` (via `localStorage` key
  `"northstar.vault.key.v1"`), `encryptPayload(key, data)→b64` /
  `decryptPayload(key, b64)→unknown`. `encryptPayload` prepends a fresh 12-byte
  random IV to the ciphertext.

- `src/features/connect/crypto/pairing.ts` — device pairing. Exports include:
  `generatePairingCode()→"XXXX-XXXX"` (alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`,
  no ambiguous chars), `deriveBundleKey(code)→key` (PBKDF2, salt
  `"northstar-pairing-v1"`, 100_000 iters, SHA-256; normalizes by removing the `-`),
  `encryptBundle(key, bundle)→b64` / `decryptBundle(key, b64)→bundle` where
  `bundle: { userId, apiSecret, vaultKeyB64 }`, plus ECDH helpers
  `generateDeviceKeyPair()`, `exportPublicKey`/`importPublicKey`,
  `deriveSharedKey(myPriv, theirPub)`, `wrapVaultKey(shared, vaultKey)→b64` /
  `unwrapVaultKey(shared, b64)→key`.

- `src/features/connect/crypto/recovery-kit.ts` — printable vault-key backup.
  Exports: `formatKitCode(hex)→"XXXXXXXX-...-"` (8 groups of 8, uppercase),
  `parseKitCode(input)→lowercase hex (strips `-`/spaces)`, `generateRecoveryKit()`
  (reads the current vault key, returns a formatted code, sets localStorage status),
  `restoreFromRecoveryKit(input)` (validates 64 hex chars, imports + saves the key),
  `confirmRecoveryKit()`, `isRecoveryKitConfirmed()`.

**Test environment facts (important):**
- Test runner: `npx vitest run`, jsdom environment, globals on (`vitest.config.ts`),
  setup `src/test/setup.ts`.
- **jsdom has no `localStorage`** — tests that touch save/load must install a Map-backed
  stub in `beforeAll`. The canonical pattern already used in this repo is in
  `src/features/connect/recoveryKitGate.test.ts:9-21` — copy it verbatim.
- WebCrypto: these tests rely on `crypto.subtle` (AES-GCM, PBKDF2, ECDH). It is provided
  by the Node/jsdom global `crypto`. If `crypto.subtle` is `undefined` in the runner,
  that is a STOP condition (do not polyfill).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Run new tests | `npx vitest run src/features/connect/crypto` | all new tests pass |
| Full suite | `npx vitest run` | all pass (≥409 + new) |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope** (create these test files only):
- `src/features/connect/crypto/vault.test.ts` (create)
- `src/features/connect/crypto/pairing.test.ts` (create)
- `src/features/connect/crypto/recovery-kit.test.ts` (create)

**Out of scope** (do NOT modify):
- Any production module under `src/features/connect/` — if a test reveals a real bug,
  do NOT fix it here; record it and STOP (this is a characterization plan: it documents
  current behavior, it does not change it).
- `src/test/setup.ts` — do not add a global localStorage there; stub per-file like the
  exemplar, to stay consistent with the existing test.

## Git workflow

- Branch: `advisor/004-crypto-tests`.
- Commit: `test(connect): characterize vault, pairing, and recovery-kit crypto`.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: `vault.test.ts`

Model the file header / localStorage stub on
`src/features/connect/recoveryKitGate.test.ts:9-21`. Cover:

- **export/import round-trip**: `generateVaultKey()` → `exportVaultKey` →
  `importVaultKey` → export again; the two base64 strings are equal.
- **payload round-trip**: `encryptPayload(key, obj)` then `decryptPayload(key, ct)`
  deep-equals the original object (use a representative `{ amount: 1234.56, note: "測試" }`).
- **IV uniqueness** (folds in the IV-reuse concern): encrypt the *same* object twice with
  the same key; assert the two ciphertexts are **not** equal (different random IV), yet
  both decrypt back to the original.
- **save/load**: `saveVaultKey(key)` then `loadVaultKey()` returns a key whose export
  matches; with empty storage `loadVaultKey()` resolves to `null`.

**Verify**: `npx vitest run src/features/connect/crypto/vault.test.ts` → all pass.

### Step 2: `pairing.test.ts`

Cover:

- **code format**: `generatePairingCode()` matches `/^[A-Z0-9]{4}-[A-Z0-9]{4}$/` and uses
  only characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I/L`). Generate ~100
  codes in a loop to exercise the alphabet mapping.
- **bundle round-trip via code**: pick a fixed code (e.g. `"ABCD-2345"`); derive the
  bundle key twice independently with `deriveBundleKey` (simulating Device A and Device B);
  `encryptBundle(keyA, bundle)` then `decryptBundle(keyB, ct)` returns the original
  `{ userId, apiSecret, vaultKeyB64 }`. This proves the PBKDF2 derivation is deterministic
  for the same code.
- **wrong code fails**: deriving the bundle key from a *different* code and attempting
  `decryptBundle` rejects (use `await expect(...).rejects.toThrow()`).
- **ECDH wrap/unwrap**: generate two device key pairs (A, B); `deriveSharedKey(aPriv, bPub)`
  and `deriveSharedKey(bPriv, aPub)` must produce keys that interoperate — wrap a vault key
  with one and unwrap with the other, then confirm the unwrapped key still encrypts/decrypts
  a payload round-trip.

**Verify**: `npx vitest run src/features/connect/crypto/pairing.test.ts` → all pass.

### Step 3: `recovery-kit.test.ts`

Use the localStorage stub. Cover:

- **format/parse round-trip**: for a known 64-char lowercase hex string,
  `formatKitCode(hex)` produces 8 dash-separated uppercase groups of 8, and
  `parseKitCode(formatted)` returns the original lowercase hex.
- **generate → restore restores the same key**: `generateVaultKey()` + `saveVaultKey`,
  then `generateRecoveryKit()` returns a code; `localStorage.clear()` (simulate device
  loss), `restoreFromRecoveryKit(code)`, then `loadVaultKey()` exports to the **same**
  base64 as the original key.
- **malformed code rejects**: `restoreFromRecoveryKit("not-hex")` and a wrong-length input
  both reject with an error (`await expect(...).rejects.toThrow()`); the validation lives at
  `recovery-kit.ts:81`.

**Verify**: `npx vitest run src/features/connect/crypto/recovery-kit.test.ts` → all pass.

### Step 4: Full suite + typecheck

**Verify**: `npx tsc --noEmit` → exit 0, and `npx vitest run` → all pass (≥409 prior +
the new tests).

## Test plan

The three files ARE the deliverable. Structural pattern to copy:
`src/features/connect/recoveryKitGate.test.ts` (imports, `beforeAll` localStorage stub,
`beforeEach(() => localStorage.clear())`, `describe`/`it`). Count the new `it` blocks
(expect ~12–15 total) and confirm they appear in the run output.

## Done criteria

ALL must hold:

- [ ] Three new files exist: `vault.test.ts`, `pairing.test.ts`, `recovery-kit.test.ts` under `src/features/connect/crypto/`
- [ ] `npx vitest run src/features/connect/crypto` → all new tests pass
- [ ] `npx vitest run` → all pass, total count > 409
- [ ] `npx tsc --noEmit` exits 0
- [ ] No production files modified — `git status` shows only the three new test files (and `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- `crypto.subtle` is `undefined` in the test runner (do not add a polyfill — report it).
- A round-trip test **fails** against the current code — that indicates a real bug in a
  shipping crypto primitive; characterization tests must capture true current behavior, so
  STOP and report the discrepancy rather than asserting the "expected" value or editing
  production code.
- A crypto module's exported signature differs from "Current state" (drift).

## Maintenance notes

- These tests pin the **current** behavior, including constants like the PBKDF2 salt
  `"northstar-pairing-v1"` and the AES-GCM/12-byte-IV envelope layout. Any future change to
  those is backward-incompatible (old envelopes / recovery kits stop decrypting) — these
  tests are the tripwire; a failure here in a future PR means "you just broke existing
  users' data," not "update the test."
- Plan 006 (vault key → Stronghold) will change `saveVaultKey`/`loadVaultKey`; these tests
  define the contract that migration must preserve (load returns a key that round-trips).
- Reviewer should confirm the tests assert real round-trips (decrypt equals original), not
  just "does not throw."
