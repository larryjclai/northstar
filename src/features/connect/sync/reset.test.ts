import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalSyncState, unlinkSync } from "./reset";
import { SECRET_KEYS, getSecretStore, resetSecretStoreForTests } from "../crypto/secretStore";
import {
  generateVaultKey,
  saveVaultKeyVersion,
  setCurrentVaultKeyVersion,
  loadVaultKeyVersion,
  listVaultKeyVersions,
  vaultKeySlot,
} from "../crypto/vault";
import type { FinanceRepository } from "../../../data/repositories";

// Seed values for the localStorage stub: sync identity + recovery flag + every
// SECRET_KEYS entry, so we can assert the reset clears both the SecretStore and
// the localStorage copies. In jsdom the SecretStore falls back to a
// localStorage-backed store, so the SECRET_KEYS live in the same Map.
function seededStore(): Map<string, string> {
  return new Map<string, string>([
    ["northstar.device.v1", "{}"],
    ["northstar.recovery.status.v1", "{}"],
    ...SECRET_KEYS.map((k) => [k, "x"] as [string, string]),
  ]);
}

describe("clearLocalSyncState", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = seededStore();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    resetSecretStoreForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSecretStoreForTests();
  });

  it("wipes financial data, conflicts, the SecretStore, and all sync localStorage keys", async () => {
    const importSnapshot = vi.fn().mockResolvedValue(undefined);
    const clearSyncConflicts = vi.fn().mockResolvedValue(undefined);
    // clearAllData calls getAppSettings then importSnapshot — provide both.
    const repo = {
      getAppSettings: vi.fn().mockResolvedValue({}),
      importSnapshot,
      clearSyncConflicts,
    } as any;

    await clearLocalSyncState(repo);

    expect(importSnapshot).toHaveBeenCalledOnce();
    expect(clearSyncConflicts).toHaveBeenCalledOnce();
    // localStorage copies gone.
    for (const k of ["northstar.device.v1", "northstar.recovery.status.v1", ...SECRET_KEYS]) {
      expect(store.has(k)).toBe(false);
    }
    // And the SecretStore itself is empty for every SECRET_KEYS entry.
    const secretStore = await getSecretStore();
    for (const k of SECRET_KEYS) {
      expect(await secretStore.get(k)).toBeNull();
    }
  });
});

describe("unlinkSync", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = seededStore();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    resetSecretStoreForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSecretStoreForTests();
  });

  it("clears sync identity + the SecretStore but KEEPS financial data (no importSnapshot)", async () => {
    const importSnapshot = vi.fn().mockResolvedValue(undefined);
    const clearSyncConflicts = vi.fn().mockResolvedValue(undefined);
    const requeueAllPendingChanges = vi.fn().mockResolvedValue(undefined);
    const repo = {
      getAppSettings: vi.fn().mockResolvedValue({}),
      importSnapshot,
      clearSyncConflicts,
      requeueAllPendingChanges,
    } as any;

    await unlinkSync(repo);

    // Data wipe (importSnapshot) must NOT run — that's the whole point of unlink.
    expect(importSnapshot).not.toHaveBeenCalled();
    expect(clearSyncConflicts).toHaveBeenCalledOnce();
    // The kept data must be re-queued for push so re-enabling re-uploads it.
    expect(requeueAllPendingChanges).toHaveBeenCalledOnce();
    for (const k of ["northstar.device.v1", "northstar.recovery.status.v1", ...SECRET_KEYS]) {
      expect(store.has(k)).toBe(false);
    }
    const secretStore = await getSecretStore();
    for (const k of SECRET_KEYS) {
      expect(await secretStore.get(k)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Plan 240 — a full local reset wipes EVERY vault key version, not just v1
// (the one static SECRET_KEYS entry). This is the deliberate "start over as
// a brand-new device" path — distinct from the "never delete a key version"
// invariant that governs normal sync/rotation operation.
// ---------------------------------------------------------------------------

describe("clearLocalSyncState wipes every held vault key version (Plan 240)", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    resetSecretStoreForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSecretStoreForTests();
  });

  it("removes v1, v2, v3 slots, the current-version pointer, and the version index", async () => {
    // Seed a device that has lived through two rotations: three versions
    // held locally, current pointer on the newest.
    await saveVaultKeyVersion(1, await generateVaultKey());
    await saveVaultKeyVersion(2, await generateVaultKey());
    await saveVaultKeyVersion(3, await generateVaultKey());
    await setCurrentVaultKeyVersion(3);
    expect(await listVaultKeyVersions()).toEqual([1, 2, 3]);

    const repo = {
      getAppSettings: vi.fn().mockResolvedValue({}),
      importSnapshot: vi.fn().mockResolvedValue(undefined),
      clearSyncConflicts: vi.fn().mockResolvedValue(undefined),
    } as unknown as FinanceRepository;

    await clearLocalSyncState(repo);

    // Every version slot is gone, not just v1.
    expect(await loadVaultKeyVersion(1)).toBeNull();
    expect(await loadVaultKeyVersion(2)).toBeNull();
    expect(await loadVaultKeyVersion(3)).toBeNull();
    // The bookkeeping keys are gone too.
    expect(store.has("northstar.vault.key.current")).toBe(false);
    expect(store.has("northstar.vault.key.versions")).toBe(false);
    for (let v = 1; v <= 3; v++) expect(store.has(vaultKeySlot(v))).toBe(false);
    // A fresh read of the index post-wipe reports no versions held.
    expect(await listVaultKeyVersions()).toEqual([]);
  });

  it("unlinkSync also wipes every held vault key version", async () => {
    await saveVaultKeyVersion(1, await generateVaultKey());
    await saveVaultKeyVersion(2, await generateVaultKey());
    await setCurrentVaultKeyVersion(2);

    const repo = {
      getAppSettings: vi.fn().mockResolvedValue({}),
      importSnapshot: vi.fn().mockResolvedValue(undefined),
      clearSyncConflicts: vi.fn().mockResolvedValue(undefined),
      requeueAllPendingChanges: vi.fn().mockResolvedValue(undefined),
    } as unknown as FinanceRepository;

    await unlinkSync(repo);

    expect(await loadVaultKeyVersion(1)).toBeNull();
    expect(await loadVaultKeyVersion(2)).toBeNull();
    expect(await listVaultKeyVersions()).toEqual([]);
  });
});
