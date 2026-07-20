# Plan 241: Rotation Phase C — `rotateVaultKey()` + auto-fire on revocation

> **Executor instructions**: Follow step by step; verify each. STOP conditions
> binding. Do NOT update `plans/README.md`.
>
> **REQUIRED READING first**: `docs/vault-key-rotation-plan.md` **§3 Rotation
> protocol** (all subsections: Initiator, New-key generation, Re-wrap, Recipient
> side, Recovery Kit regeneration, Relay-data strategy) and **§4 Failure modes
> & version skew**. This plan is Phase C of §6.
>
> **Drift check**: `git diff --stat b4fbe894..HEAD -- src/features/connect`

## Status

- **Priority**: P2 · **Effort**: M–L · **Risk**: MED-HIGH (the protocol itself;
  mitigated by A+B landing first and by lazy semantics)
- **Depends on**: **plans 239 AND 240 merged**
- **Category**: security (phase C of 4)
- **Planned at**: commit `b4fbe894`, 2026-07-19

## Operator decisions this phase encodes (answered 2026-07-19)

1. **Auto-rotate on revocation, NO prompt** — fire it from the existing
   `revokeDevice` call site; do not add a confirm dialog.
2. Old keys retained forever (Phase B's contract).
3. **Solo-device account → rotation is a NO-OP** — when enumerating remaining
   devices yields zero targets, short-circuit entirely; do not run a zero-target
   rotation.
5. Relay allocates `wrapped_key_version` (Phase A shipped it).

Decision 4 (a manual "rotate now" button) is **explicitly deferred** to after
Phase D — do not build it here.

## Why this matters

A and B built the directory, versioned storage, and envelope stamps. This is
the protocol that actually rotates: generate a new key, wrap it to every
remaining device's public key, deposit into the `/keys` mailbox, flip the local
current-version pointer — and on the recipient side, pick up the waiting
envelope during normal sync. **Relay-data strategy is LAZY** (spike §3): old
envelopes keep their old key forever; only new pushes use the new key. Do not
attempt to re-encrypt relay history — the spike proved `forceFullRepush`
silently no-ops for unchanged revisions.

## Current state

- `src/features/connect/sync/client.ts:151-156` — `fetchKeyEnvelopes` (the
  authenticated variant) exists with **zero production call sites**; backed by
  `handleFetchKey` in `worker/src/index.ts:551-563`. This is the recipient's
  poll primitive — wire it into `runSync` (spike §3 steps 6–7).
- `src/features/connect/devices/pairing.ts` (+ the pairing-flow module the
  spike names) — the shipped ECDH wrap/unwrap + mailbox deposit machinery to
  reuse: `generateVaultKey`, `wrapVaultKey`/`unwrapVaultKey`,
  `deriveSharedKeyExtended`. **All already shipped and tested — write NO new
  cryptography.**
- `src/routes/settings/ConnectSection.tsx` — the `revokeDevice` call site
  (spike cites ~line 418; grep to confirm) is where auto-rotation fires.
- `GET /devices` now returns `publicKeyB64` (Phase A).
- Phase B's contract: current-version pointer + load-by-version + never delete.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 |
| Lint | `npm run lint` | 0 errors / 761 warnings |
| Connect suites | `npx vitest run src/features/connect` | pass |
| Tests | `npm test` | prior + new pass |

## Scope

**In scope**: a new rotation module beside the pairing flow
(`rotateVaultKey()`), `runSync`'s recipient-side pickup wiring,
`ConnectSection.tsx`'s revoke call site (fire-and-report only), tests.
**Out of scope**: UI polish / partial-failure surfaces (Phase D), the manual
rotate button (post-D), any re-encryption of relay history, new crypto
primitives, `vault.ts`/`secretStore.ts` structure (Phase B owns it).

## Steps

### Step 1: `rotateVaultKey()` — initiator side

Implement spike §3 steps 1–8 in a new module:
1. Enumerate remaining devices via `GET /devices` (excluding the just-revoked one).
2. **If zero remaining targets → return a no-op result immediately** (operator
   decision 3). Do not generate a key, do not touch the pointer.
3. Generate the new vault key; obtain its version from the relay (Phase A's
   allocator).
4. For each remaining device: derive the shared key from its `publicKeyB64`,
   wrap the new vault key, deposit into the `/keys` mailbox.
5. Store the new version locally (never overwriting old slots) and flip the
   current-version pointer LAST — so a crash mid-loop leaves the device still
   encrypting under the old key (safe, resumable by re-running).

**Verify**: unit tests incl. the zero-target no-op and the
crash-before-flip-leaves-old-current invariant.

### Step 2: Recipient-side pickup

Wire `fetchKeyEnvelopes` into `runSync` (§3 steps 6–7): if a wrapped key
envelope addressed to this device exists, unwrap it, store it as its version,
flip this device's current-version pointer. Must be safe for a device that was
offline during the rotation (it simply picks up later — lazy by design) and
idempotent (re-fetching an already-applied envelope is a no-op).

**Verify**: tests for first-pickup, idempotent re-pickup, and offline-then-later.

### Step 3: Auto-fire on revocation

At `ConnectSection.tsx`'s `revokeDevice` success path, call `rotateVaultKey()`
automatically (no prompt — decision 1). Failure of rotation must NOT roll back
or obscure the successful revocation: revocation already cut relay access
(plan 132); surface the rotation failure separately (Phase D renders it
properly; here a plain error/toast is enough).

**Verify**: `npx tsc --noEmit` → 0; connect suites pass.

### Step 4: Recovery Kit regeneration

Per §3 step 9 + Phase B's staleness signal: after a successful rotation the
previously exported Kit is stale → set the signal. (Rendering is Phase D.)

### Step 5: Partial-failure semantics (v1 = manual re-run)

Per the spike's flagged unknown, v1 accepts: if the re-wrap loop partially
fails, the operation reports it and the user re-runs rotation (re-running is
safe — idempotent deposits, pointer flips last). **Do NOT build automatic
retry/resume state.** Document the choice in the module's docstring.

**Verify**: full gates.

## Test plan

Initiator: zero-target no-op; multi-device wrap loop; pointer flips last;
re-run after partial failure converges. Recipient: pickup, idempotency,
offline-then-later. Model after the existing pairing tests
(`src/features/connect/devices/pairing.test.ts`).

## Done criteria

- [ ] Gates green with new rotation tests
- [ ] `grep -rn "fetchKeyEnvelopes" src --include='*.ts' --include='*.tsx'`
      now shows a production call site (was zero)
- [ ] Solo-device revocation performs NO rotation (asserted in a test)
- [ ] Revoking with 2+ remaining devices deposits one wrapped envelope per device
- [ ] Old key versions still present after rotation (Phase B invariant holds)
- [ ] No relay-history re-encryption attempted anywhere
- [ ] No files outside scope modified

## STOP conditions

- `GET /devices` doesn't return usable `publicKeyB64` for every remaining
  device (Phase A gap — report which devices lack one; a device that never
  uploaded a key cannot receive a rotated key and needs an explicit story).
- The mailbox deposit path can't be reused without changing pairing behavior.
- Any temptation to bump revisions to force re-encryption of history — that is
  explicitly out of scope and the spike proved it doesn't work as imagined.

## Maintenance notes

- Phase D adds: post-rotation confirmation ping, partial-failure UI, the
  Kit-stale surface, and the honest §1 threat-model copy shown at rotation time
  (「移除裝置會讓它收不到新資料;它已經有的資料仍留在它那裡」).
- The manual "rotate now" button (operator decision 4) is a thin addition after
  D: same `rotateVaultKey()` entry point, triggered from Settings.
