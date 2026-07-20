import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryFinanceRepositoryForTests } from "../../../data/repositories";
import type { Account } from "../../../domain/types";
import { pullAndApply } from "./pull";
import { pullEnvelopes } from "./client";
import { loadVaultKeyVersion } from "../crypto/vault";

vi.mock("./client", () => ({
  pullEnvelopes: vi.fn(),
  // getSyncAuthToken (via account.ts) reads the device secret from the store;
  // provisionDeviceCredential is imported by account.ts but unused on this path.
  provisionDeviceCredential: vi.fn(),
}));

vi.mock("../crypto/vault", () => ({
  loadVaultKey: vi.fn(async () => ({})),
  // Plan 240: per-version key lookup. Defaults to returning a (fake, truthy)
  // key for ANY version so pre-existing tests (which never set an explicit
  // keyVersion, defaulting to 1) keep decrypting exactly as before; version-
  // specific tests override this per-call with mockImplementation.
  loadVaultKeyVersion: vi.fn(async () => ({})),
  decryptPayload: vi.fn(async (_key: unknown, payload: string) => JSON.parse(payload)),
}));

const mockedPullEnvelopes = vi.mocked(pullEnvelopes);
const mockedLoadVaultKeyVersion = vi.mocked(loadVaultKeyVersion);

async function createAccount(repo: ReturnType<typeof createMemoryFinanceRepositoryForTests>, name: string) {
  await repo.createAccount({
    name,
    currency: "TWD",
    openingBalance: 0,
    type: "cash",
    creditLimit: null,
    creditLimitGroup: "",
    statementDay: null,
    paymentDueDay: null,
    creditPaymentPaidUntil: null,
    isSharedToHousehold: false,
    loanStartDate: null,
    annualInterestRate: null,
    loanTerm: null,
    iconName: null,
    color: null,
  });
}

function envelope(payload: Account, deviceId = "device_b", keyVersion = 1) {
  return {
    id: `env_${payload.id}_${payload.revision}`,
    deviceId,
    entity: "account",
    entityId: payload.id,
    revision: payload.revision,
    encryptedPayload: JSON.stringify(payload),
    updatedAt: payload.updatedAt,
    keyVersion,
  };
}

describe("pullAndApply", () => {
  beforeEach(() => {
    mockedPullEnvelopes.mockReset();
    mockedLoadVaultKeyVersion.mockReset();
    // Default: every version resolves to a (fake, truthy) key, matching the
    // pre-Plan-240 behaviour where every envelope always decrypted. Tests
    // that need to simulate "this device doesn't hold version N" override
    // this per-test.
    mockedLoadVaultKeyVersion.mockImplementation(async () => ({}) as never);
    // getSyncAuthToken → loadDeviceSecret touches the SecretStore, which falls
    // back to localStorage off-device. jsdom has no localStorage, so stub it
    // (empty → no device secret → token falls back to the account secret).
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("applies only the changed record and preserves unrelated local rows", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    await createAccount(repo, "備用金");
    const [first] = await repo.listAccounts();
    const incoming = {
      ...first,
      name: "日常錢包",
      revision: first.revision + 1,
      updatedAt: "2099-01-02T00:00:00.000Z",
    };
    mockedPullEnvelopes.mockResolvedValue({ envelopes: [envelope(incoming)], nextCursor: "1", count: 1 });

    const result = await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(result.applied).toBe(1);
    expect((await repo.listAccounts()).map((account) => account.name).sort()).toEqual(["備用金", "日常錢包"]);
  });

  it("applies a complete tombstone and keeps it available for later sync", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    const [account] = await repo.listAccounts();
    const deletedAt = "2099-01-02T00:00:00.000Z";
    const tombstone = { ...account, revision: account.revision + 1, updatedAt: deletedAt, deletedAt };
    mockedPullEnvelopes.mockResolvedValue({ envelopes: [envelope(tombstone)], nextCursor: "2", count: 1 });

    await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(await repo.listAccounts()).toHaveLength(0);
    expect(await repo.getSyncPayload("account", account.id)).toMatchObject({ deletedAt, revision: 2 });
  });

  it("records an equal-revision divergence for later inspection", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    const [account] = await repo.listAccounts();
    const incoming = { ...account, name: "遠端錢包" };
    mockedPullEnvelopes.mockResolvedValue({ envelopes: [envelope(incoming)], nextCursor: "3", count: 1 });

    const result = await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(result.applied).toBe(0);
    expect(await repo.listSyncConflicts()).toHaveLength(1);
    expect((await repo.listSyncConflicts())[0]).toMatchObject({
      entity: "account",
      entityId: account.id,
      sourceDeviceId: "device_b",
    });

    await repo.resolveSyncConflict((await repo.listSyncConflicts())[0].id, "keepLocal");

    expect(await repo.listSyncConflicts()).toMatchObject([{ resolvedAt: expect.any(String) }]);
    expect(await repo.getSyncPayload("account", account.id)).toMatchObject({ name: "錢包", revision: 2 });
  });

  it("skips an undecryptable envelope and still applies the rest of the page", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    await createAccount(repo, "備用金");
    const [first, second] = await repo.listAccounts();
    const good = { ...second, name: "日常錢包", revision: second.revision + 1, updatedAt: "2099-01-02T00:00:00.000Z" };
    // A poison envelope (invalid ciphertext → decrypt throws) must NOT abort the
    // page: the cursor would otherwise pin here forever and the device would
    // never sync anything past it.
    const poison = { ...envelope(first), id: "env_poison", encryptedPayload: "{not-json" };
    mockedPullEnvelopes.mockResolvedValue({ envelopes: [poison, envelope(good)], nextCursor: "9", count: 2 });

    const result = await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.nextCursor).toBe("9");
    expect((await repo.listAccounts()).map((a) => a.name).sort()).toEqual(["日常錢包", "錢包"]);
  });

  it("does NOT record a conflict when the only difference is key order or a derived field", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    const [account] = await repo.listAccounts();
    // Same revision + same updatedAt. Reorder keys and change ONLY the derived
    // `balance` (recomputed per-device, not a user edit). This must not surface
    // as a conflict — it was the cause of every-account-conflicts floods.
    const accountRecord = account as unknown as Record<string, unknown>;
    const reordered: Record<string, unknown> = {};
    for (const k of Object.keys(accountRecord).reverse()) reordered[k] = accountRecord[k];
    const incoming = { ...reordered, balance: Number(accountRecord.balance ?? 0) + 9999 } as unknown as Account;
    mockedPullEnvelopes.mockResolvedValue({ envelopes: [envelope(incoming)], nextCursor: "5", count: 1 });

    const result = await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(result.applied).toBe(0);
    expect(await repo.listSyncConflicts()).toHaveLength(0);
  });

  it("auto-resolves an equal-revision divergence by newer updatedAt without a conflict", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    const [account] = await repo.listAccounts();
    // Same revision, different content, but the incoming edit is newer →
    // last-write-wins applies it silently, no conflict to triage.
    const incoming = { ...account, name: "遠端錢包", updatedAt: "2099-12-31T00:00:00.000Z" };
    mockedPullEnvelopes.mockResolvedValue({ envelopes: [envelope(incoming)], nextCursor: "4", count: 1 });

    const result = await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(result.applied).toBe(1);
    expect(await repo.listSyncConflicts()).toHaveLength(0);
    expect(await repo.getSyncPayload("account", account.id)).toMatchObject({ name: "遠端錢包" });
  });

  // ---------------------------------------------------------------------
  // Plan 240 — key-version selection + differentiated skip reasons
  // ---------------------------------------------------------------------

  it("selects the matching locally-held key version per envelope before decrypting", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    const [account] = await repo.listAccounts();
    const incoming = { ...account, name: "v2 錢包", revision: account.revision + 1, updatedAt: "2099-01-02T00:00:00.000Z" };
    // This device holds version 2 (not just the default version 1).
    mockedLoadVaultKeyVersion.mockImplementation(async (v: number) => (v === 2 ? ({} as never) : null));
    mockedPullEnvelopes.mockResolvedValue({ envelopes: [envelope(incoming, "device_b", 2)], nextCursor: "10", count: 1 });

    const result = await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(mockedLoadVaultKeyVersion).toHaveBeenCalledWith(2);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
    expect(await repo.getSyncPayload("account", account.id)).toMatchObject({ name: "v2 錢包" });
  });

  it("an envelope stamped with a key version this device does not hold is skipped with reason unknown-key-version, distinct from a corrupt payload", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    await createAccount(repo, "備用金");
    const [first, second] = await repo.listAccounts();
    // Envelope A: stamped version 5, which this device has never held (a
    // rotation it hasn't picked up yet — NOT corruption).
    mockedLoadVaultKeyVersion.mockImplementation(async (v: number) => (v === 1 ? ({} as never) : null));
    const futureVersion = envelope({ ...first, revision: first.revision + 1, updatedAt: "2099-01-01T00:00:00.000Z" }, "device_b", 5);
    // Envelope B: version 1 (a key this device DOES hold), but the ciphertext
    // itself is malformed — genuine corruption.
    const corrupt = { ...envelope(second, "device_b", 1), id: "env_corrupt", encryptedPayload: "{not-json" };
    mockedPullEnvelopes.mockResolvedValue({ envelopes: [futureVersion, corrupt], nextCursor: "11", count: 2 });

    const result = await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(result.skipped).toBe(2);
    expect(result.skippedDetails).toHaveLength(2);
    const details = result.skippedDetails!;
    const reasons = details.map((d) => d.reason).sort();
    expect(reasons).toEqual(["decrypt-failed", "unknown-key-version"]);
    // The two reasons must be genuinely distinguishable, not just labels —
    // confirm which envelope got which.
    const byEntityId = new Map(details.map((d) => [d.entityId, d.reason]));
    expect(byEntityId.get(first.id)).toBe("unknown-key-version");
    expect(byEntityId.get(second.id)).toBe("decrypt-failed");
  });

  it("loads each distinct key version referenced in a page only once, not once per envelope", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "A");
    await createAccount(repo, "B");
    await createAccount(repo, "C");
    const [a, b, c] = await repo.listAccounts();
    const bump = (acc: Account, name: string) => ({ ...acc, name, revision: acc.revision + 1, updatedAt: "2099-01-03T00:00:00.000Z" });
    mockedPullEnvelopes.mockResolvedValue({
      envelopes: [
        envelope(bump(a, "A2"), "device_b", 1),
        envelope(bump(b, "B2"), "device_b", 1),
        envelope(bump(c, "C2"), "device_b", 1),
      ],
      nextCursor: "12",
      count: 3,
    });

    const result = await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(result.applied).toBe(3);
    // Three envelopes, all version 1 → exactly one loadVaultKeyVersion(1) call.
    expect(mockedLoadVaultKeyVersion).toHaveBeenCalledTimes(1);
    expect(mockedLoadVaultKeyVersion).toHaveBeenCalledWith(1);
  });

  it("a pre-upgrade envelope with no keyVersion field at all defaults to version 1", async () => {
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    const [account] = await repo.listAccounts();
    const incoming = { ...account, name: "舊格式", revision: account.revision + 1, updatedAt: "2099-01-04T00:00:00.000Z" };
    const legacyEnvelope = envelope(incoming) as Record<string, unknown>;
    delete legacyEnvelope.keyVersion; // simulate a relay row from before this column existed on the wire
    mockedPullEnvelopes.mockResolvedValue({ envelopes: [legacyEnvelope as never], nextCursor: "13", count: 1 });

    const result = await pullAndApply(repo, { userId: "u", apiSecret: "s" }, "", "device_a");

    expect(mockedLoadVaultKeyVersion).toHaveBeenCalledWith(1);
    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(0);
  });
});
