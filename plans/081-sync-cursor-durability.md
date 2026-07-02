# Plan 081: Make device identity & sync cursors survive localStorage eviction (077 Phase 3.1, corrected)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. Touch only
> the files listed as in scope. Commit per the Git workflow section.
>
> **Drift check (run first)**: `git diff --stat 46febcab..HEAD -- src/state/deviceIdentity.ts src/main.tsx src/features/connect/sync/`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — touches app boot (`main.tsx`) and the device-identity store that
  the sync protocol depends on; a mistake could mint duplicate device IDs
- **Depends on**: none
- **Category**: bug / correctness (data durability)
- **Planned at**: commit `46febcab`, 2026-06-27

## Why this matters

Northstar's end-to-end-encrypted sync identifies each device by a **device-local**
identity: a `deviceId` UUID plus two sync watermarks (`localPushCursor`,
`remotePullCursor`). This identity lives **only** in `localStorage` and is
intentionally NOT part of the synced vault or the backup snapshot (see the code
comment in `deviceIdentity.ts`). On iOS, WebKit can evict `localStorage` under
storage pressure. If that happens, the app loses its `deviceId` and cursors and, on
the next launch, **mints a brand-new `deviceId`** — which to the relay looks like a
new device, forcing a full re-push/re-pull and potentially duplicating data lineage.
This plan adds a durable per-device file mirror (in the app's local data directory,
via the `plugin-fs` already used for backups) so the identity survives `localStorage`
eviction, **without** moving it into the synced/backed-up SQLite database (which would
break its device-locality — see "Rejected approach" below).

### Rejected approach (do NOT do this)

A naive fix is to store the cursor in the SQLite database (a `_sync_meta` table). **Do
not.** The SQLite database IS the repository that gets backed up by
`src/features/local-backup/localBackup.ts` and is the basis for sync. Putting the
`deviceId`/cursors there means a backup restored onto a second device would carry the
first device's identity — two devices sharing one `deviceId` corrupts sync. The
identity must stay device-local. A file in `BaseDirectory.AppLocalData` (NOT inside
the SQLite repo, NOT in the backup snapshot, NOT synced) is the correct durable store.

## Current state

**`src/state/deviceIdentity.ts`** — the whole store is synchronous over `localStorage`:
```ts
// Device identity is intentionally device-local (it is NOT part of the synced
// vault), so it lives in localStorage rather than the repository/backup.
const STORAGE_KEY = "northstar.device.v1";

function read(): DeviceIdentity | null { /* localStorage.getItem(STORAGE_KEY) → parse */ }
function write(identity: DeviceIdentity) { /* localStorage.setItem(STORAGE_KEY, JSON.stringify) */ }

export function getOrCreateDeviceIdentity(): DeviceIdentity { /* read() or mint+write() */ }
export function setLocalPushCursor(cursor: string | null): DeviceIdentity { /* read→merge→write */ }
export function setRemotePullCursor(cursor: string | null): DeviceIdentity { /* read→merge→write */ }
export function resetSyncCursors(): DeviceIdentity { /* both → null */ }
```

**These functions MUST stay synchronous.** `getOrCreateDeviceIdentity()` is called
synchronously in React render paths — six Settings sections do
`useState(() => getOrCreateDeviceIdentity())` (`ConnectSection.tsx:92`,
`ExportSection.tsx`, `GeneralSection.tsx`, `MerchantsSection.tsx`, `FxSection.tsx`,
`CategoriesSection.tsx`), and `push.ts`/`pairing-flow.ts`/`sync-manager.ts` call it
inline. Making the API async would cascade into all of them. Do not.

**`src/main.tsx`** — synchronous app boot:
```ts
import ReactDOM from "react-dom/client";
import { router } from "./routes/router";
import "./styles/globals.css";
import "./i18n";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

**The `plugin-fs` pattern to copy** — `src/features/local-backup/localBackup.ts` lazily
imports `@tauri-apps/plugin-fs` and writes to `BaseDirectory.AppLocalData`:
```ts
let fsPromise: Promise<typeof import("@tauri-apps/plugin-fs")> | null = null;
const fs = () => (fsPromise ??= import("@tauri-apps/plugin-fs"));
// ...
const { writeTextFile, BaseDirectory } = await fs();
await writeTextFile(`${BACKUP_DIR}/${entry.id}`, JSON.stringify(snapshot), { baseDir: BaseDirectory.AppLocalData });
// reads use readTextFile + exists with { baseDir: BaseDirectory.AppLocalData }
```
The `fs:allow-applocaldata-*` permissions are already granted in
`src-tauri/capabilities/default.json` — no capability change needed.

### Conventions to follow

- Tauri detection: `typeof window !== "undefined" && "__TAURI_INTERNALS__" in window`
  (the exact check used in `AppShell.tsx:applyNativeGlassAttribute`). In a plain
  browser / vitest this is false → file mirror is a silent no-op.
- All file I/O is best-effort: wrap in try/catch and swallow errors (never throw to
  the caller). The localStorage path stays authoritative at runtime; the file is a
  durability backstop.
- Tests: vitest + jsdom has **no** `localStorage` — stub it per test with
  `vi.stubGlobal` (this repo's standard; see `src/features/connect/sync/reset.test.ts`
  and `resync-cursor.test.ts`). Mock `@tauri-apps/plugin-fs` with `vi.mock`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install (worktree) | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Targeted test | `npx vitest run src/state/deviceIdentity.test.ts` | new tests pass |
| Full tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |

> Fresh worktree has no `node_modules` — run `npm install` first.

## Scope

**In scope**:
- `src/state/deviceIdentity.ts` — add file mirror + `hydrateDeviceIdentity()` (keep the existing synchronous API)
- `src/main.tsx` — `await hydrateDeviceIdentity()` before `render()`
- `src/state/deviceIdentity.test.ts` — new test file (create)

**Out of scope** (do NOT touch):
- **A SQLite `_sync_meta` table / any repository or migration change** — rejected
  above; it breaks device-locality
- `src/features/connect/sync/*` (sync-manager, push, pull, pairing) — the identity API
  stays synchronous, so these need no change
- `src/components/AppShell.tsx` — the iOS `visibilitychange`/`tauri://resumed`
  listeners (077 Phase 3.2) are deferred; the existing `tauri://focus` + 60s throttle
  already covers auto-sync, and AppShell has an unmerged branch in flight
- Backup/restore logic — the mirror file must remain OUTSIDE the backup snapshot

## Git workflow

- Branch: `feat/ai-sync-cursor-durability` (create in the worktree)
- Conventional commits, e.g. `fix(sync): mirror device identity to a durable file to survive localStorage eviction`
- Commit when done. Do NOT push or open a PR.

## Steps

### Step 1: Add a best-effort file mirror to `deviceIdentity.ts`

Add (keep all existing exports synchronous and unchanged in signature):

- A module constant for the filename, e.g. `const IDENTITY_FILE = "device-identity.json";`
- A lazy fs accessor copied from the localBackup pattern:
  ```ts
  let fsPromise: Promise<typeof import("@tauri-apps/plugin-fs")> | null = null;
  const fs = () => (fsPromise ??= import("@tauri-apps/plugin-fs"));
  function isTauri(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  }
  ```
- `async function mirrorToFile(identity: DeviceIdentity): Promise<void>` — if `!isTauri()`
  return; else `try { const { writeTextFile, BaseDirectory } = await fs(); await
  writeTextFile(IDENTITY_FILE, JSON.stringify(identity), { baseDir: BaseDirectory.AppLocalData }); } catch { /* best effort */ }`
- In the existing synchronous `write(identity)`, after the `localStorage.setItem`, add
  a fire-and-forget mirror: `void mirrorToFile(identity);` (do NOT make `write` async).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Add `hydrateDeviceIdentity()` for eviction recovery

Add an exported async function that restores the identity from the file when
`localStorage` has lost it:
```ts
/**
 * Restore the device identity from the durable file mirror when localStorage has
 * been evicted (iOS WebKit can drop it under storage pressure). Call ONCE at app
 * boot, before anything reads the identity. Best-effort and Tauri-only; a no-op in
 * the browser and in tests without a mocked fs.
 */
export async function hydrateDeviceIdentity(): Promise<void> {
  if (!isTauri()) return;
  try {
    const existing = read();              // current localStorage value (sync)
    if (existing) { void mirrorToFile(existing); return; } // keep file fresh, done
    const { readTextFile, exists, BaseDirectory } = await fs();
    if (!(await exists(IDENTITY_FILE, { baseDir: BaseDirectory.AppLocalData }))) return;
    const text = await readTextFile(IDENTITY_FILE, { baseDir: BaseDirectory.AppLocalData });
    const parsed = JSON.parse(text) as Partial<DeviceIdentity>;
    if (parsed && parsed.deviceId) write(parsed as DeviceIdentity); // restores localStorage (and re-mirrors)
  } catch {
    // best-effort; on any failure the app falls back to minting a fresh identity
  }
}
```
Reuse the existing private `read()` and `write()`. Do not duplicate parsing logic
beyond the minimal `deviceId` presence check shown.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Hydrate at app boot before React renders (race-free placement)

In `src/main.tsx`, wrap the render so hydration completes first. This is the only
race-free spot — it guarantees no Settings render or sync call reads the identity (and
mints a new `deviceId`) before the file→localStorage restore runs:
```ts
import { hydrateDeviceIdentity } from "./state/deviceIdentity";
// ...
async function bootstrap() {
  // Restore device identity from its durable file mirror before any render reads it.
  // Tauri-only and bounded (one small file in AppLocalData); instant no-op in browser.
  await hydrateDeviceIdentity();
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
void bootstrap();
```
Keep all existing imports. Do not change the render tree itself.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 4: Unit tests

Create `src/state/deviceIdentity.test.ts`. Stub `localStorage` with `vi.stubGlobal`
(jsdom has none) and `vi.mock("@tauri-apps/plugin-fs", …)` with in-memory fakes; set
`window.__TAURI_INTERNALS__` so `isTauri()` returns true in the relevant cases. Cover:

1. **Mirror on write**: with Tauri + mocked fs, calling `getOrCreateDeviceIdentity()`
   (first time) or `setRemotePullCursor("c1")` results in `writeTextFile` being called
   with JSON containing the current identity. (The mirror is fire-and-forget — `await`
   a microtask / flush promises before asserting, e.g. `await Promise.resolve()` or
   `await vi.waitFor(...)`.)
2. **Hydrate restores after eviction**: localStorage empty, the mocked file contains a
   valid identity (`deviceId: "dev_persisted"`); after `await hydrateDeviceIdentity()`,
   `getOrCreateDeviceIdentity().deviceId === "dev_persisted"` (NOT a freshly minted id).
3. **Hydrate keeps existing**: localStorage already has an identity; after
   `await hydrateDeviceIdentity()`, the deviceId is unchanged and `writeTextFile` was
   called to refresh the file mirror.
4. **Browser no-op**: with `__TAURI_INTERNALS__` absent, `hydrateDeviceIdentity()`
   resolves without calling fs, and `getOrCreateDeviceIdentity()` still works via
   localStorage only.

Model the localStorage stub on `src/features/connect/sync/reset.test.ts`.

**Verify**: `npx vitest run src/state/deviceIdentity.test.ts` → all 4 tests pass.

## Test plan

- New file `src/state/deviceIdentity.test.ts` with the four cases above. The assertions
  check real values (the restored `deviceId`, the `writeTextFile` argument), not just
  that a function ran.
- Verification: `npm test` → all pass, including the 4 new tests.

## Done criteria (ALL must hold)

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] `npx vitest run src/state/deviceIdentity.test.ts` → 4 tests pass
- [ ] `npm test` exits 0 (no new failures)
- [ ] `grep -n "hydrateDeviceIdentity" src/main.tsx` returns a match (hydration wired at boot)
- [ ] `grep -rn "_sync_meta\|sync_meta" src/` returns NO match (the rejected SQLite approach was not taken)
- [ ] `getOrCreateDeviceIdentity`, `setLocalPushCursor`, `setRemotePullCursor` remain
  synchronous (signatures unchanged — `grep -n "export function getOrCreateDeviceIdentity" src/state/deviceIdentity.ts` still shows `function`, not `async function`)
- [ ] No files outside the in-scope list modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpts don't match the live code (drift since `46febcab`).
- Making the mirror work appears to require changing any cursor setter or
  `getOrCreateDeviceIdentity` to `async` — it must not; report instead.
- `main.tsx` cannot `await` before render without a larger restructure than shown.
- The `plugin-fs` API names (`writeTextFile`/`readTextFile`/`exists`/`BaseDirectory`)
  differ from the localBackup.ts usage — report rather than guessing.
- You find the identity is already persisted somewhere durable (the premise is wrong).

## Maintenance notes

- **Deferred from 077 Phase 3** (NOT in this plan): the iOS `visibilitychange` /
  `tauri://resumed` auto-sync listeners (Phase 3.2 — the 60s throttle already exists in
  `useAutoSync`) and any further background-termination handling (Phase 3.3 —
  `forceFullResync` already covers recovery). Both touch `AppShell.tsx`, which has an
  unmerged branch in flight; sequence them after that lands.
- **Reviewer focus**: confirm the identity file is written to `AppLocalData` (device-
  local) and is NOT added to the backup snapshot or the synced vault; confirm the boot
  hydration is `await`ed before `render()`; confirm no setter became async.
- **Backup/restore interaction**: if a future "restore from backup" feature is added,
  it must NOT overwrite or relocate `device-identity.json` — the restored data is the
  repository, but the identity must remain the receiving device's own.
