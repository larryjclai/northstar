import { describe, expect, it } from "vitest";
import type { SyncConflictRecord, SyncEntity } from "../../../domain/sync";
import { summarizeConflict } from "./conflictSummary";

function conflict(
  overrides: Partial<SyncConflictRecord> & {
    entity?: SyncEntity;
    localPayload: Record<string, unknown>;
    incomingPayload: Record<string, unknown>;
  },
): SyncConflictRecord {
  return {
    id: "conflict_1",
    entity: overrides.entity ?? "account",
    entityId: overrides.entityId ?? "acc_0123456789abcdef",
    revision: overrides.revision ?? 2,
    sourceDeviceId: overrides.sourceDeviceId ?? "device_b",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    resolvedAt: overrides.resolvedAt ?? null,
    localPayload: overrides.localPayload,
    incomingPayload: overrides.incomingPayload,
  };
}

describe("summarizeConflict", () => {
  it("labels the entity, picks a human title, and lists only the differing fields", () => {
    const summary = summarizeConflict(
      conflict({
        entity: "account",
        localPayload: {
          id: "acc_1",
          name: "錢包",
          balance: 1000,
          revision: 2,
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
        incomingPayload: {
          id: "acc_1",
          name: "日常錢包",
          balance: 1200,
          revision: 2,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    );

    expect(summary.entityLabel).toBe("帳戶");
    expect(summary.title).toBe("錢包");
    // Local updatedAt is later → local carries the newer edit.
    expect(summary.newer).toBe("local");
    const byKey = Object.fromEntries(summary.diffs.map((d) => [d.key, d]));
    expect(Object.keys(byKey).sort()).toEqual(["balance", "name"]);
    expect(byKey.name).toMatchObject({ label: "名稱", local: "錢包", incoming: "日常錢包" });
    expect(byKey.balance.label).toBe("餘額");
  });

  it("ignores sync-bookkeeping fields even when they differ", () => {
    const summary = summarizeConflict(
      conflict({
        localPayload: {
          id: "acc_1",
          name: "錢包",
          revision: 2,
          updatedAt: "2026-02-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          userId: "u1",
        },
        incomingPayload: {
          id: "acc_1",
          name: "錢包",
          revision: 5,
          updatedAt: "2026-03-01T00:00:00.000Z",
          createdAt: "2020-01-01T00:00:00.000Z",
          userId: "u2",
        },
      }),
    );

    // id/revision/updatedAt/createdAt/userId are all ignored; nothing else differs.
    expect(summary.diffs).toEqual([]);
    // updatedAt still drives newer even though it isn't shown as a diff.
    expect(summary.newer).toBe("incoming");
  });

  it("reports a tie when both sides share an updatedAt", () => {
    const summary = summarizeConflict(
      conflict({
        localPayload: { id: "x", name: "A", updatedAt: "2026-01-01T00:00:00.000Z" },
        incomingPayload: { id: "x", name: "B", updatedAt: "2026-01-01T00:00:00.000Z" },
      }),
    );
    expect(summary.newer).toBe("tie");
  });

  it("falls back to a truncated id title when no title field is present", () => {
    const summary = summarizeConflict(
      conflict({
        entity: "investment",
        entityId: "inv_abcdef0123456789",
        localPayload: {
          id: "inv_abcdef0123456789",
          quantity: 10,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        incomingPayload: {
          id: "inv_abcdef0123456789",
          quantity: 12,
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    );
    expect(summary.entityLabel).toBe("投資交易");
    expect(summary.title).toBe("投資交易 inv_abcd…");
    expect(summary.diffs.map((d) => d.key)).toEqual(["quantity"]);
  });

  it("prefers ticker for the title when name is absent and formats value types", () => {
    const summary = summarizeConflict(
      conflict({
        entity: "asset",
        localPayload: {
          id: "a1",
          ticker: "2330.TW",
          isActive: true,
          note: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        incomingPayload: {
          id: "a1",
          ticker: "2330.TW",
          isActive: false,
          note: "賣出",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    );
    expect(summary.title).toBe("2330.TW");
    const byKey = Object.fromEntries(summary.diffs.map((d) => [d.key, d]));
    // boolean → 是/否, null → —.
    expect(byKey.isActive).toMatchObject({ local: "是", incoming: "否" });
    expect(byKey.note).toMatchObject({ local: "—", incoming: "賣出" });
  });
});
