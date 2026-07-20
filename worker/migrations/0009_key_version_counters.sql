-- Rotation Phase A, revise round 1 (Plan 239): a durable "next version"
-- counter, decoupled from individual key_envelopes deposits.
--
-- Round 1's handleStoreKey computed wrapped_key_version via
-- `SELECT MAX(wrapped_key_version)+1 ... WHERE user_id = ? AND key_type = ?`
-- INSIDE EVERY deposit call. That is wrong: a single rotation deposits the
-- SAME actual vault key to every remaining device, but each deposit's
-- independent MAX()+1 read minted a DIFFERENT version number per device (3
-- remaining devices -> versions N+1, N+2, N+3 for one identical key).
-- docs/vault-key-rotation-plan.md §2 is explicit: versioning is "per vault
-- key", not per envelope. Phase B stamps sync_envelopes.key_version on push
-- and selects the matching local key on pull, so two devices holding the
-- IDENTICAL key under DIFFERENT version numbers would silently stop being
-- able to decrypt each other's pushes.
--
-- Fix: allocate the version ONCE per rotation via POST /keys/version
-- (handleAllocateKeyVersion), independent of how many subsequent
-- POST /keys/:targetDeviceId deposits reuse that SAME allocated value.
--
-- This needs its OWN table rather than deriving "the allocated max" from
-- MAX(key_envelopes.wrapped_key_version): immediately after allocating a
-- fresh version, no key_envelopes row exists yet with that value (nothing
-- has been deposited under it yet), so validating deposits against existing
-- envelope rows would reject the very first deposit of a newly-allocated
-- version.
--
-- Same allocation pattern as the relay_sequence fix's spirit
-- (0006_per_user_relay_sequence.sql) and this migration's own
-- handleStoreKey precedent: a single correlated UPSERT statement
-- (INSERT ... ON CONFLICT DO UPDATE SET current_version = current_version + 1
-- RETURNING current_version), relying on SQLite's single-writer guarantee so
-- two concurrent allocations for the same (user_id, key_type) are
-- necessarily serialized and get distinct, strictly increasing values.
CREATE TABLE IF NOT EXISTS key_version_counters (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, key_type)
);
