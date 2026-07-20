// Northstar Sync Worker — encrypted envelope relay.
// The server stores only opaque ciphertext; all plaintext stays on devices.

export interface Env {
  DB: D1Database;
}

// ---------- helpers ----------

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function err(message: string, status: number): Response {
  return json({ error: message }, status);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- rate limiting ----------

// Per-scope requests allowed per fixed 1-minute window, keyed on client IP.
// Unauthenticated endpoints only — authenticated routes are already bounded by
// the account/device credential.
const RATE_LIMITS = {
  users: 10, // POST /users (account registration)
  pairing: 30, // POST /pairing/join + GET /pairing/:code
} as const;

const RATE_WINDOW_MS = 60_000;

// Best-effort, fail-open rate limiter backed by D1 (Plan 133 item B). Returns a
// 429 Response when the caller has exceeded `limit` requests in the current
// 1-minute window, or null to let the request proceed.
//
// Fail-open by design: a rate-limiter storage error must never break sync
// onboarding for a legitimate user. When there is no client IP to bucket on
// (e.g. local dev / non-Cloudflare edge), the check is skipped — in production
// Cloudflare always sets CF-Connecting-IP, so real traffic is always limited.
async function rateLimit(
  env: Env,
  scope: keyof typeof RATE_LIMITS,
  request: Request,
): Promise<Response | null> {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip) return null;

  const now = Date.now();
  const windowStart = Math.floor(now / RATE_WINDOW_MS);
  const key = `${scope}:${ip}:${windowStart}`;
  // Keep the row one full window past the current one, then it is prunable.
  const expiresAt = (windowStart + 2) * RATE_WINDOW_MS;

  try {
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
      .bind(key, expiresAt)
      .first<{ count: number }>();

    // First hit of a fresh window: opportunistically prune expired rows so the
    // table stays bounded without a dedicated cron.
    if (row?.count === 1) {
      await env.DB.prepare("DELETE FROM rate_limits WHERE expires_at < ?").bind(now).run();
    }

    if (row && row.count > RATE_LIMITS[scope]) {
      return err("Rate limit exceeded", 429);
    }
  } catch (e) {
    console.error("rateLimit error (failing open)", e);
    return null;
  }
  return null;
}

// ---------- auth ----------

// Auth result: userId is always resolved; deviceId is non-null only when the
// request authenticated with a per-device credential (Plan 132). Legacy
// account-secret auth resolves the user but leaves deviceId null, so callers
// that need a trusted device dimension (e.g. push envelope stamping) know to
// fall back to body-supplied values for legacy tokens.
interface AuthContext {
  userId: string;
  deviceId: string | null;
}

async function authenticate(
  request: Request,
  env: Env,
): Promise<AuthContext | Response> {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return err("Missing Authorization header", 401);

  // Device-credential auth (preferred). Token format: "<deviceId>.<deviceSecret>".
  // Device ids are UUID/`dev_*` style and never contain a dot, and account
  // secrets are 64-hex-char strings with no dot either, so a dotted token is
  // unambiguously a device token — never fall back to legacy for it.
  const dot = token.indexOf(".");
  if (dot > 0) {
    const deviceId = token.slice(0, dot);
    const deviceSecret = token.slice(dot + 1);
    if (deviceSecret.length > 0) {
      const secretHash = await sha256Hex(deviceSecret);
      const device = await env.DB.prepare(
        "SELECT user_id, device_secret_hash FROM devices WHERE id = ?",
      )
        .bind(deviceId)
        .first<{ user_id: string; device_secret_hash: string | null }>();
      // A revoked device has no row (revocation hard-deletes it) -> 401.
      // Return the SAME generic 401 whether the device is missing or the secret
      // mismatches, so a caller can't distinguish "no such device" from
      // "bad secret".
      if (
        device &&
        device.device_secret_hash &&
        device.device_secret_hash === secretHash
      ) {
        return { userId: device.user_id, deviceId };
      }
    }
    return err("Invalid token", 401);
  }

  // Legacy account-secret auth (DEPRECATED — kept working during the per-device
  // credential migration; removal is a follow-up once every device holds its own
  // credential). Grants full relay access to any holder of the account secret.
  const hash = await sha256Hex(token);
  const user = await env.DB.prepare("SELECT id FROM users WHERE api_secret_hash = ?")
    .bind(hash)
    .first<{ id: string }>();
  if (!user) return err("Invalid token", 401);
  return { userId: user.id, deviceId: null };
}

// ---------- router ----------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Pairing-Token",
        },
      });
    }

    try {
      // POST /users — register a new sync account + first device
      if (method === "POST" && path === "/users") {
        const limited = await rateLimit(env, "users", request);
        if (limited) return withCors(limited);
        return handleRegister(request, env);
      }

      // POST /pairing/join — the JOINING device (B) publishes its ECDH public key
      // bundle (unauthenticated; B has no account yet). Returns a single-purpose
      // pairing token B uses to later fetch its wrapped key envelopes.
      if (method === "POST" && path === "/pairing/join") {
        const limited = await rateLimit(env, "pairing", request);
        if (limited) return withCors(limited);
        return withCors(await handleJoinPairing(request, env));
      }

      // GET /pairing/:code — claim the bundle (unauthenticated; code is the credential).
      // Legacy path: Device B claims A's credentials bundle.
      // ECDH path: Device A claims B's public-key bundle.
      const pairingClaim = path.match(/^\/pairing\/([A-Z0-9]{4}-[A-Z0-9]{4})$/);
      if (method === "GET" && pairingClaim) {
        const limited = await rateLimit(env, "pairing", request);
        if (limited) return withCors(limited);
        return withCors(await handleClaimPairing(env, pairingClaim[1]));
      }

      // GET /keys/:device with X-Pairing-Token — the joining device (B) fetches
      // its wrapped vault/account envelopes before it has account credentials.
      const keyFetchByToken = path.match(/^\/keys\/([^/]+)$/);
      const pairingToken = request.headers.get("X-Pairing-Token");
      if (method === "GET" && keyFetchByToken && pairingToken) {
        return withCors(
          await handleFetchKeyByToken(env, keyFetchByToken[1], pairingToken),
        );
      }

      // All routes below require auth
      const auth = await authenticate(request, env);
      if (auth instanceof Response) return withCors(auth);
      const { userId, deviceId: authDeviceId } = auth;

      // POST /devices — register a device
      if (method === "POST" && path === "/devices") {
        return withCors(await handleAddDevice(request, env, userId));
      }
      // GET /devices — list devices
      if (method === "GET" && path === "/devices") {
        return withCors(await handleListDevices(env, userId));
      }
      // POST /devices/:id/credential — self-provision a device credential
      // (one-time upgrade for existing installs that still auth with the account
      // secret). Only succeeds if the device is owned by this account and has no
      // credential yet.
      const deviceCredential = path.match(/^\/devices\/([^/]+)\/credential$/);
      if (method === "POST" && deviceCredential) {
        return withCors(
          await handleProvisionDeviceCredential(request, env, userId, deviceCredential[1]),
        );
      }
      // POST /devices/:id/public-key — self-provision this device's ECDH public
      // key into the durable directory (Plan 239, rotation phase A). Mirrors the
      // credential endpoint's set-once shape. Only succeeds if the device is
      // owned by this account and has no public key on file yet.
      const devicePublicKey = path.match(/^\/devices\/([^/]+)\/public-key$/);
      if (method === "POST" && devicePublicKey) {
        return withCors(
          await handleProvisionDevicePublicKey(request, env, userId, devicePublicKey[1]),
        );
      }
      // DELETE /devices/:id — revoke a device
      const deviceRevoke = path.match(/^\/devices\/([^/]+)$/);
      if (method === "DELETE" && deviceRevoke) {
        return withCors(await handleRevokeDevice(env, userId, deviceRevoke[1]));
      }

      // POST /envelopes — upload encrypted change records
      if (method === "POST" && path === "/envelopes") {
        return withCors(await handlePushEnvelopes(request, env, userId, authDeviceId));
      }
      // GET /envelopes?cursor= — fetch changes since cursor
      if (method === "GET" && path === "/envelopes") {
        return withCors(await handlePullEnvelopes(url, env, userId));
      }

      // POST /keys/:target_device_id — store wrapped key envelope
      const keyPost = path.match(/^\/keys\/([^/]+)$/);
      if (method === "POST" && keyPost) {
        return withCors(await handleStoreKey(request, env, userId, keyPost[1]));
      }
      // GET /keys/:target_device_id — fetch wrapped key envelope
      if (method === "GET" && keyPost) {
        return withCors(await handleFetchKey(env, userId, keyPost[1]));
      }

      // POST /pairing — Device A deposits encrypted credentials bundle (auth required)
      if (method === "POST" && path === "/pairing") {
        return withCors(await handleCreatePairing(request, env));
      }

      return withCors(err("Not found", 404));
    } catch (e) {
      console.error(e);
      // To prevent Information Exposure (CWE-209), we log the error internally
      // but only return a generic message to the client.
      return withCors(err("Internal server error", 500));
    }
  },
};

function withCors(response: Response): Response {
  const next = new Response(response.body, response);
  next.headers.set("Access-Control-Allow-Origin", "*");
  return next;
}

// ---------- handlers ----------

interface RegisterBody {
  userId: string;
  apiSecretHash: string;
  // device.secretHash: SHA-256 of the first device's own credential (Plan 132).
  // Optional for backward compatibility with older clients; when present the
  // device row is created already carrying its credential.
  device: { id: string; name: string; platform: string; secretHash?: string };
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json<RegisterBody>();
  if (!body.userId || !body.apiSecretHash || !body.device?.id) {
    return err("Missing required fields", 400);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO users (id, api_secret_hash, created_at) VALUES (?, ?, ?)")
      .bind(body.userId, body.apiSecretHash, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO devices (id, user_id, name, platform, device_secret_hash, trusted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      body.device.id,
      body.userId,
      body.device.name,
      body.device.platform,
      body.device.secretHash ?? null,
      now,
      now,
    ),
  ]);

  // Reject a userId collision under a different secret (would otherwise let a
  // second account silently "succeed" against someone else's row).
  const existing = await env.DB.prepare("SELECT api_secret_hash FROM users WHERE id = ?")
    .bind(body.userId)
    .first<{ api_secret_hash: string }>();
  if (existing && existing.api_secret_hash !== body.apiSecretHash) {
    return withCors(err("Account already exists with different credentials", 409));
  }

  return withCors(json({ ok: true }, 201));
}

interface DeviceBody {
  id: string;
  name: string;
  platform: string;
  // secretHash: SHA-256 of the joining device's own credential (Plan 132). The
  // joining device (B) generates its secret locally and only the hash rides the
  // pairing bundle to the approving device (A), which forwards it here.
  secretHash?: string;
  // publicKeyB64: the device's ECDH public key (Plan 239, rotation phase A).
  // Optional so older clients that predate the directory keep working; the
  // approver already knows the joining device's public key from the pairing
  // bundle, so it can supply it here directly instead of requiring the
  // joining device to self-provision separately.
  publicKeyB64?: string;
}

async function handleAddDevice(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const body = await request.json<DeviceBody>();
  if (!body.id || !body.name || !body.platform) return err("Missing fields", 400);

  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO devices (id, user_id, name, platform, device_secret_hash, public_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(body.id, userId, body.name, body.platform, body.secretHash ?? null, body.publicKeyB64 ?? null, now)
    .run();

  return json({ ok: true }, 201);
}

interface ProvisionCredentialBody {
  secretHash: string;
}

/**
 * Self-provision a device credential for an existing install (Plan 132 step 5).
 *
 * Migration path: a device that still authenticates with the account secret
 * (legacy) generates its own credential and registers only the hash here. The
 * UPDATE is guarded by `device_secret_hash IS NULL`, so a credential can be set
 * exactly once and never overwritten — an already-provisioned device cannot be
 * silently re-keyed (which would be a covert revocation).
 *
 * Residual, accepted risk: whoever holds the account secret already has full
 * relay access via legacy auth, so they could pre-claim a not-yet-migrated
 * device's slot. This grants them nothing they don't already have; the real fix
 * is retiring legacy auth once every device is migrated (tracked as follow-up).
 */
async function handleProvisionDeviceCredential(
  request: Request,
  env: Env,
  userId: string,
  deviceId: string,
): Promise<Response> {
  const body = await request.json<ProvisionCredentialBody>();
  if (!body.secretHash) return err("Missing fields", 400);

  const result = await env.DB.prepare(
    "UPDATE devices SET device_secret_hash = ? WHERE id = ? AND user_id = ? AND device_secret_hash IS NULL",
  )
    .bind(body.secretHash, deviceId, userId)
    .run();

  // meta.changes === 0 means the device is absent, not owned by this account, or
  // already has a credential. Report a conflict without distinguishing which, so
  // the endpoint can't be used to probe device ownership.
  if (!result.meta.changes) {
    return err("Device credential already set or device not found", 409);
  }

  return json({ ok: true }, 201);
}

interface ProvisionPublicKeyBody {
  publicKeyB64: string;
}

/**
 * Self-provision this device's ECDH public key into the durable directory
 * (Plan 239, rotation phase A). Migration path for a device that was paired
 * before the directory shipped (its `devices.public_key` row is NULL) — it
 * uploads its own key the first time it syncs post-upgrade (see
 * ensureDevicePublicKeyUploaded in the client).
 *
 * Guarded by `public_key IS NULL`, exactly like
 * handleProvisionDeviceCredential: a key can be set exactly once and never
 * silently overwritten by this endpoint. This closes spike gap 1 — without a
 * durable directory, a rotation initiator has no way to look up a remote
 * device's public key months after their original pairing session.
 */
async function handleProvisionDevicePublicKey(
  request: Request,
  env: Env,
  userId: string,
  deviceId: string,
): Promise<Response> {
  const body = await request.json<ProvisionPublicKeyBody>();
  if (!body.publicKeyB64) return err("Missing fields", 400);

  const result = await env.DB.prepare(
    "UPDATE devices SET public_key = ? WHERE id = ? AND user_id = ? AND public_key IS NULL",
  )
    .bind(body.publicKeyB64, deviceId, userId)
    .run();

  // meta.changes === 0 means the device is absent, not owned by this account, or
  // already has a public key on file. Report a conflict without distinguishing
  // which, mirroring handleProvisionDeviceCredential's same anti-probing shape.
  if (!result.meta.changes) {
    return err("Device public key already set or device not found", 409);
  }

  return json({ ok: true }, 201);
}

async function handleListDevices(env: Env, userId: string): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT id, name, platform, trusted_at, created_at, public_key as publicKeyB64 FROM devices WHERE user_id = ? ORDER BY created_at",
  )
    .bind(userId)
    .all();
  return json(result.results);
}

async function handleRevokeDevice(
  env: Env,
  userId: string,
  deviceId: string,
): Promise<Response> {
  await env.DB.prepare("DELETE FROM devices WHERE id = ? AND user_id = ?")
    .bind(deviceId, userId)
    .run();
  return json({ ok: true });
}

interface Envelope {
  id: string;
  deviceId: string;
  entity: string;
  entityId: string;
  revision: number;
  encryptedPayload: string;
  updatedAt: string;
  sequence?: number;
}

async function handlePushEnvelopes(
  request: Request,
  env: Env,
  userId: string,
  authDeviceId: string | null,
): Promise<Response> {
  const { envelopes } = await request.json<{ envelopes: Envelope[] }>();
  if (!Array.isArray(envelopes) || envelopes.length === 0) {
    return err("envelopes must be a non-empty array", 400);
  }
  if (envelopes.length > 500) return err("Max 500 envelopes per request", 400);

  // When the request authenticated with a device credential, stamp every
  // envelope with the AUTHENTICATED device id and ignore whatever the body
  // claims — a device can only push under its own id. Legacy account-secret
  // auth (authDeviceId === null) keeps trusting the body value, since those
  // tokens have no device dimension.
  const effectiveDeviceId = (e: Envelope): string => authDeviceId ?? e.deviceId;

  // relay_sequence is unique PER USER (idx_envelopes_user_sequence). Previously
  // every row computed its own (SELECT MAX(relay_sequence)+1) subquery; within a
  // single batch the subquery can resolve to the same value for multiple rows,
  // tripping the unique index and failing the whole push (the "Internal server
  // error" 500). Read the current max once and assign explicit,
  // monotonically-increasing sequences in JS so every row in the batch is
  // distinct.
  //
  // The MAX read is scoped to THIS user so two concurrent pushes from different
  // accounts no longer read the same global max and collide (Plan 133 item A).
  // Pull is already per-user (WHERE user_id = ? AND relay_sequence > ?), so a
  // per-user counter keeps cursors correct.
  const maxRow = await env.DB.prepare(
    "SELECT COALESCE(MAX(relay_sequence), 0) AS maxSeq FROM sync_envelopes WHERE user_id = ?",
  )
    .bind(userId)
    .first<{ maxSeq: number }>();
  let nextSequence = (maxRow?.maxSeq ?? 0) + 1;

  const stmt = env.DB.prepare(
    `INSERT INTO sync_envelopes
       (id, user_id, device_id, entity, entity_id, revision, encrypted_payload, updated_at, relay_sequence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, entity, entity_id, revision, device_id) DO NOTHING`,
  );
  const batch = envelopes.map((e) =>
    stmt.bind(e.id, userId, effectiveDeviceId(e), e.entity, e.entityId, e.revision, e.encryptedPayload, e.updatedAt, nextSequence++),
  );
  await env.DB.batch(batch);

  return json({ ok: true, count: envelopes.length });
}

async function handlePullEnvelopes(
  url: URL,
  env: Env,
  userId: string,
): Promise<Response> {
  const cursor = Number(url.searchParams.get("cursor") ?? "0") || 0;
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "200"), 500);

  const result = await env.DB.prepare(
    `SELECT id, device_id as deviceId, entity, entity_id as entityId,
            revision, encrypted_payload as encryptedPayload, updated_at as updatedAt,
            relay_sequence as sequence
     FROM sync_envelopes
     WHERE user_id = ? AND relay_sequence > ?
     ORDER BY relay_sequence ASC
     LIMIT ?`,
  )
    .bind(userId, cursor, limit)
    .all<Envelope>();

  const envelopes = result.results;
  const nextCursor =
    envelopes.length > 0 ? String(envelopes[envelopes.length - 1].sequence) : String(cursor);

  return json({ envelopes, nextCursor, count: envelopes.length });
}

interface KeyEnvelopeBody {
  id: string;
  sourceDeviceId: string;
  keyType: string;
  wrappedKey: string;
  // ECDH pairing: A's public key so B can derive the shared secret. Opaque here.
  sourcePublicKeyB64?: string;
}

/**
 * Store (or overwrite) a wrapped key envelope for a target device, allocating
 * `wrapped_key_version` server-side (Plan 239, rotation phase A — spike gap 2:
 * the column existed since 0001_initial.sql but nothing read or wrote it).
 *
 * Allocation is NOT trusted from the client body (§4/§5 of
 * docs/vault-key-rotation-plan.md: an attacker or buggy client must not be
 * able to inject an arbitrary version number) — it is computed by this SAME
 * statement via `SELECT MAX(wrapped_key_version)+1 ... WHERE user_id = ? AND
 * key_type = ?`, scoped per-user exactly like 0006_per_user_relay_sequence.sql
 * scoped the relay_sequence counter per-user.
 *
 * Unlike relay_sequence's fix (a separate SELECT MAX, then a separate INSERT —
 * two round trips, still racy for two concurrent SAME-user writes, just no
 * longer racy ACROSS users), this allocation reads and writes the max in ONE
 * SQL statement. SQLite only allows one writer at a time; a second concurrent
 * INSERT for the same user+key_type cannot begin evaluating its subquery until
 * the first commits, so it necessarily observes the first's new row and is
 * guaranteed a distinct, strictly greater version. See the "distinct versions
 * under concurrent allocation" test in index.test.ts, which is what actually
 * proves this holds (the STOP-worthy unknown plan 239 flagged).
 *
 * RETURNING hands the allocated version straight back to the caller so a
 * rotation initiator (Phase C) can learn what version landed without a
 * separate fetch.
 */
async function handleStoreKey(
  request: Request,
  env: Env,
  userId: string,
  targetDeviceId: string,
): Promise<Response> {
  const body = await request.json<KeyEnvelopeBody>();
  if (!body.id || !body.sourceDeviceId || !body.keyType || !body.wrappedKey) {
    return err("Missing fields", 400);
  }

  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO key_envelopes
       (id, user_id, target_device_id, source_device_id, key_type, wrapped_key, wrapped_key_version, source_public_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?,
       (SELECT COALESCE(MAX(wrapped_key_version), 0) + 1 FROM key_envelopes WHERE user_id = ? AND key_type = ?),
       ?, ?)
     ON CONFLICT(user_id, target_device_id, key_type)
     DO UPDATE SET wrapped_key = excluded.wrapped_key,
                   source_device_id = excluded.source_device_id,
                   wrapped_key_version = excluded.wrapped_key_version,
                   source_public_key = excluded.source_public_key,
                   created_at = excluded.created_at
     RETURNING wrapped_key_version AS wrappedKeyVersion`,
  )
    .bind(
      body.id,
      userId,
      targetDeviceId,
      body.sourceDeviceId,
      body.keyType,
      body.wrappedKey,
      userId,
      body.keyType,
      body.sourcePublicKeyB64 ?? null,
      now,
    )
    .first<{ wrappedKeyVersion: number }>();

  return json({ ok: true, wrappedKeyVersion: row?.wrappedKeyVersion }, 201);
}

const KEY_ENVELOPE_SELECT = `SELECT id, source_device_id as sourceDeviceId, key_type as keyType,
            wrapped_key as wrappedKey, source_public_key as sourcePublicKeyB64,
            wrapped_key_version as wrappedKeyVersion,
            created_at as createdAt
     FROM key_envelopes`;

async function handleFetchKey(
  env: Env,
  userId: string,
  targetDeviceId: string,
): Promise<Response> {
  const row = await env.DB.prepare(
    `${KEY_ENVELOPE_SELECT} WHERE user_id = ? AND target_device_id = ?`,
  )
    .bind(userId, targetDeviceId)
    .all();

  return json(row.results);
}

interface KeyEnvelopeRow {
  keyType: string;
}

// GET /keys/:device authenticated by a pairing token (the joining device B has
// no account credentials yet). The token proves B minted this session for this
// exact device id; it is TTL-bound and single-use. Note the wrapped envelopes
// are themselves encrypted to B's ECDH public key, so even an invalid reader
// learns nothing — the token is defence-in-depth + rate-limiting, not the sole
// protection.
async function handleFetchKeyByToken(
  env: Env,
  targetDeviceId: string,
  presentedToken: string,
): Promise<Response> {
  const now = new Date().toISOString();
  const tokenHash = await sha256Hex(presentedToken);

  const session = await env.DB.prepare(
    `SELECT code, pairing_token_expires_at, pairing_token_consumed
       FROM pairing_sessions
      WHERE target_device_id = ? AND pairing_token_hash = ?`,
  )
    .bind(targetDeviceId, tokenHash)
    .first<{ code: string; pairing_token_expires_at: string | null; pairing_token_consumed: number }>();

  if (!session || !session.pairing_token_expires_at) return err("Invalid pairing token", 401);
  if (session.pairing_token_consumed) return err("Pairing token already used", 410);
  if (session.pairing_token_expires_at < now) return err("Pairing token expired", 410);

  const rows = await env.DB.prepare(
    `${KEY_ENVELOPE_SELECT} WHERE target_device_id = ?`,
  )
    .bind(targetDeviceId)
    .all<KeyEnvelopeRow>();

  const types = new Set(rows.results.map((r) => r.keyType));
  // Consume the token only once BOTH envelopes have landed, so B may poll
  // harmlessly while A is still approving.
  if (types.has("vault-v1") && types.has("account-v1")) {
    await env.DB.prepare(
      "UPDATE pairing_sessions SET pairing_token_consumed = 1 WHERE target_device_id = ? AND pairing_token_hash = ?",
    )
      .bind(targetDeviceId, tokenHash)
      .run();
  }

  return json(rows.results);
}

// ---------- pairing ----------

interface CreatePairingBody {
  code: string;
  encryptedBundle: string;
}

/**
 * @deprecated Legacy path — Device A deposits a code-encrypted credentials
 * bundle. Superseded by POST /pairing/join (ECDH). Kept working during the
 * transition; schedule removal once the ECDH flow is verified on real devices.
 */
async function handleCreatePairing(request: Request, env: Env): Promise<Response> {
  const body = await request.json<CreatePairingBody>();
  if (!body.code || !body.encryptedBundle) return err("Missing fields", 400);
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(body.code)) return err("Invalid code format", 400);

  // 5-minute TTL
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await env.DB.prepare(
    "INSERT INTO pairing_sessions (code, encrypted_bundle, expires_at) VALUES (?, ?, ?)",
  )
    .bind(body.code, body.encryptedBundle, expiresAt)
    .run();

  return json({ ok: true }, 201);
}

interface JoinPairingBody {
  code: string;
  // Public-key bundle (deviceId + ECDH public key), encrypted only so a passive
  // relay observer can't trivially correlate it to a device. Carries no secret.
  encryptedBundle: string;
  // Cleartext device id the pairing token is scoped to. Not secret — the device
  // id already appears on every sync envelope. Used to bind the token.
  deviceId: string;
}

/**
 * ECDH pairing — the JOINING device (B), which has NO account credentials,
 * publishes its public-key bundle and receives a single-purpose pairing token.
 * B later presents that token on GET /keys/:deviceId to fetch the vault/account
 * envelopes A wrapped to it.
 */
async function handleJoinPairing(request: Request, env: Env): Promise<Response> {
  const body = await request.json<JoinPairingBody>();
  if (!body.code || !body.encryptedBundle || !body.deviceId) return err("Missing fields", 400);
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(body.code)) return err("Invalid code format", 400);

  const now = Date.now();
  const sessionExpiresAt = new Date(now + 5 * 60 * 1000).toISOString();
  // The token outlives the 5-min claim window so B can keep polling for the
  // wrapped envelopes after A approves. 10-min TTL, single-use.
  const tokenExpiresAt = new Date(now + 10 * 60 * 1000).toISOString();

  // 32-byte random token; only its hash is stored server-side.
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const tokenHash = await sha256Hex(token);

  await env.DB.prepare(
    `INSERT INTO pairing_sessions
       (code, encrypted_bundle, expires_at, target_device_id,
        pairing_token_hash, pairing_token_expires_at, pairing_token_consumed)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(body.code, body.encryptedBundle, sessionExpiresAt, body.deviceId, tokenHash, tokenExpiresAt)
    .run();

  return json({ ok: true, pairingToken: token }, 201);
}

async function handleClaimPairing(env: Env, code: string): Promise<Response> {
  const now = new Date().toISOString();

  const session = await env.DB.prepare(
    "SELECT encrypted_bundle, attempt_count, expires_at, claimed_at FROM pairing_sessions WHERE code = ?",
  )
    .bind(code)
    .first<{ encrypted_bundle: string; attempt_count: number; expires_at: string; claimed_at: string | null }>();

  if (!session) return err("Invalid code", 404);
  if (session.claimed_at) return err("Code already used", 410);
  if (session.expires_at < now) return err("Code expired", 410);
  if (session.attempt_count >= 5) return err("Too many attempts", 429);

  // Increment attempt count and mark claimed in one batch
  await env.DB.batch([
    env.DB.prepare("UPDATE pairing_sessions SET attempt_count = attempt_count + 1, claimed_at = ? WHERE code = ?")
      .bind(now, code),
  ]);

  return json({ encryptedBundle: session.encrypted_bundle });
}
