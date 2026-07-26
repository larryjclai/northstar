import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveBackup, listBackups, readBackupSnapshot, restoreBackup } from "./backup";
import type { RepositorySnapshot, FinanceRepository } from "../../../data/repositories";

// jsdom has no IndexedDB, so the backup store (which persists snapshots in IDB)
// is exercised against a minimal in-memory fake that supports exactly the API
// backup.ts uses: open (with onupgradeneeded), readonly/readwrite transactions,
// and objectStore get/getAll/add/delete keyed by keyPath.
function installFakeIndexedDB() {
  const stores = new Map<string, Map<string, unknown>>();
  const keyPaths = new Map<string, string>();
  let dbCreated = false;

  function schedule(fn: () => void) {
    setTimeout(fn, 0);
  }

  class FakeObjectStore {
    constructor(private name: string) {}
    private map() {
      return stores.get(this.name)!;
    }
    getAll() {
      const req: {
        result?: unknown;
        error?: unknown;
        onsuccess?: () => void;
        onerror?: () => void;
      } = {};
      schedule(() => {
        req.result = [...this.map().values()];
        req.onsuccess?.();
      });
      return req;
    }
    get(key: string) {
      const req: {
        result?: unknown;
        error?: unknown;
        onsuccess?: () => void;
        onerror?: () => void;
      } = {};
      schedule(() => {
        req.result = this.map().get(key);
        req.onsuccess?.();
      });
      return req;
    }
    add(value: Record<string, unknown>) {
      const kp = keyPaths.get(this.name)!;
      this.map().set(value[kp] as string, value);
      return {};
    }
    delete(key: string) {
      this.map().delete(key);
      return {};
    }
  }

  class FakeTransaction {
    oncomplete: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      // Fire completion after the synchronous op statements + handler assignment.
      schedule(() => this.oncomplete?.());
    }
    objectStore(name: string) {
      return new FakeObjectStore(name);
    }
  }

  class FakeDB {
    createObjectStore(name: string, opts: { keyPath: string }) {
      stores.set(name, new Map());
      keyPaths.set(name, opts.keyPath);
      return new FakeObjectStore(name);
    }
    transaction() {
      return new FakeTransaction();
    }
  }

  const db = new FakeDB();

  const fake = {
    open() {
      const req: {
        result?: unknown;
        error?: unknown;
        onsuccess?: () => void;
        onerror?: () => void;
        onupgradeneeded?: () => void;
      } = {};
      schedule(() => {
        req.result = db;
        if (!dbCreated) {
          dbCreated = true;
          req.onupgradeneeded?.();
        }
        req.onsuccess?.();
      });
      return req;
    },
  };

  vi.stubGlobal("indexedDB", fake);
}

function snapshot(exportedAt: string, accounts: number): RepositorySnapshot {
  return {
    exportedAt,
    accounts: Array.from({ length: accounts }, (_, i) => ({ id: `a${i}` })),
  } as unknown as RepositorySnapshot;
}

describe("sync backup store", () => {
  beforeEach(() => {
    installFakeIndexedDB();
  });

  it("readBackupSnapshot returns the stored snapshot for a known timestamp", async () => {
    await saveBackup(snapshot("2026-01-01T00:00:00.000Z", 3));
    const entries = await listBackups();
    expect(entries).toHaveLength(1);

    const snap = await readBackupSnapshot(entries[0].timestamp);
    expect(snap).not.toBeNull();
    expect(snap?.accounts).toHaveLength(3);
  });

  it("readBackupSnapshot returns null for an unknown timestamp", async () => {
    const snap = await readBackupSnapshot("1999-01-01T00:00:00.000Z");
    expect(snap).toBeNull();
  });

  it("restoreBackup still applies the stored snapshot", async () => {
    await saveBackup(snapshot("2026-02-02T00:00:00.000Z", 5));
    const entries = await listBackups();
    const importSnapshot = vi.fn(async (_snap: RepositorySnapshot) => {});
    const repo = { importSnapshot } as unknown as FinanceRepository;

    await restoreBackup(entries[0].timestamp, repo);
    expect(importSnapshot).toHaveBeenCalledTimes(1);
    const applied = importSnapshot.mock.calls[0][0];
    expect(applied.accounts).toHaveLength(5);
  });

  it("restoreBackup throws for a missing backup", async () => {
    const repo = { importSnapshot: vi.fn(async () => {}) } as unknown as FinanceRepository;
    await expect(restoreBackup("nope", repo)).rejects.toThrow("備份不存在");
  });
});
