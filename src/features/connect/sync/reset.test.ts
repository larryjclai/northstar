import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalSyncState } from "./reset";

describe("clearLocalSyncState", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map([
      ["northstar.device.v1", "{}"],
      ["northstar.sync.account.v1", "{}"],
      ["northstar.vault.key.v1", "x"],
      ["northstar.device.keypair.v1", "x"],
      ["northstar.recovery.status.v1", "{}"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("wipes financial data, conflicts, and all sync localStorage keys", async () => {
    const importSnapshot = vi.fn().mockResolvedValue(undefined);
    const clearSyncConflicts = vi.fn().mockResolvedValue(undefined);
    // clearAllData calls getAppSettings then importSnapshot — provide both.
    const repo = { getAppSettings: vi.fn().mockResolvedValue({}), importSnapshot, clearSyncConflicts } as any;

    await clearLocalSyncState(repo);

    expect(importSnapshot).toHaveBeenCalledOnce();
    expect(clearSyncConflicts).toHaveBeenCalledOnce();
    for (const k of ["northstar.device.v1", "northstar.sync.account.v1", "northstar.vault.key.v1", "northstar.device.keypair.v1", "northstar.recovery.status.v1"]) {
      expect(store.has(k)).toBe(false);
    }
  });
});
