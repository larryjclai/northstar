// Vault key: AES-GCM 256-bit key used to encrypt all sync envelopes.
// Persisted as base64-encoded raw bytes through the SecretStore (Stronghold on
// device, localStorage fallback in the web shell/tests). On first sync setup
// this key is generated; on pairing it is received wrapped from the existing
// trusted device.
//
// Versioned key storage (Plan 240, rotation phase B — see
// docs/vault-key-rotation-plan.md §2). Rotation (Phase C, not built yet) mints
// a NEW vault key on every device revocation and re-wraps it to every
// remaining device; a device must therefore hold EVERY key version it has
// ever had (old envelopes on the relay stay encrypted under whatever version
// pushed them — see the "critical finding" in the spike about
// forceFullRepush NOT re-encrypting history) plus a pointer to which version
// is CURRENT (used for new encryption).
//
// Storage shape:
//   northstar.vault.key.v{n}      — the raw key material for version n.
//     v1 is the ORIGINAL fixed slot name from before versioning existed —
//     unchanged on purpose, so a pre-upgrade install with only this one slot
//     keeps working with zero migration step (loadCurrentVaultKeyVersion()
//     defaults to 1 when the pointer below has never been written).
//   northstar.vault.key.current   — integer pointer: which version is used
//     for NEW encryption (push, Recovery Kit generation, pairing-approval).
//     Absent == version 1 (pre-rotation / pre-upgrade state).
//   northstar.vault.key.versions  — JSON array of every version number this
//     device has ever saved locally. Append-only bookkeeping ONLY (decrypt
//     correctness never depends on it — decryptByVersion reads the per-
//     version slot directly from an envelope's stamped version). It exists
//     so a full local reset (sync/reset.ts) can enumerate and wipe every
//     version slot a device holds, since that set is open-ended and can't be
//     known as a static list. If absent but v1's slot has a key, that is a
//     pre-upgrade install that predates this index — backfilled as [1] on
//     read, never assumed empty.
//
// INVARIANT: nothing in this module ever deletes a version's slot. The
// operator decision (2026-07-19) is unbounded local retention — see the
// plan's "Operator decision this phase depends on". The only code path that
// removes vault key material at all is the full-device wipe in
// sync/reset.ts, which is a deliberate "start over as a brand-new device"
// action, not a rotation/maintenance path.

import { getSecretStore } from "./secretStore";

const VAULT_KEY_PREFIX = "northstar.vault.key.v";
/** Storage key for the "which version is current" pointer. Exported for sync/reset.ts's full-wipe enumeration. */
export const VAULT_KEY_CURRENT_VERSION_KEY = "northstar.vault.key.current";
/** Storage key for the append-only list of versions ever saved locally. Exported for sync/reset.ts. */
export const VAULT_KEY_VERSIONS_INDEX_KEY = "northstar.vault.key.versions";

/** SecretStore key for a given vault key version's slot. Version 1 is `northstar.vault.key.v1` — the original, unchanged pre-versioning slot name. */
export function vaultKeySlot(version: number): string {
  return `${VAULT_KEY_PREFIX}${version}`;
}

export async function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportVaultKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importVaultKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Which vault key version is CURRENT (used for new encryption). Defaults to 1
 * when the pointer has never been written — the correct behaviour for both a
 * brand-new install (first key it ever generates IS version 1) and a
 * pre-upgrade install that only ever knew the single `v1` slot.
 */
export async function getCurrentVaultKeyVersion(): Promise<number> {
  const store = await getSecretStore();
  const raw = await store.get(VAULT_KEY_CURRENT_VERSION_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Flip the "current version" pointer to an EXISTING version's slot. This
 * never creates or deletes key material — it only changes which
 * already-saved slot new encryption uses. Phase C's rotation protocol calls
 * this after a newly-generated key has been successfully re-wrapped to every
 * remaining device (spike §3 step 5's ordering: flip only after deposits
 * succeed, so a crash mid-rotation leaves the device consistently on the OLD
 * version rather than half-migrated).
 */
export async function setCurrentVaultKeyVersion(version: number): Promise<void> {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Invalid vault key version: ${version}`);
  }
  const store = await getSecretStore();
  await store.set(VAULT_KEY_CURRENT_VERSION_KEY, String(version));
}

/**
 * Every vault key version this device has ever saved locally, ascending.
 * Bookkeeping only (see module doc) — used by sync/reset.ts to enumerate
 * slots for a full-device wipe, not by any decrypt path.
 */
export async function listVaultKeyVersions(): Promise<number[]> {
  const store = await getSecretStore();
  const raw = await store.get(VAULT_KEY_VERSIONS_INDEX_KEY);
  if (!raw) {
    // No index yet: either a fresh install with nothing saved, or a
    // pre-upgrade install whose only key predates this index entirely.
    // Detect the latter by checking whether the v1 slot actually has a key.
    const hasV1 = (await store.get(vaultKeySlot(1))) != null;
    return hasV1 ? [1] : [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => Number.isInteger(v)).sort((a, b) => a - b);
  } catch {
    return [];
  }
}

async function recordVaultKeyVersion(version: number): Promise<void> {
  const store = await getSecretStore();
  const versions = await listVaultKeyVersions();
  if (versions.includes(version)) return; // append-only, idempotent
  const next = [...versions, version].sort((a, b) => a - b);
  await store.set(VAULT_KEY_VERSIONS_INDEX_KEY, JSON.stringify(next));
}

/**
 * Persist a vault key under a SPECIFIC version's slot. Never deletes or
 * overwrites a DIFFERENT version's slot — each version gets its own
 * `northstar.vault.key.v{n}` entry, permanently. Records the version in the
 * local index (listVaultKeyVersions) for the full-wipe path.
 */
export async function saveVaultKeyVersion(version: number, key: CryptoKey): Promise<void> {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Invalid vault key version: ${version}`);
  }
  const b64 = await exportVaultKey(key);
  const store = await getSecretStore();
  await store.set(vaultKeySlot(version), b64);
  await recordVaultKeyVersion(version);
}

/**
 * Persist the vault key under the CURRENT version's slot (creating version 1
 * if no pointer has ever been set — matches the original single-slot
 * behaviour exactly). Unchanged call sites (pairing-flow.ts's completeJoin,
 * recovery-kit.ts's restoreFromRecoveryKit) keep working without any
 * modification, since neither has any notion of "which version" yet — that
 * only becomes meaningful once Phase C's rotation protocol exists.
 */
export async function saveVaultKey(key: CryptoKey): Promise<void> {
  const version = await getCurrentVaultKeyVersion();
  await saveVaultKeyVersion(version, key);
}

/**
 * Load a SPECIFIC vault key version — used by pull.ts to decrypt an envelope
 * stamped with an older (or, after Phase C ships, potentially newer) key
 * version than this device's current one. Returns null if this device has
 * never held that version (e.g. a rotation this device hasn't picked up yet
 * — see pull.ts's "unknown key version" skip path, NOT an error).
 */
export async function loadVaultKeyVersion(version: number): Promise<CryptoKey | null> {
  const store = await getSecretStore();
  const b64 = await store.get(vaultKeySlot(version));
  if (!b64) return null;
  return importVaultKey(b64);
}

/**
 * Load the CURRENT version's vault key (for new encryption), or null if not
 * yet set up. A pre-upgrade install (only `northstar.vault.key.v1` present,
 * no `current` pointer ever written) resolves to version 1 and returns
 * exactly the key it always has — zero user action required.
 */
export async function loadVaultKey(): Promise<CryptoKey | null> {
  const version = await getCurrentVaultKeyVersion();
  return loadVaultKeyVersion(version);
}

/** Encrypt arbitrary JSON-serialisable data. Returns base64 ciphertext. */
export async function encryptPayload(key: CryptoKey, data: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  // Prefix: 12-byte IV + ciphertext, all base64
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt a base64 ciphertext produced by encryptPayload. */
export async function decryptPayload(key: CryptoKey, b64: string): Promise<unknown> {
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
