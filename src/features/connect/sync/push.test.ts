import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryFinanceRepositoryForTests } from "../../../data/repositories";
import { resetSecretStoreForTests } from "../crypto/secretStore";
import { pushEnvelopes } from "./client";
import { encryptPayload } from "../crypto/vault";
import { getOrCreateDeviceIdentity, setLocalPushCursor } from "../../../state/deviceIdentity";
import { pushPendingChanges } from "./push";

// Transport + crypto are faked; the repo is the real in-memory one so the
// pending-change collection (settings + created rows) is exercised for real.
vi.mock("./client", () => ({
  pushEnvelopes: vi.fn(async () => {}),
  // account.ts imports this; unused on the push path (device secret absent).
  provisionDeviceCredential: vi.fn(),
}));
vi.mock("../crypto/vault", () => ({
  loadVaultKey: vi.fn(async () => ({})),
  // The encryption boundary: return the plaintext record so tests can assert
  // exactly what got serialised into each envelope.
  encryptPayload: vi.fn(async (_key: unknown, payload: unknown) => JSON.stringify(payload)),
}));
vi.mock("../../../state/deviceIdentity", () => ({
  getOrCreateDeviceIdentity: vi.fn(),
  setLocalPushCursor: vi.fn(),
}));

const mockedPushEnvelopes = vi.mocked(pushEnvelopes);
const mockedEncrypt = vi.mocked(encryptPayload);
const mockedGetDevice = vi.mocked(getOrCreateDeviceIdentity);
const mockedSetPushCursor = vi.mocked(setLocalPushCursor);

const account = { userId: "u1", apiSecret: "acct-secret" };

function device(localPushCursor: string | null) {
  return {
    deviceId: "device_a",
    createdAt: "2020-01-01T00:00:00.000Z",
    schemaVersion: 1,
    localPushCursor,
    remotePullCursor: null,
  };
}

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

beforeEach(() => {
  vi.clearAllMocks();
  mockedPushEnvelopes.mockResolvedValue(undefined);
  mockedEncrypt.mockImplementation(async (_key, payload) => JSON.stringify(payload));
  // getSyncAuthToken → loadDeviceSecret touches the SecretStore, which falls back
  // to localStorage off-device. jsdom has none, so stub it (empty → account secret).
  const mem = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  });
  resetSecretStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSecretStoreForTests();
});

describe("pushPendingChanges", () => {
  it("turns pending records into full-payload envelopes and advances the push cursor", async () => {
    mockedGetDevice.mockReturnValue(device(null));
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");
    await createAccount(repo, "備用金");

    const result = await pushPendingChanges(repo, account);

    // Two accounts + the always-present app_settings row.
    expect(result.pushed).toBe(3);
    expect(mockedPushEnvelopes).toHaveBeenCalledTimes(1);
    const [authToken, envelopes] = mockedPushEnvelopes.mock.calls[0];
    // No device credential provisioned → legacy account secret is the auth token.
    expect(authToken).toBe(account.apiSecret);
    expect(envelopes).toHaveLength(3);
    expect(envelopes.every((e) => e.deviceId === "device_a")).toBe(true);

    // Every envelope carries the full serialised record (the encryption boundary
    // received the same object we can read back from getSyncPayload).
    const accountEnvelopes = envelopes.filter((e) => e.entity === "account");
    expect(accountEnvelopes).toHaveLength(2);
    for (const env of accountEnvelopes) {
      const stored = await repo.getSyncPayload("account", env.entityId);
      expect(stored).toBeTruthy();
      // revision is stamped from the pending change, matching the stored record.
      expect(env.revision).toBe(Number(stored!.revision));
      expect(JSON.parse(env.encryptedPayload)).toMatchObject({ id: env.entityId });
    }

    // Cursor advanced to the newest updatedAt seen.
    expect(mockedSetPushCursor).toHaveBeenCalledTimes(1);
    expect(mockedSetPushCursor).toHaveBeenCalledWith(expect.any(String));
  });

  it("is a no-op when nothing has changed since the push cursor", async () => {
    // Cursor far in the future → every row's updatedAt is <= cursor → empty set.
    mockedGetDevice.mockReturnValue(device("2999-12-31T00:00:00.000Z"));
    const repo = createMemoryFinanceRepositoryForTests();
    await createAccount(repo, "錢包");

    const result = await pushPendingChanges(repo, account);

    expect(result).toEqual({ pushed: 0, nextCursor: "2999-12-31T00:00:00.000Z" });
    expect(mockedPushEnvelopes).not.toHaveBeenCalled();
    expect(mockedSetPushCursor).not.toHaveBeenCalled();
  });

  it("throws when the vault key is not initialised", async () => {
    const { loadVaultKey } = await import("../crypto/vault");
    vi.mocked(loadVaultKey).mockResolvedValueOnce(null as never);
    mockedGetDevice.mockReturnValue(device(null));
    const repo = createMemoryFinanceRepositoryForTests();
    await expect(pushPendingChanges(repo, account)).rejects.toThrow("Vault key not initialised");
  });
});
