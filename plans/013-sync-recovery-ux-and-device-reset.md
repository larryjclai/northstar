# Plan 013: A reinstalled device gets its data back in one tap, and "reset this device" truly wipes local sync state

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a4ee4f2b..HEAD -- src/routes/settings/ConnectSection.tsx src/data/repositories.ts src/features/connect/sync/`
> If any of these changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M–L
- **Risk**: MED
- **Depends on**: plans/012-sync-resync-correctness-and-diagnostics.md
- **Category**: bug / dx
- **Planned at**: commit `a4ee4f2b`, 2026-06-15

## Why this matters

The operator reports the sync recovery flow is too hard to use and doesn't work
in practice: after reinstalling on device A and pairing to device B, the data
never comes back, and "清空本地資料" doesn't seem to fully clear local state.

Two root usability problems, both fixable here:

1. **Pairing alone does not download data.** `joinWithCode` registers the device
   and inherits the vault key, but the new/reinstalled device still shows
   *empty* until the user separately discovers and taps "完整重新下載". Most
   users never make that second connection, so "I paired and nothing came back"
   is the expected outcome, not a bug in pairing. The fix is to **chain a full
   re-download onto a successful join** so one action both pairs and restores.

2. **There is no honest "reset this device" — local sync state is scattered and
   sticky.** "清空所有資料" (`clearAllData`) wipes financial *rows* but leaves the
   device identity + pull/push cursors (`northstar.device.v1`), the sync account
   (`northstar.sync.account.v1`), the vault key, the recovery-kit flag
   (`northstar.recovery.status.v1`), and the `sync_conflicts` table. On desktop
   these survive an app reinstall too (Tauri app data isn't removed with the
   bundle). So the device is never in a clean "first-run" state, which is exactly
   the confusion behind "本地資料清空也沒有完整的把本地資料刪掉的樣子". The fix
   is a real `clearLocalSyncState()` that wipes all of it, surfaced as an
   explicit "完全重設此裝置" action.

After this plan: tapping "加入同步" on a fresh/reinstalled device pairs **and**
pulls the data in one go; and a clearly-labelled reset returns the device to a
genuine first-run state so re-pairing is clean.

This plan **depends on plan 012** — it uses `forceFullResync`'s new `reason`
field and the `resetSyncCursors` primitive. Do 012 first.

## Current state

### `clearAllData` keeps all sync state

`src/data/demoData.ts:529-547` — `clearAllData` imports an empty snapshot
(preserving settings). It does not touch any `localStorage` sync key, the vault
key, or `sync_conflicts`. (Do not modify `clearAllData` itself — see Scope.)

The sync-related local state lives in these `localStorage` keys (verified):
- `northstar.device.v1` — device id + both cursors (`src/state/deviceIdentity.ts:6`)
- `northstar.sync.account.v1` — userId + apiSecret (`src/features/connect/sync/account.ts:4`)
- `northstar.vault.key.v1` and `northstar.device.keypair.v1` — secrets
  (`src/features/connect/crypto/secretStore.ts:33-37`, `SECRET_KEYS`)
- `northstar.recovery.status.v1` — recovery-kit confirmed flag
  (`src/features/connect/crypto/recovery-kit.ts:13`, `STATUS_KEY` — not exported)
- plus the `sync_conflicts` DB table (no repo method clears it today).

### Join does not pull

`src/routes/settings/ConnectSection.tsx:291-316` — `handleJoin` calls
`joinWithCode`, refreshes account/devices, closes the dialog, and toasts
"裝置已成功加入同步". It never pulls data:

```tsx
async function handleJoin() {
  if (!syncWorkerConfigured) { setJoinError("…"); return; }
  setJoinError(null);
  setJoinLoading(true);
  try {
    await joinWithCode(joinCode, joinDeviceName, getDevicePlatform());
    const joined = loadSyncAccount()!;
    setAccount(joined);
    setKitStatus(loadLocalRecoveryKitStatus());
    const devs = await listDevices(joined.apiSecret);
    setDevices(devs);
    setShowDialog(false);
    setJoinCode("");
    toast.success("裝置已成功加入同步");
  } catch (e) {
    setJoinError(e instanceof Error ? e.message : "配對失敗，請確認配對碼是否正確");
  } finally {
    setJoinLoading(false);
  }
}
```

`forceFullResync` is already imported in this file
(`import { runSync, forceFullResync } from "../../features/connect/sync/sync-manager";`).
After plan 012 it returns `{ pushed, pulled, applied, reason }`.

### Conflict-table access in the repository

`src/data/repositories.ts` exposes sync-conflict methods on the
`FinanceRepository` interface (around the `importSnapshot` declaration, line
~287) and implements them in both the in-memory base class and the SQLite
override. Reference points:
- In-memory `applySyncChanges` pushes into `this.data.syncConflicts`
  (`repositories.ts:1509-1511`).
- SQLite `listSyncConflicts` reads `from sync_conflicts`
  (`repositories.ts:3219-3241`); `resolveSyncConflict` starts at
  `repositories.ts:3243`.

There is currently **no** `clearSyncConflicts` method — you will add one.

### Conventions to follow

- **Two-click inline confirm, never `window.confirm`** — it's a no-op in the
  Tauri webview. Destructive actions in this file use a `useState` flag flipped
  on first click and the real action on the second. Examples already in the
  file: `confirmFullResync` (lines ~139, 653-667), `confirmRevokeId`
  (lines ~136, 689-696), `confirmRestoreTs` (lines ~412, 778-789). Match this
  pattern exactly for the new reset action.
- **Toasts** via `useToast()` (`toast.success` / `toast.error`).
- **Copy** is Chinese (zh-TW), inline in the TSX.
- **Tests**: vitest; jsdom has no real `localStorage` — stub it per-test with
  `vi.stubGlobal` (see plan 012's Conventions block for the exact stub, or copy
  from `resync-cursor.test.ts` once 012 lands).

## Commands you will need

| Purpose      | Command                                                   | Expected             |
|--------------|-----------------------------------------------------------|----------------------|
| Typecheck    | `npx tsc --noEmit`                                        | exit 0, no errors    |
| Tests        | `npm test`                                                | all pass             |
| New test     | `npx vitest run src/features/connect/sync/reset.test.ts` | new tests pass       |
| Lint         | `npm run lint`                                            | exit 0 (warnings ok) |

## Scope

**In scope**:
- `src/features/connect/sync/reset.ts` (create — `clearLocalSyncState`)
- `src/features/connect/sync/reset.test.ts` (create)
- `src/data/repositories.ts` (add `clearSyncConflicts` to interface + both impls)
- `src/routes/settings/ConnectSection.tsx` (auto-pull after join; "完全重設此裝置" action; copy)
- `src/features/connect/crypto/recovery-kit.ts` (export a `clearRecoveryKitStatus` helper — small addition)

**Out of scope** (do NOT touch):
- `src/data/demoData.ts` `clearAllData` — reuse it, don't change its contract.
- `pairing-flow.ts`, `pull.ts`, `push.ts`, `vault.ts` crypto internals — call
  them, don't modify them.
- `sync-manager.ts` — owned by plan 012; this plan only *calls* `forceFullResync`.
- The worker.

## Git workflow

- Branch: `advisor/013-sync-recovery-ux`
- Conventional commits, e.g. `feat(sync): pull data automatically after pairing`,
  `feat(sync): add full device reset for clean re-pairing`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `clearRecoveryKitStatus()` to recovery-kit.ts

In `src/features/connect/crypto/recovery-kit.ts`, the confirmed-status flag is
stored under the module-private `STATUS_KEY` (`northstar.recovery.status.v1`).
Add an exported helper so the reset coordinator can clear it without duplicating
the key string:

```ts
/** Clear the local "recovery kit confirmed" flag (used by full device reset). */
export function clearRecoveryKitStatus(): void {
  try { localStorage.removeItem(STATUS_KEY); } catch { /* ignore */ }
}
```

Place it next to `confirmRecoveryKit` / `loadLocalRecoveryKitStatus`.

**Verify**: `grep -n "export function clearRecoveryKitStatus" src/features/connect/crypto/recovery-kit.ts` → one match. `npx tsc --noEmit` → exit 0.

### Step 2: Add `clearSyncConflicts()` to the repository

In `src/data/repositories.ts`:

1. **Interface**: next to the other sync-conflict method declarations (near
   `listSyncConflicts` / `resolveSyncConflict` in the `FinanceRepository`
   interface), add: `clearSyncConflicts(): Promise<void>;`
2. **In-memory base impl** (the class that stores `this.data.syncConflicts`):
   ```ts
   async clearSyncConflicts(): Promise<void> {
     this.data.syncConflicts = [];
     await this.persist();
   }
   ```
   Match the surrounding methods' use of `this.persist()`.
3. **SQLite override** (the class with `listSyncConflicts` reading
   `from sync_conflicts`):
   ```ts
   override async clearSyncConflicts(): Promise<void> {
     await this.db.execute("delete from sync_conflicts");
   }
   ```

Read the two existing conflict methods first to copy their exact
casing/`this.db`/`this.persist` conventions.

**Verify**: `grep -n "clearSyncConflicts" src/data/repositories.ts` → three
matches (interface + 2 impls). `npx tsc --noEmit` → exit 0.

### Step 3: Create the `clearLocalSyncState` coordinator

Create `src/features/connect/sync/reset.ts`. It returns the device to a genuine
first-run state: financial rows cleared, all sync `localStorage` keys removed,
conflicts cleared. It does **not** call the relay (resetting is purely local —
the server keeps the user's data so they can re-pair and re-download).

```ts
// Full local reset of this device's sync state, for a clean re-pair.
//
// Removes everything that makes the device "remember" a previous sync:
//   - financial rows (via clearAllData)
//   - device identity + cursors, sync account, vault key + device keypair
//   - recovery-kit confirmed flag
//   - local sync conflicts
//
// The server copy is untouched: after this, the user pairs again (or restores
// from a Recovery Kit) and pulls their data back down.

import type { FinanceRepository } from "../../../data/repositories";
import { clearAllData } from "../../../data/demoData";
import { SECRET_KEYS } from "../crypto/secretStore";
import { clearRecoveryKitStatus } from "../crypto/recovery-kit";

const DEVICE_KEY = "northstar.device.v1";
const ACCOUNT_KEY = "northstar.sync.account.v1";

export async function clearLocalSyncState(repo: FinanceRepository): Promise<void> {
  // 1. Financial data + sync_outbox (clearAllData wipes both on desktop).
  await clearAllData(repo);

  // 2. Local sync conflicts.
  await repo.clearSyncConflicts();

  // 3. All sync-related localStorage keys (identity, cursors, account, secrets).
  const keys = [DEVICE_KEY, ACCOUNT_KEY, ...SECRET_KEYS];
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { /* ignore quota/private mode */ }
  }

  // 4. Recovery-kit confirmed flag.
  clearRecoveryKitStatus();
}
```

Note: `SECRET_KEYS` already includes `northstar.vault.key.v1`,
`northstar.device.keypair.v1`, and `northstar.sync.account.v1` — the explicit
`ACCOUNT_KEY` in the list is harmless (dedup not required; `removeItem` is
idempotent), but keep it for clarity.

**Verify**: `npx tsc --noEmit` → exit 0.
`grep -n "export async function clearLocalSyncState" src/features/connect/sync/reset.ts` → one match.

### Step 4: Auto-pull after a successful join

In `src/routes/settings/ConnectSection.tsx`, update `handleJoin` so that after a
successful `joinWithCode` it immediately runs `forceFullResync` to bring the
account's data onto this device. Keep the existing account/device refresh and
dialog-close behavior; show a result-aware toast.

Replace the body of the `try` block in `handleJoin` with:

```tsx
await joinWithCode(joinCode, joinDeviceName, getDevicePlatform());
const joined = loadSyncAccount()!;
setAccount(joined);
setKitStatus(loadLocalRecoveryKitStatus());
const devs = await listDevices(joined.apiSecret);
setDevices(devs);
setShowDialog(false);
setJoinCode("");

// Pairing alone leaves this device empty — immediately pull the account's
// data so "join" restores in one step. (forceFullResync is pull-only; it
// never overwrites the server.)
toast.success("裝置已加入，正在下載資料…");
try {
  syncStatus.setPhase("pulling");
  const repo = await getFinanceRepository();
  const result = await forceFullResync(repo);
  syncStatus.setSyncDone(result.pushed, result.pulled, result.applied);
  await queryClient.invalidateQueries();
  toast.success(
    result.applied > 0
      ? `已下載並套用 ${result.applied} 筆資料`
      : "已加入同步（伺服器目前沒有可下載的資料）",
  );
} catch (pullErr) {
  const msg = pullErr instanceof Error ? pullErr.message : String(pullErr);
  console.error("[sync] post-join resync failed:", pullErr);
  syncStatus.setError(msg);
  toast.error("已加入同步，但自動下載失敗，請稍後在設定按「完整重新下載」。");
}
```

`getFinanceRepository`, `forceFullResync`, `syncStatus`, and `queryClient` are
all already in scope in this component (verify by reading the imports/hooks at
the top of `ConnectStatus`). Do not add new imports unless typecheck demands it.

**Verify**: `npx tsc --noEmit` → exit 0.
`grep -n "正在下載資料" src/routes/settings/ConnectSection.tsx` → one match.

### Step 5: Add a "完全重設此裝置" action to the active card

In the active (`account` set) branch of `ConnectStatus`, add a destructive
reset control using the **two-click inline confirm** pattern (mirror
`confirmFullResync`). Place it just after the existing "完整重新下載" recovery
box (the `<div>` ending around line 668), before the device list.

1. Add state near the other confirm flags (by `confirmFullResync`):
   ```tsx
   const [confirmDeviceReset, setConfirmDeviceReset] = useState(false);
   ```
2. Add a handler near `handleForceFullResync`:
   ```tsx
   async function handleDeviceReset() {
     setConfirmDeviceReset(false);
     try {
       const repo = await getFinanceRepository();
       await clearLocalSyncState(repo);
       await queryClient.invalidateQueries();
       // Drop back to first-run state in the UI.
       setAccount(null);
       setDevices([]);
       setKitStatus(null);
       toast.success("已重設此裝置。可重新「啟用同步」或用配對碼／備援碼還原。");
     } catch (e) {
       toast.error("重設失敗：" + (e instanceof Error ? e.message : String(e)));
     }
   }
   ```
3. Import the coordinator at the top of the file:
   `import { clearLocalSyncState } from "../../features/connect/sync/reset";`
4. Render the control (mirroring the `confirmFullResync` box markup):
   ```tsx
   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
     padding: "10px 12px", marginBottom: 16, borderRadius: "var(--ns-r-md)",
     background: "var(--ns-neg-soft)", border: "1px solid var(--ns-neg)" }}>
     <div className="text-caption" style={{ color: "var(--ns-fg-muted)", lineHeight: 1.5 }}>
       完全重設此裝置：清除本機所有財務資料與同步設定（裝置 ID、加密金鑰、配對帳號、備援碼狀態），讓這台裝置回到全新狀態。<strong>伺服器上的資料不受影響</strong>，可重新配對後下載回來。建議先到「備份與還原」匯出一份備份。
     </div>
     {confirmDeviceReset
       ? <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
           <Button variant="ghost" className="text-xs" onClick={() => setConfirmDeviceReset(false)}>取消</Button>
           <Button variant="outline" className="text-xs" style={{ color: "var(--ns-neg)", borderColor: "var(--ns-neg)" }}
             onClick={handleDeviceReset}>確認重設</Button>
         </div>
       : <Button variant="ghost" className="text-xs" style={{ flexShrink: 0, color: "var(--ns-neg)" }}
           onClick={() => setConfirmDeviceReset(true)}>
           <Trash size={13} />完全重設此裝置
         </Button>
     }
   </div>
   ```
   `Trash` is already imported in this file (used by the device-revoke button).

**Verify**: `npx tsc --noEmit` → exit 0.
`grep -n "完全重設此裝置" src/routes/settings/ConnectSection.tsx` → at least two
matches (description + button label).

### Step 6: Unit test for `clearLocalSyncState`

Create `src/features/connect/sync/reset.test.ts`. Use the `localStorage` stub
(plan 012 Conventions) and a minimal fake repo. Assert that after
`clearLocalSyncState(fakeRepo)`:
- `clearAllData` was invoked (assert via a spy or via the fake repo's
  `importSnapshot` being called with empty arrays),
- `repo.clearSyncConflicts` was called,
- `localStorage` no longer contains `northstar.device.v1`,
  `northstar.sync.account.v1`, `northstar.vault.key.v1`,
  `northstar.device.keypair.v1`, or `northstar.recovery.status.v1`.

Skeleton:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalSyncState } from "./reset";

describe("clearLocalSyncState", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map([
      ["northstar.device.v1", "{}"],
      ["northstar.sync.account.v1", "{}"],
      ["northstar.vault.key.v1", "x"],
      ["northstar.device.keypair.v1", "x"],
      ["northstar.recovery.status.v1", "{}"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("wipes financial data, conflicts, and all sync localStorage keys", async () => {
    const importSnapshot = vi.fn().mockResolvedValue(undefined);
    const clearSyncConflicts = vi.fn().mockResolvedValue(undefined);
    // clearAllData calls getAppSettings then importSnapshot — provide both.
    const repo = { getAppSettings: vi.fn().mockResolvedValue({}), importSnapshot, clearSyncConflicts } as any;

    await clearLocalSyncState(repo);

    expect(importSnapshot).toHaveBeenCalledOnce();
    expect(clearSyncConflicts).toHaveBeenCalledOnce();
    for (const k of ["northstar.device.v1", "northstar.sync.account.v1", "northstar.vault.key.v1", "northstar.device.keypair.v1", "northstar.recovery.status.v1"]) {
      expect(store.has(k)).toBe(false);
    }
  });
});
```

If `clearAllData`'s real call surface differs (it reads `getAppSettings()` then
calls `importSnapshot(...)` — see `demoData.ts:529-547`), adjust the fake repo
to satisfy it; do not change `clearAllData`.

**Verify**: `npx vitest run src/features/connect/sync/reset.test.ts` → all pass.

### Step 7: Full verification

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm test` → all pass (existing + 2 new files across plans 012/013)
- `npm run lint` → exit 0 (pre-existing warnings ok; no NEW errors in touched files)

## Test plan

- New: `src/features/connect/sync/reset.test.ts` — verifies `clearLocalSyncState`
  wipes financial data (importSnapshot called), conflicts, and every sync
  `localStorage` key. Pattern: plan 012's `resync-cursor.test.ts` /
  `pull.test.ts`.
- The auto-pull-after-join and the reset UI are not unit-tested (they need the
  relay + DOM). Manual checklist for the operator:
  1. Fresh/reinstalled device → "我有配對碼" → enter the other device's code →
     expect the data to download automatically and a "已下載並套用 N 筆" toast,
     with no separate "完整重新下載" needed.
  2. "完全重設此裝置" → confirm → the Connect card returns to the not-set-up
     ("啟用同步") state; re-pairing then works cleanly.
  3. After reset, confirm (in devtools or a fresh launch) that
     `localStorage` has no `northstar.device.v1` / `northstar.sync.account.v1` /
     vault key.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; `reset.test.ts` exists and passes
- [ ] `grep -n "clearSyncConflicts" src/data/repositories.ts` → 3 matches
- [ ] `grep -n "export async function clearLocalSyncState" src/features/connect/sync/reset.ts` → one match
- [ ] `grep -n "正在下載資料" src/routes/settings/ConnectSection.tsx` → one match (auto-pull after join)
- [ ] `grep -n "完全重設此裝置" src/routes/settings/ConnectSection.tsx` → ≥2 matches
- [ ] `git status` shows only the in-scope files modified/created
- [ ] `plans/README.md` status row for 013 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 012 is not yet DONE (this plan needs `forceFullResync`'s `reason` field
  and `resetSyncCursors`). Check `plans/README.md` status first.
- The `FinanceRepository` interface or the two repo classes are structured
  differently from the "Current state" excerpts (e.g. `syncConflicts` is stored
  elsewhere) — adding `clearSyncConflicts` would then need a different shape;
  report rather than guessing.
- `handleJoin` already pulls after join, or a different recovery auto-flow
  exists (the branch advanced) — reconcile instead of duplicating.
- `clearAllData`'s signature/behavior differs from `demoData.ts:529-547` —
  `clearLocalSyncState` relies on it wiping rows.

## Maintenance notes

- **Order of operations matters in `clearLocalSyncState`**: clear the DB/conflicts
  *before* removing the vault key — once the key is gone, any encrypted on-disk
  artifact can't be decrypted, but `clearAllData` works on plaintext rows so the
  current order is fine. Keep DB ops before key removal if you extend it.
- If a future change moves secrets into Stronghold (see `secretStore.ts`,
  `USE_STRONGHOLD`, and `docs/secret-storage-plan.md`), `clearLocalSyncState`
  must also clear the Stronghold snapshot — today secrets live in `localStorage`,
  so removing the `SECRET_KEYS` keys is sufficient. Add a TODO referencing that
  doc.
- A reviewer should confirm the auto-pull after join is **pull-only**
  (`forceFullResync` never pushes) so a freshly-paired empty device can't upload
  placeholder state and clobber the relay.
- Deferred out of scope: a single "switch device" wizard combining reset +
  re-pair into one screen. The primitives added here (`clearLocalSyncState`,
  auto-pull-after-join) are the building blocks if that's wanted later.
