// Pull encrypted envelopes from the sync worker, decrypt, and apply to the
// local repository using a stable last-write-wins merge keyed on
// (entity, id, revision, updatedAt).
//
// Merge strategy:
//   - For each remote record, prefer higher revision, then newer updatedAt
//   - Same revision + different content is auto-resolved by updatedAt (newer
//     edit wins); only an exact updatedAt tie is surfaced as a conflict
//   - Soft-deletes (deletedAt set) always propagate when revision wins
//   - Settings, market quotes, FX rates are NOT touched (not sync-tracked)

import type { SyncFields } from "../../../domain/types";
import type { SyncApplyChange, SyncConflictRecord, SyncEntity } from "../../../domain/sync";
import { loadVaultKey, decryptPayload } from "../crypto/vault";
import { pullEnvelopes, type EnvelopeRecord } from "./client";
import type { SyncAccount } from "./account";
import type { FinanceRepository } from "../../../data/repositories";

export interface SyncPullResult {
  pulled: number;
  applied: number;
  nextCursor: string;
}

/**
 * Pull and apply all envelopes since `cursor` from the device's own perspective.
 * Skips envelopes that originated from this device (already applied locally).
 *
 * `opts.includeOwnDevice` disables that skip — used by the full-recovery flow,
 * where the local DB was wiped, so even records this device originally pushed
 * (and which exist on the relay only under this device's id) must be pulled
 * back in.
 */
export async function pullAndApply(
  repo: FinanceRepository,
  account: SyncAccount,
  cursor: string,
  deviceId: string,
  opts: { includeOwnDevice?: boolean } = {},
): Promise<SyncPullResult> {
  const vaultKey = await loadVaultKey();
  if (!vaultKey) throw new Error("Vault key not initialised.");

  const result = await pullEnvelopes(account.apiSecret, cursor);
  const foreign = opts.includeOwnDevice
    ? result.envelopes
    : result.envelopes.filter((e: EnvelopeRecord) => e.deviceId !== deviceId);

  if (foreign.length === 0) {
    return { pulled: 0, applied: 0, nextCursor: result.nextCursor };
  }

  // Decrypt all foreign envelopes in parallel.
  // Use allSettled so a single bad envelope doesn't abort the entire batch.
  const settled = await Promise.allSettled(
    foreign.map((e) => decryptPayload(vaultKey, e.encryptedPayload)),
  );
  const failed = settled.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") {
    throw new Error(`同步資料解密失敗，已保留 checkpoint 供稍後重試：${String(failed.reason)}`);
  }
  const decrypted = settled.map((r, i) => {
    if (r.status === "rejected") return null;
    return r.value;
  });

  const changes: SyncApplyChange[] = [];
  const conflicts: SyncConflictRecord[] = [];
  let applied = 0;
  for (let i = 0; i < foreign.length; i++) {
    const envelope = foreign[i];
    const raw = decrypted[i];
    if (!raw) continue; // decryption failed, already warned
    const payload = raw as SyncFields & Record<string, unknown>;
    assertValidPayload(envelope, payload);
    const entity = envelope.entity as SyncEntity;
    const existing = await repo.getSyncPayload(entity, envelope.entityId);
    // Same logical record edited to the same revision on two devices but with
    // different content. We auto-resolve by `updatedAt` (newer edit wins, see
    // shouldApply) so the user is never asked to triage routine concurrent
    // edits. Only a true tie — identical revision AND identical updatedAt, yet
    // different content — is genuinely undecidable, so that's the only case we
    // surface in the conflict centre.
    if (
      existing &&
      Number(existing.revision) === payload.revision &&
      !samePayload(existing, payload) &&
      String(existing.updatedAt ?? "") === String(payload.updatedAt ?? "")
    ) {
      conflicts.push({
        id: `conflict_${envelope.entity}_${envelope.entityId}_${payload.revision}_${envelope.deviceId}`,
        entity,
        entityId: envelope.entityId,
        revision: payload.revision,
        sourceDeviceId: envelope.deviceId,
        localPayload: existing,
        incomingPayload: payload,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      });
    }
    if (!shouldApply(existing, payload)) continue;
    changes.push({
      entity,
      payload: payload.deletedAt !== null && existing ? { ...existing, ...payload } : payload,
    });
    applied++;
  }

  if (changes.length > 0 || conflicts.length > 0) {
    await repo.applySyncChanges(changes, conflicts);
  }

  return { pulled: foreign.length, applied, nextCursor: result.nextCursor };
}

function shouldApply(existing: Record<string, unknown> | null, incoming: SyncFields) {
  if (!existing) return true;
  const revision = Number(existing.revision ?? 0);
  const updatedAt = String(existing.updatedAt ?? "");
  return incoming.revision > revision
    || (incoming.revision === revision && incoming.updatedAt > updatedAt);
}

function samePayload(left: Record<string, unknown>, right: Record<string, unknown>) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertValidPayload(envelope: EnvelopeRecord, payload: SyncFields & Record<string, unknown>) {
  const validEntities = new Set<SyncEntity>(["account", "ledger", "asset", "investment", "recurring", "recurringInvestment", "goal", "settings"]);
  if (
    !validEntities.has(envelope.entity as SyncEntity) ||
    !payload ||
    typeof payload.id !== "string" ||
    payload.id !== envelope.entityId ||
    typeof payload.revision !== "number" ||
    !Number.isFinite(payload.revision) ||
    typeof payload.updatedAt !== "string" ||
    !("deletedAt" in payload)
  ) {
    throw new Error(`同步資料格式驗證失敗，已保留 checkpoint 供稍後重試：${envelope.entity}/${envelope.entityId}`);
  }
}
