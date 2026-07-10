// Vault key: AES-GCM 256-bit key used to encrypt all sync envelopes.
// Persisted as base64-encoded raw bytes through the SecretStore (Stronghold on
// device, localStorage fallback in the web shell/tests). On first sync setup
// this key is generated; on pairing it is received wrapped from the existing
// trusted device.

import { getSecretStore } from "./secretStore";

// SecretStore key string. Must stay identical so the localStorage fallback
// backend and migrateLocalStorageSecrets keep addressing the same entry.
const STORAGE_KEY = "northstar.vault.key.v1";

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

/** Persist the vault key locally via the SecretStore. */
export async function saveVaultKey(key: CryptoKey): Promise<void> {
  const b64 = await exportVaultKey(key);
  const store = await getSecretStore();
  await store.set(STORAGE_KEY, b64);
}

/** Load the local vault key from the SecretStore, or null if not yet set up. */
export async function loadVaultKey(): Promise<CryptoKey | null> {
  const store = await getSecretStore();
  const b64 = await store.get(STORAGE_KEY);
  if (!b64) return null;
  return importVaultKey(b64);
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
