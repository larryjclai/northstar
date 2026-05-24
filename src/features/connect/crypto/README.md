# Crypto Boundary

This module will own client-side encryption for Northstar Connect.

Rules:

- Personal finance payloads are encrypted before they leave the device.
- Supabase stores encrypted sync envelopes and encrypted key envelopes only.
- Account login identifies the user; it does not decrypt vault data.
- Trusted-device pairing or Recovery Kit unlocks the Personal Vault Key.
- Household sharing uses a separate Household Space Key.

Implementation is intentionally deferred until after the Tauri foundation and local data layer are stable.
