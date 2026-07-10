import { DatabaseSync } from "node:sqlite";
import { describe } from "vitest";
import {
  createMemoryFinanceRepositoryForTests,
  createSqliteFinanceRepositoryForTests,
  type FinanceRepository,
  type RepositoryData,
} from "./repositories";

// Minimal shim of @tauri-apps/plugin-sql's Database over node:sqlite, so the
// real SQLite repository (BEGIN/COMMIT, triggers, recompute) can be exercised
// in unit tests. plugin-sql uses `$1,$2,…` placeholders and *reuses* some
// numbers (e.g. `$6,$6`); node:sqlite treats `$1` as a named parameter, so we
// bind by name to preserve that reuse. Kept identical to the inline shims in
// repositories.sqlite-tx.test.ts / repositories.sync.test.ts.
export function makeSqliteShim() {
  const raw = new DatabaseSync(":memory:");
  function named(values?: unknown[]) {
    const obj: Record<string, unknown> = {};
    (values ?? []).forEach((v, i) => {
      obj[`$${i + 1}`] = v === undefined ? null : v;
    });
    return obj as never;
  }
  return {
    // Resolve on a later microtask to mimic plugin-sql's async round-trip, so
    // concurrently-started operations can interleave at their await points.
    async execute(sql: string, values?: unknown[]) {
      await Promise.resolve();
      if (!values || values.length === 0) {
        raw.exec(sql);
        return { rowsAffected: 0, lastInsertId: 0 };
      }
      const info = raw.prepare(sql).run(named(values));
      return { rowsAffected: Number(info.changes), lastInsertId: Number(info.lastInsertRowid) };
    },
    async select<T>(sql: string, values?: unknown[]): Promise<T> {
      await Promise.resolve();
      return raw.prepare(sql).all(named(values)) as unknown as T;
    },
    async close() {
      raw.close();
      return true;
    },
  } as never;
}

// A factory that produces a fresh, isolated repository seeded with the same
// data a suite would pass to `createMemoryFinanceRepositoryForTests`. Both
// variants return a Promise so callers can `await makeRepo(...)` uniformly.
export type MakeRepo = (seed?: Partial<RepositoryData>) => Promise<FinanceRepository>;

const makeMemoryRepo: MakeRepo = async (seed = {}) => createMemoryFinanceRepositoryForTests(seed);

const makeSqliteRepo: MakeRepo = async (seed = {}) => {
  const repo = await createSqliteFinanceRepositoryForTests(makeSqliteShim());
  if (Object.keys(seed).length > 0) {
    // The SQLite factory has no `loadDataForTests` equivalent, so seed it the
    // same way sync restore does: build a snapshot from a throwaway memory twin
    // (preserving the seed's ids/revisions verbatim) and importSnapshot() it.
    // This exercises SQLite's real insert + recompute path rather than a test
    // back door, and keeps the two repos' starting state identical.
    const twin = createMemoryFinanceRepositoryForTests(seed);
    const snapshot = await twin.exportSnapshot();
    await repo.importSnapshot(snapshot);
  }
  return repo;
};

export type RepoLabel = "memory" | "sqlite";

export const repoFactories = [
  ["memory", makeMemoryRepo],
  ["sqlite", makeSqliteRepo],
] as const satisfies ReadonlyArray<readonly [RepoLabel, MakeRepo]>;

/**
 * Run a suite body once per repository implementation (memory twin + real
 * SQLite). The body receives a `makeRepo(seed?)` factory; call it in each test
 * (or a beforeEach) to get a fresh, isolated repo seeded with the given data.
 * The second arg is the repo label ("memory" | "sqlite"), for the rare test
 * that must pin a known representational divergence between the two repos.
 *
 * Usage:
 *   describeEachRepo("refund", (makeRepo) => {
 *     it("...", async () => {
 *       const repo = await makeRepo({ accounts: [card] });
 *       ...
 *     });
 *   });
 */
export function describeEachRepo(name: string, body: (makeRepo: MakeRepo, repoLabel: RepoLabel) => void) {
  describe.each(repoFactories)(`${name} [%s]`, (label, makeRepo) => body(makeRepo, label));
}
