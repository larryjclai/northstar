// HTTP client for the Northstar sync worker.
// All payloads are already encrypted by the caller; this module only handles transport.

export const WORKER_URL = (import.meta.env.VITE_NORTHSTAR_SYNC_WORKER_URL ?? "").trim().replace(/\/+$/, "");

export function isSyncWorkerConfigured(): boolean {
  return WORKER_URL.length > 0;
}

export interface EnvelopeRecord {
  id: string;
  deviceId: string;
  entity: string;
  entityId: string;
  revision: number;
  encryptedPayload: string;
  updatedAt: string;
  sequence?: number;
}

export interface DeviceRecord {
  id: string;
  name: string;
  platform: string;
  trusted_at: string | null;
  created_at: string;
}

export interface KeyEnvelopeRecord {
  id: string;
  sourceDeviceId: string;
  keyType: string;
  wrappedKey: string;
  /** ECDH pairing: the source device's public key, so the target can derive the shared secret. */
  sourcePublicKeyB64?: string;
  createdAt: string;
}

export interface PullResult {
  envelopes: EnvelopeRecord[];
  nextCursor: string;
  count: number;
}

async function request<T>(
  path: string,
  options: RequestInit & { apiSecret?: string } = {},
): Promise<T> {
  if (!isSyncWorkerConfigured()) {
    throw new Error("Sync worker endpoint is not configured for this build.");
  }
  const { apiSecret, ...rest } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(apiSecret ? { Authorization: `Bearer ${apiSecret}` } : {}),
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(`${WORKER_URL}${path}`, { ...rest, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sync worker ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Register a new user account + first device. Call once on first sync setup. */
export async function registerUser(opts: {
  userId: string;
  apiSecretHash: string;
  device: { id: string; name: string; platform: string };
}): Promise<void> {
  await request("/users", { method: "POST", body: JSON.stringify(opts) });
}

/** Push a batch of encrypted envelopes. */
export async function pushEnvelopes(
  apiSecret: string,
  envelopes: EnvelopeRecord[],
): Promise<void> {
  await request("/envelopes", {
    method: "POST",
    apiSecret,
    body: JSON.stringify({ envelopes }),
  });
}

/** Pull encrypted envelopes since a cursor. */
export async function pullEnvelopes(
  apiSecret: string,
  cursor: string,
  limit = 200,
): Promise<PullResult> {
  const params = new URLSearchParams({ cursor, limit: String(limit) });
  return request<PullResult>(`/envelopes?${params}`, { apiSecret });
}

/** Register an additional device on an existing account (Device B pairing path). */
export async function addDevice(
  apiSecret: string,
  device: { id: string; name: string; platform: string },
): Promise<void> {
  await request("/devices", { method: "POST", apiSecret, body: JSON.stringify(device) });
}

/** List trusted devices for this account. */
export async function listDevices(apiSecret: string): Promise<DeviceRecord[]> {
  return request<DeviceRecord[]>("/devices", { apiSecret });
}

/** Revoke a device's access. */
export async function revokeDevice(apiSecret: string, deviceId: string): Promise<void> {
  await request(`/devices/${deviceId}`, { method: "DELETE", apiSecret });
}

/** Store a wrapped vault key envelope for a target device. */
export async function storeKeyEnvelope(
  apiSecret: string,
  targetDeviceId: string,
  envelope: Omit<KeyEnvelopeRecord, "createdAt">,
): Promise<void> {
  await request(`/keys/${targetDeviceId}`, {
    method: "POST",
    apiSecret,
    body: JSON.stringify(envelope),
  });
}

/** Fetch key envelopes destined for a specific device (authenticated device path). */
export async function fetchKeyEnvelopes(
  apiSecret: string,
  targetDeviceId: string,
): Promise<KeyEnvelopeRecord[]> {
  return request<KeyEnvelopeRecord[]>(`/keys/${targetDeviceId}`, { apiSecret });
}

/**
 * ECDH pairing (Device B): fetch the wrapped vault/account envelopes using the
 * single-purpose pairing token — B has no account credentials yet. The token is
 * scoped server-side to this exact device id.
 */
export async function fetchKeyEnvelopesWithToken(
  pairingToken: string,
  targetDeviceId: string,
): Promise<KeyEnvelopeRecord[]> {
  return request<KeyEnvelopeRecord[]>(`/keys/${targetDeviceId}`, {
    headers: { "X-Pairing-Token": pairingToken },
  });
}

// ---------- pairing ----------

/**
 * ECDH pairing (Device B, the joiner): publish a public-key bundle + device id
 * to the relay. Returns a single-purpose pairing token B uses to later fetch the
 * wrapped vault/account envelopes. Unauthenticated — B has no account yet.
 */
export async function joinPairingSession(
  code: string,
  encryptedBundle: string,
  deviceId: string,
): Promise<{ pairingToken: string }> {
  return request<{ pairingToken: string }>("/pairing/join", {
    method: "POST",
    body: JSON.stringify({ code, encryptedBundle, deviceId }),
  });
}

/**
 * @deprecated Legacy code-encrypted bundle path (Device A deposits credentials).
 * Superseded by the ECDH flow (joinPairingSession + key envelopes). Kept working
 * during the transition.
 */
export async function createPairingSession(
  apiSecret: string,
  code: string,
  encryptedBundle: string,
): Promise<void> {
  await request("/pairing", {
    method: "POST",
    apiSecret,
    body: JSON.stringify({ code, encryptedBundle }),
  });
}

/**
 * Claim the encrypted bundle using the pairing code. One-time — the server marks
 * the session claimed on first successful fetch. Used by the ECDH flow (Device A
 * claims B's public-key bundle) and the legacy flow (Device B claims A's bundle).
 */
export async function claimPairingSession(
  code: string,
): Promise<{ encryptedBundle: string }> {
  // Unauthenticated — the code itself is the credential
  return request<{ encryptedBundle: string }>(`/pairing/${encodeURIComponent(code)}`);
}
