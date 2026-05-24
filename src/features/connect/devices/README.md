# Device Pairing Boundary

Trusted-device pairing is the preferred new-device path.

Expected flow:

1. New device signs in with Supabase Auth.
2. Existing trusted device displays a QR or pairing code.
3. Existing device wraps the vault key for the new device.
4. Server stores the encrypted key envelope without seeing plaintext key material.
