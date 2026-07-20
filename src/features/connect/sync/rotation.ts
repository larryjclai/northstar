// Vault-key rotation protocol (Plan 241, rotation phase C — see
// docs/vault-key-rotation-plan.md §3 "Rotation protocol" and §4 "Failure
// modes & version skew"). Reuses 100% of shipped crypto primitives
// (generateVaultKey, wrapVaultKey/unwrapVaultKey, deriveSharedKeyExtended,
// allocateKeyVersion, storeKeyEnvelope, fetchKeyEnvelopes) — this module
// writes NO new cryptography.
//
// Two halves:
//
//   - rotateVaultKey(): INITIATOR side (spike §3 steps 1-5, 9). Fires
//     automatically, with no confirmation prompt, from ConnectSection.tsx's
//     revokeDevice success path (operator decision, plan 241 — "auto-rotate
//     on revocation, NO prompt"). Mints a new vault key, re-wraps it to
//     every OTHER currently-trusted device via the /keys mailbox, and —
//     only once every deposit succeeds — flips this device's own
//     current-version pointer. A solo-device account (zero remaining
//     targets once the revoked device is gone) is a deliberate NO-OP:
//     nothing to re-wrap to, so no key is generated and no version is
//     allocated (operator decision, plan 241).
//
//   - pickUpRotatedVaultKey(): RECIPIENT side (spike §3 steps 6-8), wired
//     into runSync's cycle (sync-manager.ts). Polls the authenticated
//     fetchKeyEnvelopes mailbox path — shipped since Phase A but never
//     called from production code until this module — for a `vault-v1`
//     envelope newer than this device's current version; if found, unwraps
//     and adopts it. Pull-driven and lazy by design: a device that was
//     offline during rotation simply sees the latest envelope next time it
//     syncs (key_envelopes UPSERTs per target, so there is never more than
//     one waiting envelope to catch up on, regardless of how many
//     rotations happened while it was away). Idempotent: the version
//     comparison short-circuits once this device has already adopted the
//     envelope's version.
//
// Relay-data strategy is LAZY (spike §3(a)): old sync envelopes stay under
// their old key forever; only new pushes use the new key going forward.
// This module never touches sync_envelopes / relay history — see
// docs/vault-key-rotation-plan.md §3's "(b) Full re-push... Rejected" for
// why bumping revisions to force re-encryption of history is explicitly out
// of scope (the spike proved `forceFullRepush` silently no-ops on unchanged
// revisions; nothing here attempts anything like it).
//
// v1 partial-failure semantics (plan 241 step 5): if the re-wrap loop fails
// for one or more target devices — a network error, or a target with no
// publicKeyB64 on file yet (e.g. it hasn't synced since Phase A shipped the
// public-key directory) — rotateVaultKey() reports the failure and does
// NOT flip the current-version pointer, exactly as if the process had
// crashed mid-loop. There is no automatic retry/resume state: the caller
// (today, the auto-fire in ConnectSection.tsx; later, the deferred manual
// "rotate now" button) simply re-runs rotateVaultKey(). Re-running is safe
// because every deposit is idempotent (key_envelopes UPSERTs per target)
// and each attempt allocates a fresh server-side version number, so a
// previously-failed attempt's abandoned version is harmless — Phase B's
// "never delete a local key version" invariant means an unused version
// costs nothing.

import { getOrCreateDeviceIdentity } from "../../../state/deviceIdentity";
import {
  generateVaultKey,
  saveVaultKeyVersion,
  getCurrentVaultKeyVersion,
  setCurrentVaultKeyVersion,
} from "../crypto/vault";
import {
  loadDeviceKeyPair,
  saveDeviceKeyPair,
  generateDeviceKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedKeyExtended,
  wrapVaultKey,
  unwrapVaultKey,
} from "../crypto/pairing";
import {
  listDevices,
  allocateKeyVersion,
  storeKeyEnvelope,
  fetchKeyEnvelopes,
  provisionDevicePublicKey,
} from "./client";
import { getSyncAuthToken, type SyncAccount } from "./account";

const VAULT_KEY_TYPE = "vault-v1";

export interface RotationFailure {
  deviceId: string;
  reason: string;
}

export interface RotationResult {
  /** True only when the current-version pointer actually flipped. */
  rotated: boolean;
  reason: "no-remaining-devices" | "ok" | "partial-failure";
  newVersion?: number;
  /** Number of remaining trusted devices (excluding this one) considered as targets. */
  targetCount: number;
  succeeded: string[];
  failed: RotationFailure[];
}

/**
 * INITIATOR side. Call after a device has been revoked (or, once the
 * deferred manual "rotate now" button ships, on demand for any reason).
 *
 * `excludeDeviceId` — the just-revoked device's id, if known. Revocation
 * hard-deletes the device row (worker/src/index.ts), so GET /devices
 * normally already omits it; passing it here defensively protects against
 * a caller holding a stale device list.
 */
export async function rotateVaultKey(
  account: SyncAccount,
  excludeDeviceId?: string,
): Promise<RotationResult> {
  const self = getOrCreateDeviceIdentity();
  const authToken = await getSyncAuthToken(account);

  const devices = await listDevices(authToken);
  const targets = devices.filter(
    (d) => d.id !== self.deviceId && d.id !== excludeDeviceId,
  );

  // Operator decision (plan 241, decision 3): a solo-device account — zero
  // remaining devices to re-wrap to — is a deliberate no-op. Do not
  // generate a key, do not allocate a version, do not touch the pointer.
  if (targets.length === 0) {
    return { rotated: false, reason: "no-remaining-devices", targetCount: 0, succeeded: [], failed: [] };
  }

  // Step 1 (spike §3): generate the new key and persist it under its OWN
  // version slot immediately. This never touches the current-version
  // pointer — see setCurrentVaultKeyVersion below, called only on success.
  const newKey = await generateVaultKey();
  const newVersion = await allocateKeyVersion(authToken, VAULT_KEY_TYPE);
  await saveVaultKeyVersion(newVersion, newKey);

  // This device's own ECDH keypair. Every device that is part of a
  // >=2-remaining-device account has necessarily generated one already (see
  // docs/vault-key-rotation-plan.md's "Orphaned/missing primitives"
  // analysis: pairing always generates a keypair for at least one side).
  // The lazy-generate fallback mirrors approveJoiningDevice's
  // belt-and-suspenders handling of the same edge case, not an expected
  // path here.
  let pair = await loadDeviceKeyPair();
  if (!pair) {
    pair = await generateDeviceKeyPair();
    await saveDeviceKeyPair(pair);
    try {
      const freshPublicKeyB64 = await exportPublicKey(pair.publicKey);
      await provisionDevicePublicKey(authToken, self.deviceId, freshPublicKeyB64);
    } catch {
      // Best-effort directory seed; never blocks rotation.
    }
  }
  const myPublicKeyB64 = await exportPublicKey(pair.publicKey);

  // Steps 3-4 (spike §3): re-wrap the new key to every remaining device. A
  // target with no publicKeyB64 on file cannot receive it (STOP condition
  // in plan 241 — a device that never uploaded a key needs an explicit
  // story; here that story is: record it as a failure rather than throw,
  // so ONE unreachable device doesn't corrupt the whole attempt, and it
  // resolves itself once that device uploads a key and rotation re-runs).
  const succeeded: string[] = [];
  const failed: RotationFailure[] = [];
  for (const target of targets) {
    if (!target.publicKeyB64) {
      failed.push({ deviceId: target.id, reason: "no public key on file" });
      continue;
    }
    try {
      const theirPublicKey = await importPublicKey(target.publicKeyB64);
      const shared = await deriveSharedKeyExtended(pair.privateKey, theirPublicKey);
      const wrappedKey = await wrapVaultKey(shared, newKey);
      await storeKeyEnvelope(authToken, target.id, {
        id: `${target.id}:${VAULT_KEY_TYPE}`,
        sourceDeviceId: self.deviceId,
        keyType: VAULT_KEY_TYPE,
        wrappedKey,
        sourcePublicKeyB64: myPublicKeyB64,
        wrappedKeyVersion: newVersion,
      });
      succeeded.push(target.id);
    } catch (e) {
      failed.push({ deviceId: target.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  // Step 5 (spike §3): flip the current-version pointer LAST, and ONLY if
  // every deposit succeeded — a crash or a partial failure both leave this
  // device consistently encrypting under the OLD key (safe; re-running
  // rotateVaultKey() is the documented recovery, see this module's
  // docstring — v1 has no automatic retry/resume state by design).
  if (failed.length > 0) {
    return { rotated: false, reason: "partial-failure", newVersion, targetCount: targets.length, succeeded, failed };
  }

  await setCurrentVaultKeyVersion(newVersion);
  // Step 9 (spike §3, Recovery Kit regeneration): staleness is a DERIVED
  // signal — recovery-kit.ts's isRecoveryKitStale() compares the kit's
  // recorded version against getCurrentVaultKeyVersion(). Flipping the
  // pointer above is the only action rotation needs to take; there is no
  // separate "mark stale" call. Phase D renders the resulting signal.
  return { rotated: true, reason: "ok", newVersion, targetCount: targets.length, succeeded, failed: [] };
}

/**
 * RECIPIENT side (spike §3 steps 6-8). Call once per runSync cycle
 * (sync-manager.ts). Checks the authenticated key mailbox for a `vault-v1`
 * envelope newer than this device's current version; if found, unwraps and
 * adopts it, then flips this device's own pointer to match. Idempotent — a
 * device that has already applied the latest envelope compares versions
 * and does nothing. Best-effort: must never throw and block a normal sync
 * cycle (an offline/unreachable relay just means "try again next sync",
 * matching the lazy-pickup design in spike §4's failure-mode table).
 */
export async function pickUpRotatedVaultKey(account: SyncAccount): Promise<void> {
  const self = getOrCreateDeviceIdentity();
  const pair = await loadDeviceKeyPair();
  if (!pair) return; // never paired — nothing to receive a rotated key with

  let envelopes;
  try {
    const authToken = await getSyncAuthToken(account);
    envelopes = await fetchKeyEnvelopes(authToken, self.deviceId);
  } catch {
    return; // offline / relay error — retried automatically on the next sync
  }

  const envelope = envelopes.find((e) => e.keyType === VAULT_KEY_TYPE);
  if (!envelope || !envelope.sourcePublicKeyB64) return;

  const currentVersion = await getCurrentVaultKeyVersion();
  if (envelope.wrappedKeyVersion <= currentVersion) return; // already caught up — idempotent no-op

  try {
    const theirPublicKey = await importPublicKey(envelope.sourcePublicKeyB64);
    const shared = await deriveSharedKeyExtended(pair.privateKey, theirPublicKey);
    const vaultKey = await unwrapVaultKey(shared, envelope.wrappedKey);
    await saveVaultKeyVersion(envelope.wrappedKeyVersion, vaultKey);
    await setCurrentVaultKeyVersion(envelope.wrappedKeyVersion);
  } catch (e) {
    // Malformed/undecryptable envelope: never block sync over it. Will be
    // retried on the next sync (this is not a "wrong version" situation —
    // envelopeKeyVersion was already newer than ours — so it will not
    // self-heal by waiting unless a fresh rotation re-deposits a good one).
    console.warn("[rotation] failed to adopt rotated vault key envelope:", e);
  }
}
