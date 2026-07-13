// Debounced auto-push scheduler (roadmap 5.3①).
//
// A deliberately "dumb" debounce with a single subscriber: UI mutation funnels
// call noteLocalChange() after a local finance write, and AppShell registers a
// flush handler (its existing triggerSync) via setPushFlushHandler(). After the
// user stops editing for QUIET_MS, the handler fires once — which then re-checks
// account/key/kit and the sync cooldown itself.
//
// Kept free of imports from sync modules so it is trivially unit-testable with
// fake timers. It decides *when* to sync, never *how*.

const QUIET_MS = 30_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let flush: (() => void) | null = null;

/** AppShell registers its triggerSync here. Pass null to unregister. */
export function setPushFlushHandler(fn: (() => void) | null): void {
  flush = fn;
}

/** Call after any local finance mutation. Restarts the QUIET_MS quiet timer. */
export function noteLocalChange(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    flush?.();
  }, QUIET_MS);
}

/** Test hook: clear any pending timer (does not touch the registered handler). */
export function _resetPushScheduler(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
