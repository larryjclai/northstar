// Pull encrypted envelopes from the sync worker, decrypt, and apply to the
// local repository using a last-write-wins merge keyed on (entity, id, revision).
//
// Merge strategy:
//   - For each remote record, if remote.revision > local.revision → use remote
//   - Soft-deletes (deletedAt set) always propagate when revision wins
//   - Settings, market quotes, FX rates are NOT touched (not sync-tracked)

import type {
  Account, LedgerTransaction, PortfolioAsset,
  InvestmentRecord, RecurringTransaction, FinancialGoal,
} from "../../../domain/types";
import type { SyncFields } from "../../../domain/types";
import { loadVaultKey, decryptPayload } from "../crypto/vault";
import { pullEnvelopes, type EnvelopeRecord } from "./client";
import type { SyncAccount } from "./account";
import type { FinanceRepository } from "../../../data/repositories";

export interface SyncPullResult {
  pulled: number;
  applied: number;
  nextCursor: string;
}

type MergeMap<T extends SyncFields> = Map<string, T>;

function mergeRecord<T extends SyncFields>(map: MergeMap<T>, incoming: T): boolean {
  const existing = map.get(incoming.id);
  if (!existing || incoming.revision > existing.revision) {
    map.set(incoming.id, incoming);
    return true;
  }
  return false;
}

/**
 * Pull and apply all envelopes since `cursor` from the device's own perspective.
 * Skips envelopes that originated from this device (already applied locally).
 */
export async function pullAndApply(
  repo: FinanceRepository,
  account: SyncAccount,
  cursor: string,
  deviceId: string,
): Promise<SyncPullResult> {
  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("Vault key not initialised.");

  const result = await pullEnvelopes(account.apiSecret, cursor);
  const foreign = result.envelopes.filter((e: EnvelopeRecord) => e.deviceId !== deviceId);

  if (foreign.length === 0) {
    return { pulled: 0, applied: 0, nextCursor: result.nextCursor };
  }

  // Decrypt all foreign envelopes in parallel.
  // Use allSettled so a single bad envelope doesn't abort the entire batch.
  const settled = await Promise.allSettled(
    foreign.map((e) => decryptPayload(vaultKey, e.encryptedPayload)),
  );
  const decrypted = settled.map((r, i) => {
    if (r.status === "rejected") {
      console.warn("[sync] failed to decrypt envelope", foreign[i].id, r.reason);
      return null;
    }
    return r.value;
  });

  // Load the current local snapshot to build merge maps.
  const snapshot = await repo.exportSnapshot();

  const accounts: MergeMap<Account> = new Map(snapshot.accounts.map((r) => [r.id, r]));
  const ledger: MergeMap<LedgerTransaction> = new Map(snapshot.ledgerTransactions.map((r) => [r.id, r]));
  const assets: MergeMap<PortfolioAsset> = new Map(snapshot.portfolioAssets.map((r) => [r.id, r]));
  const investments: MergeMap<InvestmentRecord> = new Map(snapshot.investmentRecords.map((r) => [r.id, r]));
  const recurring: MergeMap<RecurringTransaction> = new Map(snapshot.recurringTransactions.map((r) => [r.id, r]));
  const goals: MergeMap<FinancialGoal> = new Map((snapshot.financialGoals ?? []).map((r) => [r.id, r]));

  let applied = 0;
  for (let i = 0; i < foreign.length; i++) {
    const envelope = foreign[i];
    const raw = decrypted[i];
    if (!raw) continue; // decryption failed, already warned
    const payload = raw as SyncFields & Record<string, unknown>;
    if (!payload?.id) continue;

    let changed = false;
    const p = payload as unknown;
    switch (envelope.entity) {
      case "account":    changed = mergeRecord(accounts, p as Account); break;
      case "ledger":     changed = mergeRecord(ledger, p as LedgerTransaction); break;
      case "asset":      changed = mergeRecord(assets, p as PortfolioAsset); break;
      case "investment": changed = mergeRecord(investments, p as InvestmentRecord); break;
      case "recurring":  changed = mergeRecord(recurring, p as RecurringTransaction); break;
      case "goal":       changed = mergeRecord(goals, p as FinancialGoal); break;
    }
    if (changed) applied++;
  }

  if (applied > 0) {
    // Import the merged snapshot, preserving non-sync-tracked data.
    await repo.importSnapshot({
      ...snapshot,
      accounts: Array.from(accounts.values()),
      ledgerTransactions: Array.from(ledger.values()),
      portfolioAssets: Array.from(assets.values()),
      investmentRecords: Array.from(investments.values()),
      recurringTransactions: Array.from(recurring.values()),
      financialGoals: Array.from(goals.values()),
    });
  }

  return { pulled: foreign.length, applied, nextCursor: result.nextCursor };
}
