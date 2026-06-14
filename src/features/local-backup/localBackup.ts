// Unified local backup layer for scheduled + manual full-database backups.
//
// Roadmap 5.1. Two storage backends behind one API:
//
//  • Desktop (Tauri): writes real `.json` files under {appLocalData}/backups/ so
//    the user can find and copy them in Finder, and they survive even if the
//    app's embedded SQLite store is lost — that's the disaster-recovery value of
//    a *local* backup.
//  • Browser: there is no filesystem, so it falls back to IndexedDB (same shape
//    as the sync pre-backup in features/connect/sync/backup.ts).
//
// Retention (scheduled backups only): keep the newest backup per day for the 7
// most recent days, plus the newest per ISO-week for the 4 most recent weeks —
// at most 11 files regardless of how often the app launches. Manual backups are
// never auto-pruned; the user deletes those.

import type { FinanceRepository, RepositorySnapshot } from "../../data/repositories";

export type LocalBackupKind = "scheduled" | "manual";

export interface LocalBackupEntry {
  id: string; // filename on desktop / IDB key — embeds kind + epoch, sortable
  timestamp: string; // ISO
  label: string; // human-readable, e.g. "自動備份 · 2026-06-14 09:30"
  kind: LocalBackupKind;
}

const BACKUP_DIR = "backups";
const FILE_RE = /^northstar-(scheduled|manual)-(\d+)\.json$/;

const KEEP_DAILY = 7;
const KEEP_WEEKLY = 4;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function fileName(kind: LocalBackupKind, epochMs: number): string {
  return `northstar-${kind}-${epochMs}.json`;
}

function parseEntry(name: string): LocalBackupEntry | null {
  const m = FILE_RE.exec(name);
  if (!m) return null;
  const kind = m[1] as LocalBackupKind;
  const epochMs = Number(m[2]);
  if (!Number.isFinite(epochMs)) return null;
  const ts = new Date(epochMs);
  return { id: name, timestamp: ts.toISOString(), label: labelFor(kind, ts), kind };
}

function labelFor(kind: LocalBackupKind, d: Date): string {
  const date = d.toLocaleDateString("zh-Hant");
  const time = d.toLocaleTimeString("zh-Hant", { hour: "2-digit", minute: "2-digit" });
  return `${kind === "scheduled" ? "自動備份" : "手動備份"} · ${date} ${time}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${week}`;
}

// ── Storage backend ─────────────────────────────────────────────────────────

interface BackupStore {
  put(entry: LocalBackupEntry, snapshot: RepositorySnapshot): Promise<void>;
  list(): Promise<LocalBackupEntry[]>; // newest first
  read(id: string): Promise<RepositorySnapshot | null>;
  remove(id: string): Promise<void>;
}

// Desktop: real JSON files under {appLocalData}/backups/.
function createFsStore(): BackupStore {
  let fsPromise: Promise<typeof import("@tauri-apps/plugin-fs")> | null = null;
  const fs = () => (fsPromise ??= import("@tauri-apps/plugin-fs"));

  async function ensureDir(): Promise<void> {
    const { mkdir, exists, BaseDirectory } = await fs();
    if (!(await exists(BACKUP_DIR, { baseDir: BaseDirectory.AppLocalData }))) {
      await mkdir(BACKUP_DIR, { baseDir: BaseDirectory.AppLocalData, recursive: true });
    }
  }

  return {
    async put(entry, snapshot) {
      const { writeTextFile, BaseDirectory } = await fs();
      await ensureDir();
      await writeTextFile(`${BACKUP_DIR}/${entry.id}`, JSON.stringify(snapshot), {
        baseDir: BaseDirectory.AppLocalData,
      });
    },
    async list() {
      const { readDir, exists, BaseDirectory } = await fs();
      if (!(await exists(BACKUP_DIR, { baseDir: BaseDirectory.AppLocalData }))) return [];
      const dir = await readDir(BACKUP_DIR, { baseDir: BaseDirectory.AppLocalData });
      return dir
        .filter((e) => e.isFile)
        .map((e) => parseEntry(e.name))
        .filter((e): e is LocalBackupEntry => e != null)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    },
    async read(id) {
      const { readTextFile, BaseDirectory } = await fs();
      try {
        const text = await readTextFile(`${BACKUP_DIR}/${id}`, { baseDir: BaseDirectory.AppLocalData });
        return JSON.parse(text) as RepositorySnapshot;
      } catch {
        return null;
      }
    },
    async remove(id) {
      const { remove, BaseDirectory } = await fs();
      await remove(`${BACKUP_DIR}/${id}`, { baseDir: BaseDirectory.AppLocalData });
    },
  };
}

// Browser: IndexedDB. One record per backup: { ...meta, snapshot }.
function createIdbStore(): BackupStore {
  const DB_NAME = "northstar-local-backups";
  const STORE = "backups";

  function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  type Row = LocalBackupEntry & { snapshot: RepositorySnapshot };

  return {
    async put(entry, snapshot) {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ ...entry, snapshot } satisfies Row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async list() {
      const db = await openDB();
      return new Promise<LocalBackupEntry[]>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () =>
          resolve(
            (req.result as Row[])
              .map(({ snapshot: _snapshot, ...meta }) => meta)
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
          );
        req.onerror = () => reject(req.error);
      });
    },
    async read(id) {
      const db = await openDB();
      return new Promise<RepositorySnapshot | null>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => resolve((req.result as Row | undefined)?.snapshot ?? null);
        req.onerror = () => reject(req.error);
      });
    },
    async remove(id) {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
}

let storeInstance: BackupStore | null = null;
function store(): BackupStore {
  return (storeInstance ??= isTauriRuntime() ? createFsStore() : createIdbStore());
}

// ── Retention ───────────────────────────────────────────────────────────────

// Given scheduled entries newest-first, return the ids to keep: newest per day
// for the 7 most recent days ∪ newest per ISO-week for the 4 most recent weeks.
function selectRetained(scheduled: LocalBackupEntry[]): Set<string> {
  const keep = new Set<string>();

  const newestPerDay = new Map<string, string>();
  for (const e of scheduled) {
    const k = dayKey(new Date(e.timestamp));
    if (!newestPerDay.has(k)) newestPerDay.set(k, e.id); // first seen = newest
  }
  for (const id of [...newestPerDay.values()].slice(0, KEEP_DAILY)) keep.add(id);

  const newestPerWeek = new Map<string, string>();
  for (const e of scheduled) {
    const k = isoWeekKey(new Date(e.timestamp));
    if (!newestPerWeek.has(k)) newestPerWeek.set(k, e.id);
  }
  for (const id of [...newestPerWeek.values()].slice(0, KEEP_WEEKLY)) keep.add(id);

  return keep;
}

async function pruneScheduled(): Promise<void> {
  const all = await store().list();
  const scheduled = all.filter((e) => e.kind === "scheduled");
  const keep = selectRetained(scheduled);
  for (const e of scheduled) {
    if (!keep.has(e.id)) {
      try {
        await store().remove(e.id);
      } catch {
        /* best-effort prune */
      }
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

function isEmptySnapshot(s: RepositorySnapshot): boolean {
  return (
    s.accounts.length === 0 &&
    s.ledgerTransactions.length === 0 &&
    s.investmentRecords.length === 0 &&
    s.portfolioAssets.length === 0
  );
}

async function createBackup(repo: FinanceRepository, kind: LocalBackupKind): Promise<LocalBackupEntry> {
  const snapshot = await repo.exportSnapshot();
  const now = Date.now();
  const entry: LocalBackupEntry = {
    id: fileName(kind, now),
    timestamp: new Date(now).toISOString(),
    label: labelFor(kind, new Date(now)),
    kind,
  };
  await store().put(entry, snapshot);
  return entry;
}

/**
 * Create today's scheduled backup if one doesn't exist yet (once per calendar
 * day). No-op for an empty database. Prunes old scheduled backups afterwards.
 * Returns the new entry, or null if skipped. Caller must skip during demo mode.
 */
export async function runDailyBackupIfDue(repo: FinanceRepository): Promise<LocalBackupEntry | null> {
  const today = dayKey(new Date());
  const existing = await store().list();
  const hasToday = existing.some((e) => e.kind === "scheduled" && dayKey(new Date(e.timestamp)) === today);
  if (hasToday) return null;

  const snapshot = await repo.exportSnapshot();
  if (isEmptySnapshot(snapshot)) return null;

  const now = Date.now();
  const entry: LocalBackupEntry = {
    id: fileName("scheduled", now),
    timestamp: new Date(now).toISOString(),
    label: labelFor("scheduled", new Date(now)),
    kind: "scheduled",
  };
  await store().put(entry, snapshot);
  await pruneScheduled();
  return entry;
}

/** Create a backup right now from the "立即備份" button. */
export async function createManualBackup(repo: FinanceRepository): Promise<LocalBackupEntry> {
  return createBackup(repo, "manual");
}

/** All local backups, newest first. */
export async function listLocalBackups(): Promise<LocalBackupEntry[]> {
  return store().list();
}

/** Restore a specific backup into the repository (overwrites current data). */
export async function restoreLocalBackup(id: string, repo: FinanceRepository): Promise<void> {
  const snapshot = await store().read(id);
  if (!snapshot) throw new Error("備份不存在或已損毀");
  await repo.importSnapshot(snapshot);
}

/** Delete a specific backup. */
export async function deleteLocalBackup(id: string): Promise<void> {
  await store().remove(id);
}

/** Where backups are stored, for a UI hint. */
export function localBackupLocation(): "filesystem" | "browser" {
  return isTauriRuntime() ? "filesystem" : "browser";
}
