// Device pairing: short pairing code + QR code flow.
//
// How it works (both paths use the same server API):
//
//   Device A (existing trusted device):
//     1. Generates a random 8-char code: e.g. "7A3F-K9M2"
//     2. Derives a 256-bit bundle key from the code via PBKDF2
//     3. Encrypts { userId, apiSecret, vaultKey } with that key → encryptedBundle
//     4. Deposits encryptedBundle on the Worker (POST /pairing)
//     5. Shows the code to the user (typed entry) and a QR encoding the same code
//
//   Device B (new device):
//     - Manual: user types the code shown on Device A
//     - QR: user scans the QR (which encodes the same code string)
//     6. Derives the same bundle key from the entered/scanned code
//     7. Fetches encryptedBundle from the Worker (GET /pairing/:code) — one-time claim
//     8. Decrypts the bundle → gets { userId, apiSecret, vaultKey }
//     9. Saves credentials locally, registers device via POST /devices
//
// Security: code is 40-bit entropy, valid 5 min, one-time claim, 5-attempt limit.

const STORAGE_KEY = "northstar.device.keypair.v1";

interface StoredKeyPair {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export async function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
  ]);
}

export async function saveDeviceKeyPair(pair: CryptoKeyPair): Promise<void> {
  const [pub, priv] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ publicKey: pub, privateKey: priv }));
}

export async function loadDeviceKeyPair(): Promise<CryptoKeyPair | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const stored: StoredKeyPair = JSON.parse(raw);
  const [pub, priv] = await Promise.all([
    crypto.subtle.importKey("jwk", stored.publicKey, { name: "ECDH", namedCurve: "P-256" }, true, []),
    crypto.subtle.importKey("jwk", stored.privateKey, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]),
  ]);
  return { publicKey: pub, privateKey: priv };
}

/** Export a public key as base64 for inclusion in a QR code / pairing payload. */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

/** Derive a shared AES-GCM key from an ECDH key exchange. */
export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

/** Wrap the vault key with the shared key so it can be relayed via the server. */
export async function wrapVaultKey(sharedKey: CryptoKey, vaultKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", vaultKey, sharedKey, {
    name: "AES-GCM",
    iv,
  });
  const combined = new Uint8Array(12 + wrapped.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(wrapped), 12);
  return btoa(String.fromCharCode(...combined));
}

/** Unwrap the vault key using the shared key. */
export async function unwrapVaultKey(sharedKey: CryptoKey, b64: string): Promise<CryptoKey> {
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const wrapped = combined.slice(12);
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    sharedKey,
    { name: "AES-GCM", iv },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

// ---------- short pairing code ----------

// 32-char alphabet: uppercase, no ambiguous chars (0/O, 1/I/L)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a random 8-char pairing code displayed as XXXX-XXXX. */
export function generatePairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = Array.from(bytes)
    .map((b) => CODE_CHARS[b % 32])
    .join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Derive a 256-bit AES-GCM key from the pairing code via PBKDF2.
 * Both Device A and Device B run this independently to get the same key.
 */
export async function deriveBundleKey(code: string): Promise<CryptoKey> {
  const normalized = code.replace("-", "");
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(normalized),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("northstar-pairing-v1"),
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface CredentialsBundle {
  userId: string;
  apiSecret: string;
  vaultKeyB64: string;
}

/** Encrypt the credentials bundle with the bundle key derived from the pairing code. */
export async function encryptBundle(
  bundleKey: CryptoKey,
  bundle: CredentialsBundle,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(bundle));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, bundleKey, plaintext);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt the credentials bundle using the bundle key derived from the pairing code. */
export async function decryptBundle(
  bundleKey: CryptoKey,
  b64: string,
): Promise<CredentialsBundle> {
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, bundleKey, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as CredentialsBundle;
}
