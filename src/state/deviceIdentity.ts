import { SYNC_SCHEMA_VERSION, type DeviceIdentity } from "../domain/sync";

// Device identity is intentionally device-local (it is NOT part of the synced
// vault), so it lives in localStorage rather than the repository/backup.

const STORAGE_KEY = "northstar.device.v1";

// Durable file mirror — survives iOS localStorage eviction.
const IDENTITY_FILE = "device-identity.json";

let fsPromise: Promise<typeof import("@tauri-apps/plugin-fs")> | null = null;
const fs = () => (fsPromise ??= import("@tauri-apps/plugin-fs"));

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Best-effort write of the identity to a durable file in AppLocalData. */
async function mirrorToFile(identity: DeviceIdentity): Promise<void> {
  if (!isTauri()) return;
  try {
    const { writeTextFile, BaseDirectory } = await fs();
    await writeTextFile(IDENTITY_FILE, JSON.stringify(identity), {
      baseDir: BaseDirectory.AppLocalData,
    });
  } catch {
    // best-effort — never throw
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for webviews without randomUUID (non-secure contexts):
  // getRandomValues is available everywhere we run (browsers, Tauri WebView, jsdom, Node).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `dev_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function read(): DeviceIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeviceIdentity>;
    if (!parsed.deviceId) return null;
    return {
      deviceId: parsed.deviceId,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      schemaVersion: typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : SYNC_SCHEMA_VERSION,
      localPushCursor: parsed.localPushCursor ?? (parsed as { lastSyncCursor?: string | null }).lastSyncCursor ?? null,
      remotePullCursor: parsed.remotePullCursor ?? null,
    };
  } catch {
    return null;
  }
}

function write(identity: DeviceIdentity) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // ignore quota / private mode
  }
  void mirrorToFile(identity);
}

/** Returns the persisted device identity, creating one on first use. */
export function getOrCreateDeviceIdentity(): DeviceIdentity {
  const existing = read();
  if (existing) return existing;
  const created: DeviceIdentity = {
    deviceId: uuid(),
    createdAt: new Date().toISOString(),
    schemaVersion: SYNC_SCHEMA_VERSION,
    localPushCursor: null,
    remotePullCursor: null,
  };
  write(created);
  return created;
}

/** Records the local updatedAt watermark of the last successfully-pushed change. */
export function setLocalPushCursor(cursor: string | null): DeviceIdentity {
  const identity = getOrCreateDeviceIdentity();
  const next = { ...identity, localPushCursor: cursor };
  write(next);
  return next;
}

/** Records the relay sequence watermark of the last successfully-applied pull. */
export function setRemotePullCursor(cursor: string | null): DeviceIdentity {
  const identity = getOrCreateDeviceIdentity();
  const next = { ...identity, remotePullCursor: cursor };
  write(next);
  return next;
}

/** Reset both sync watermarks so the next sync re-pushes/re-pulls from scratch. */
export function resetSyncCursors(): DeviceIdentity {
  setLocalPushCursor(null);
  return setRemotePullCursor(null);
}

/**
 * Restore the device identity from the durable file mirror when localStorage has
 * been evicted. Call ONCE at app boot, before anything reads the identity.
 * Best-effort and Tauri-only; a no-op in the browser and in tests without a mocked fs.
 */
export async function hydrateDeviceIdentity(): Promise<void> {
  if (!isTauri()) return;
  try {
    const existing = read();
    if (existing) {
      void mirrorToFile(existing);
      return;
    }
    const { readTextFile, exists, BaseDirectory } = await fs();
    if (!(await exists(IDENTITY_FILE, { baseDir: BaseDirectory.AppLocalData })))
      return;
    const text = await readTextFile(IDENTITY_FILE, {
      baseDir: BaseDirectory.AppLocalData,
    });
    const parsed = JSON.parse(text) as Partial<DeviceIdentity>;
    if (parsed && parsed.deviceId) write(parsed as DeviceIdentity);
  } catch {
    // best-effort; on failure the app falls back to minting a fresh identity
  }
}
