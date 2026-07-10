-- Plan 131: ECDH device pairing.
--
-- The JOINING device (B) now publishes ONLY its ECDH public key + device id
-- (POST /pairing/join). The existing device (A) claims that bundle, wraps the
-- vault key to B's public key, and posts wrapped envelopes to /keys/:B. Because
-- B has no account credentials yet, it fetches those envelopes with a
-- short-lived, single-purpose pairing token bound to its device id.

-- Pairing token: minted at /pairing/join, stored hashed, scoped to one device
-- id, 10-min TTL, single-use (consumed once both envelopes are fetched).
ALTER TABLE pairing_sessions ADD COLUMN target_device_id TEXT;
ALTER TABLE pairing_sessions ADD COLUMN pairing_token_hash TEXT;
ALTER TABLE pairing_sessions ADD COLUMN pairing_token_expires_at TEXT;
ALTER TABLE pairing_sessions ADD COLUMN pairing_token_consumed INTEGER NOT NULL DEFAULT 0;

-- A ships its own ECDH public key alongside each wrapped envelope so B can
-- derive the same shared secret. Opaque to the relay.
ALTER TABLE key_envelopes ADD COLUMN source_public_key TEXT;

CREATE INDEX IF NOT EXISTS idx_pairing_token
  ON pairing_sessions(target_device_id, pairing_token_hash);
