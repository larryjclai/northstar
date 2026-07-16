# 214 — Give the NotificationCenter panel enter/exit motion

- **Status**: TODO
- **Commit**: `ae708c1b`
- **Severity**: MEDIUM
- **Category**: Physicality & origin / Missed opportunity
- **Estimated scope**: 2 files (`src/components/NotificationCenter.tsx`, `src/styles/globals.css`), ~40 lines

## Problem

The notification panel is a trigger-anchored surface (opens from the bell button in the header) that **teleports** in and out — it is the only popover-like surface left in the app with zero motion. Every other anchored/overlay surface (ModalShell drawers/centers/sheets, toasts, BookSwitcher popover) animates.

```tsx
// src/components/NotificationCenter.tsx:110-126 — current: conditional render, no motion
{open && anchorRect && (
  <div
    ref={panelRef}
    role="dialog"
    aria-label="通知中心面板"
    style={{
      position: "fixed",
      top: anchorRect.bottom + 8,
      right: window.innerWidth - anchorRect.right,
      zIndex: 1200,
      width: "min(340px, calc(100vw - 32px))",
      background: "var(--ns-surface)",
      border: "1px solid var(--ns-border)",
      borderRadius: "var(--ns-r-md, 10px)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      overflow: "hidden",
    }}
  >
```

Close paths that currently call `setOpen(false)` directly: outside-click handler (`NotificationCenter.tsx:36-50`), resize handler (`NotificationCenter.tsx:52-61`), and the bell-button toggle (`NotificationCenter.tsx:74` `onClick={() => setOpen((v) => !v)}`).

## Target

The panel scales in from its anchor corner (top-right, since it hangs below-right of the bell) and fades/scales back out on close. Never `scale(0)` — start at `0.97`.

```css
/* src/styles/globals.css — target (add after the .ns-toast block, ~line 419) */

/* ── Notification panel (plan 214) ── */
.ns-notif-panel {
  transform-origin: top right;
  transition: transform 160ms var(--ns-ease-out-strong), opacity 160ms var(--ns-ease-out-strong);
  @starting-style { transform: translateY(-4px) scale(0.97); opacity: 0; }
}
.ns-notif-panel[data-closing] {
  transform: translateY(-4px) scale(0.97);
  opacity: 0;
  pointer-events: none;
  transition-duration: 120ms;
}
```

Component: exits wait for the transition before unmounting (the repo's established `data-closing` → `transitionend` pattern), except the resize path which closes instantly (a stale `anchorRect` must not linger mispositioned).

## Repo conventions to follow

- Easing/duration tokens live at `src/styles/globals.css:47-50` (`--ns-ease`, `--ns-ease-out-strong`, `--ns-dur-fast`, `--ns-dur`). Do not hand-type cubic-beziers.
- The enter-via-`@starting-style` / exit-via-`[data-closing]` + `transitionend` pattern is documented at `src/styles/globals.css:358-385` (`.ns-overlay-scrim`, `.ns-overlay-panel`) and implemented in `src/components/ModalShell.tsx:127-268` (`closing` state, `closingRef` double-dismiss guard, `transitionend` listener with a timeout fallback before unmount). Imitate that component, scaled down.
- Asymmetric timing (enter 160ms, exit 120ms) matches the existing overlays (e.g. `ns-overlay-panel[data-motion="center"]` 180ms in / 140ms out).

## Steps

1. **`src/styles/globals.css`**: add the `.ns-notif-panel` block exactly as in Target, placed after the `.ns-toast[data-dragging]` rule (~line 419) with the `/* ── Notification panel (plan 214) ── */` header comment, matching neighboring section comments.
2. **`src/components/NotificationCenter.tsx`**: add closing state:
   ```tsx
   const [closing, setClosing] = useState(false);
   const closeTimerRef = useRef<number | null>(null);

   function requestClose() {
     if (closing) return;
     setClosing(true);
   }
   ```
   Add an effect that, while `closing`, listens for `transitionend` on `panelRef.current` (guard `e.target === panelRef.current`) and then runs `finishClose()` — `setOpen(false); setClosing(false)`. Include a `window.setTimeout(finishClose, 200)` fallback (cleared on unmount/effect cleanup) so a missed event (e.g. reduced-motion zeroing durations) can't strand the panel.
3. Wire the close paths:
   - Outside-click handler: `setOpen(false)` → `requestClose()`.
   - Bell button: `onClick={() => (open ? requestClose() : setOpen(true))}`.
   - Resize handler: keep `setOpen(false)` (instant) and also `setClosing(false)` to reset any in-flight exit.
4. On the panel `div` (line 111): add `className="ns-notif-panel"` and `data-closing={closing || undefined}`. Keep the existing inline `style` object untouched (positioning is dynamic — inline is correct per repo style rules).
5. While `closing`, also guard the render condition: the panel must stay mounted during exit, i.e. render when `(open) && anchorRect` still — `open` stays `true` until `finishClose()`, so no render-condition change is needed. Verify this is the case; if the component structure differs, STOP and report.

## Boundaries

- Do NOT migrate the panel to Base UI `Popover` — the hand-rolled fixed positioning exists to escape the sidebar's `overflow: hidden` (comment at `NotificationCenter.tsx:26-29`). Out of scope.
- Do NOT touch the badge, list contents, or acknowledge logic.
- Do NOT add dependencies.
- If the cited line numbers have drifted, re-locate by the quoted code; if the code itself changed shape, STOP and report.

## Verification

- **Mechanical**: `npm run lint` and `npx tsc --noEmit` — zero new errors. `npm test` — no regressions (jsdom has no `matchMedia`/real transitions; if a new test is added, follow the `vi.stubGlobal` convention from `ModalShell.test.tsx`).
- **Feel check** (dev app, `npm run dev`):
  - Open the bell: panel grows from the top-right corner toward the bottom-left — it must visibly originate at the trigger, not the panel center.
  - Click outside: panel shrinks back toward the bell and is gone in ~120ms; it must never linger interactive (pointer-events none while closing).
  - Spam-click the bell rapidly: no stuck states, no double-open, no flash-from-zero (transitions retarget; if you see restarts, the `closing` guard is wrong).
  - DevTools → Rendering → emulate `prefers-reduced-motion: reduce`: panel appears/disappears instantly (global rule zeroes durations) and the timeout fallback still unmounts it.
- **Done when**: all feel checks pass and no close path can strand a mounted-but-invisible panel.
