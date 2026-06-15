# Plan 003: Set a Content-Security-Policy on the Tauri webview (remove `csp: null`)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan has a MANDATORY manual in-app verification gate
> (Step 4) that cannot be automated — if you cannot run `npm run tauri dev`,
> complete Steps 1–3, then STOP and hand back to the operator with the manual
> checklist. If anything in "STOP conditions" occurs, stop and report.
> When done, update the status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9115a2b5..HEAD -- src-tauri/tauri.conf.json`
> If the file changed since this plan was written, compare against "Current
> state" before proceeding.

## Status

- **Priority**: P1
- **Effort**: S–M (mostly verification)
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9115a2b5`, 2026-06-15

## Why this matters

`src-tauri/tauri.conf.json` sets `"security": { "csp": null }`, which disables the
Content-Security-Policy for the embedded webview entirely. This app is end-to-end
encrypted: the **vault key lives in `localStorage`** (`src/features/connect/crypto/vault.ts`),
so any DOM-based XSS — from an unsanitized field, a market-data response rendered as
HTML, or a compromised npm dependency — executes in the Tauri context and can read
that key, defeating the whole E2EE design. The single highest-leverage mitigation is
a CSP that forbids inline/`eval` script execution (`script-src` without
`'unsafe-inline'`/`'unsafe-eval'`), which is exactly the vector an injected `<script>`
or `javascript:` payload needs. We intentionally keep `connect-src` broad because the
app fetches from many external hosts (Yahoo Finance, TWSE/TPEX) and an
**env-configurable** sync worker (`VITE_NORTHSTAR_SYNC_WORKER_URL`), so a tight host
allowlist would break sync on a different deployment.

## Current state

- `src-tauri/tauri.conf.json` — Tauri 2 config. The relevant block:

  ```json
  // src-tauri/tauri.conf.json:30-32
  "security": {
    "csp": null
  }
  ```

  The window uses `"transparent": true` and `windowEffects` (mica/sidebar) and the
  frontend is a Vite-built React SPA served from `../dist`. Inline **styles** are used
  (Tailwind v4 + transparent window), so `style-src` must allow `'unsafe-inline'`.
  Production Vite output loads hashed `.js`/`.css` as external files (no inline
  `<script>`), so `script-src 'self'` is expected to work — Step 4 confirms this in
  the real app.

- Network egress the CSP must not break (all `https:`):
  - Yahoo Finance market data (`src/features/market-data/yahooFinanceProvider.ts`)
  - TWSE/TPEX open data: `openapi.twse.com.tw`, `mopsfin.twse.com.tw`, `www.tpex.org.tw`
    (`src/features/market-data/taiwanMarketDataProvider.ts`)
  - Sync worker at `VITE_NORTHSTAR_SYNC_WORKER_URL` (`src/features/connect/sync/client.ts:4`) — host varies per deployment
  - Tauri IPC (handled by Tauri; include `ipc:` and `http://ipc.localhost` defensively)

- Tauri reference for this field: the `app > security > csp` key accepts a CSP string
  or per-directive object; Tauri injects nonces/hashes for its own assets when a
  policy is set. See https://v2.tauri.app/security/csp/ .

## Commands you will need

| Purpose            | Command                              | Expected on success |
|--------------------|--------------------------------------|---------------------|
| Validate JSON      | `node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'));console.log('ok')"` | prints `ok` |
| Frontend build     | `npm run build`                      | exit 0 (tsc + vite) |
| Tauri dev (manual) | `npm run tauri dev`                  | app window opens; see Step 4 |
| Rust check         | `npm run check:tauri`                | exit 0              |

## Scope

**In scope** (the only file you may modify):
- `src-tauri/tauri.conf.json`

**Out of scope** (do NOT touch):
- Any frontend source. If the app relies on an inline script that the CSP blocks,
  that is a STOP condition — do not start rewriting components to satisfy the CSP in
  this plan.
- `src-tauri/capabilities/*` — capability/permission tightening is a separate concern.
- The `connect-src` directive must remain broad (`https:`) — do NOT try to enumerate
  the sync worker host; it is configured per environment.

## Git workflow

- Branch: `advisor/003-tauri-csp`.
- Commit: `security(tauri): set CSP on webview (was disabled)`.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Replace `csp: null` with a policy

Edit `src-tauri/tauri.conf.json` so the `security` block reads exactly:

```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost https: blob: data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
}
```

Rationale per directive (do not change these without operator sign-off):
- `script-src 'self'` — the actual XSS mitigation: no inline/`eval` scripts.
- `style-src 'unsafe-inline'` — required by Tailwind/transparent-window inline styles.
- `img-src ... https:` — bank/asset logos and chart images.
- `connect-src ... https:` — broad on purpose (market data + env-configurable worker).
- `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'` — cheap hardening.

**Verify**: `node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8'));console.log('ok')"` → prints `ok`.

### Step 2: Confirm the frontend still builds

**Verify**: `npm run build` → exit 0. (This does not exercise the CSP, only that the
config edit didn't break the build pipeline.)

### Step 3: Confirm Rust/Tauri config still parses

**Verify**: `npm run check:tauri` → exit 0. (Tauri validates the config schema during
`cargo check`.)

### Step 4: MANDATORY manual in-app smoke (cannot be automated)

The CSP only takes effect in the actual webview. Run `npm run tauri dev` and, with the
**devtools console open**, verify there are **no** `Content-Security-Policy` violation
errors during these flows:

1. App loads; dashboard renders (no blank screen, no console CSP errors).
2. Fonts and icons render correctly (tests `font-src`/`img-src`).
3. Investments tab: a holding's market price / chart loads (tests `connect-src` →
   Yahoo / TWSE).
4. Settings → Connect (`ConnectSection`): the panel opens and, if a sync worker is
   configured, "啟用同步"/device list works (tests `connect-src` → worker + IPC).
5. Quick Add and the command palette open (tests no inline-script reliance).

If you cannot run Tauri in this environment, STOP after Step 3 and report that
Steps 1–3 are complete and Step 4's manual checklist is pending operator verification.

### Step 5: If a CSP violation appears

If Step 4 surfaces a console violation, do **not** broaden `script-src` to
`'unsafe-inline'` (that would undo the entire benefit). Instead STOP and report the
exact violated directive and the blocked resource URL. The fix (e.g. moving an inline
script to an external file, or adding a specific host to `img-src`) is a follow-up
decision, not part of this plan.

## Test plan

There is no unit test for Tauri config. Verification is: JSON validity (Step 1),
frontend build (Step 2), `check:tauri` schema validation (Step 3), and the manual
console-error-free smoke (Step 4). Record the Step 4 result (pass / which directive
failed) in the PR description.

## Done criteria

ALL must hold:

- [ ] `src-tauri/tauri.conf.json` no longer contains `"csp": null`; the policy string from Step 1 is present
- [ ] `node -e "JSON.parse(...)"` prints `ok` (valid JSON)
- [ ] `npm run build` exits 0
- [ ] `npm run check:tauri` exits 0
- [ ] Step 4 manual smoke completed with zero CSP console violations (or explicitly handed to operator as pending)
- [ ] No files outside `src-tauri/tauri.conf.json` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The frontend genuinely requires an inline `<script>` or `eval` (Step 4 shows a
  `script-src` violation) — broadening the policy defeats the purpose; this needs a
  source-level fix outside this plan.
- A market-data or sync flow breaks under the CSP and the blocked URL is not `https:`
  (the broad `connect-src https:` should cover all of them; if not, report the scheme).
- `npm run check:tauri` reports a schema error on the `csp` field (Tauri version may
  expect a different shape — report the version and error).

## Maintenance notes

- This pairs with the larger key-storage hardening (plan 006): even with a CSP, the
  vault key in `localStorage` is reachable by any same-origin script; CSP shrinks the
  XSS surface but does not eliminate the exposure.
- If a future feature adds a `<script>`-injecting integration, a third-party iframe,
  or `eval`-based code, it will hit this CSP — that is the intended tripwire; widen the
  specific directive deliberately rather than reverting to `null`.
- A reviewer should confirm `connect-src` was kept broad (so sync on alternate worker
  deployments keeps working) and that `script-src` did NOT gain `'unsafe-inline'`.
