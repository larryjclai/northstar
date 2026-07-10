// Sync account: userId + apiSecret stored locally.
// apiSecret is a random 32-byte hex string; only its SHA-256 hash is sent to the server.

import { createSecretStore, migrateLocalStorageSecrets } from "../crypto/secretStore";
import { getOrCreateDeviceIdentity } from "../../../state/deviceIdentity";
import { provisionDeviceCredential } from "./client";

const STORAGE_KEY = "northstar.sync.account.v1";

// Per-device relay credential (Plan 132). Device-local, never synced. The Bearer
// token this device presents is "<deviceId>.<deviceSecret>"; the worker looks up
// the device row and compares SHA-256(deviceSecret). The account apiSecret is the
// legacy (deprecated) fallback for installs that predate device credentials.
const DEVICE_SECRET_KEY = "northstar.device.secret.v1";

export interface SyncAccount {
  userId: string;
  apiSecret: string;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadSyncAccount(): Promise<SyncAccount | null> {
  const store = await createSecretStore();
  await migrateLocalStorageSecrets(store);
  const raw = await store.get(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SyncAccount;
  } catch {
    return null;
  }
}

export async function createSyncAccount(): Promise<SyncAccount> {
  const account: SyncAccount = {
    userId: crypto.randomUUID(),
    apiSecret: randomHex(32),
  };
  const store = await createSecretStore();
  await store.set(STORAGE_KEY, JSON.stringify(account));
  return account;
}

/** Load the existing account or create one on first call. */
export async function getOrCreateSyncAccount(): Promise<SyncAccount> {
  return (await loadSyncAccount()) ?? (await createSyncAccount());
}

/** Persist credentials received during device pairing (Device B). */
export async function setSyncAccount(account: SyncAccount): Promise<void> {
  const store = await createSecretStore();
  await store.set(STORAGE_KEY, JSON.stringify(account));
}

// ---------- per-device credential (Plan 132) ----------

/** Generate a fresh 32-byte device secret (hex). Never leaves the device. */
export function generateDeviceSecret(): string {
  return randomHex(32);
}

/** The device secret stored on this install, or null if none provisioned yet. */
export async function loadDeviceSecret(): Promise<string | null> {
  const store = await createSecretStore();
  await migrateLocalStorageSecrets(store);
  return store.get(DEVICE_SECRET_KEY);
}

/** Persist this device's own relay credential. */
export async function saveDeviceSecret(secret: string): Promise<void> {
  const store = await createSecretStore();
  await store.set(DEVICE_SECRET_KEY, secret);
}

/**
 * Drop this device's stored credential. Used when a flow leaves the device
 * WITHOUT a registered device credential (legacy account-secret auth) so a stale
 * secret from a previous account can't be presented as this device's token.
 */
export async function clearDeviceSecret(): Promise<void> {
  const store = await createSecretStore();
  await store.remove(DEVICE_SECRET_KEY);
}

/**
 * Resolve the Bearer token for authenticated relay calls. Prefers this device's
 * own credential ("<deviceId>.<deviceSecret>"); falls back to the shared account
 * secret (legacy/deprecated) when the device hasn't been provisioned yet.
 */
export async function getSyncAuthToken(account: SyncAccount): Promise<string> {
  const deviceSecret = await loadDeviceSecret();
  if (deviceSecret) {
    const { deviceId } = getOrCreateDeviceIdentity();
    return `${deviceId}.${deviceSecret}`;
  }
  return account.apiSecret;
}

/**
 * One-time upgrade for an existing install: if this device has no credential
 * yet, generate one, register only its hash with the relay (authenticated with
 * the account secret), and persist the secret locally. Idempotent and
 * best-effort — a no-op once provisioned, and silently retried on the next sync
 * if the relay rejects (409: already claimed) or is unreachable. The local
 * secret is saved ONLY after the relay accepts the hash, so this device's token
 * can never diverge from what the server will honour.
 */
export async function ensureDeviceCredential(account: SyncAccount): Promise<void> {
  if (await loadDeviceSecret()) return;

  const secret = generateDeviceSecret();
  const secretHash = await sha256Hex(secret);
  const { deviceId } = getOrCreateDeviceIdentity();
  try {
    await provisionDeviceCredential(account.apiSecret, deviceId, secretHash);
  } catch {
    // 409 (already provisioned / not owned) or offline — keep using the account
    // secret and retry on a later sync. Do NOT persist the unaccepted secret.
    return;
  }
  await saveDeviceSecret(secret);
}

