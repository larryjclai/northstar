// High-level pairing orchestration.
//
// ECDH protocol (Plan 131) — the pairing code never protects the vault key:
//
//   Device B (JOINER, no account yet):
//     1. startJoinSession(): generates an ECDH keypair, a pairing code, and a
//        per-session salt; publishes { code, salt.enc(publicKey+deviceId) } to
//        the relay and receives a single-purpose pairing token. Shows the code.
//     2. completeJoin(): polls the relay with the pairing token until Device A's
//        wrapped envelopes appear, derives the ECDH shared key, unwraps the vault
//        key + account secret, and finishes local setup.
//
//   Device A (APPROVER, existing trusted device):
//     - user types/scans B's code.
//     1. inspectJoinRequest(): claims B's public-key bundle and computes a SAS
//        fingerprint of B's public key for user confirmation.
//     2. approveJoiningDevice(): after the user confirms, wraps the vault key and
//        account secret to B's public key and deposits both envelopes; registers B.
//
// The relay only ever sees B's public key and ciphertext wrapped under an ECDH
// shared secret — grinding the low-entropy code yields nothing of value.

import { exportVaultKey, loadVaultKey, importVaultKey, saveVaultKey, encryptPayload, decryptPayload } from "../crypto/vault";
import {
  generatePairingCode,
  generateBundleSalt,
  deriveBundleKey,
  encryptBundle,
  decryptBundle,
  generateDeviceKeyPair,
  saveDeviceKeyPair,
  loadDeviceKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedKeyExtended,
  wrapVaultKey,
  unwrapVaultKey,
  fingerprintPublicKey,
  type PublicPairingBundle,
} from "../crypto/pairing";
import {
  getOrCreateSyncAccount,
  setSyncAccount,
  generateDeviceSecret,
  saveDeviceSecret,
  clearDeviceSecret,
  sha256Hex,
} from "./account";
import { confirmRecoveryKit } from "../crypto/recovery-kit";
import {
  createPairingSession,
  claimPairingSession,
  joinPairingSession,
  storeKeyEnvelope,
  fetchKeyEnvelopesWithToken,
  addDevice,
  provisionDevicePublicKey,
} from "./client";
import { getOrCreateDeviceIdentity } from "../../../state/deviceIdentity";

export const PAIRING_QR_PREFIX = "northstar://pair?code=";

const VAULT_KEY_TYPE = "vault-v1";
const ACCOUNT_KEY_TYPE = "account-v1";

// The transmitted bundle packs the (public) per-session salt in front of the
// ciphertext so the claimer can derive the same bundle key. Standard base64 never
// contains `.`, so a single split on the first `.` is unambiguous.
function packBundle(saltB64: string, cipher: string): string {
  return `${saltB64}.${cipher}`;
}
function unpackBundle(packed: string): { saltB64: string; cipher: string } {
  const idx = packed.indexOf(".");
  if (idx < 0) throw new Error("Malformed pairing bundle.");
  return { saltB64: packed.slice(0, idx), cipher: packed.slice(idx + 1) };
}

function normalizeCode(input: string): string {
  const code = input.startsWith(PAIRING_QR_PREFIX)
    ? input.slice(PAIRING_QR_PREFIX.length)
    : input.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    throw new Error("Invalid pairing code format. Expected XXXX-XXXX.");
  }
  return code;
}

// ---------- Device B (joiner) ----------

export interface JoinSession {
  /** 8-char code shown to the user, e.g. "7A3F-K9M2" */
  code: string;
  /** QR code content — scan this on Device A instead of typing the code */
  qrPayload: string;
  /** Absolute time when the code expires */
  expiresAt: Date;
  /** Single-purpose token used to fetch the wrapped envelopes (device-local only). */
  pairingToken: string;
  /** This device's id (target of the wrapped envelopes). */
  deviceId: string;
  /**
   * This device's freshly-generated relay credential (Plan 132). Device-local
   * and NEVER transmitted — only its hash rides the pairing bundle. Persisted by
   * completeJoin() once the join succeeds.
   */
  deviceSecret: string;
  deviceName: string;
  platform: string;
}

/**
 * Device B: generate an ECDH keypair + pairing code and publish this device's
 * PUBLIC key to the relay. Show `session.code` / render `session.qrPayload` for
 * the user to enter on Device A. Then poll via completeJoin().
 */
export async function startJoinSession(
  deviceName: string,
  platform: string,
): Promise<JoinSession> {
  const pair = await generateDeviceKeyPair();
  await saveDeviceKeyPair(pair);
  const publicKeyB64 = await exportPublicKey(pair.publicKey);
  const device = getOrCreateDeviceIdentity();

  // Mint this device's relay credential now; only its hash goes into the bundle.
  const deviceSecret = generateDeviceSecret();
  const secretHash = await sha256Hex(deviceSecret);

  const code = generatePairingCode();
  const salt = generateBundleSalt();
  const bundleKey = await deriveBundleKey(code, salt);
  const publicBundle: PublicPairingBundle = {
    deviceId: device.deviceId,
    publicKeyB64,
    name: deviceName,
    platform,
    secretHash,
  };
  const cipher = await encryptPayload(bundleKey, publicBundle);

  const { pairingToken } = await joinPairingSession(code, packBundle(salt, cipher), device.deviceId);

  return {
    code,
    qrPayload: `${PAIRING_QR_PREFIX}${code}`,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    pairingToken,
    deviceId: device.deviceId,
    deviceSecret,
    deviceName,
    platform,
  };
}

export interface JoinResult {
  userId: string;
}

/**
 * Device B: poll the relay for the wrapped envelopes that Device A deposited
 * after confirming this device. Returns null while they haven't arrived yet
 * (keep polling); returns the JoinResult once setup is complete.
 */
export async function completeJoin(session: JoinSession): Promise<JoinResult | null> {
  const envelopes = await fetchKeyEnvelopesWithToken(session.pairingToken, session.deviceId);
  const vault = envelopes.find((e) => e.keyType === VAULT_KEY_TYPE);
  const account = envelopes.find((e) => e.keyType === ACCOUNT_KEY_TYPE);
  if (!vault || !account) return null; // Device A hasn't approved yet.

  const pair = await loadDeviceKeyPair();
  if (!pair) throw new Error("Device key pair missing; restart pairing on this device.");

  const sourcePublicKeyB64 = vault.sourcePublicKeyB64 ?? account.sourcePublicKeyB64;
  if (!sourcePublicKeyB64) throw new Error("Pairing envelope missing source public key.");
  const theirPublicKey = await importPublicKey(sourcePublicKeyB64);
  const shared = await deriveSharedKeyExtended(pair.privateKey, theirPublicKey);

  const vaultKey = await unwrapVaultKey(shared, vault.wrappedKey);
  await saveVaultKey(vaultKey);

  // This device inherited the vault key from the already-paired device, where
  // the Recovery Kit was created. Mark it confirmed locally so the sync gate
  // (see runSync) doesn't block this device from syncing.
  confirmRecoveryKit();

  const acct = (await decryptPayload(shared, account.wrappedKey)) as { userId: string; apiSecret: string };
  await setSyncAccount({ userId: acct.userId, apiSecret: acct.apiSecret });

  // Persist this device's own relay credential. Device A already registered its
  // hash (via addDevice) when it approved us, so this device can authenticate
  // with its own token ("<deviceId>.<deviceSecret>") from the first sync.
  await saveDeviceSecret(session.deviceSecret);

  // Belt-and-suspenders self-provision of this device's own public key into
  // the durable directory (Plan 239, rotation phase A). Device A's addDevice
  // call (approveJoiningDevice, below) already SHOULD have seeded this from
  // the pairing bundle it received — this call only has any effect if that
  // somehow didn't happen (e.g. Device A is on an older client build). The
  // relay's set-once guard makes it a harmless no-op (409) otherwise. This is
  // the earliest point THIS device (B) has authenticated relay credentials —
  // startJoinSession, where the keypair was actually generated, ran before B
  // had an account at all, so it could not have made this call itself.
  try {
    const myPublicKeyB64 = await exportPublicKey(pair.publicKey);
    await provisionDevicePublicKey(acct.apiSecret, session.deviceId, myPublicKeyB64);
  } catch {
    // Already set (by A) or offline — non-fatal, never blocks join completion.
  }

  // Device A already registered this device (addDevice) when it approved it.
  return { userId: acct.userId };
}

// ---------- Device A (approver) ----------

export interface PendingJoinApproval {
  deviceId: string;
  publicKeyB64: string;
  name: string;
  platform: string;
  /** 8-hex SAS fingerprint of the joining device's public key, for user confirmation. */
  fingerprint: string;
  /** Hash of B's own relay credential (Plan 132); forwarded to the relay on approval. */
  secretHash?: string;
}

/**
 * Device A: claim the joining device's public-key bundle using the code the user
 * entered, and compute the SAS fingerprint. Does NOT yet reveal any secret — the
 * caller shows { name, fingerprint } to the user before approveJoiningDevice().
 */
export async function inspectJoinRequest(input: string): Promise<PendingJoinApproval> {
  const code = normalizeCode(input);
  const { encryptedBundle } = await claimPairingSession(code);
  const { saltB64, cipher } = unpackBundle(encryptedBundle);
  const bundleKey = await deriveBundleKey(code, saltB64);
  const bundle = (await decryptPayload(bundleKey, cipher)) as PublicPairingBundle;
  const fingerprint = await fingerprintPublicKey(bundle.publicKeyB64);
  return {
    deviceId: bundle.deviceId,
    publicKeyB64: bundle.publicKeyB64,
    name: bundle.name,
    platform: bundle.platform,
    fingerprint,
    secretHash: bundle.secretHash,
  };
}

/**
 * Device A: after the user confirms the joining device, wrap the vault key and
 * account secret to B's public key under an ECDH shared secret and deposit both
 * envelopes on the relay. Registers B on the account.
 */
export async function approveJoiningDevice(approval: PendingJoinApproval): Promise<void> {
  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("Vault key not initialised. Complete sync setup first.");
  const account = await getOrCreateSyncAccount();
  const self = getOrCreateDeviceIdentity();

  let pair = await loadDeviceKeyPair();
  let isFreshKeyPair = false;
  if (!pair) {
    pair = await generateDeviceKeyPair();
    await saveDeviceKeyPair(pair);
    isFreshKeyPair = true;
  }
  const myPublicKeyB64 = await exportPublicKey(pair.publicKey);

  // A device approving its first joiner without ever having paired/approved
  // before (the lazy-generation path above) has never uploaded its own public
  // key either — do so now (Plan 239, rotation phase A). Best-effort: this
  // must never block approving the joining device.
  if (isFreshKeyPair) {
    try {
      await provisionDevicePublicKey(account.apiSecret, self.deviceId, myPublicKeyB64);
    } catch {
      // Offline or (shouldn't happen for a freshly-generated keypair) already
      // set — non-fatal, this device's own directory entry is a bonus, not a
      // requirement for THIS approval to succeed.
    }
  }

  const theirPublicKey = await importPublicKey(approval.publicKeyB64);
  const shared = await deriveSharedKeyExtended(pair.privateKey, theirPublicKey);

  const wrappedVaultKey = await wrapVaultKey(shared, vaultKey);
  const wrappedAccount = await encryptPayload(shared, {
    userId: account.userId,
    apiSecret: account.apiSecret,
  });

  await storeKeyEnvelope(account.apiSecret, approval.deviceId, {
    id: `${approval.deviceId}:${VAULT_KEY_TYPE}`,
    sourceDeviceId: self.deviceId,
    keyType: VAULT_KEY_TYPE,
    wrappedKey: wrappedVaultKey,
    sourcePublicKeyB64: myPublicKeyB64,
  });
  await storeKeyEnvelope(account.apiSecret, approval.deviceId, {
    id: `${approval.deviceId}:${ACCOUNT_KEY_TYPE}`,
    sourceDeviceId: self.deviceId,
    keyType: ACCOUNT_KEY_TYPE,
    wrappedKey: wrappedAccount,
    sourcePublicKeyB64: myPublicKeyB64,
  });

  // Seed B's directory entry with the public key we already have from the
  // pairing bundle (Plan 239) — B doesn't need to self-provision it later,
  // since it has no relay credentials until completeJoin() finishes anyway.
  await addDevice(account.apiSecret, {
    id: approval.deviceId,
    name: approval.name,
    platform: approval.platform,
    secretHash: approval.secretHash,
    publicKeyB64: approval.publicKeyB64,
  });
}

// ---------- Legacy code-encrypted bundle flow (DEPRECATED) ----------

export interface PairingSession {
  code: string;
  qrPayload: string;
  expiresAt: Date;
}

/**
 * @deprecated Legacy flow — Device A uploads { userId, apiSecret, vaultKey }
 * encrypted under a key derived from the pairing code. The code was the SOLE
 * protection of the vault key. Superseded by startJoinSession/approveJoiningDevice.
 * Kept working only for the transition window.
 */
export async function initiatePairing(): Promise<PairingSession> {
  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("Vault key not initialised. Complete sync setup first.");

  const account = await getOrCreateSyncAccount();
  const vaultKeyB64 = await exportVaultKey(vaultKey);

  const code = generatePairingCode();
  const bundleKey = await deriveBundleKey(code);
  const encryptedBundle = await encryptBundle(bundleKey, {
    userId: account.userId,
    apiSecret: account.apiSecret,
    vaultKeyB64,
  });

  await createPairingSession(account.apiSecret, code, encryptedBundle);

  return {
    code,
    qrPayload: `${PAIRING_QR_PREFIX}${code}`,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  };
}

/**
 * @deprecated Legacy flow — Device B claims A's code-encrypted credentials
 * bundle. Superseded by startJoinSession/completeJoin. Kept working only for the
 * transition window.
 */
export async function joinWithCode(
  input: string,
  deviceName: string,
  platform: string,
): Promise<JoinResult> {
  const code = normalizeCode(input);

  const bundleKey = await deriveBundleKey(code);
  const { encryptedBundle } = await claimPairingSession(code);
  const bundle = await decryptBundle(bundleKey, encryptedBundle);

  const vaultKey = await importVaultKey(bundle.vaultKeyB64);
  await saveVaultKey(vaultKey);
  confirmRecoveryKit();

  await setSyncAccount({ userId: bundle.userId, apiSecret: bundle.apiSecret });

  // Legacy path registers this device WITHOUT a device credential, so it must
  // authenticate with the account secret. Drop any stale device secret from a
  // previous account so getSyncAuthToken doesn't present a bogus device token;
  // ensureDeviceCredential will provision a fresh one on the next sync.
  await clearDeviceSecret();

  const device = getOrCreateDeviceIdentity();
  await addDevice(bundle.apiSecret, {
    id: device.deviceId,
    name: deviceName,
    platform,
  });

  return { userId: bundle.userId };
}
