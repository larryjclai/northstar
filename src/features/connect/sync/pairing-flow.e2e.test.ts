// End-to-end ECDH pairing test: two "devices" (isolated localStorage stores)
// exchange the vault key + account secret through an in-memory fake of the relay
// transport, using the REAL crypto/vault/account/pairing code. Asserts that
// Device B ends up with Device A's exact vault key + account secret, and that no
// relay-visible artifact ever carries the raw vault-key bytes or the apiSecret.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- in-memory relay (shared with the ./client mock via vi.hoisted) ----
const relay = vi.hoisted(() => ({
  sessions: new Map<string, { encryptedBundle: string; deviceId: string; token: string; claimed: boolean }>(),
  keyEnvelopes: new Map<string, Array<{ id: string; sourceDeviceId: string; keyType: string; wrappedKey: string; sourcePublicKeyB64?: string; wrappedKeyVersion: number; createdAt: string }>>(),
  devices: [] as Array<{ id: string; name: string; platform: string; secretHash?: string; publicKeyB64?: string }>,
  // Mirrors the real worker's `devices.public_key` column (Plan 239) — a single
  // slot per device id, settable via EITHER addDevice's optional field OR the
  // self-provision endpoint, set-once either way (matching handleAddDevice's
  // INSERT OR IGNORE + handleProvisionDevicePublicKey's `IS NULL` guard).
  publicKeys: new Map<string, string>(),
  // Mirrors the real worker's key_version_counters table (Plan 239, revise
  // round 1) — one counter per keyType (this fake only ever exercises a
  // single account, so no per-user keying is needed here).
  keyVersionCounters: new Map<string, number>(),
  bundles: [] as string[],
  reset() {
    this.sessions.clear();
    this.keyEnvelopes.clear();
    this.devices.length = 0;
    this.publicKeys.clear();
    this.keyVersionCounters.clear();
    this.bundles.length = 0;
  },
}));

vi.mock("./client", () => ({
  isSyncWorkerConfigured: () => true,
  // Plan 239 revise round 1: allocate ONCE per logical key, reused across
  // every storeKeyEnvelope() deposit that wraps that same key value.
  allocateKeyVersion: vi.fn(async (_apiSecret: string, keyType: string) => {
    const next = (relay.keyVersionCounters.get(keyType) ?? 0) + 1;
    relay.keyVersionCounters.set(keyType, next);
    return next;
  }),
  joinPairingSession: vi.fn(async (code: string, encryptedBundle: string, deviceId: string) => {
    const token = "tok_" + Math.random().toString(36).slice(2);
    relay.sessions.set(code, { encryptedBundle, deviceId, token, claimed: false });
    relay.bundles.push(encryptedBundle);
    return { pairingToken: token };
  }),
  claimPairingSession: vi.fn(async (code: string) => {
    const s = relay.sessions.get(code);
    if (!s) throw new Error("Invalid code");
    if (s.claimed) throw new Error("Already claimed");
    s.claimed = true;
    return { encryptedBundle: s.encryptedBundle };
  }),
  storeKeyEnvelope: vi.fn(async (
    _apiSecret: string,
    target: string,
    env: { id: string; sourceDeviceId: string; keyType: string; wrappedKey: string; sourcePublicKeyB64?: string; wrappedKeyVersion: number },
  ) => {
    const arr = relay.keyEnvelopes.get(target) ?? [];
    const next = arr.filter((e) => e.keyType !== env.keyType);
    next.push({ ...env, createdAt: new Date().toISOString() });
    relay.keyEnvelopes.set(target, next);
  }),
  fetchKeyEnvelopesWithToken: vi.fn(async (token: string, target: string) => {
    const ok = [...relay.sessions.values()].some((s) => s.token === token && s.deviceId === target);
    if (!ok) throw new Error("Invalid pairing token");
    return relay.keyEnvelopes.get(target) ?? [];
  }),
  addDevice: vi.fn(async (
    _apiSecret: string,
    device: { id: string; name: string; platform: string; secretHash?: string; publicKeyB64?: string },
  ) => {
    relay.devices.push(device);
    if (device.publicKeyB64 && !relay.publicKeys.has(device.id)) {
      relay.publicKeys.set(device.id, device.publicKeyB64);
    }
  }),
  // Plan 239: self-provision endpoint. Set-once, matching the real worker's
  // `public_key IS NULL` guard — a device already seeded (by addDevice, or a
  // prior self-provision call) gets a 409, regardless of which path set it.
  provisionDevicePublicKey: vi.fn(async (_apiSecret: string, deviceId: string, publicKeyB64: string) => {
    if (relay.publicKeys.has(deviceId)) {
      throw new Error("Sync worker 409: already set");
    }
    relay.publicKeys.set(deviceId, publicKeyB64);
  }),
  // legacy — unused by the ECDH flow but imported by the module under test
  createPairingSession: vi.fn(),
  // imported by account.ts (ensureDeviceCredential); unused on the pairing path
  provisionDeviceCredential: vi.fn(),
}));

import {
  startJoinSession,
  completeJoin,
  inspectJoinRequest,
  approveJoiningDevice,
} from "./pairing-flow";
import { generateVaultKey, saveVaultKey, loadVaultKey, exportVaultKey } from "../crypto/vault";
import { getOrCreateSyncAccount, loadSyncAccount, loadDeviceSecret, getSyncAuthToken, sha256Hex } from "./account";
import { resetSecretStoreForTests } from "../crypto/secretStore";
import { provisionDevicePublicKey } from "./client";

const mockedProvisionPublicKey = vi.mocked(provisionDevicePublicKey);

function makeLocalStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

let deviceA: Storage;
let deviceB: Storage;

/** Switch the "current device" — swaps localStorage and rebuilds the memoized secret store. */
function activate(store: Storage) {
  vi.stubGlobal("localStorage", store);
  resetSecretStoreForTests();
}

beforeEach(() => {
  relay.reset();
  deviceA = makeLocalStorage();
  deviceB = makeLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetSecretStoreForTests();
});

describe("ECDH pairing end-to-end", () => {
  it("transfers the vault key + account secret to B without exposing them to the relay", async () => {
    // ── Device A: existing trusted device with a vault key + account ──
    activate(deviceA);
    const aVaultKey = await generateVaultKey();
    await saveVaultKey(aVaultKey);
    const aAccount = await getOrCreateSyncAccount();
    const aVaultKeyB64 = await exportVaultKey(aVaultKey);

    // ── Device B: brand-new device starts a join session (shows the code) ──
    activate(deviceB);
    const session = await startJoinSession("我的 iPhone", "ios");
    expect(session.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(session.pairingToken).toBeTruthy();

    // The published bundle must not contain the vault key or account secret.
    expect(relay.bundles[0]).not.toContain(aVaultKeyB64);
    expect(relay.bundles[0]).not.toContain(aAccount.apiSecret);

    // B polls before A has approved — nothing yet.
    expect(await completeJoin(session)).toBeNull();

    // ── Device A: user enters B's code, inspects, confirms, approves ──
    activate(deviceA);
    const approval = await inspectJoinRequest(session.code);
    expect(approval.name).toBe("我的 iPhone");
    expect(approval.platform).toBe("ios");
    expect(approval.deviceId).toBe(session.deviceId);
    expect(approval.fingerprint).toMatch(/^[0-9A-F]{8}$/);

    await approveJoiningDevice(approval);

    // Relay-visible key envelopes must be wrapped, never raw.
    const envs = relay.keyEnvelopes.get(session.deviceId)!;
    expect(envs.map((e) => e.keyType).sort()).toEqual(["account-v1", "vault-v1"]);
    const vaultEnv = envs.find((e) => e.keyType === "vault-v1")!;
    const acctEnv = envs.find((e) => e.keyType === "account-v1")!;
    expect(vaultEnv.wrappedKey).not.toBe(aVaultKeyB64);
    expect(vaultEnv.wrappedKey).not.toContain(aVaultKeyB64);
    expect(acctEnv.wrappedKey).not.toContain(aAccount.apiSecret);
    expect(vaultEnv.sourcePublicKeyB64).toBeTruthy();

    // Plan 239 (revise round 1): each key type got its OWN allocated version
    // (independent counters — vault-v1 and account-v1 are different logical
    // keys), and both are positive integers actually obtained from
    // allocateKeyVersion(), not left undefined/unset.
    expect(vaultEnv.wrappedKeyVersion).toBe(1);
    expect(acctEnv.wrappedKeyVersion).toBe(1);

    // A registered B — with B's device-credential HASH (Plan 132), never a secret.
    const registered = relay.devices.find((d) => d.id === session.deviceId)!;
    expect(registered).toMatchObject({ id: session.deviceId, name: "我的 iPhone", platform: "ios" });
    expect(registered.secretHash).toBeTruthy();
    // The bundle A processed must carry only the HASH, never B's raw secret.
    expect(relay.bundles[0]).not.toContain(session.deviceSecret);

    // Plan 239: A also seeded B's directory entry with B's public key straight
    // from the pairing bundle (no separate self-provision call needed for B's
    // INITIAL key), and A — approving its very first joiner, so its own
    // keypair was freshly generated — self-provisioned ITS OWN public key too.
    expect(registered.publicKeyB64).toBe(approval.publicKeyB64);
    expect(relay.publicKeys.get(session.deviceId)).toBe(approval.publicKeyB64);
    const aDeviceId = vaultEnv.sourceDeviceId;
    expect(relay.publicKeys.get(aDeviceId)).toBe(vaultEnv.sourcePublicKeyB64);

    // ── Device B: polls again, completes the join ──
    activate(deviceB);
    const result = await completeJoin(session);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe(aAccount.userId);

    // B now holds A's exact vault key…
    const bVaultKey = await loadVaultKey();
    expect(bVaultKey).not.toBeNull();
    expect(await exportVaultKey(bVaultKey!)).toBe(aVaultKeyB64);

    // …and A's account secret.
    const bAccount = await loadSyncAccount();
    expect(bAccount).toEqual({ userId: aAccount.userId, apiSecret: aAccount.apiSecret });

    // Plan 132: B now holds its OWN relay credential, and the hash A registered
    // matches it — so B authenticates as itself, and revoking B's row severs it.
    const bSecret = await loadDeviceSecret();
    expect(bSecret).toBe(session.deviceSecret);
    expect(await sha256Hex(bSecret!)).toBe(registered.secretHash);

    // B syncs using its DEVICE token ("<deviceId>.<deviceSecret>"), NOT the
    // shared account secret.
    const token = await getSyncAuthToken(bAccount!);
    expect(token).toBe(`${session.deviceId}.${bSecret}`);
    expect(token).not.toBe(bAccount!.apiSecret);
  });

  it("a wrong pairing code cannot claim the session", async () => {
    activate(deviceB);
    await startJoinSession("Tablet", "android");
    activate(deviceA);
    await expect(inspectJoinRequest("ZZZZ-9999")).rejects.toThrow();
  });

  it("Plan 239: an approver with an ALREADY-persisted keypair does not self-provision again", async () => {
    mockedProvisionPublicKey.mockClear(); // isolate the call count from earlier tests in this file
    // ── Device A: already went through pairing once before (has a keypair AND
    // a directory entry) — simulate that by joining+approving device X first. ──
    activate(deviceA);
    const aVaultKey = await generateVaultKey();
    await saveVaultKey(aVaultKey);

    activate(deviceB); // "device X" for this setup step, reusing the deviceB slot
    const firstSession = await startJoinSession("Setup Device", "macos");
    activate(deviceA);
    const firstApproval = await inspectJoinRequest(firstSession.code);
    await approveJoiningDevice(firstApproval);
    expect(mockedProvisionPublicKey).toHaveBeenCalledTimes(1); // A's own key, first time

    // ── Now A approves a SECOND joiner. A's keypair already exists, so the
    // lazy-generation branch (and its self-provision call) must NOT re-fire. ──
    const deviceC = makeLocalStorage();
    activate(deviceC);
    const secondSession = await startJoinSession("Second Device", "ios");
    activate(deviceA);
    const secondApproval = await inspectJoinRequest(secondSession.code);
    await approveJoiningDevice(secondApproval);

    // Still exactly 1 — A never calls provisionDevicePublicKey for itself again.
    expect(mockedProvisionPublicKey).toHaveBeenCalledTimes(1);
    // B's own directory entry (seeded via addDevice from the pairing bundle)
    // is unaffected by A's keypair reuse — still correctly recorded.
    expect(relay.publicKeys.get(secondSession.deviceId)).toBe(secondApproval.publicKeyB64);
  });
});
