# Sync Boundary

Northstar Connect will sync record-level encrypted envelopes.

The sync engine must preserve local-first behavior:

- Local writes land in SQLite immediately.
- Writes are appended to the local outbox.
- Push encrypts records and sends envelopes to Supabase Edge Functions.
- Pull fetches envelopes by cursor, decrypts locally, and applies revisions.
- Realtime only wakes clients up; it is not the source of truth.
