// High-level pairing orchestration.
//
// Device A calls initiatePairing() → shows the code (and a QR encoding it).
// Device B calls joinWithCode() after the user types or scans the code.

import { exportVaultKey, loadVaultKey, importVaultKey, saveVaultKey } from "../crypto/vault";
import {
  generatePairingCode,
  deriveBundleKey,
  encryptBundle,
  decryptBundle,
} from "../crypto/pairing";
import { getOrCreateSyncAccount, setSyncAccount } from "./account";
import { confirmRecoveryKit } from "../crypto/recovery-kit";
import { createPairingSession, claimPairingSession, addDevice } from "./client";
import { getOrCreateDeviceIdentity } from "../../../state/deviceIdentity";

export const PAIRING_QR_PREFIX = "northstar://pair?code=";

export interface PairingSession {
  /** 8-char code shown to the user, e.g. "7A3F-K9M2" */
  code: string;
  /** QR code content — scan this on Device B instead of typing the code */
  qrPayload: string;
  /** Absolute time when the code expires */
  expiresAt: Date;
}

/**
 * Device A: generate a pairing code, encrypt local credentials, and upload
 * the bundle to the Worker. Show `session.code` to the user and render
 * `session.qrPayload` as a QR code — both paths lead to the same bundle.
 */
export async function initiatePairing(): Promise<PairingSession> {
  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("Vault key not initialised. Complete sync setup first.");

  const account = getOrCreateSyncAccount();
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

export interface JoinResult {
  userId: string;
}

/**
 * Device B: join an existing sync account using a pairing code.
 * Accepts both the raw code ("7A3F-K9M2") and a scanned QR payload
 * ("northstar://pair?code=7A3F-K9M2").
 *
 * After this call succeeds, the device has a vault key and sync credentials
 * and is registered on the Worker.
 */
export async function joinWithCode(
  input: string,
  deviceName: string,
  platform: string,
): Promise<JoinResult> {
  // Accept both raw code and QR payload
  const code = input.startsWith(PAIRING_QR_PREFIX)
    ? input.slice(PAIRING_QR_PREFIX.length)
    : input.trim().toUpperCase();

  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    throw new Error("Invalid pairing code format. Expected XXXX-XXXX.");
  }

  const bundleKey = await deriveBundleKey(code);
  const { encryptedBundle } = await claimPairingSession(code);
  const bundle = await decryptBundle(bundleKey, encryptedBundle);

  const vaultKey = await importVaultKey(bundle.vaultKeyB64);
  await saveVaultKey(vaultKey);

  // This device inherited the vault key from the already-paired device, where
  // the Recovery Kit was created. Mark it confirmed locally so the sync gate
  // (see runSync) doesn't block this device from syncing.
  confirmRecoveryKit();

  setSyncAccount({ userId: bundle.userId, apiSecret: bundle.apiSecret });

  // Register this device on the Worker using the received credentials.
  // POST /devices (not /users — the account already exists).
  const device = getOrCreateDeviceIdentity();
  await addDevice(bundle.apiSecret, {
    id: device.deviceId,
    name: deviceName,
    platform,
  });

  return { userId: bundle.userId };
}
