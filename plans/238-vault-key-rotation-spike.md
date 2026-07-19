# Plan 238: Vault-key rotation on device revocation — design SPIKE (doc-only)

> **Executor instructions**: This is a SPIKE — the deliverable is
> `docs/vault-key-rotation-plan.md`. Do NOT modify ANY source file, worker
> file, or migration. Every claim cites file:line. On a STOP condition, stop
> and report. Do NOT update `plans/README.md`.
>
> **Drift check**: `git diff --stat 82839b85..HEAD -- src/features/connect/crypto src/features/connect/devices worker/src`
> Non-empty = note what changed, proceed (spike reads current reality).

## Status

- **Priority**: P2 (security; the recorded gap from plan 132)
- **Effort**: M (investigation + writing) · **Risk**: — (doc-only)
- **Depends on**: plans 130/131/132 (all shipped)
- **Category**: security (direction spike)
- **Planned at**: commit `82839b85`, 2026-07-19

## Why this matters

Plan 132 made revocation cut a device's RELAY access (per-device credentials)
and explicitly deferred cryptographic revocation: *"a revoked device that
already synced ciphertext it captured can still decrypt THAT; future data is
cut off by per-device auth"* (`plans/132-per-device-credentials-revocation.md:103-106`,
maintenance note `:163-165`: "new vault key, re-encrypt local data, re-wrap to
remaining devices via the /keys mailbox. Requires plan 131's machinery;
substantial"). This spike designs that rotation so a build plan can be cut in
a dedicated session. The BUILD is intentionally NOT this plan — this is the
highest-risk surface in the app (crypto + sync + worker + multi-device version
skew in a finance product).

## Inputs the spike must read (verify each; cite as you go)

- `src/features/connect/crypto/vault.ts` + `secretStore.ts` (+ READMEs) — how
  the vault key is derived/stored today; what encrypts sync envelopes.
- `src/features/connect/devices/pairing.ts` — plan 131's ECDH pairing + the
  worker `/keys` mailbox contract.
- `worker/` — the relay's tables + endpoints touching keys/devices (plan 131/132
  deltas; grep `keys`, `device`).
- `docs/shared-books-plan.md` — the Book Space Key design (per-book key wrapped
  to member devices via the SAME ECDH; **mandatory rotation on member removal**)
  — the closest in-repo precedent for "rotate + re-wrap"; the vault-key design
  should rhyme with it so a future shared-books build shares machinery.
- `plans/130-*.md`, `131-*.md`, `132-*.md` — the shipped ground.
- Sync gotchas the design must survive: pull cursor in localStorage +
  `forceFullResync` recovery; outbox `entity:id:revision` ids; LWW.

## The deliverable — `docs/vault-key-rotation-plan.md` with:

1. **Threat model, honestly bounded** (≤1 page): what rotation does and does
   NOT protect (already-captured ciphertext is lost regardless — say it
   plainly); what it adds over 132's credential cut (defense against future
   relay compromise / credential leak reusing the old vault key).
2. **Key versioning**: envelope key-id scheme; how devices decrypt old + new
   during transition; when the old key may be destroyed.
3. **Rotation protocol**: initiator (the revoking device), new-key generation,
   re-wrap to each remaining device via the /keys mailbox (131 machinery),
   acknowledgment, and the relay-data strategy — evaluate BOTH: (a) lazy
   (old envelopes stay old-key; new pushes new-key) vs (b) full re-push under
   the new key (forceFullResync-style) — recommend one with reasoning.
4. **Failure modes & version skew**: a remaining device offline during
   rotation; two rotations racing; a device that never picks up the mailbox;
   partial re-wrap. Each with detection + recovery (the duplicate-books
   merge-on-pull saga is the cautionary precedent — cite plans 206/207/211).
5. **Worker delta**: additive tables/endpoints only; migration numbering per
   the worker's existing scheme.
6. **Phased build outline** with effort tags + the STOP-worthy unknowns, ready
   for `/improve plan` in a dedicated session.
7. **Open questions for the operator** (each with a recommendation) — e.g.
   auto-rotate on every revocation vs. prompt; old-key retention window.

## Verify

Read-only greps/reads only. `npm test` optionally to confirm baseline (1414).
Commit: `docs: vault-key rotation design spike (plan 238)` + standard trailer.

## Scope

In: `docs/vault-key-rotation-plan.md` (new) ONLY. Out: everything else.

## STOP conditions

- The /keys mailbox from plan 131 doesn't exist as described in shipped code
  (the design would float on fiction — report what IS there).
- Reading reveals rotation is already partially implemented somewhere.

## Maintenance notes

- The BUILD plan(s) must be cut in a dedicated session with the operator's
  answers to §7 — do not let a future misc batch absorb this.
