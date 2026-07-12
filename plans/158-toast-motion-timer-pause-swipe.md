# Plan 158: Toast enter/exit motion, timer pause on hover + hidden tab, and swipe-to-dismiss

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 37ccb332..HEAD -- src/components/Toast.tsx`
> If Toast.tsx changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — Toast is used app-wide (updates, sync, errors); a lifecycle
  bug can drop error toasts, which are the app's only error surface in Tauri
- **Depends on**: none (independent of 156/157)
- **Category**: tech-debt (motion / UX polish)
- **Planned at**: commit `37ccb332`, 2026-07-12

## Why this matters

Toasts currently **pop** in and out with zero animation, auto-dismiss on a
fixed timer even while the user is reading (or while the tab/window is
hidden — the toast burns its 4 s unseen), and cannot be swiped away on touch.
These are the exact "unseen details" that make software feel loved: enter/exit
motion via interruptible transitions (rapid stacking never restarts
animations), a timer that pauses while the pointer hovers the stack or the
document is hidden, and flick-to-dismiss with a velocity threshold on touch
devices. The pattern here follows Sonner's published behaviour.

## Current state

All excerpts verified at commit `37ccb332`. `src/components/Toast.tsx`
(317 lines) is a self-contained provider + viewport + item, no library.

- Timer model — one `setTimeout` per toast, fixed, never paused (`:74-85`):

  ```tsx
  const show = useCallback<ToastContextValue["show"]>((descriptor) => {
    const id = genId();
    const tone = descriptor.tone;
    const durationMs = descriptor.durationMs ?? defaultDuration[tone];
    const entry: ToastDescriptor = { ...descriptor, id };
    setToasts((current) => [...current, entry]);
    if (durationMs > 0) {
      const timer = setTimeout(() => dismiss(id), durationMs);
      timeouts.current.set(id, timer);
    }
    return id;
  }, [dismiss]);
  ```

  `dismiss` removes the toast from state immediately (`:65-72`). Errors are
  sticky by default (`durationMs: 0`, `:53-59`) — preserve that.

- Viewport (`:119-128`): bottom-centered on mobile, bottom-right on `sm:`;
  each item is a bordered card (`:166-171`) with buttons inside (查看詳細,
  複製, action, close).

- No `transition`/`animation` except a hover opacity on the close button.

- Repo conventions: motion tokens `--ns-ease`, `--ns-dur-fast: 120ms`,
  `--ns-dur: 200ms` in `src/styles/globals.css:46-49`; the global
  reduced-motion rule (`globals.css:491-498`) forces durations to `0.001ms`
  — transitions still fire `transitionend`, so no special handling needed.
  Testing gotcha (AGENTS.md): vitest jsdom has no `localStorage` — irrelevant
  here, but note jsdom also returns empty computed transition durations, so
  animation code must degrade to synchronous behaviour (same trick as plan
  157: parse `getComputedStyle(el).transitionDuration`, 0 → skip waiting).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck + build | `npm run build` | exit 0 |
| Tests     | `npm test`         | all pass |
| Focused   | `npx vitest run src/components/Toast.test.tsx` | all pass |
| Lint      | `npm run lint`     | exit 0 |

## Scope

**In scope**:
- `src/components/Toast.tsx`
- `src/components/Toast.test.tsx` (create)
- `src/styles/globals.css` (toast motion classes only)

**Out of scope** (do NOT touch):
- Any toast **call site** — the public `useToast()` API must not change.
- ModalShell / overlay motion (plan 157), NotificationCenter.tsx.

## Git workflow

- Branch: `feat/ai-toast-motion`. Conventional commits
  (`feat(ui): toast enter/exit motion + timer pause + swipe dismiss`).
  Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Restructure the timer so it can pause and resume

Replace the fire-and-forget `setTimeout` map with per-toast bookkeeping stored
in a ref: `{ remainingMs: number; startedAt: number; timer: Timeout | null }`.

- `show()` starts the timer as today (sticky toasts: no entry).
- `pauseAll()` — for each running entry: clear the timeout, set
  `remainingMs -= Date.now() - startedAt`, `timer = null`.
- `resumeAll()` — for each paused entry with `remainingMs > 0`: restart
  `setTimeout(dismiss, remainingMs)`; if `remainingMs <= 0`, dismiss.
- Wire: viewport `onPointerEnter={pauseAll}` / `onPointerLeave={resumeAll}`
  (pointer events cover mouse; a finger resting produces pointerenter too —
  acceptable), and a `document.visibilitychange` listener in the provider:
  hidden → `pauseAll()`, visible → `resumeAll()`. Clean up the listener on
  unmount alongside the existing timer cleanup (`:97-101`).

**Verify**: `npm run build` → exit 0.

### Step 2: Enter/exit motion via transitions

1. Add to `globals.css` (utilities section):

   ```css
   /* ── Toast motion (plan 158) ── */
   .ns-toast {
     transition: transform var(--ns-dur) var(--ns-ease), opacity var(--ns-dur) var(--ns-ease);
     @starting-style { transform: translateY(12px); opacity: 0; }
   }
   .ns-toast[data-leaving] { transform: translateY(8px); opacity: 0; transition-duration: 140ms; }
   .ns-toast[data-swiped] { transition-duration: 160ms; } /* exit continues in swipe direction via inline transform */
   ```

2. In `ToastProvider`, dismissal becomes two-phase: `dismiss(id)` now marks
   the toast `leaving: true` in state (idempotent) instead of removing it;
   `ToastItem` sees `leaving`, sets `data-leaving`, and on `transitionend`
   (target === root, property === opacity/transform) calls a new
   `remove(id)` that actually deletes it. Fallback `setTimeout(remove, 250)`
   AND the jsdom sync path (computed duration 0 → `remove` immediately) so
   tests and legacy engines never leak ghost toasts.
3. Root div of `ToastItem` gains `className="ns-toast …existing classes"`.
4. Public API unchanged: `dismiss(id)` still eventually removes; the
   `toast.dismiss(progressId)` call sites (e.g. AppShell updater) keep working.

**Verify**: `npm run build` → exit 0; `npm test` → all pass (no call-site test
knows about `leaving`).

### Step 3: Swipe-to-dismiss (touch + mouse drag)

On the `ToastItem` root:

- `onPointerDown`: ignore if the target is inside `button, a, pre` (closest());
  ignore if a drag is already active (multi-touch guard). Record
  `startX/startY/startTime`, `setPointerCapture(pointerId)`.
- `onPointerMove`: after 10 px horizontal hysteresis (and |dx| > |dy|), track
  1:1 — set inline `style.transform = translateX(dx)` and fade opacity toward
  `1 - min(|dx|/160, 0.6)`. Pause timers while dragging (reuse `pauseAll`).
- `onPointerUp`: compute `velocity = |dx| / (Date.now() - startTime)` (px/ms).
  If `|dx| >= 45 || velocity > 0.11`: set `data-swiped`, set inline transform
  to `translateX(sign(dx) * 100%)`, opacity 0, then run the same two-phase
  removal as Step 2. Otherwise: clear the inline transform (the `.ns-toast`
  transition springs it back) and `resumeAll()`.
- Keep all handlers on the root div; do not preventDefault on pointerdown
  (buttons inside must stay clickable).

**Verify**: `npm run build` → exit 0. Manual: `npm run dev`, trigger a toast
(e.g. 設定 → 檢查更新 on a dev build errors → error toast), drag it sideways
>45 px → it flies off; small drag → snaps back.

### Step 4: Unit tests

Create `src/components/Toast.test.tsx` (model the provider-render pattern on
`src/components/ModalShell.test.tsx`; use `vi.useFakeTimers()`):

1. auto-dismiss: `success` toast disappears after its 4 000 ms (advance timers;
   jsdom sync-removal path makes this deterministic).
2. sticky error: error toast still present after 60 000 ms.
3. pause/resume: fire `pointerenter` on the viewport at t=2 000, advance
   10 000 ms → toast still present; `pointerleave`, advance 2 100 ms → gone.
4. visibilitychange pause: mock `document.visibilityState = "hidden"`,
   dispatch the event, advance past duration → still present; flip back to
   visible + event, advance remaining → gone.
5. two-phase dismiss is idempotent: calling `dismiss(id)` twice removes one
   toast and does not throw.

**Verify**: `npx vitest run src/components/Toast.test.tsx` → 5 tests pass;
`npm test` → all pass.

## Done criteria

- [ ] `npm run build`, `npm test`, `npm run lint` all exit 0
- [ ] `src/components/Toast.test.tsx` exists with ≥5 passing tests
- [ ] `useToast()` public signature unchanged (`grep -rn "useToast(" src/` call sites untouched — `git status` confirms only the 3 in-scope files modified)
- [ ] `.ns-toast` classes present in globals.css; ToastItem root carries `ns-toast`
- [ ] Manual: enter/exit animate; hover pauses countdown; swipe >45 px dismisses
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Toast.tsx has drifted from the excerpts (someone may have adopted a toast
  library in the meantime).
- The two-phase removal breaks any existing test that asserts a toast is gone
  synchronously after `dismiss()` — check whether the jsdom sync path is
  taking effect before changing test expectations.
- Pointer capture interferes with the buttons inside the toast (查看詳細 /
  複製 / action) — the `closest("button")` guard should prevent this; if it
  doesn't, STOP rather than removing the guard.

## Maintenance notes

- If toast volume grows, consider stacking behaviour (offset + scale for >3
  toasts) — deliberately out of scope here.
- The pause covers the whole stack (Sonner semantics), not per-toast — a
  reviewer questioning that should know it's intentional.
- If the app later adopts Sonner, this file's behaviour is the spec to match;
  the public `useToast` API was deliberately kept stable to make that swap
  possible.
