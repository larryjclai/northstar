import { beforeAll, describe, expect, it } from "vitest";
import {
  generatePairingCode,
  deriveBundleKey,
  encryptBundle,
  decryptBundle,
  generateDeviceKeyPair,
  deriveSharedKey,
  wrapVaultKey,
  unwrapVaultKey,
  type CredentialsBundle,
} from "./pairing";
import { generateVaultKey, encryptPayload, decryptPayload, exportVaultKey } from "./vault";

beforeAll(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    } as Storage;
  }
});

const CODE_CHARS = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");

describe("pairing code format", () => {
  it("matches /^[A-Z0-9]{4}-[A-Z0-9]{4}$/ and uses only valid alphabet chars", () => {
    for (let i = 0; i < 100; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      // verify only chars from the CODE_CHARS alphabet
      const chars = code.replace("-", "").split("");
      for (const ch of chars) {
        expect(CODE_CHARS.has(ch)).toBe(true);
      }
    }
  });
});

describe("bundle round-trip", () => {
  it("encrypts and decrypts a bundle using two independently derived keys", async () => {
    const code = "ABCD-2345";
    const [keyA, keyB] = await Promise.all([
      deriveBundleKey(code),
      deriveBundleKey(code),
    ]);
    const bundle: CredentialsBundle = {
      userId: "user-abc-123",
      apiSecret: "secret-xyz",
      vaultKeyB64: "dGVzdGtleQ==",
    };
    const ct = await encryptBundle(keyA, bundle);
    const result = await decryptBundle(keyB, ct);
    expect(result).toEqual(bundle);
  });

  it("decryptBundle rejects when a different code is used", async () => {
    const code = "ABCD-2345";
    const wrongCode = "WXYZ-9876";
    const keyA = await deriveBundleKey(code);
    const keyWrong = await deriveBundleKey(wrongCode);
    const bundle: CredentialsBundle = {
      userId: "user-abc-123",
      apiSecret: "secret-xyz",
      vaultKeyB64: "dGVzdGtleQ==",
    };
    const ct = await encryptBundle(keyA, bundle);
    await expect(decryptBundle(keyWrong, ct)).rejects.toThrow();
  });
});

describe("ECDH wrap/unwrap", () => {
  it("wrap vault key on one side, unwrap on other, key still works for payload round-trip", async () => {
    const [pairA, pairB] = await Promise.all([
      generateDeviceKeyPair(),
      generateDeviceKeyPair(),
    ]);

    // Each device derives shared key from their own private + the other's public
    const [sharedA, sharedB] = await Promise.all([
      deriveSharedKey(pairA.privateKey, pairB.publicKey),
      deriveSharedKey(pairB.privateKey, pairA.publicKey),
    ]);

    // A wraps the vault key with sharedA
    const vaultKey = await generateVaultKey();
    const wrapped = await wrapVaultKey(sharedA, vaultKey);

    // B unwraps with sharedB
    const unwrapped = await unwrapVaultKey(sharedB, wrapped);

    // Confirm the unwrapped key still encrypts/decrypts correctly
    const payload = { amount: 999.99, note: "共享金鑰測試" };
    const ct = await encryptPayload(unwrapped, payload);
    const decrypted = await decryptPayload(unwrapped, ct);
    expect(decrypted).toEqual(payload);

    // Also confirm the original vault key and unwrapped key export to the same base64
    const originalB64 = await exportVaultKey(vaultKey);
    const unwrappedB64 = await exportVaultKey(unwrapped);
    expect(unwrappedB64).toBe(originalB64);
  });
});
