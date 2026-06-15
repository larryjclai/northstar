import { SYNC_SCHEMA_VERSION, type DeviceIdentity } from "../domain/sync";

// Device identity is intentionally device-local (it is NOT part of the synced
// vault), so it lives in localStorage rather than the repository/backup.

const STORAGE_KEY = "northstar.device.v1";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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
