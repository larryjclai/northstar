// Pre-pull snapshot backups stored in IndexedDB.
// Before every pull we save the current local state so the user can
// revert if a sync accidentally overwrites good data.
//
// Retention policy: at most one backup per calendar day, for up to 30 days.
// A 5-minute dedup window prevents rapid-fire syncs from creating many
// nearly-identical entries with the same human-readable timestamp label.

import type { RepositorySnapshot } from "../../../data/repositories";

const DB_NAME = "northstar-sync-backups";
const STORE = "snapshots";
const MAX_DAYS = 30;
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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

/**
 * Save current snapshot as a pre-pull backup.
 *
 * Skipped if a backup was already made within the last 5 minutes (rapid-fire
 * syncs create duplicate entries that look identical to the user). After
 * inserting, prunes to keep the newest entry per calendar day for up to 30
 * days — so storage stays bounded regardless of how often sync runs.
 */
export async function saveBackup(snapshot: RepositorySnapshot): Promise<void> {
  const db = await openDB();

  // Dedup: skip if there's already a backup within DEDUP_WINDOW_MS
  const existing = await listBackups();
  if (existing.length > 0) {
    const latestMs = Date.parse(existing[0].timestamp);
    if (!isNaN(latestMs) && Date.now() - latestMs < DEDUP_WINDOW_MS) return;
  }

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

  // Prune: keep one entry per calendar day for up to MAX_DAYS days.
  // Within a day, keep the newest entry (most useful for rollback).
  const all = await listBackups(); // sorted newest-first

  const byDay = new Map<string, BackupEntry>();
  for (const e of all) {
    const day = e.timestamp.slice(0, 10); // "YYYY-MM-DD"
    if (!byDay.has(day)) byDay.set(day, e); // first seen = newest per day
  }

  const keep = [...byDay.values()]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_DAYS);
  const keepSet = new Set(keep.map((e) => e.timestamp));
  const toDelete = all.filter((e) => !keepSet.has(e.timestamp));

  if (toDelete.length > 0) {
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
