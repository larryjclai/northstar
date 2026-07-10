// End-to-end ECDH pairing test: two "devices" (isolated localStorage stores)
// exchange the vault key + account secret through an in-memory fake of the relay
// transport, using the REAL crypto/vault/account/pairing code. Asserts that
// Device B ends up with Device A's exact vault key + account secret, and that no
// relay-visible artifact ever carries the raw vault-key bytes or the apiSecret.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- in-memory relay (shared with the ./client mock via vi.hoisted) ----
const relay = vi.hoisted(() => ({
  sessions: new Map<string, { encryptedBundle: string; deviceId: string; token: string; claimed: boolean }>(),
  keyEnvelopes: new Map<string, Array<{ id: string; sourceDeviceId: string; keyType: string; wrappedKey: string; sourcePublicKeyB64?: string; createdAt: string }>>(),
  devices: [] as Array<{ id: string; name: string; platform: string }>,
  bundles: [] as string[],
  reset() {
    this.sessions.clear();
    this.keyEnvelopes.clear();
    this.devices.length = 0;
    this.bundles.length = 0;
  },
}));

vi.mock("./client", () => ({
  isSyncWorkerConfigured: () => true,
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
    env: { id: string; sourceDeviceId: string; keyType: string; wrappedKey: string; sourcePublicKeyB64?: string },
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
  addDevice: vi.fn(async (_apiSecret: string, device: { id: string; name: string; platform: string }) => {
    relay.devices.push(device);
  }),
  // legacy — unused by the ECDH flow but imported by the module under test
  createPairingSession: vi.fn(),
}));

import {
  startJoinSession,
  completeJoin,
  inspectJoinRequest,
  approveJoiningDevice,
} from "./pairing-flow";
import { generateVaultKey, saveVaultKey, loadVaultKey, exportVaultKey } from "../crypto/vault";
import { getOrCreateSyncAccount, loadSyncAccount } from "./account";
import { resetSecretStoreForTests } from "../crypto/secretStore";

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

    // A registered B.
    expect(relay.devices).toContainEqual({ id: session.deviceId, name: "我的 iPhone", platform: "ios" });

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
  });

  it("a wrong pairing code cannot claim the session", async () => {
    activate(deviceB);
    await startJoinSession("Tablet", "android");
    activate(deviceA);
    await expect(inspectJoinRequest("ZZZZ-9999")).rejects.toThrow();
  });
});
