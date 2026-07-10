# Plan 132: Per-device credentials — make device revocation actually revoke

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- worker/ src/features/connect`
> This plan assumes plans 130 and 131 have landed; verify their done-criteria
> hold (grep: no direct localStorage in vault.ts; ECDH pairing flow present).
> If they haven't landed, STOP.

## Status

- **Priority**: P1 (but sequenced after 130, 131)
- **Effort**: L
- **Risk**: MED–HIGH — auth-model change; a bug can lock out legitimate
  devices. Mitigated by keeping account-secret auth working during migration.
- **Depends on**: plans/130, plans/131, plans/129 (worker tests)
- **Category**: security
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

Every paired device holds the SAME `apiSecret` (one hash per account in
`users.api_secret_hash`) and the same vault key. "Revoking" a device
(`DELETE /devices/:id`) merely deletes a row — push/pull (`/envelopes`) never
consult the `devices` table, so a lost or stolen device keeps full read/write
access to the encrypted stream and can decrypt everything, forever. For a
privacy-first finance product, the lost-phone story is currently: nothing can
be done short of abandoning the account. This plan gives each device its own
API credential so revocation cuts off relay access immediately. (Full
cryptographic revocation — vault-key rotation + re-wrap — is explicitly a
follow-up spike, not this plan; see Maintenance notes.)

## Current state

Worker — `worker/src/index.ts`:

- `authenticate()` (~line 30): hashes the Bearer token, looks up
  `users.api_secret_hash` only. No device dimension.
- `handleRevokeDevice` (~line 204): `DELETE FROM devices WHERE id = ? AND
  user_id = ?` — nothing else.
- `handlePushEnvelopes` (~line 226): trusts body-supplied `e.deviceId`.
- Schema: `worker/migrations/` — `users(id, api_secret_hash, …)`,
  `devices(id, user_id, name, platform, …)` (read the actual migration files
  for exact columns).

Client — `src/features/connect/`:

- `sync/account.ts`: account record `{userId, apiSecret}` via SecretStore
  (post-130).
- `sync/client.ts`: all calls send `Authorization: Bearer <apiSecret>`.
- Post-131 pairing: `approveJoiningDevice` (Device A) registers Device B and
  wraps account payload to it — the natural place to mint B's device secret.
- `src/state/deviceIdentity.ts`: stable per-install `deviceId`.

## Target design (implement as specified)

- `devices` gains `device_secret_hash` (nullable during migration).
- Auth: `authenticate()` first tries device auth — token format
  `<deviceId>.<deviceSecret>` (split on first `.`; deviceIds are
  `createId`-style with no dots — VERIFY by reading `deviceIdentity.ts`; if
  ids can contain dots, use a different separator or a JSON token) → look up
  the device row by id, compare `sha256(deviceSecret)`, confirm not revoked →
  `{userId, deviceId}`. Fallback: legacy account-secret auth (unchanged) →
  `{userId, deviceId: null}`.
- Push: when `deviceId` is known from auth, OVERRIDE each envelope's
  `deviceId` with it (stop trusting the body). Legacy-auth pushes keep body
  behavior.
- Revocation: unchanged endpoint, but now deletion actually severs access for
  device-auth tokens. Add `revoked_at` soft-column instead of hard DELETE so
  the UI can show history (optional — decide by reading how ConnectSection
  renders the device list; hard delete is acceptable if simpler).
- Credential issuance: (a) first device: `POST /users` request gains
  `device.secretHash`; client generates a random 32-byte secret alongside
  registration; (b) joining device (131 flow): Device B generates its own
  secret locally, includes `secretHash` in the pairing bundle (public-key
  bundle → now also carries the hash — the SECRET never leaves B), and Device
  A passes the hash to `addDevice`. B stores its secret via SecretStore.
- Client storage: device secret joins the SecretStore under a new key
  (extend `SECRET_KEYS`); `client.ts` prefers the device token when present,
  falls back to account secret.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Worker tests | `cd worker && npm test` | all pass |
| App tests | `npm test` | all pass |
| Typechecks | `npx tsc`; `cd worker && npx tsc --noEmit` | exit 0 |

## Scope

**In scope**: `worker/src/index.ts`, new worker migration,
`src/features/connect/sync/{client,account,pairing-flow (131's successor)}.ts`,
`secretStore.ts` (`SECRET_KEYS` addition), ConnectSection device-list UI copy
if revocation semantics text changes, tests throughout.

**Out of scope**:
- Vault-key rotation / re-wrap on revocation (follow-up spike — record in
  README as the remaining gap: a revoked device that already synced ciphertext
  it captured can still decrypt THAT; future data requires the relay to serve
  it, which this plan cuts off).
- Removing legacy account-secret auth (deprecate only; removal after all
  operator devices migrate).
- Rate limiting / relay_sequence (plan 133).

## Git workflow

- Branch: `feat/ai-device-credentials`
- Conventional commits per layer; worker first.
- Do NOT push or merge to `main`. Deploying the worker is the OPERATOR's
  action — this plan only prepares code + migration.

## Steps

1. **Worker migration + auth**: add column; extend `authenticate()` per
   design; tests: device token happy path, revoked device → 401, legacy token
   still works, malformed token → 401.
   **Verify**: `cd worker && npm test` green.
2. **Worker push binding**: device-auth pushes stamp envelopes with the
   authenticated deviceId; test that a mismatched body deviceId is
   overridden.
   **Verify**: worker tests green.
3. **Client credential generation + storage**: secret generation
   (crypto.getRandomValues 32 bytes, base64), SecretStore key, `client.ts`
   token preference. Registration path sends the hash.
   **Verify**: `npm test` green.
4. **Pairing integration**: B's secretHash rides the 131 bundle; A's
   `addDevice` call carries it; B stores the secret before first sync.
   **Verify**: 131's e2e-style test extended — post-join, B syncs using its
   DEVICE token (assert the fake client saw the device-token format).
5. **Migration for existing installs**: on startup with account secret but no
   device secret, self-provision: call a new authed endpoint
   `POST /devices/:id/credential` (accepts secretHash for a device the
   account owns, only if none set) — one-time upgrade per device. Test both
   worker + client sides.
   **Verify**: all suites green.

## Done criteria

- [ ] A revoked device's token gets 401 on `/envelopes` (worker test proves)
- [ ] Envelope deviceId comes from auth, not body, for device tokens
- [ ] New + joining + existing devices all end up with device credentials
- [ ] Legacy auth still works and is marked deprecated in code comments
- [ ] All gates green; `plans/README.md` updated incl. the crypto-revocation
      follow-up note and "operator: deploy worker + verify device matrix"

## STOP conditions

- deviceId format contains the token separator (see design) — report format.
- The self-provision endpoint can't be made safe against a stolen ACCOUNT
  secret racing to claim another device's credential slot (think through the
  only-if-none-set guard; if the guard is insufficient because revoked
  devices can re-claim, report the hole instead of shipping).
- ConnectSection's device UI needs more than copy changes.

## Maintenance notes

- Follow-up spike (explicitly deferred): vault-key rotation on revocation
  (new vault key, re-encrypt local data, re-wrap to remaining devices via
  the /keys mailbox). Requires plan 131's machinery; substantial.
- Once operator confirms all their devices hold device tokens, a removal plan
  can drop legacy account-secret auth from `/envelopes` (keep for /users).
- Reviewer: hash comparison must be constant-time-ish (D1 lookup by device id
  then compare hex — fine); ensure 401s don't distinguish "no such device"
  from "bad secret".
