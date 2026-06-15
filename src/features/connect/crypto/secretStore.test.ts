import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalStorageStore,
  createSecretStore,
  migrateLocalStorageSecrets,
  SECRET_KEYS,
} from "./secretStore";

// ---------------------------------------------------------------------------
// Map-backed localStorage stub (same pattern as recoveryKitGate.test.ts:9–21)
// ---------------------------------------------------------------------------

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

beforeEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Helper: create a fresh in-memory mock store for testing migration
// ---------------------------------------------------------------------------

function createMockStore() {
  const data = new Map<string, string>();
  return {
    data,
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async set(key: string, value: string) {
      data.set(key, value);
    },
    async remove(key: string) {
      data.delete(key);
    },
  };
}

// ---------------------------------------------------------------------------
// Suite 1: localStorage backend round-trip
// ---------------------------------------------------------------------------

describe("createLocalStorageStore", () => {
  it("returns null for a key that has never been set", async () => {
    const store = createLocalStorageStore();
    expect(await store.get("some.key")).toBeNull();
  });

  it("round-trips a value through set/get", async () => {
    const store = createLocalStorageStore();
    await store.set("test.key", "secret-value-123");
    expect(await store.get("test.key")).toBe("secret-value-123");
  });

  it("overwrites an existing value on set", async () => {
    const store = createLocalStorageStore();
    await store.set("test.key", "first");
    await store.set("test.key", "second");
    expect(await store.get("test.key")).toBe("second");
  });

  it("returns null after remove", async () => {
    const store = createLocalStorageStore();
    await store.set("test.key", "to-delete");
    await store.remove("test.key");
    expect(await store.get("test.key")).toBeNull();
  });

  it("removing a non-existent key does not throw", async () => {
    const store = createLocalStorageStore();
    await expect(store.remove("does.not.exist")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 2: createSecretStore — uses localStorage when not in Tauri
// ---------------------------------------------------------------------------

describe("createSecretStore (no Tauri runtime)", () => {
  it("returns a store that behaves as localStorage outside Tauri", async () => {
    // __TAURI_INTERNALS__ is not set in jsdom → falls back to localStorage
    const store = await createSecretStore();
    await store.set("northstar.vault.key.v1", "my-vault-key");
    expect(await store.get("northstar.vault.key.v1")).toBe("my-vault-key");
    // also present in the underlying localStorage
    expect(localStorage.getItem("northstar.vault.key.v1")).toBe("my-vault-key");
  });
});

// ---------------------------------------------------------------------------
// Suite 3: migrateLocalStorageSecrets — copies existing secrets into store
// ---------------------------------------------------------------------------

describe("migrateLocalStorageSecrets", () => {
  it("copies an existing localStorage secret into a fresh mock store", async () => {
    localStorage.setItem("northstar.vault.key.v1", "vault-key-abc");

    const mockStore = createMockStore();
    await migrateLocalStorageSecrets(mockStore);

    expect(await mockStore.get("northstar.vault.key.v1")).toBe("vault-key-abc");
  });

  it("copies all three known secret keys that are present", async () => {
    localStorage.setItem("northstar.vault.key.v1", "vault-key-value");
    localStorage.setItem("northstar.device.keypair.v1", "keypair-value");
    localStorage.setItem("northstar.sync.account.v1", "account-value");

    const mockStore = createMockStore();
    await migrateLocalStorageSecrets(mockStore);

    expect(await mockStore.get("northstar.vault.key.v1")).toBe("vault-key-value");
    expect(await mockStore.get("northstar.device.keypair.v1")).toBe("keypair-value");
    expect(await mockStore.get("northstar.sync.account.v1")).toBe("account-value");
  });

  it("skips keys not present in localStorage", async () => {
    // Only set one of the three keys
    localStorage.setItem("northstar.vault.key.v1", "only-this-key");

    const mockStore = createMockStore();
    await migrateLocalStorageSecrets(mockStore);

    expect(await mockStore.get("northstar.vault.key.v1")).toBe("only-this-key");
    expect(await mockStore.get("northstar.device.keypair.v1")).toBeNull();
    expect(await mockStore.get("northstar.sync.account.v1")).toBeNull();
  });

  it("migration is idempotent — running twice does not overwrite existing store value", async () => {
    localStorage.setItem("northstar.vault.key.v1", "original-in-localStorage");

    const mockStore = createMockStore();
    // First migration: copies from localStorage
    await migrateLocalStorageSecrets(mockStore);
    expect(await mockStore.get("northstar.vault.key.v1")).toBe(
      "original-in-localStorage",
    );

    // Simulate localStorage changing after the first migration (shouldn't matter)
    localStorage.setItem("northstar.vault.key.v1", "updated-in-localStorage");

    // Second migration: key already in store → not overwritten
    await migrateLocalStorageSecrets(mockStore);
    expect(await mockStore.get("northstar.vault.key.v1")).toBe(
      "original-in-localStorage",
    );
  });

  it("migration does NOT clear localStorage — rollback remains possible", async () => {
    localStorage.setItem("northstar.vault.key.v1", "vault-key-original");
    localStorage.setItem("northstar.device.keypair.v1", "keypair-original");

    const mockStore = createMockStore();
    await migrateLocalStorageSecrets(mockStore);

    // localStorage copies must still be present after migration
    expect(localStorage.getItem("northstar.vault.key.v1")).toBe(
      "vault-key-original",
    );
    expect(localStorage.getItem("northstar.device.keypair.v1")).toBe(
      "keypair-original",
    );
  });

  it("does not write to the store if localStorage is empty", async () => {
    const mockStore = createMockStore();
    const setSpy = vi.spyOn(mockStore, "set");

    await migrateLocalStorageSecrets(mockStore);

    expect(setSpy).not.toHaveBeenCalled();
    expect(mockStore.data.size).toBe(0);
  });

  it("SECRET_KEYS covers all three known keys", () => {
    expect(SECRET_KEYS).toContain("northstar.vault.key.v1");
    expect(SECRET_KEYS).toContain("northstar.device.keypair.v1");
    expect(SECRET_KEYS).toContain("northstar.sync.account.v1");
    expect(SECRET_KEYS).toHaveLength(3);
  });
});
