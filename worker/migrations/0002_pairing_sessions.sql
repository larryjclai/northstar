-- Pairing sessions: short-lived relay for device-to-device credential transfer.
-- The server stores only an encrypted bundle — it cannot read userId, apiSecret,
-- or the vault key. The pairing code is the only decryption key.
CREATE TABLE IF NOT EXISTS pairing_sessions (
  code TEXT PRIMARY KEY,
  encrypted_bundle TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  claimed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pairing_expires ON pairing_sessions(expires_at);
