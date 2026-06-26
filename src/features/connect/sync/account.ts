// Sync account: userId + apiSecret stored locally.
// apiSecret is a random 32-byte hex string; only its SHA-256 hash is sent to the server.

import { createSecretStore, migrateLocalStorageSecrets } from "../crypto/secretStore";

const STORAGE_KEY = "northstar.sync.account.v1";

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

