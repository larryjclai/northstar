// Pre-pull snapshot backups stored in IndexedDB.
// Before every pull we save the current local state so the user can
// revert if a sync accidentally overwrites good data.
// Max 3 entries are kept (oldest is dropped when a 4th arrives).

import type { RepositorySnapshot } from "../../../data/repositories";

const DB_NAME = "northstar-sync-backups";
const STORE = "snapshots";
const MAX_BACKUPS = 3;

export interface BackupEntry {
  timestamp: string; // ISO — also used as IDB key
  label: string;     // human-readable, e.g. "同步前備份 · 2026-05-31 22:14"
  snapshot: RepositorySnapshot;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "timestamp" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save current snapshot as a pre-pull backup. Drops oldest if > MAX_BACKUPS. */
export async function saveBackup(snapshot: RepositorySnapshot): Promise<void> {
  const db = await openDB();
  const now = new Date();
  const label = `同步前備份 · ${now.toLocaleDateString("zh-Hant")} ${now.toLocaleTimeString("zh-Hant", { hour: "2-digit", minute: "2-digit" })}`;
  const entry: BackupEntry = { timestamp: now.toISOString(), label, snapshot };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Prune oldest entries to keep only MAX_BACKUPS
  const all = await listBackups();
  if (all.length > MAX_BACKUPS) {
    const toDelete = all.slice(MAX_BACKUPS); // sorted newest-first, so tail is oldest
    const tx2 = db.transaction(STORE, "readwrite");
    const store2 = tx2.objectStore(STORE);
    toDelete.forEach((e) => store2.delete(e.timestamp));
    await new Promise<void>((res) => { tx2.oncomplete = () => res(); });
  }
}

/** List all backups, newest first. */
export async function listBackups(): Promise<BackupEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () =>
      resolve(
        (req.result as BackupEntry[]).sort(
          (a, b) => b.timestamp.localeCompare(a.timestamp),
        ),
      );
    req.onerror = () => reject(req.error);
  });
}

/** Restore a specific backup into the repository. */
export async function restoreBackup(
  timestamp: string,
  repo: import("../../../data/repositories").FinanceRepository,
): Promise<void> {
  const db = await openDB();
  const entry = await new Promise<BackupEntry | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(timestamp);
    req.onsuccess = () => resolve(req.result as BackupEntry | undefined);
    req.onerror = () => reject(req.error);
  });
  if (!entry) throw new Error("備份不存在");
  await repo.importSnapshot(entry.snapshot);
}
