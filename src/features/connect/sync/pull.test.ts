import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryFinanceRepositoryForTests } from "../../../data/repositories";
import type { Account } from "../../../domain/types";
import { pullAndApply } from "./pull";
import { pullEnvelopes } from "./client";

vi.mock("./client", () => ({
  pullEnvelopes: vi.fn(),
}));

vi.mock("../crypto/vault", () => ({
  loadVaultKey: vi.fn(async () => ({})),
  decryptPayload: vi.fn(async (_key: unknown, payload: string) => JSON.parse(payload)),
}));

const mockedPullEnvelopes = vi.mocked(pullEnvelopes);

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

function envelope(payload: Account, deviceId = "device_b") {
  return {
    id: `env_${payload.id}_${payload.revision}`,
    deviceId,
    entity: "account",
    entityId: payload.id,
    revision: payload.revision,
    encryptedPayload: JSON.stringify(payload),
    updatedAt: payload.updatedAt,
  };
}

describe("pullAndApply", () => {
  beforeEach(() => {
    mockedPullEnvelopes.mockReset();
  });

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
});
