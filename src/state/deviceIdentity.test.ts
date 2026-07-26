import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// In-memory fs fake for @tauri-apps/plugin-fs
let fileStore: Map<string, string>;
const mockWriteTextFile = vi.fn(async (path: string, data: string, _opts?: unknown) => {
  fileStore.set(path, data);
});
const mockReadTextFile = vi.fn(async (path: string, _opts?: unknown) => {
  const content = fileStore.get(path);
  if (content === undefined) throw new Error("file not found");
  return content;
});
const mockExists = vi.fn(async (path: string, _opts?: unknown) => {
  return fileStore.has(path);
});

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: (...args: unknown[]) =>
    mockWriteTextFile(args[0] as string, args[1] as string, args[2]),
  readTextFile: (...args: unknown[]) => mockReadTextFile(args[0] as string, args[1]),
  exists: (...args: unknown[]) => mockExists(args[0] as string, args[1]),
  BaseDirectory: { AppLocalData: 26 },
}));

// Must import AFTER vi.mock so the module picks up our fake.
import {
  getOrCreateDeviceIdentity,
  hydrateDeviceIdentity,
  setRemotePullCursor,
} from "./deviceIdentity";

describe("deviceIdentity file mirror", () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    fileStore = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    // Enable Tauri detection
    vi.stubGlobal("__TAURI_INTERNALS__", {});
    mockWriteTextFile.mockClear();
    mockReadTextFile.mockClear();
    mockExists.mockClear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("mirrors identity to file on write", async () => {
    // First call mints a new identity and writes it
    const identity = getOrCreateDeviceIdentity();
    expect(identity.deviceId).toBeTruthy();

    // Mirror is fire-and-forget — flush microtask queue
    await vi.waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalled();
    });

    // writeTextFile(path, data, options) — data is the second argument
    const writtenJson = mockWriteTextFile.mock.calls[0][1];
    const written = JSON.parse(writtenJson) as { deviceId: string };
    expect(written.deviceId).toBe(identity.deviceId);

    // Also verify that setRemotePullCursor triggers another mirror
    mockWriteTextFile.mockClear();
    setRemotePullCursor("c1");
    await vi.waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalled();
    });
    const cursorJson = mockWriteTextFile.mock.calls[0][1];
    const cursorWritten = JSON.parse(cursorJson) as { remotePullCursor: string };
    expect(cursorWritten.remotePullCursor).toBe("c1");
  });

  it("hydrate restores identity after localStorage eviction", async () => {
    // Simulate a previously-mirrored identity in the file
    const persisted = JSON.stringify({
      deviceId: "dev_persisted",
      createdAt: "2026-01-01T00:00:00.000Z",
      schemaVersion: 1,
      localPushCursor: "lp1",
      remotePullCursor: "rp1",
    });
    fileStore.set("device-identity.json", persisted);

    // localStorage is empty (evicted)
    expect(store.size).toBe(0);

    await hydrateDeviceIdentity();

    // After hydration, getOrCreateDeviceIdentity should return the file-persisted identity
    const identity = getOrCreateDeviceIdentity();
    expect(identity.deviceId).toBe("dev_persisted");
    expect(identity.localPushCursor).toBe("lp1");
    expect(identity.remotePullCursor).toBe("rp1");
  });

  it("hydrate keeps existing localStorage identity and refreshes file mirror", async () => {
    // Pre-populate localStorage with an identity
    const existing = {
      deviceId: "dev_existing",
      createdAt: "2026-02-01T00:00:00.000Z",
      schemaVersion: 1,
      localPushCursor: null,
      remotePullCursor: null,
    };
    store.set("northstar.device.v1", JSON.stringify(existing));
    mockWriteTextFile.mockClear();

    await hydrateDeviceIdentity();

    // Identity should be unchanged
    const identity = getOrCreateDeviceIdentity();
    expect(identity.deviceId).toBe("dev_existing");

    // File mirror should have been refreshed
    await vi.waitFor(() => {
      expect(mockWriteTextFile).toHaveBeenCalled();
    });
    // writeTextFile(path, data, options) — data is the second argument
    const writtenJson = mockWriteTextFile.mock.calls[0][1];
    const written = JSON.parse(writtenJson) as { deviceId: string };
    expect(written.deviceId).toBe("dev_existing");
  });

  it("browser no-op: hydrateDeviceIdentity resolves without fs when not in Tauri", async () => {
    // Remove Tauri marker
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    mockWriteTextFile.mockClear();
    mockReadTextFile.mockClear();
    mockExists.mockClear();

    await hydrateDeviceIdentity();

    // fs should never be called
    expect(mockWriteTextFile).not.toHaveBeenCalled();
    expect(mockReadTextFile).not.toHaveBeenCalled();
    expect(mockExists).not.toHaveBeenCalled();

    // getOrCreateDeviceIdentity still works via localStorage only
    const identity = getOrCreateDeviceIdentity();
    expect(identity.deviceId).toBeTruthy();
  });
});
