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
import { loadVaultKey, loadVaultKeyVersion, decryptPayload } from "../crypto/vault";
import { pullEnvelopes, type EnvelopeRecord } from "./client";
import { getSyncAuthToken, type SyncAccount } from "./account";
import type { FinanceRepository } from "../../../data/repositories";

/**
 * Why an envelope was skipped (Plan 240 §4 — the spike's flagged unknown: the
 * skip path used to be one undifferentiated bucket). Phase D's UI reads this
 * to message the two cases differently — this phase only produces the
 * signal, it does not render anything.
 *
 *  - "unknown-key-version": this device does not (yet) hold the vault key
 *    version this envelope was encrypted under. NOT corruption — it means a
 *    rotation happened that this device hasn't picked up yet (Phase C's
 *    fetchKeyEnvelopes polling); it resolves itself once the device syncs
 *    again after receiving that key, no action needed here.
 *  - "decrypt-failed": this device DOES hold the matching key version, but
 *    decryption still threw (bad IV, truncated ciphertext, wrong key somehow)
 *    — genuinely malformed/corrupt, will not self-heal by waiting.
 *  - "invalid-payload": decrypted successfully but the JSON shape failed
 *    validation (bad entity, missing id/revision/updatedAt, id mismatch).
 */
export type SkipReason = "unknown-key-version" | "decrypt-failed" | "invalid-payload";

export interface SkippedEnvelope {
  entity: string;
  entityId: string;
  reason: SkipReason;
}

export interface SyncPullResult {
  pulled: number;
  applied: number;
  /** Envelopes skipped because they failed to decrypt or validate. */
  skipped: number;
  /**
   * Per-envelope skip reasons, same length as `skipped` — see SkipReason.
   * Typed optional (rather than required) so out-of-scope call sites that
   * construct a SyncPullResult-shaped mock without it (e.g.
   * sync-manager.test.ts) keep compiling unchanged; pullAndApply itself
   * always populates it.
   */
  skippedDetails?: SkippedEnvelope[];
  nextCursor: string;
}

/** Envelope.keyVersion, defensively normalised — never trust the wire fully even though the relay's column is NOT NULL DEFAULT 1. */
function envelopeKeyVersion(e: EnvelopeRecord): number {
  return Number.isInteger(e.keyVersion) && e.keyVersion >= 1 ? e.keyVersion : 1;
}

/** Thrown internally to distinguish "no matching key" from "decrypt threw" inside Promise.allSettled. */
class UnknownKeyVersionError extends Error {
  constructor(readonly version: number) {
    super(`No locally-held vault key for version ${version}`);
  }
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

  const result = await pullEnvelopes(await getSyncAuthToken(account), cursor);
  const foreign = opts.includeOwnDevice
    ? result.envelopes
    : result.envelopes.filter((e: EnvelopeRecord) => e.deviceId !== deviceId);

  if (foreign.length === 0) {
    return { pulled: 0, applied: 0, skipped: 0, skippedDetails: [], nextCursor: result.nextCursor };
  }

  // Select the matching vault key VERSION per envelope before decrypting
  // (Plan 240 §3: "pull reads it and selects the matching locally-held key
  // before decryptPayload"). Load each distinct version referenced in this
  // page once (not once per envelope) and cache it; a version this device
  // doesn't hold resolves to null, which the loop below treats as the
  // distinct "unknown-key-version" skip reason rather than attempting (and
  // failing) a decrypt.
  const versionsInPage = new Set(foreign.map(envelopeKeyVersion));
  const keyByVersion = new Map<number, CryptoKey | null>();
  await Promise.all(
    Array.from(versionsInPage).map(async (v) => {
      keyByVersion.set(v, await loadVaultKeyVersion(v));
    }),
  );

  // Decrypt all foreign envelopes in parallel.
  // Use allSettled so a single bad envelope doesn't abort the entire batch.
  //
  // A single undecryptable / malformed envelope must NOT block the whole device:
  // the pull cursor only advances after a page returns, so throwing here would
  // pin the cursor at this page forever and the device would re-fail on the same
  // poison row on every sync (it would receive every record before that
  // relay_sequence and nothing after). We instead skip the bad envelope, count
  // it, and let the cursor move past it — a later revision of that same record
  // (pushed again) will heal it. See SyncPullResult.skipped.
  // NOTE: the mapper below MUST be `async` even though it has no other
  // `await` before the throw — a synchronous throw inside a plain (non-async)
  // Array.map callback escapes immediately and aborts the WHOLE
  // Promise.allSettled call (and thus the whole page), which is exactly the
  // failure mode this function exists to prevent. Wrapping in `async` turns
  // that throw into a per-element rejection that allSettled correctly
  // isolates.
  const settled = await Promise.allSettled(
    foreign.map(async (e) => {
      const version = envelopeKeyVersion(e);
      const key = keyByVersion.get(version) ?? null;
      if (!key) throw new UnknownKeyVersionError(version);
      return decryptPayload(key, e.encryptedPayload);
    }),
  );
  const decrypted = settled.map((r) => (r.status === "rejected" ? null : r.value));
  const decryptSkipReasons: (SkipReason | null)[] = settled.map((r) =>
    r.status === "rejected"
      ? (r.reason instanceof UnknownKeyVersionError ? "unknown-key-version" : "decrypt-failed")
      : null,
  );

  // Prefetch every local record this page might merge against, one batched query
  // per entity, instead of a getSyncPayload SELECT per envelope (an N+1 that made
  // initial sync thousands of serialized round-trips). The loop below reads only
  // from this map; applySyncChanges still runs once at the end, so each lookup
  // sees the same pre-page local state getSyncPayload would have returned.
  const idsByEntity = new Map<SyncEntity, string[]>();
  for (const e of foreign) {
    const entity = e.entity as SyncEntity;
    if (!VALID_ENTITIES.has(entity)) continue; // bad entity → skipped in the loop
    const list = idsByEntity.get(entity);
    if (list) list.push(e.entityId);
    else idsByEntity.set(entity, [e.entityId]);
  }
  const existingByKey = new Map<string, Record<string, unknown>>();
  for (const [entity, ids] of idsByEntity) {
    const payloads = await repo.getSyncPayloads(entity, ids);
    for (const [id, payload] of payloads) existingByKey.set(`${entity}:${id}`, payload);
  }

  const changes: SyncApplyChange[] = [];
  const conflicts: SyncConflictRecord[] = [];
  const skippedDetails: SkippedEnvelope[] = [];
  let applied = 0;
  let skipped = 0;
  for (let i = 0; i < foreign.length; i++) {
    const envelope = foreign[i];
    const raw = decrypted[i];
    if (!raw) {
      skipped++;
      const reason = decryptSkipReasons[i] ?? "decrypt-failed";
      skippedDetails.push({ entity: envelope.entity, entityId: envelope.entityId, reason });
      if (reason === "unknown-key-version") {
        console.warn(
          `同步：略過 envelope ${envelope.entity}/${envelope.entityId}（rev ${envelope.revision}）— 尚未取得金鑰版本 ${envelopeKeyVersion(envelope)}，下次同步取得金鑰後將自動解決。`,
        );
      } else {
        console.warn(
          `同步：略過無法解密的 envelope ${envelope.entity}/${envelope.entityId}（rev ${envelope.revision}），繼續同步其餘資料。`,
        );
      }
      continue;
    }
    const payload = raw as SyncFields & Record<string, unknown>;
    if (!isValidPayload(envelope, payload)) {
      skipped++;
      skippedDetails.push({ entity: envelope.entity, entityId: envelope.entityId, reason: "invalid-payload" });
      console.warn(
        `同步：略過格式不符的 envelope ${envelope.entity}/${envelope.entityId}（rev ${envelope.revision}），繼續同步其餘資料。`,
      );
      continue;
    }
    const entity = envelope.entity as SyncEntity;
    const existing = existingByKey.get(`${entity}:${envelope.entityId}`) ?? null;
    // Same logical record edited to the same revision on two devices but with
    // different content. We auto-resolve by `updatedAt` (newer edit wins, see
    // shouldApply) so the user is never asked to triage routine concurrent
    // edits. Only a true tie — identical revision AND identical updatedAt, yet
    // different MEANINGFUL content — is genuinely undecidable, so that's the
    // only case we surface in the conflict centre.
    if (
      existing &&
      Number(existing.revision) === payload.revision &&
      !samePayload(entity, existing, payload) &&
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

  return { pulled: foreign.length, applied, skipped, skippedDetails, nextCursor: result.nextCursor };
}

function shouldApply(existing: Record<string, unknown> | null, incoming: SyncFields) {
  if (!existing) return true;
  const revision = Number(existing.revision ?? 0);
  const updatedAt = String(existing.updatedAt ?? "");
  return incoming.revision > revision
    || (incoming.revision === revision && incoming.updatedAt > updatedAt);
}

// Per-device DERIVED fields: recomputed locally from other records (account
// balance from its ledger; asset quantity/cost from its investment records;
// localized name caches from quotes). They legitimately differ between devices
// at the SAME revision/updatedAt because each device recomputes them from its
// own (possibly mid-sync) data, and they are NOT bumped on recompute. Including
// them in the tie comparison flagged every account/asset as a bogus conflict.
const DERIVED_FIELDS: Partial<Record<SyncEntity, readonly string[]>> = {
  account: ["balance"],
  asset: ["totalQuantity", "averageCost", "nameZh", "nameEn"],
};

/**
 * Order-independent, derived-field-insensitive equality for conflict detection.
 *
 * `JSON.stringify` equality is key-ORDER sensitive — two devices that serialize
 * the same record with different key order produced different strings and thus a
 * phantom "兩版同時間" conflict for logically-identical records (the bulk of a
 * post-full-resync conflict flood). We canonicalize by sorting keys and dropping
 * per-device derived fields so only genuine differences in user-meaningful
 * fields surface.
 */
function samePayload(entity: SyncEntity, left: Record<string, unknown>, right: Record<string, unknown>) {
  return canonical(entity, left) === canonical(entity, right);
}

function canonical(entity: SyncEntity, obj: Record<string, unknown>): string {
  const drop = new Set(DERIVED_FIELDS[entity] ?? []);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    if (!drop.has(key)) sorted[key] = obj[key];
  }
  return JSON.stringify(sorted);
}

const VALID_ENTITIES = new Set<SyncEntity>(["account", "ledger", "asset", "investment", "recurring", "recurringInvestment", "goal", "book", "invoice", "client", "settings"]);

function isValidPayload(envelope: EnvelopeRecord, payload: SyncFields & Record<string, unknown>): boolean {
  return (
    VALID_ENTITIES.has(envelope.entity as SyncEntity) &&
    !!payload &&
    typeof payload.id === "string" &&
    payload.id === envelope.entityId &&
    typeof payload.revision === "number" &&
    Number.isFinite(payload.revision) &&
    typeof payload.updatedAt === "string" &&
    "deletedAt" in payload
  );
}
