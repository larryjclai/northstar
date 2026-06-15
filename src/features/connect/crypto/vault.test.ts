import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  generateVaultKey,
  exportVaultKey,
  importVaultKey,
  encryptPayload,
  decryptPayload,
  saveVaultKey,
  loadVaultKey,
} from "./vault";

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

describe("vault crypto", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("export/import round-trip produces the same base64 string", async () => {
    const key = await generateVaultKey();
    const b64First = await exportVaultKey(key);
    const imported = await importVaultKey(b64First);
    const b64Second = await exportVaultKey(imported);
    expect(b64Second).toBe(b64First);
  });

  it("payload round-trip returns the original object", async () => {
    const key = await generateVaultKey();
    const payload = { amount: 1234.56, note: "測試" };
    const ciphertext = await encryptPayload(key, payload);
    const decrypted = await decryptPayload(key, ciphertext);
    expect(decrypted).toEqual(payload);
  });

  it("IV uniqueness: encrypting same object twice produces different ciphertexts", async () => {
    const key = await generateVaultKey();
    const payload = { amount: 1234.56, note: "測試" };
    const ct1 = await encryptPayload(key, payload);
    const ct2 = await encryptPayload(key, payload);
    expect(ct1).not.toBe(ct2);
    // both must still decrypt correctly
    expect(await decryptPayload(key, ct1)).toEqual(payload);
    expect(await decryptPayload(key, ct2)).toEqual(payload);
  });

  it("saveVaultKey then loadVaultKey yields the same key", async () => {
    const key = await generateVaultKey();
    const originalB64 = await exportVaultKey(key);
    await saveVaultKey(key);
    const loaded = await loadVaultKey();
    expect(loaded).not.toBeNull();
    const loadedB64 = await exportVaultKey(loaded!);
    expect(loadedB64).toBe(originalB64);
  });

  it("loadVaultKey returns null when storage is empty", async () => {
    const result = await loadVaultKey();
    expect(result).toBeNull();
  });
});
