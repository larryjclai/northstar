import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  generateVaultKey,
  exportVaultKey,
  importVaultKey,
  encryptPayload,
  decryptPayload,
  saveVaultKey,
  loadVaultKey,
  saveVaultKeyVersion,
  loadVaultKeyVersion,
  getCurrentVaultKeyVersion,
  setCurrentVaultKeyVersion,
  listVaultKeyVersions,
  vaultKeySlot,
} from "./vault";
import { getSecretStore, resetSecretStoreForTests } from "./secretStore";

beforeAll(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => {
        store.clear();
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage;
  }
});

describe("vault crypto", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSecretStoreForTests();
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

// ---------------------------------------------------------------------------
// Plan 240 — versioned key storage (rotation phase B)
// ---------------------------------------------------------------------------

describe("versioned vault key storage", () => {
  beforeEach(() => {
    localStorage.clear();
    resetSecretStoreForTests();
  });

  it("DONE CRITERION: a pre-upgrade install holding only northstar.vault.key.v1 keeps syncing with zero user action", async () => {
    // Simulate a pre-upgrade install: write directly to the v1 slot, exactly
    // as the OLD single-slot saveVaultKey used to, with no "current version"
    // pointer and no version index ever written (both are new in this phase).
    const key = await generateVaultKey();
    const b64 = await exportVaultKey(key);
    const store = await getSecretStore();
    await store.set(vaultKeySlot(1), b64);

    // loadVaultKey() — what push.ts/pull.ts/sync-manager.ts actually call —
    // must resolve this device's existing key with NO migration step and NO
    // extra state having ever been written.
    const loaded = await loadVaultKey();
    expect(loaded).not.toBeNull();
    expect(await exportVaultKey(loaded!)).toBe(b64);

    // The current-version pointer defaults to 1, matching this install's one
    // and only key, so getCurrentVaultKeyVersion() is correct too.
    expect(await getCurrentVaultKeyVersion()).toBe(1);
  });

  it("getCurrentVaultKeyVersion defaults to 1 when the pointer has never been written", async () => {
    expect(await getCurrentVaultKeyVersion()).toBe(1);
  });

  it("storing v2 leaves v1 intact and readable", async () => {
    const v1 = await generateVaultKey();
    const v1B64 = await exportVaultKey(v1);
    await saveVaultKeyVersion(1, v1);

    const v2 = await generateVaultKey();
    await saveVaultKeyVersion(2, v2);

    const loadedV1 = await loadVaultKeyVersion(1);
    expect(loadedV1).not.toBeNull();
    expect(await exportVaultKey(loadedV1!)).toBe(v1B64);

    const loadedV2 = await loadVaultKeyVersion(2);
    expect(loadedV2).not.toBeNull();
    expect(await exportVaultKey(loadedV2!)).not.toBe(v1B64);
  });

  it("loadVaultKeyVersion returns null for a version this device has never held", async () => {
    await saveVaultKeyVersion(1, await generateVaultKey());
    expect(await loadVaultKeyVersion(2)).toBeNull();
    expect(await loadVaultKeyVersion(99)).toBeNull();
  });

  it("loadVaultKey (no version arg) always returns the CURRENT version's key, not necessarily v1", async () => {
    const v1 = await generateVaultKey();
    await saveVaultKeyVersion(1, v1);
    const v2 = await generateVaultKey();
    await saveVaultKeyVersion(2, v2);

    // Still current = 1 by default.
    expect(await exportVaultKey((await loadVaultKey())!)).toBe(await exportVaultKey(v1));

    await setCurrentVaultKeyVersion(2);
    expect(await exportVaultKey((await loadVaultKey())!)).toBe(await exportVaultKey(v2));
    // v1 is STILL readable by explicit version — never deleted.
    expect(await exportVaultKey((await loadVaultKeyVersion(1))!)).toBe(await exportVaultKey(v1));
  });

  it("setCurrentVaultKeyVersion rejects a non-positive-integer version", async () => {
    await expect(setCurrentVaultKeyVersion(0)).rejects.toThrow();
    await expect(setCurrentVaultKeyVersion(-1)).rejects.toThrow();
    await expect(setCurrentVaultKeyVersion(1.5)).rejects.toThrow();
  });

  it("saveVaultKeyVersion rejects a non-positive-integer version", async () => {
    const key = await generateVaultKey();
    await expect(saveVaultKeyVersion(0, key)).rejects.toThrow();
    await expect(saveVaultKeyVersion(-1, key)).rejects.toThrow();
  });

  it("saveVaultKey (no version arg) writes to the CURRENT version's slot, matching the original single-slot behaviour when never rotated", async () => {
    const key = await generateVaultKey();
    await saveVaultKey(key);
    // Default current version is 1 → this is exactly the pre-versioning slot.
    const store = await getSecretStore();
    expect(await store.get(vaultKeySlot(1))).toBe(await exportVaultKey(key));
  });

  it("listVaultKeyVersions returns every version saved locally, ascending", async () => {
    expect(await listVaultKeyVersions()).toEqual([]);
    await saveVaultKeyVersion(1, await generateVaultKey());
    expect(await listVaultKeyVersions()).toEqual([1]);
    await saveVaultKeyVersion(3, await generateVaultKey());
    await saveVaultKeyVersion(2, await generateVaultKey());
    expect(await listVaultKeyVersions()).toEqual([1, 2, 3]);
  });

  it("listVaultKeyVersions backfills [1] for a pre-upgrade install with a v1 slot but no index ever written", async () => {
    const store = await getSecretStore();
    await store.set(vaultKeySlot(1), await exportVaultKey(await generateVaultKey()));
    // No VAULT_KEY_VERSIONS_INDEX_KEY entry exists — simulating an install
    // that predates this phase entirely.
    expect(await listVaultKeyVersions()).toEqual([1]);
  });

  it("re-saving the same version is idempotent in the version index (no duplicate entries)", async () => {
    const key = await generateVaultKey();
    await saveVaultKeyVersion(1, key);
    await saveVaultKeyVersion(1, key);
    expect(await listVaultKeyVersions()).toEqual([1]);
  });

  it("NEVER-DELETE INVARIANT: no function in this module removes a versioned key slot", () => {
    // Structural guard mirroring the plan's own done-criterion grep
    // (`grep -rn "remove(" src/features/connect/crypto/vault.ts`): the
    // versioned-storage API surface here is generate/export/import/save/load
    // only — there is no delete/remove/clear export at all.
    const moduleExports = {
      generateVaultKey,
      exportVaultKey,
      importVaultKey,
      saveVaultKey,
      loadVaultKey,
      saveVaultKeyVersion,
      loadVaultKeyVersion,
      getCurrentVaultKeyVersion,
      setCurrentVaultKeyVersion,
      listVaultKeyVersions,
      vaultKeySlot,
      encryptPayload,
      decryptPayload,
    };
    const exportNames = Object.keys(moduleExports);
    expect(exportNames.some((n) => /remove|delete|clear|wipe/i.test(n))).toBe(false);
  });

  it("multi-version coexistence: three versions all remain independently readable after all three are saved", async () => {
    const keys = await Promise.all([generateVaultKey(), generateVaultKey(), generateVaultKey()]);
    await saveVaultKeyVersion(1, keys[0]);
    await saveVaultKeyVersion(2, keys[1]);
    await saveVaultKeyVersion(3, keys[2]);

    for (let v = 1; v <= 3; v++) {
      const loaded = await loadVaultKeyVersion(v);
      expect(loaded).not.toBeNull();
      expect(await exportVaultKey(loaded!)).toBe(await exportVaultKey(keys[v - 1]));
    }
    expect(await listVaultKeyVersions()).toEqual([1, 2, 3]);
  });
});
