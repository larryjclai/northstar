# Plan 171: Debounced auto-push after local edits (roadmap 5.3①)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ac63576..HEAD -- src/components/AppShell.tsx src/data/hooks.ts src/features/connect/sync/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches sync triggering; a bug could cause sync loops or battery drain — mitigations below)
- **Depends on**: none
- **Category**: direction (roadmap 5.3① stated-but-undelivered)
- **Planned at**: commit `4ac63576`, 2026-07-12

## Why this matters

Sync currently pushes only on **app focus** (60s cooldown) and on the **manual
button**. Roadmap 5.3① asks for「變更後 debounce 自動 push（~30 秒靜默期）」:
after the user stops editing for ~30 seconds, push automatically. Without it,
two-device users see stale data until the other device happens to refocus, and
every unpushed minute widens the record-level LWW overwrite window the roadmap
itself flags as the remaining conflict risk. All the heavy machinery exists —
`runSync` is idempotent and cursor-based — this plan only adds a *scheduler*
that calls the existing trigger after a quiet period.

## Current state

- `src/features/connect/sync/sync-manager.ts` — `runSync(repo)` orchestrates
  push→backup→pull; module-level `_syncRunning` mutex; `isSyncRunning()`
  exported. Pending changes are **cursor-derived** (`repo.collectPendingChanges
  (device.localPushCursor)` in `push.ts`), so an extra `runSync` when nothing
  changed is a cheap no-op push (0 envelopes) plus a pull. **Do not modify this
  file's sync logic.**
- `src/components/AppShell.tsx:755-830` — `useAutoSync()`:

  ```tsx
  // AppShell.tsx:759
  const MIN_SYNC_INTERVAL_MS = 60_000;
  function useAutoSync() {
    // ...
    const triggerSync = useCallback(async () => {
      const account = await loadSyncAccount();       // skip if sync not configured
      if (!account) return;
      const vaultKey = await loadVaultKey();
      if (!vaultKey) return;
      if (!isRecoveryKitConfirmed()) return;         // silent until kit confirmed
      if (isSyncRunning()) return;
      if (Date.now() - lastSyncRef.current < MIN_SYNC_INTERVAL_MS) return;
      lastSyncRef.current = Date.now();
      // ... setPhase / runSync / invalidateQueries(applied > 0)
    }, [...]);
    useEffect(() => {
      if (!isTauriRuntime()) return;   // focus listener registered below
  ```

- `src/data/hooks.ts:166` — the central mutation funnel most UI writes go
  through:

  ```ts
  // hooks.ts:166
  export function useRepositoryMutation<TInput>(
  // ... wraps useMutation, invalidates query keys on success
  ```

  Also `usePostDueRecurring` (hooks.ts:141) posts due recurring transactions on
  startup. Some imperative one-off writes call `getFinanceRepository()` directly
  (demo mode, CSV import, device connect — ~10 files); a June audit ruled those
  fine to leave on the focus-sync path. **This plan only needs the two funnels
  in hooks.ts.**
- Convention: sync status UI reads `src/state/syncStatus.ts`; auto-sync
  already reports through it — the debounced push must reuse the same
  `triggerSync` so status/error handling stays uniform.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0, 0 errors    |

Note: vitest is jsdom; there is **no `localStorage`** — stub per-test with
`vi.stubGlobal` (repo convention; see existing sync tests for the pattern).

## Scope

**In scope** (the only files you should modify):
- `src/features/connect/sync/pushScheduler.ts` (create)
- `src/features/connect/sync/pushScheduler.test.ts` (create)
- `src/data/hooks.ts` (two one-line calls)
- `src/components/AppShell.tsx` (`useAutoSync` only)

**Out of scope** (do NOT touch):
- `sync-manager.ts`, `push.ts`, `pull.ts`, `backup.ts` — sync semantics are
  frozen; the scheduler only decides *when* to call the existing trigger.
- The 10 direct `getFinanceRepository()` call sites — deliberately not wired;
  their changes ride the next focus/manual/debounced sync via the cursor.
- The worker (`workers/`), cursors, LWW merge.

## Git workflow

- Branch: `feat/ai-sync-debounced-push`
- Conventional commits, e.g. `feat(sync): debounce auto-push 30s after local edits`
- Do NOT push or merge; leave the branch for review.

## Steps

### Step 1: `pushScheduler.ts` — a dumb debounce with one subscriber

Create `src/features/connect/sync/pushScheduler.ts`:

```ts
const QUIET_MS = 30_000;
let timer: ReturnType<typeof setTimeout> | null = null;
let flush: (() => void) | null = null;

/** AppShell registers its triggerSync here. Returns an unsubscribe fn. */
export function setPushFlushHandler(fn: (() => void) | null): void { ... }

/** Call after any local finance mutation. Restarts the 30s quiet timer. */
export function noteLocalChange(): void { ... }

/** Test hook. */
export function _resetPushScheduler(): void { ... }
```

Behavior: `noteLocalChange` clears + restarts the timer; on fire it calls the
registered handler (if any) exactly once. No handler registered → timer fires
into a no-op (browser dev shell / sync not set up — the handler itself also
re-checks account/key/kit). Keep it free of imports from sync modules so it is
trivially testable with fake timers.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Wire the funnels

In `src/data/hooks.ts`, call `noteLocalChange()` in `useRepositoryMutation`'s
`onSuccess` (after invalidation) and in `usePostDueRecurring`'s success path
(only when it actually posted ≥ 1 transaction — check its result shape).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Register the handler in `useAutoSync`

In `AppShell.tsx` `useAutoSync`, register `triggerSync` via
`setPushFlushHandler` in the same `useEffect` that installs the focus listener
(and unregister on cleanup). Two interaction rules:

1. **Cooldown**: `triggerSync` keeps its `MIN_SYNC_INTERVAL_MS` guard. If the
   debounce fires inside the cooldown, the push is skipped — that's acceptable
   for v1 (the roadmap asks for "~30s", not a guarantee); do NOT add re-arming
   retry logic.
2. **Loop safety**: remote-applied changes must not re-arm the timer. They
   don't — pulls write through the repository directly, not through
   `useRepositoryMutation` — but add a comment stating this invariant at the
   registration site.

Note the existing `useEffect` early-returns when `!isTauriRuntime()`; keep the
handler registration under the same gate (browser dev shell keeps today's
behavior).

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → 0 errors.

### Step 4: Tests

See test plan.

**Verify**: `npm test` → all pass, including the new scheduler tests.

## Test plan

New file `src/features/connect/sync/pushScheduler.test.ts` with
`vi.useFakeTimers()`:

- fires the handler once, 30s after the last `noteLocalChange` (multiple calls
  inside the window coalesce; timer restarts on each call).
- does not fire with no handler registered (no throw).
- unregistering (handler set to null / unsubscribe) prevents firing.
- `_resetPushScheduler` clears a pending timer.

Model the structure after any small existing domain test (e.g.
`src/domain/recurringDates.test.ts` style: pure module, no jsdom needs).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0; `npm run lint` 0 errors; `npm test` all pass with ≥ 4 new scheduler tests
- [ ] `grep -n "noteLocalChange" src/data/hooks.ts` → 2 call sites
- [ ] `grep -n "setPushFlushHandler" src/components/AppShell.tsx` → registered inside `useAutoSync`
- [ ] `git diff --stat` shows no changes to `sync-manager.ts`/`push.ts`/`pull.ts`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `useRepositoryMutation` no longer exists at `hooks.ts:166` in the described
  shape (mutation flow refactored since planning).
- Making the wiring work seems to require calling `runSync` directly from the
  scheduler (bypassing `useAutoSync`'s guards) — that duplicates guard logic
  and is the loop/battery risk this plan's design avoids.
- You find evidence that pulls DO route through `useRepositoryMutation`
  (would create a sync loop) — report with the call chain.

## Maintenance notes

- If roadmap 5.3② (sync history) lands later, the scheduler's fire events are
  a natural log point.
- Reviewer should scrutinize: cleanup on unmount (no timer left registered to a
  stale closure), and that `noteLocalChange` is NOT called from any pull/apply
  path.
- Deferred deliberately: re-arming retry when the cooldown swallows a flush;
  wiring the ~10 direct-repository call sites.
