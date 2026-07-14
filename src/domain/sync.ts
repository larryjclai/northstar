// Connect Sync primitives shared by the browser fallback and the SQLite app.
// Browser storage derives pending rows from timestamps. SQLite overrides that
// feed with a transactional outbox so offline writes cannot be skipped.

/** Current local schema version — bumped when the persisted shape changes. */
export const SYNC_SCHEMA_VERSION = 1;

export interface DeviceIdentity {
  deviceId: string;
  createdAt: string;
  schemaVersion: number;
  /** Local updatedAt watermark for changes successfully pushed by this device. */
  localPushCursor: string | null;
  /** Relay sequence watermark for envelopes successfully pulled by this device. */
  remotePullCursor: string | null;
}

export type SyncEntity =
  | "account"
  | "ledger"
  | "asset"
  | "investment"
  | "recurring"
  | "recurringInvestment"
  | "goal"
  | "book"
  | "invoice"
  | "client"
  | "settings";

export interface PendingChange {
  /** Present for SQLite outbox rows. Browser timestamp feeds leave it unset. */
  outboxId?: string;
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

export interface SyncApplyChange {
  entity: SyncEntity;
  payload: Record<string, unknown>;
}

export interface SyncConflictRecord {
  id: string;
  entity: SyncEntity;
  entityId: string;
  revision: number;
  sourceDeviceId: string;
  localPayload: Record<string, unknown>;
  incomingPayload: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
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
  recurringInvestments?: SyncSourceRecord[];
  financialGoals?: SyncSourceRecord[];
  books?: SyncSourceRecord[];
  invoices?: SyncSourceRecord[];
  clients?: SyncSourceRecord[];
  appSettings?: SyncSourceRecord[];
}

const ENTITY_BY_KEY: Record<keyof SyncSource, SyncEntity> = {
  accounts: "account",
  ledgerTransactions: "ledger",
  portfolioAssets: "asset",
  investmentRecords: "investment",
  recurringTransactions: "recurring",
  recurringInvestments: "recurringInvestment",
  financialGoals: "goal",
  books: "book",
  invoices: "invoice",
  clients: "client",
  appSettings: "settings",
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
