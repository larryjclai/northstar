// Connect Sync — preparation layer.
//
// We don't push to a server yet, but every record already carries SyncFields
// (id, revision, createdAt, updatedAt, deletedAt). That lets us derive the set
// of changes since a cursor without maintaining a separate write-ahead outbox:
// the "pending changes" feed below is what a future push step will serialize,
// encrypt, and send. Soft-deletes (deletedAt set + updatedAt bumped) flow
// through naturally as deletions.

/** Current local schema version — bumped when the persisted shape changes. */
export const SYNC_SCHEMA_VERSION = 1;

export interface DeviceIdentity {
  deviceId: string;
  createdAt: string;
  schemaVersion: number;
  /** updatedAt of the last change successfully pushed; null = never synced. */
  lastSyncCursor: string | null;
}

export type SyncEntity =
  | "account"
  | "ledger"
  | "asset"
  | "investment"
  | "recurring"
  | "goal";

export interface PendingChange {
  entity: SyncEntity;
  entityId: string;
  revision: number;
  updatedAt: string;
  deleted: boolean;
}

export interface PendingChangeSet {
  changes: PendingChange[];
  /** Pass this back as the cursor next time once these changes are pushed. */
  nextCursor: string | null;
  count: number;
}

export interface SyncSourceRecord {
  id: string;
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SyncSource {
  accounts: SyncSourceRecord[];
  ledgerTransactions: SyncSourceRecord[];
  portfolioAssets: SyncSourceRecord[];
  investmentRecords: SyncSourceRecord[];
  recurringTransactions: SyncSourceRecord[];
  financialGoals?: SyncSourceRecord[];
}

const ENTITY_BY_KEY: Record<keyof SyncSource, SyncEntity> = {
  accounts: "account",
  ledgerTransactions: "ledger",
  portfolioAssets: "asset",
  investmentRecords: "investment",
  recurringTransactions: "recurring",
  financialGoals: "goal",
};

/**
 * Every record changed strictly after `sinceCursor` (an ISO updatedAt string),
 * across all sync-tracked entities, ordered oldest-first. `nextCursor` is the
 * newest updatedAt seen (or the input cursor if nothing changed).
 */
export function buildPendingChanges(source: SyncSource, sinceCursor: string | null): PendingChangeSet {
  const since = sinceCursor ?? "";
  const changes: PendingChange[] = [];

  (Object.keys(ENTITY_BY_KEY) as (keyof SyncSource)[]).forEach((key) => {
    const rows = source[key] ?? [];
    for (const row of rows) {
      if (row.updatedAt > since) {
        changes.push({
          entity: ENTITY_BY_KEY[key],
          entityId: row.id,
          revision: row.revision,
          updatedAt: row.updatedAt,
          deleted: row.deletedAt !== null,
        });
      }
    }
  });

  changes.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const nextCursor = changes.length ? changes[changes.length - 1].updatedAt : sinceCursor;
  return { changes, nextCursor, count: changes.length };
}
