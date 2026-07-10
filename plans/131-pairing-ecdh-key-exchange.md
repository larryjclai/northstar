# Plan 131: Pair devices via ECDH key exchange instead of a code-encrypted vault-key bundle

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/features/connect worker/src worker/migrations`
> Re-locate excerpts by grep; STOP on shape mismatch.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED–HIGH — changes the pairing protocol; old-version ↔ new-version
  devices cannot pair with each other during the transition (acceptable in
  alpha; the plan keeps the OLD path working until the new one is verified).
- **Depends on**: plans/130 (vault/keypair storage plumbing), plans/129
  (worker test harness — strongly recommended so the new endpoints get tests)
- **Category**: security
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Today "add a device" uploads `{userId, apiSecret, vaultKeyB64}` to the relay,
encrypted under a key derived from the 8-char pairing code (~40 bits, 32-char
alphabet) with PBKDF2 using a **constant salt** (`"northstar-pairing-v1"`,
100k iterations). The product's core promise is that the relay can never read
finance data — but a malicious/compromised relay can capture stored bundles
and grind the 40-bit code space offline (precomputable once for all users,
thanks to the fixed salt). Success yields the vault key AND account secret.

The codebase already contains the correct machinery, unused for this flow:
P-256 ECDH device keypairs, `deriveSharedKey`, `wrapVaultKey`/`unwrapVaultKey`
(`crypto/pairing.ts:29-106`), and worker key-envelope endpoints
(`POST/GET /keys/:device`). This plan re-plumbs pairing so the vault key is
wrapped to the joining device's public key; the short code becomes only a
session locator + low-value authenticator, never the sole protection of the
vault key.

## Current state

Client — `src/features/connect/sync/pairing-flow.ts` (108 lines, read fully):

- `initiatePairing()` (Device A): `generatePairingCode()` →
  `deriveBundleKey(code)` → `encryptBundle(bundleKey, { userId, apiSecret,
  vaultKeyB64 })` → `createPairingSession(apiSecret, code, encryptedBundle)`.
- `joinWithCode()` (Device B): derive bundle key from code →
  `claimPairingSession(code)` → decrypt → `saveVaultKey` + `setSyncAccount` +
  `addDevice`.

Crypto — `src/features/connect/crypto/pairing.ts`:

- `deriveBundleKey` (~line 122): PBKDF2, salt
  `new TextEncoder().encode("northstar-pairing-v1")`, 100k iterations.
- ECDH set (verbatim, present, exported): `generateDeviceKeyPair`,
  `saveDeviceKeyPair`, `loadDeviceKeyPair`, `exportPublicKey`,
  `importPublicKey`, `deriveSharedKey`, `wrapVaultKey`, `unwrapVaultKey`.

Worker — `worker/src/index.ts`:

- `POST /pairing` (auth required): stores `{code, encrypted_bundle}` with
  5-min TTL. `GET /pairing/:code` (unauthenticated; code is the credential):
  single-claim, 5-attempt counter, TTL check.
- `POST /keys/:target_device_id` / `GET /keys/:target_device_id` (auth
  required): upsert/fetch `{id, sourceDeviceId, keyType, wrappedKey}` rows —
  the wrapped-key mailbox, keyed `(user_id, target_device_id, key_type)`.

Client API wrapper: `src/features/connect/sync/client.ts` — read it for
`createPairingSession`, `claimPairingSession`, `addDevice`, and whether
key-envelope calls already exist (grep `keys/`).

## Target protocol (design decision — implement as specified)

Direction flips so the code never protects the vault key:

1. **Device B (joiner)** generates its ECDH keypair (`generateDeviceKeyPair` +
   `saveDeviceKeyPair`), generates the pairing code, and publishes
   `{code, bundle = encryptBundle(deriveBundleKey(code), { deviceId,
   publicKeyB64 })}` to the relay. The bundle now contains only a PUBLIC key
   and device id — worthless to crack.
2. **Device A (existing device)** — user types/scans the code shown by B —
   claims the session, decrypts B's public key, verifies with the user
   (screen shows B's device name / a short fingerprint of the key — SAS-lite;
   see step 4), then: `deriveSharedKey(A.privateKey, B.publicKey)` →
   `wrapVaultKey(sharedKey, vaultKey)` → `POST /keys/:B.deviceId` with
   `keyType: "vault-v1"` and `sourceDeviceId: A.deviceId` +
   `sourcePublicKeyB64` (extend the key-envelope body — worker passes it
   through opaquely; if adding a column, add a worker migration), and calls
   `addDevice` to register B (plus `POST` a second key envelope
   `keyType: "account-v1"` wrapping `{userId, apiSecret}` the same way —
   `wrapVaultKey` wraps a CryptoKey; for the account JSON use
   `encryptPayload`-style AES-GCM under the shared key; reuse
   `vault.ts`'s `encryptPayload`/`decryptPayload` if importable, else add a
   sibling helper in `pairing.ts`).
3. **Device B** polls `GET /keys/:B.deviceId` (it can't authenticate yet — see
   STOP condition below and step 3's resolution) until the envelopes appear,
   derives the same shared key from its private key + A's public key, unwraps
   the vault key and account secret, then proceeds exactly as today
   (`saveVaultKey`, `confirmRecoveryKit`, `setSyncAccount`, `addDevice` is
   already done by A).

Auth wrinkle (resolve in implementation): `GET /keys/:device` currently
requires the account Bearer token, which B lacks until it has the account
secret. Resolution: allow the pairing-session claim response to include a
short-lived, single-purpose `pairingToken` the worker mints and stores on the
session row, and accept it ONLY on `GET /keys/:device` for the deviceId bound
to that session (new column on `pairing_sessions` + check in the handler +
worker migration). Scope it: 10-min TTL, invalidated after first successful
fetch of both envelopes.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc` / `cd worker && npx tsc --noEmit` | exit 0 |
| App tests | `npm test` | all pass |
| Worker tests | `cd worker && npm test` | all pass (if plan 129 landed) |
| Lint | `npm run lint` | exit 0 |

## Scope

**In scope**:
- `src/features/connect/sync/pairing-flow.ts` (protocol rewrite)
- `src/features/connect/crypto/pairing.ts` (additive helpers only; PBKDF2
  bundle encryption stays for the public-key bundle — but switch
  `deriveBundleKey` to a per-session random salt carried alongside the
  bundle, since it costs one field)
- `src/features/connect/sync/client.ts` (key-envelope + pairingToken calls)
- `worker/src/index.ts` + a new `worker/migrations/000N_*.sql`
  (pairingToken column; optional source_public_key column)
- The UI that drives pairing: find it via grep `initiatePairing|joinWithCode`
  (ConnectSection) — swap which device shows vs enters the code and add the
  confirm-device step on A
- Tests for all of the above

**Out of scope**:
- Per-device API credentials and real revocation (plan 132 — but design
  nothing here that blocks it).
- Recovery Kit flow (unchanged).
- Removing the OLD bundle path server-side (keep `POST /pairing` +
  `GET /pairing/:code` working until operator confirms the new flow on real
  devices; mark the old client functions `@deprecated`).

## Git workflow

- Branch: `feat/ai-pairing-ecdh`
- Conventional commits per layer (crypto → worker → client flow → UI).
- Do NOT push or merge to `main`.

## Steps

1. **Crypto helpers + tests**: per-session-salt `deriveBundleKey` variant;
   AES-GCM JSON wrap/unwrap under a shared ECDH key. Unit-test round trips
   (A↔B keypairs → same shared key → wrap/unwrap vault key + account JSON).
   **Verify**: `npm test -- pairing` green.
2. **Worker**: pairingToken mint on claim + scoped acceptance on
   `GET /keys/:device`; migration; endpoint tests (or manual curl script if
   129 absent — then STOP-note the test gap).
   **Verify**: `cd worker && npx tsc --noEmit` (+ tests if present).
3. **Client flow**: rewrite `initiatePairing` (now run on the JOINER) and the
   existing-device side per the protocol; keep function names
   role-accurate (`startJoinSession` / `approveJoiningDevice` — pick clear
   names, update callers).
   **Verify**: `npm test` green.
4. **UI**: ConnectSection — B shows code; A enters it and sees
   「確認新裝置：<name> (<key fingerprint 前 8 碼>)」 with 確認/取消 before any
   key is wrapped. zh-TW copy; follow the file's existing form patterns.
   **Verify**: `npx tsc`, `npm run lint`.
5. **End-to-end dev-shell test**: two repo instances in one jsdom test faking
   the client transport (model on `pull.test.ts` fakes): full join → assert
   B ends with A's vault key and the account secret, and the relay-visible
   artifacts (bundle, key envelopes) never contain the raw vault key bytes
   (assert ciphertext ≠ plaintext key material).
   **Verify**: `npm test` green.

## Done criteria

- [ ] The vault key and apiSecret leave a device ONLY wrapped under an ECDH
      shared key (grep the new flow: no `vaultKeyB64` in any relay-bound
      bundle)
- [ ] Pairing-code bundle contains only deviceId + public key (+ salt)
- [ ] Old endpoints still function (deprecation notes in place)
- [ ] All gates green; e2e-style test passes
- [ ] `plans/README.md` updated with "operator: verify on 2 real devices,
      then schedule old-path removal"

## STOP conditions

- The pairingToken design conflicts with how `client.ts` structures auth
  (e.g. a global fetch wrapper hard-codes Bearer) — report the coupling.
- `wrapKey`-based helpers can't express the account-JSON wrap without new
  crypto primitives beyond AES-GCM — report; do NOT invent crypto.
- UI flow requires changing OnboardingOverlay or recovery flows.

## Maintenance notes

- Plan 132 will bind per-device credentials into `approveJoiningDevice` —
  the confirm-device moment added here is exactly where device trust gets
  established; keep that seam clean.
- Reviewer: scrutinize the pairingToken scoping (single deviceId, TTL,
  single-use) and that the SAS fingerprint is derived from the public key,
  not the code.
