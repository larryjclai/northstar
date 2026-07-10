import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinanceRepository } from "../../../data/repositories";
import { runSync, forceFullRepush, isSyncRunning, RECOVERY_KIT_REQUIRED } from "./sync-manager";
import { loadSyncAccount, ensureDeviceCredential } from "./account";
import { loadVaultKey } from "../crypto/vault";
import { isRecoveryKitConfirmed } from "../crypto/recovery-kit";
import { pushPendingChanges } from "./push";
import { pullAndApply } from "./pull";
import { saveBackup } from "./backup";
import {
  getOrCreateDeviceIdentity,
  setRemotePullCursor,
  setLocalPushCursor,
} from "../../../state/deviceIdentity";

// The orchestrator wires together account/vault/push/pull/backup/deviceIdentity.
// We fake every collaborator so these tests exercise ONLY the coordinator logic:
// the recovery-kit gate, the push→pull ordering, the pull loop + cursor advance,
// the module-level mutex, and error propagation.
vi.mock("./account", () => ({
  loadSyncAccount: vi.fn(),
  ensureDeviceCredential: vi.fn(async () => {}),
}));
vi.mock("../crypto/vault", () => ({ loadVaultKey: vi.fn() }));
vi.mock("../crypto/recovery-kit", () => ({ isRecoveryKitConfirmed: vi.fn() }));
vi.mock("./push", () => ({ pushPendingChanges: vi.fn() }));
vi.mock("./pull", () => ({ pullAndApply: vi.fn() }));
vi.mock("./backup", () => ({ saveBackup: vi.fn(async () => {}) }));
vi.mock("../../../state/deviceIdentity", () => ({
  getOrCreateDeviceIdentity: vi.fn(),
  setRemotePullCursor: vi.fn(),
  setLocalPushCursor: vi.fn(),
  resetSyncCursors: vi.fn(),
}));

const mockedLoadAccount = vi.mocked(loadSyncAccount);
const mockedEnsureCred = vi.mocked(ensureDeviceCredential);
const mockedLoadVault = vi.mocked(loadVaultKey);
const mockedRecoveryKit = vi.mocked(isRecoveryKitConfirmed);
const mockedPush = vi.mocked(pushPendingChanges);
const mockedPull = vi.mocked(pullAndApply);
const mockedSaveBackup = vi.mocked(saveBackup);
const mockedGetDevice = vi.mocked(getOrCreateDeviceIdentity);
const mockedSetPullCursor = vi.mocked(setRemotePullCursor);
const mockedSetPushCursor = vi.mocked(setLocalPushCursor);

const account = { userId: "u1", apiSecret: "acct-secret" };

// A minimal repo — only exportSnapshot (pre-pull backup) and
// requeueAllPendingChanges (forceFullRepush) are reached; the rest is mocked.
function fakeRepo() {
  return {
    exportSnapshot: vi.fn(async () => ({}) as never),
    requeueAllPendingChanges: vi.fn(async () => {}),
  } as unknown as FinanceRepository;
}

function device(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: "device_a",
    createdAt: "2020-01-01T00:00:00.000Z",
    schemaVersion: 1,
    localPushCursor: null,
    remotePullCursor: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedLoadAccount.mockResolvedValue(account);
  mockedLoadVault.mockResolvedValue({} as never);
  mockedRecoveryKit.mockReturnValue(true);
  mockedGetDevice.mockReturnValue(device() as never);
  mockedPush.mockResolvedValue({ pushed: 0, nextCursor: null });
  mockedPull.mockResolvedValue({ pulled: 0, applied: 0, skipped: 0, nextCursor: "" });
});

afterEach(() => {
  // Guard against a test leaking the module-level mutex into the next one.
  expect(isSyncRunning()).toBe(false);
});

describe("runSync — happy path round trip", () => {
  it("pushes, backs up, then drains the pull loop and advances the cursor", async () => {
    mockedPush.mockResolvedValue({ pushed: 3, nextCursor: "push-1" });
    // First page has more; second page repeats its cursor → loop terminates.
    mockedPull
      .mockResolvedValueOnce({ pulled: 2, applied: 2, skipped: 0, nextCursor: "seq-5" })
      .mockResolvedValueOnce({ pulled: 1, applied: 1, skipped: 0, nextCursor: "seq-5" });

    const repo = fakeRepo();
    const result = await runSync(repo);

    expect(result).toEqual({ pushed: 3, pulled: 3, applied: 3, skipped: 0 });
    // Ordering: credential migration, then push, then pull.
    expect(mockedEnsureCred).toHaveBeenCalledWith(account);
    expect(mockedPush).toHaveBeenCalledWith(repo, account);
    expect(mockedSaveBackup).toHaveBeenCalledTimes(1);
    // Cursor advanced exactly once (only when the page moved it forward).
    expect(mockedSetPullCursor).toHaveBeenCalledTimes(1);
    expect(mockedSetPullCursor).toHaveBeenCalledWith("seq-5");
    expect(isSyncRunning()).toBe(false);
  });

  it("starts the pull from the device's stored remote cursor", async () => {
    mockedGetDevice.mockReturnValue(device({ remotePullCursor: "seq-99" }) as never);
    await runSync(fakeRepo());
    expect(mockedPull).toHaveBeenCalledWith(
      expect.anything(),
      account,
      "seq-99",
      "device_a",
    );
  });
});

describe("runSync — gates", () => {
  it("throws when no sync account is configured", async () => {
    mockedLoadAccount.mockResolvedValue(null);
    await expect(runSync(fakeRepo())).rejects.toThrow("尚未設定同步帳號");
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("throws when the vault key is missing", async () => {
    mockedLoadVault.mockResolvedValue(null as never);
    await expect(runSync(fakeRepo())).rejects.toThrow("加密金鑰尚未初始化");
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it("refuses to sync until the Recovery Kit is confirmed", async () => {
    mockedRecoveryKit.mockReturnValue(false);
    await expect(runSync(fakeRepo())).rejects.toThrow(RECOVERY_KIT_REQUIRED);
    expect(mockedPush).not.toHaveBeenCalled();
  });
});

describe("runSync — mutex", () => {
  it("rejects a second concurrent run while one is in flight and never double-runs", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Hold the first sync open inside the pull phase.
    mockedPull.mockImplementationOnce(async () => {
      await gate;
      return { pulled: 0, applied: 0, skipped: 0, nextCursor: "" };
    });

    const first = runSync(fakeRepo());
    expect(isSyncRunning()).toBe(true);

    await expect(runSync(fakeRepo())).rejects.toThrow("同步正在進行中");
    // The rejected call must not have started its own push.
    expect(mockedPush).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(isSyncRunning()).toBe(false);
  });
});

describe("runSync — error propagation", () => {
  it("surfaces a push failure, releases the mutex, and does not advance the cursor", async () => {
    mockedPush.mockRejectedValue(new Error("relay 500"));
    await expect(runSync(fakeRepo())).rejects.toThrow("relay 500");
    expect(mockedPull).not.toHaveBeenCalled();
    expect(mockedSetPullCursor).not.toHaveBeenCalled();
    expect(isSyncRunning()).toBe(false);
  });

  it("surfaces a pull failure and releases the mutex", async () => {
    mockedPull.mockRejectedValue(new Error("decrypt boom"));
    await expect(runSync(fakeRepo())).rejects.toThrow("decrypt boom");
    expect(isSyncRunning()).toBe(false);
  });
});

describe("forceFullRepush", () => {
  it("re-queues every change and clears the push cursor before syncing", async () => {
    const repo = fakeRepo();
    mockedPush.mockResolvedValue({ pushed: 7, nextCursor: "push-x" });

    const result = await forceFullRepush(repo);

    expect(repo.requeueAllPendingChanges).toHaveBeenCalledTimes(1);
    expect(mockedSetPushCursor).toHaveBeenCalledWith(null);
    expect(result.pushed).toBe(7);
    expect(isSyncRunning()).toBe(false);
  });
});
