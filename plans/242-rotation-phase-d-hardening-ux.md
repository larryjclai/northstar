# Plan 242: Rotation Phase D — race hardening, honest UX copy, Recovery-Kit surface

> **Executor instructions**: Follow step by step; verify each. Do NOT update
> `plans/README.md`.
>
> **REQUIRED READING first**: `docs/vault-key-rotation-plan.md` **§4 Failure
> modes & version skew** and **§1 Threat model** (its "Bottom line, stated
> plainly for the operator and eventually the user-facing copy" paragraph is
> the source for this phase's UX copy). Phase D of §6.
>
> **Drift check**: `git diff --stat b4fbe894..HEAD -- src/features/connect src/routes/settings`

## Status

- **Priority**: P3 · **Effort**: S–M · **Risk**: LOW (UX + a confirmation check
  on top of an already-designed mechanism; spike lists no unknowns)
- **Depends on**: **plans 239, 240, 241 merged**
- **Category**: security / UX (phase D of 4 — final)
- **Planned at**: commit `b4fbe894`, 2026-07-19

## Why this matters

Phases A–C make rotation work. This phase makes it **honest and legible**: the
user is told plainly what removing a device does and does not protect, partial
failures are visible rather than silent, and a stale Recovery Kit is surfaced.
The threat-model framing is not optional polish — promising more than rotation
delivers would be the actual harm here.

## Current state

- Phase C sets: a rotation result (incl. partial-failure info), a Recovery-Kit
  staleness signal (Phase B's flag), and fires automatically from
  `ConnectSection.tsx`'s revoke path.
- Phase B distinguishes "unknown key version" from "corrupt payload" skips —
  today the sync status UI shows one undifferentiated bucket; this phase can
  message them separately.
- `src/routes/settings/ConnectSection.tsx` — the devices/sync settings surface
  (also home to the existing pairing + revoke UI). Match its existing
  card/row/toast conventions; UI copy is zh-TW written inline in this file
  (this route is not part of the copy.csv workflow — confirm by grepping for
  `t(` usage in the file before choosing).

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 |
| Lint | `npm run lint` | 0 errors / 761 warnings |
| Tests | `npm test` | prior + new pass |

## Scope

**In scope**: `src/routes/settings/ConnectSection.tsx`, the rotation module
(confirmation-ping check only), sync-status messaging for the two skip reasons,
tests.
**Out of scope**: the manual "rotate now" button (operator decision 4 — a
separate thin follow-up AFTER this phase), the protocol itself (Phase C), key
storage (Phase B), the worker (Phase A).

## Steps

### Step 1: Post-rotation confirmation ping

Per §4: after the re-wrap loop, the initiator verifies at least one deposit
actually stuck (re-read the mailbox / device list). A rotation where zero
deposits landed must report as FAILED, not silently "done" — otherwise the
initiator flips to a key nobody else can obtain.

**Verify**: a test where all deposits fail → result is failure and (per Phase
C's "pointer flips last") the local current-version pointer did NOT advance.

### Step 2: Partial-failure UI

In `ConnectSection.tsx`, when rotation reports partial failure, show which
devices did NOT receive the new key and offer a re-run (Phase C made re-running
safe/idempotent). Plain, non-alarming copy — e.g.
「已更新金鑰,但有 N 台裝置尚未收到,它們下次同步前無法讀取新資料。可重新執行。」

### Step 3: Recovery-Kit stale surface

Render Phase B's staleness signal where the Kit is managed: prompt to
regenerate after a rotation. Do not auto-regenerate (the Kit is a user-held
artifact).

### Step 4: Honest threat-model copy at rotation time

Show, at/after revocation-triggered rotation, the §1 bottom-line framing —
aligned with how `docs/shared-books-plan.md` frames the identical shared-books
limitation:
「移除裝置後,它收不到新的資料;但它先前已同步的資料仍留在該裝置上。」
Do NOT write copy implying remote wipe or retroactive protection.

### Step 5: Skip-reason messaging

Use Phase B's differentiated skip reasons so "unknown key version (等下次同步取得
新金鑰後即可讀取)" reads differently from a genuine corruption warning in the
sync status surface.

**Verify**: full gates after each step.

## Test plan

Step 1's zero-deposit failure test is the load-bearing one. UI is
jsdom-hostile; reviewer feel-check: revoke a device on a 2-device demo/dev
setup → rotation fires silently on success, partial failure renders the re-run
affordance, Kit-stale prompt appears.

## Done criteria

- [ ] Gates green; the zero-deposit-failure test passes
- [ ] A failed rotation never advances the local current-version pointer
- [ ] Partial failure names the unreached devices and offers re-run
- [ ] Threat-model copy present and does NOT overpromise
- [ ] No files outside scope modified

## STOP conditions

- Phase C's rotation result doesn't carry enough detail to name unreached
  devices (would need a Phase C change — report rather than reaching back).

## Maintenance notes

- **After this phase**: the operator-approved manual "rotate now" button
  (decision 4) — same `rotateVaultKey()` entry point from Settings, small.
- If a compliance need ever demands old data become provably unreadable, that
  is relay-side ciphertext deletion/compaction — a materially bigger feature
  the spike deliberately deferred (see its Maintenance notes), NOT an extension
  of this phase.
