import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOrCreateDeviceIdentity,
  setLocalPushCursor,
  setRemotePullCursor,
  resetSyncCursors,
} from "../../../state/deviceIdentity";

describe("resetSyncCursors", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("nulls both cursors but keeps the device id", () => {
    const before = getOrCreateDeviceIdentity();
    setLocalPushCursor("abc");
    setRemotePullCursor("99");
    resetSyncCursors();
    const after = getOrCreateDeviceIdentity();
    expect(after.deviceId).toBe(before.deviceId);
    expect(after.localPushCursor).toBeNull();
    expect(after.remotePullCursor).toBeNull();
  });
});
