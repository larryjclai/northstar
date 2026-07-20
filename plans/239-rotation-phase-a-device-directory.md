# Plan 239: Rotation Phase A — per-device public-key directory + key-version plumbing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. On any STOP condition, stop and report — this is the
> app's crypto/sync surface; improvising here is how data becomes unreadable.
> Do NOT update `plans/README.md`.
>
> **REQUIRED READING before you start**: `docs/vault-key-rotation-plan.md`
> sections **"Orphaned / missing primitives"** (gaps 1, 2, 4), **§2 Key
> versioning**, and **§5 Worker delta**. This plan implements Phase A of that
> spike's §6 table. The spike is the design; this plan is the build order.
>
> **Drift check**: `git diff --stat b4fbe894..HEAD -- worker/ src/features/connect/`
> Non-empty = compare against the spike's "Current state" section before proceeding.

## Status

- **Priority**: P2 · **Effort**: S–M · **Risk**: MED (worker migration + a new
  endpoint; additive only, but it's the relay)
- **Depends on**: plans 130/131/132 (shipped), spike 238 (merged)
- **Category**: security (vault-key rotation, phase A of 4)
- **Planned at**: commit `b4fbe894`, 2026-07-19

## Operator decisions this build encodes (answered 2026-07-19 — do not re-ask)

1. **Auto-rotate on every revocation, no prompt.**
2. **Old key versions are retained locally forever** (never deleted) — deleting
   breaks `forceFullResync` and buys no security.
3. **Solo-device accounts: rotation is a no-op** (nothing to re-wrap to).
4. **A manual "rotate now" button is wanted** — as a thin follow-up after
   phases A–D, not in v1.
5. **Relay-side allocation of `wrapped_key_version` is acceptable** (the
   rotation-count metadata signal is smaller than what the relay already sees).

## Why this matters

Rotation's blocker is not cryptography — every primitive is shipped and tested.
It's that **there is no durable directory of device public keys**: a device's
ECDH public key is only visible transiently (inside an in-flight pairing
bundle, or as `key_envelopes.source_public_key` on an envelope that device
authored). So device C cannot look up device D's public key months later in
order to wrap a rotated vault key to it. Phase A builds that directory and the
version plumbing the later phases stand on. Nothing user-visible ships here.

## Current state (verify each before editing)

- `worker/migrations/` — latest is `0007_rate_limits.sql`; **the new migration
  is `0008_*`**. Migrations are additive-only in this project.
- `worker/migrations/0001_initial.sql:36-52` — `key_envelopes`, including
  `wrapped_key_version INTEGER NOT NULL DEFAULT 1` (**schema-present but no
  code reads or writes it** — spike gap 2).
- `worker/migrations/0004_pairing_ecdh.sql:18` — `ALTER TABLE key_envelopes ADD
  COLUMN source_public_key TEXT` (the transient-only public key today).
- `worker/src/index.ts` — endpoint routing: `POST /devices` (:210),
  `GET /devices` (:214), `POST /devices/:id/credential` (:221),
  `DELETE /devices/:id` (:227). Follow this file's existing handler style
  exactly (auth via `authenticate()`, same error/response shapes).
- `worker/migrations/0006_per_user_relay_sequence.sql` — the **per-user scoped
  `MAX()` race fix** for `relay_sequence`. §5's version allocation must use the
  SAME pattern (spike flags this as the phase's STOP-worthy unknown).
- Client pairing/keypair generation points named by the spike:
  `startJoinSession` and the lazy path in `approveJoiningDevice` (grep them in
  `src/features/connect/devices/`).
- `src/features/connect/sync/client.ts:151-156` — `fetchKeyEnvelopes` exists,
  **zero production call sites** (spike gap 3). Phase C wires it; do NOT wire
  it here.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 |
| Lint | `npm run lint` | 0 errors / 761 warnings |
| Tests | `npm test` | 1414 + new pass |
| Worker tests | check `worker/` for its own test script (`cd worker && npm test` or the root script — grep `package.json`) | pass |

## Scope

**In scope**: `worker/migrations/0008_*.sql` (new), `worker/src/index.ts`,
worker tests, `src/features/connect/sync/client.ts` (the new endpoint's client
call), the client keypair-generation sites that upload the public key, and
`docs/vault-key-rotation-plan.md` §7 ONLY to stamp the five operator answers
above as DECIDED.
**Out of scope**: `vault.ts` / `secretStore.ts` versioned storage (Phase B),
the rotation protocol itself (Phase C), any UI (Phase D), removing legacy
account-secret auth, `sync_envelopes.key_version` (Phase B).

## Steps

### Step 1: Migration `0008`

Per spike §5: add the columns that phase's table specifies — the device
public-key column on the devices table, and whatever §5 names for version
allocation. Read §5 and implement exactly what it lists; additive only, no
backfill needed for `key_version` (the DEFAULT 1 is historically correct — §2).

**Verify**: migration applies cleanly against a fresh D1 (follow how the repo
tests/applies worker migrations — grep the worker README/package scripts).

### Step 2: Extend `GET`/`POST /devices` with `publicKeyB64`

Per spike §5. Match the file's existing handler conventions.

**Verify**: worker tests pass; a `GET /devices` response includes the field.

### Step 3: `POST /devices/:id/public-key` self-provision endpoint

Mirrors the existing `POST /devices/:id/credential` handler's shape
(`worker/src/index.ts:221`) — authenticated, scoped to the calling device.

**Verify**: worker tests (add coverage mirroring the credential endpoint's tests).

### Step 4: Client uploads its public key

At the keypair-generation points (`startJoinSession`, `approveJoiningDevice`'s
lazy path) upload the public key via the new endpoint. Plus a **one-time
backfill call in `runSync`** for installs that paired before this ships
(idempotent; skip when the directory already has this device's key).

**Verify**: `npx tsc --noEmit` → 0; `npm test` → pass.

### Step 5: Version allocation with the race fix

Implement server-side allocation of `wrapped_key_version` using the same
per-user-scoped `MAX()` pattern as `0006_per_user_relay_sequence.sql`.
**Spike-flagged unknown**: verify the pattern actually holds under concurrent
rotation. Write a worker test that simulates two concurrent allocations and
asserts distinct versions. **If you cannot make that test deterministic, STOP
and report** rather than shipping an unverified allocator.

**Verify**: the concurrency test passes; full gates.

### Step 6: Stamp the decisions

In `docs/vault-key-rotation-plan.md` §7, mark each of the five questions
**DECIDED (2026-07-19)** with the answers listed in this plan's Status block.
Do not restructure the doc.

## Test plan

Worker tests for the new endpoint + the concurrency allocation test (step 5);
client-side, extend whatever covers pairing key generation. No new client UI.

## Done criteria

- [ ] Gates green; worker tests pass incl. the concurrency test
- [ ] `grep -rn "publicKeyB64" worker/src src/features/connect` shows endpoint + client
- [ ] Migration is `0008_*`, additive, no backfill
- [ ] `fetchKeyEnvelopes` still has zero production call sites (Phase C's job)
- [ ] Spike doc §7 stamped DECIDED
- [ ] No files outside scope modified

## STOP conditions

- The version-allocation concurrency test can't be made deterministic (step 5).
- `docs/vault-key-rotation-plan.md` §5's schema delta doesn't match the live
  worker schema (spike drift).
- Any step appears to require changing `vault.ts`/`secretStore.ts` — that's
  Phase B; the phases are separated deliberately.

## Maintenance notes

- Phases B→C→D follow (plans 240–242) and MUST land in order: B gives versioned
  local key storage, C the rotation protocol, D hardening/UX.
- The directory this phase builds is also what a future shared-books
  implementation needs (`docs/shared-books-plan.md`) — keep it generic, don't
  couple it to rotation specifically.
