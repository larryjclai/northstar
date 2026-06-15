# Plan 012: Full re-download reliably restores a wiped device, and re-enabling sync never 500s

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a4ee4f2b..HEAD -- src/features/connect/sync/sync-manager.ts src/state/deviceIdentity.ts worker/src/index.ts src/routes/settings/ConnectSection.tsx`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a4ee4f2b`, 2026-06-15

## Why this matters

The operator reports (on v0.1.0-alpha.34) that cross-device sync recovery does
not work: after reinstalling Northstar on device A and pairing it to device B,
the data never comes back, and "完整重新下載" (force full re-download) appears to
apply nothing. Two concrete, code-level defects contribute, and both are fixable
in this repo:

1. **Re-enabling sync on an account that already exists throws a 500.** The sync
   worker's `POST /users` handler does a bare `INSERT INTO users …`. If a device
   still holds its old account in `localStorage` (which survives an app
   reinstall on desktop — Tauri app data is not removed with the app bundle) and
   the user taps "啟用同步" again, the insert collides on the primary key, the D1
   `batch()` throws, and the client shows the opaque "啟用失敗，請稍後再試". The
   same handler also blocks legitimate re-registration after the user deleted the
   account server-side.

2. **`forceFullResync` trusts stale local cursors and gives no diagnostic when
   it applies zero records.** It restarts the pull cursor at `""` to re-drain the
   relay, but it never resets the *local push cursor* or the persisted *remote
   pull cursor* up front, and on completion it reports only raw counts. When it
   genuinely pulls 0 (wrong account / empty relay) or pulls >0 but applies 0, the
   user is told nothing actionable, so "it doesn't work" is indistinguishable
   from "there was nothing to download".

After this plan: re-enabling sync is idempotent (no 500), `forceFullResync`
always starts from a clean cursor baseline, and the UI explains the outcome
("下載 N 筆、套用 M 筆" plus a reason when nothing was applied).

This plan is the **correctness foundation**; plan 013 builds the simplified
recovery UX on top of it.

## Current state

### Defect 1 — worker `POST /users` is not idempotent

`worker/src/index.ts:142-158`:

```ts
async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json<RegisterBody>();
  if (!body.userId || !body.apiSecretHash || !body.device?.id) {
    return err("Missing required fields", 400);
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, api_secret_hash, created_at) VALUES (?, ?, ?)")
      .bind(body.userId, body.apiSecretHash, now),
    env.DB.prepare(
      "INSERT INTO devices (id, user_id, name, platform, trusted_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(body.device.id, body.userId, body.device.name, body.device.platform, now, now),
  ]);

  return withCors(json({ ok: true }, 201));
}
```

For contrast, the device-add handler already uses `INSERT OR IGNORE`
(`worker/src/index.ts:166-182`), which is the pattern to mirror. Pull/push are
authorized by `api_secret_hash` → `userId` (account-level; see `authenticate`
at lines 30-44), so device revocation does **not** block sync — that rules out
"the revoked device" as the cause and points squarely at this insert.

The client caller is `registerUser` in
`src/features/connect/sync/client.ts:65-71`, invoked from `handleSetup` in
`src/routes/settings/ConnectSection.tsx:237-270`. It sends the **SHA-256 hash**
of the secret (`apiSecretHash`), never the secret itself — keep it that way.

### Defect 2 — `forceFullResync` cursor handling + thin result

`src/features/connect/sync/sync-manager.ts:106-142` (current full body):

```ts
export async function forceFullResync(repo: FinanceRepository): Promise<SyncResult> {
  if (_syncRunning) throw new Error("同步正在進行中，請稍候");
  _syncRunning = true;

  try {
    const account = loadSyncAccount();
    if (!account) throw new Error("尚未設定同步帳號");

    const vaultKey = await loadVaultKey();
    if (!vaultKey) throw new Error("加密金鑰尚未初始化");

    const device = getOrCreateDeviceIdentity();

    // Pre-pull backup so the user can revert if the recovery looks wrong.
    const snapshot = await repo.exportSnapshot();
    await saveBackup(snapshot).catch(console.warn);

    let cursor = "";
    let pulled = 0;
    let applied = 0;
    for (;;) {
      const page = await pullAndApply(repo, account, cursor, device.deviceId, { includeOwnDevice: true });
      pulled += page.pulled;
      applied += page.applied;
      if (!page.nextCursor || page.nextCursor === cursor) break;
      cursor = page.nextCursor;
    }

    if (cursor) setRemotePullCursor(cursor);

    return { pushed: 0, pulled, applied };
  } finally {
    _syncRunning = false;
  }
}
```

`SyncResult` is declared at `sync-manager.ts:23-27`:

```ts
export interface SyncResult {
  pushed: number;
  pulled: number;
  applied: number;
}
```

### Cursor storage

`src/state/deviceIdentity.ts` persists the device identity (including both
cursors) in `localStorage` under `northstar.device.v1`. It already exports
`setLocalPushCursor` and `setRemotePullCursor` (lines 56-70). There is **no**
helper that resets both at once — you will add one.

### The ConnectSection handler that surfaces the result

`src/routes/settings/ConnectSection.tsx:390-407`:

```tsx
async function handleForceFullResync() {
  if (syncStatus.phase === "pushing" || syncStatus.phase === "pulling") return;
  setConfirmFullResync(false);
  syncStatus.setPhase("pulling");
  try {
    const repo = await getFinanceRepository();
    const result = await forceFullResync(repo);
    syncStatus.setSyncDone(result.pushed, result.pulled, result.applied);
    await queryClient.invalidateQueries();
    toast.success(`已從伺服器完整重新下載，套用 ${result.applied} 筆`);
  } catch (e) {
    const msg = e instanceof Error ? e.message
      : typeof e === "string" ? e
      : (e as { message?: string })?.message ?? JSON.stringify(e) ?? "重新下載失敗";
    console.error("[sync] force full resync failed:", e);
    syncStatus.setError(msg);
  }
}
```

### Conventions to follow

- **Tests**: vitest, files named `*.test.ts` next to the source. Sync tests
  live in `src/features/connect/sync/` — model new tests after
  `src/features/connect/sync/pull.test.ts`. **jsdom in this repo has no real
  `localStorage`**; per `MEMORY.md`, stub it per-test with `vi.stubGlobal`. See
  any existing test that touches `localStorage` for the exact shape; if none,
  use:
  ```ts
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  ```
- **Worker**: there is no test harness in `worker/` (no vitest/miniflare). The
  worker change is verified by typecheck + code review only, and requires a
  separate deploy (see STOP/Maintenance). Do not add a test framework to the
  worker in this plan.
- **i18n / copy**: user-facing strings are Chinese (zh-TW), written inline in
  the TSX as in the surrounding code. Match that.

## Commands you will need

| Purpose          | Command                                             | Expected on success |
|------------------|-----------------------------------------------------|---------------------|
| Typecheck (app)  | `npx tsc --noEmit`                                  | exit 0, no errors    |
| Tests            | `npm test`                                          | all pass             |
| Run new test     | `npx vitest run src/features/connect/sync/resync-cursor.test.ts` | new tests pass |
| Lint             | `npm run lint`                                      | exit 0 (warnings ok) |
| Typecheck worker | `cd worker && npx tsc --noEmit` (then `cd ..`)      | exit 0               |

## Scope

**In scope**:
- `worker/src/index.ts` (Defect 1)
- `src/state/deviceIdentity.ts` (add `resetSyncCursors`)
- `src/features/connect/sync/sync-manager.ts` (Defect 2 — cursor reset + reason)
- `src/routes/settings/ConnectSection.tsx` (surface the reason in `handleForceFullResync` only)
- `src/features/connect/sync/resync-cursor.test.ts` (create)

**Out of scope** (do NOT touch):
- `src/features/connect/sync/pull.ts` / `push.ts` — the merge/decrypt logic is
  correct and covered by `pull.test.ts`; changing it risks data corruption.
- The pairing flow (`pairing-flow.ts`) and vault key handling — plan 013 owns
  the recovery-UX changes; this plan must not alter pairing or key transfer.
- `clearAllData` / `demoData.ts` — plan 013 territory.
- The worker D1 migrations / schema — the `ON CONFLICT` targets already exist.
- Any change to what `registerUser` sends (keep sending the hash, never the secret).

## Git workflow

- Branch: `advisor/012-resync-correctness`
- Conventional commits, one per step is fine, e.g.
  `fix(worker): make POST /users idempotent` /
  `fix(sync): reset cursors + report reason on force full resync`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make `POST /users` idempotent in the worker

In `worker/src/index.ts`, in `handleRegister`, change the users insert to
`INSERT OR IGNORE` and the device insert to `INSERT OR IGNORE` (mirroring
`handleAddDevice`). After the batch, **verify the stored hash matches** the
incoming one so a different secret for an existing `userId` is rejected rather
than silently treated as success:

```ts
const now = new Date().toISOString();
await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO users (id, api_secret_hash, created_at) VALUES (?, ?, ?)")
    .bind(body.userId, body.apiSecretHash, now),
  env.DB.prepare(
    "INSERT OR IGNORE INTO devices (id, user_id, name, platform, trusted_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(body.device.id, body.userId, body.device.name, body.device.platform, now, now),
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
```

**Verify**: `cd worker && npx tsc --noEmit && cd ..` → exit 0. Then
`grep -n "INSERT OR IGNORE INTO users" worker/src/index.ts` → one match.

### Step 2: Add `resetSyncCursors()` to `deviceIdentity.ts`

In `src/state/deviceIdentity.ts`, add an exported helper that nulls both cursors
by reusing the existing setters (so the single `write()` shape stays canonical):

```ts
/** Reset both sync watermarks so the next sync re-pushes/re-pulls from scratch. */
export function resetSyncCursors(): DeviceIdentity {
  setLocalPushCursor(null);
  return setRemotePullCursor(null);
}
```

Place it directly below `setRemotePullCursor`.

**Verify**: `npx tsc --noEmit` → exit 0.
`grep -n "export function resetSyncCursors" src/state/deviceIdentity.ts` → one match.

### Step 3: Reset cursors up front + return a reason from `forceFullResync`

In `src/features/connect/sync/sync-manager.ts`:

1. Import the new helper. The existing import line is:
   `import { getOrCreateDeviceIdentity, setRemotePullCursor } from "../../../state/deviceIdentity";`
   Change it to also import `resetSyncCursors`.

2. Extend `SyncResult` with an optional reason:
   ```ts
   export interface SyncResult {
     pushed: number;
     pulled: number;
     applied: number;
     /** Set by forceFullResync when applied === 0, to explain why. */
     reason?: "ok" | "empty-relay" | "nothing-applied";
   }
   ```

3. In `forceFullResync`, after `const device = getOrCreateDeviceIdentity();` and
   **before** the drain loop, reset the cursors so no stale watermark survives:
   ```ts
   // Clear any stale watermark so a normal sync after this can't skip data,
   // and so the drain below truly starts from the beginning of the relay.
   resetSyncCursors();
   ```

4. After the loop, compute and return the reason (keep the existing
   `if (cursor) setRemotePullCursor(cursor);`):
   ```ts
   const reason: SyncResult["reason"] =
     applied > 0 ? "ok" : pulled === 0 ? "empty-relay" : "nothing-applied";
   return { pushed: 0, pulled, applied, reason };
   ```

Do not change the loop body, the backup call, or the `includeOwnDevice: true`
flag.

**Verify**: `npx tsc --noEmit` → exit 0.
`grep -n "resetSyncCursors()" src/features/connect/sync/sync-manager.ts` → one match.
`grep -n "empty-relay" src/features/connect/sync/sync-manager.ts` → present.

### Step 4: Surface the reason in `handleForceFullResync`

In `src/routes/settings/ConnectSection.tsx`, in `handleForceFullResync` only,
replace the single success toast with a result-aware message. Keep the
`setSyncDone` / `invalidateQueries` calls:

```tsx
const result = await forceFullResync(repo);
syncStatus.setSyncDone(result.pushed, result.pulled, result.applied);
await queryClient.invalidateQueries();
if (result.applied > 0) {
  toast.success(`已從伺服器完整重新下載，套用 ${result.applied} 筆`);
} else if (result.reason === "empty-relay") {
  toast.error("伺服器沒有可下載的資料。請確認這台裝置已配對到正確的同步帳號（設定 → 新增裝置 / 我有配對碼）。");
} else {
  toast.success(`已是最新狀態，沒有需要套用的變更（伺服器 ${result.pulled} 筆都已存在）。`);
}
```

Do not change the `catch` block.

**Verify**: `npx tsc --noEmit` → exit 0.
`grep -n "empty-relay" src/routes/settings/ConnectSection.tsx` → one match.

### Step 5: Add a unit test for the cursor-reset behavior

Create `src/features/connect/sync/resync-cursor.test.ts`. It tests the cheap,
pure piece — that `resetSyncCursors()` nulls both cursors in the persisted
identity — without standing up the relay. Use the `localStorage` stub from the
Conventions section.

Cover:
- After `getOrCreateDeviceIdentity()` then `setLocalPushCursor("abc")` and
  `setRemotePullCursor("99")`, calling `resetSyncCursors()` leaves a reloaded
  identity with `localPushCursor === null` and `remotePullCursor === null`,
  while `deviceId` is unchanged.

Read the existing exports of `src/state/deviceIdentity.ts` to import the right
names. Example skeleton:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOrCreateDeviceIdentity, setLocalPushCursor, setRemotePullCursor, resetSyncCursors,
} from "../../../state/deviceIdentity";

describe("resetSyncCursors", () => {
  beforeEach(() => { /* localStorage stub from Conventions */ });
  afterEach(() => vi.unstubAllGlobals());

  it("nulls both cursors but keeps the device id", () => {
    const before = getOrCreateDeviceIdentity();
    setLocalPushCursor("abc");
    setRemotePullCursor("99");
    resetSyncCursors();
    const after = getOrCreateDeviceIdentity();
    expect(after.deviceId).toBe(before.deviceId);
    expect(after.localPushCursor).toBeNull();
    expect(after.remotePullCursor).toBeNull();
  });
});
```

**Verify**: `npx vitest run src/features/connect/sync/resync-cursor.test.ts` →
all pass.

### Step 6: Full verification

**Verify**:
- `npx tsc --noEmit` → exit 0
- `cd worker && npx tsc --noEmit && cd ..` → exit 0
- `npm test` → all pass (existing + new)
- `npm run lint` → exit 0 (pre-existing warnings ok; no NEW errors in touched files)

## Test plan

- New: `src/features/connect/sync/resync-cursor.test.ts` — asserts
  `resetSyncCursors()` clears both watermarks and preserves `deviceId`
  (1+ cases). Structural pattern: `src/features/connect/sync/pull.test.ts`.
- The worker idempotency and the toast wording are **not** unit-tested (no
  worker harness; toast is UI copy). They are verified by typecheck + code
  review and the manual checklist below.
- Manual checklist for the operator (cannot be automated here — needs the real
  relay + two devices):
  1. On a device that already has an account, tap "啟用同步" again → expect no
     "啟用失敗" (the worker must be redeployed first — see Maintenance).
  2. Wipe device A's local financial data, then "完整重新下載" → expect the
     holdings/ledger to reappear and the toast to read "套用 N 筆".
  3. On a brand-new account with nothing on the relay, "完整重新下載" → expect
     the "伺服器沒有可下載的資料…" message, not a silent success.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `cd worker && npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; `resync-cursor.test.ts` exists and passes
- [ ] `grep -n "INSERT OR IGNORE INTO users" worker/src/index.ts` → one match
- [ ] `grep -n "export function resetSyncCursors" src/state/deviceIdentity.ts` → one match
- [ ] `grep -n "resetSyncCursors()" src/features/connect/sync/sync-manager.ts` → one match
- [ ] `git status` shows only the five in-scope files modified/created
- [ ] `plans/README.md` status row for 012 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The worker schema does not have a `UNIQUE`/`PRIMARY KEY` on `users.id` (then
  `INSERT OR IGNORE` is a no-op for the wrong reason). Check
  `worker/migrations/` and report before changing the handler.
- `pullAndApply`'s signature or `SyncPullResult` shape differs from the
  "Current state" excerpt — the cursor loop depends on `nextCursor`.
- `forceFullResync` already resets cursors or already returns a `reason` (the
  branch may have advanced) — reconcile instead of duplicating.
- Adding the `reason` field breaks a different caller of `forceFullResync`
  (search `grep -rn "forceFullResync" src/`) — there should be exactly one
  caller (`ConnectSection.tsx`); if there are more, report.

## Maintenance notes

- **The worker change only takes effect after a deploy.** Per
  `MEMORY.md` (release+updater), the worker has its own deploy path
  (`cd worker && npm run deploy`, or the project's CI). The operator's installed
  app talks to the already-deployed worker, so this fix does nothing for them
  until the worker is redeployed. Call this out explicitly in your hand-off.
- This plan deliberately does **not** clear the account/vault key or add a
  guided recovery flow — that is plan 013, which depends on the
  `resetSyncCursors` primitive added here.
- A reviewer should confirm the 409 path can't lock out a legitimate user who
  rotated their secret intentionally (today the app never rotates `apiSecret`,
  so this is safe; revisit if secret rotation is ever added).
