import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { lockViewportScroll } from "../lib/scrollLock";

export type ModalShellVariant = "center" | "sheet" | "drawer";
export type ModalShellMotion = "drawer" | "center" | "none";
export type ModalShellMobilePresentation = "bottom-sheet" | "none";

/**
 * Positional keys a call site's `panelStyle` may set — overridden in bottom-sheet mode.
 * `maxWidth`/`minWidth` are included because in sheet mode horizontal geometry is
 * entirely owned by `.ns-sheet-bottom` — a call site's `maxWidth` (sized for a
 * right-docked desktop drawer) would over-constrain the sheet and leave a scrim gap.
 */
const PANEL_POSITION_KEYS = [
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "maxWidth",
  "minWidth",
] as const;

/**
 * Rubber-band resistance for drag-past-bounds (iOS-style). `c` controls how much
 * resistance builds up as the overshoot grows; smaller = stiffer.
 */
function rubberband(overshoot: number, dim: number, c = 0.55): number {
  const d = dim || 1;
  return (overshoot * d * c) / (d + c * Math.abs(overshoot));
}

/** Momentum projection: where the gesture would land if released and let decay. */
function projectEndpoint(current: number, velocityPxPerSec: number, decay = 0.998): number {
  return current + ((velocityPxPerSec / 1000) * decay) / (1 - decay);
}

export interface ModalShellProps {
  /** Called when the user dismisses (scrim click, Escape). */
  onClose: () => void;
  /** Accessible name. Provide this OR `labelledById`. */
  title?: string;
  /** id of an element inside the panel that labels the dialog (wins over `title`). */
  labelledById?: string;
  /** Scrim layout preset. `center` centres a panel; `sheet`/`drawer` let the panel position itself. */
  variant?: ModalShellVariant;
  /** Overlay enter/exit motion. Defaults by variant: `center` → "center", `sheet`/`drawer` → "drawer". */
  motion?: ModalShellMotion;
  /**
   * Opt in to native-style bottom-sheet presentation on narrow (mobile-layout)
   * viewports — width < 1024px, where the desktop sidebar is hidden — with
   * drag-to-dismiss and momentum. Default `"none"` — zero change for un-migrated
   * call sites. When active, the call site's positional `panelStyle` keys
   * (position/top/right/bottom/left/width) are ignored.
   */
  mobilePresentation?: ModalShellMobilePresentation;
  /** Don't close on Escape. */
  disableEscape?: boolean;
  /** Don't close on scrim click. */
  disableScrimClose?: boolean;
  /** Extra classes merged onto the scrim. */
  className?: string;
  /** Style merged onto the scrim (e.g. a custom z-index). */
  style?: CSSProperties;
  /** Classes for the dialog panel — pass the modal's existing panel classes for pixel identity. */
  panelClassName?: string;
  /** Style for the dialog panel — pass the modal's existing panel style for pixel identity. */
  panelStyle?: CSSProperties;
  /**
   * Panel content. Pass a function to receive the animated `dismiss` callback —
   * wire it to sole-purpose close buttons (×/取消) so they play the exit
   * animation instead of unmounting instantly.
   */
  children: ReactNode | ((dismiss: () => void) => ReactNode);
}

const VARIANT_SCRIM_CLASS: Record<ModalShellVariant, string> = {
  center: "fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center",
  sheet: "fixed inset-0",
  drawer: "fixed inset-0",
};

const VARIANT_DEFAULT_MOTION: Record<ModalShellVariant, ModalShellMotion> = {
  center: "center",
  sheet: "drawer",
  drawer: "drawer",
};

const EXIT_FALLBACK_MS = 320;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * Accessible dialog wrapper: `role="dialog"`, `aria-modal`, focus trap + restore,
 * Escape/scrim close, and body scroll lock. Replaces the hand-rolled `fixed inset-0`
 * overlays (DESIGN.md §6.4).
 *
 * The keydown listener is bound to the panel node (not `window`/`document`), so Tab
 * and Escape inside a Base UI popover that portals to `document.body` (AppSelect,
 * DatePicker, IconPicker) never reach this trap — the popover keeps its own keyboard
 * behaviour and the trap only governs focusables that are real DOM descendants.
 */
export function ModalShell({
  onClose,
  title,
  labelledById,
  variant = "center",
  motion,
  mobilePresentation = "none",
  disableEscape = false,
  disableScrimClose = false,
  className,
  style,
  panelClassName,
  panelStyle,
  children,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  // Keep the latest close/flags reachable from the mount-only listener without re-binding.
  // Written in an effect (not during render): a ref write during render is
  // unsafe under concurrent rendering — React may render and discard the
  // result, but the ref mutation would still have happened (plan 274,
  // react-hooks/refs). Both refs are only ever read from the mount-only
  // keydown listener and from `requestClose`, never during render.
  const closeRef = useRef(onClose);
  const disableEscapeRef = useRef(disableEscape);
  useEffect(() => {
    closeRef.current = onClose;
    disableEscapeRef.current = disableEscape;
  });

  // Bottom-sheet presentation is the MOBILE-layout affordance and must stay
  // mutually exclusive with the desktop sidebar (AppShell `aside.ns-sidebar`,
  // shown at `lg` = min-width:1024px, z-index 1100). `.ns-sheet-bottom` is a
  // full-viewport `position:fixed; left:0; right:0` panel, so any time the
  // sidebar is also painted it occludes the sheet's left edge (plan 244).
  // Gate strictly on the viewport width that HIDES the sidebar. We must NOT use
  // `(pointer: coarse)`: the macOS/Tauri WKWebView reports coarse on the desktop
  // build (min window width 1024 → sidebar always shown), which is exactly the
  // overlap we are fixing. Subscribed via `useSyncExternalStore` (not a one-shot
  // `useState`) so a modal left open across a viewport change (iPad rotation,
  // desktop window drag) re-evaluates instead of getting stuck in its mount-time
  // presentation — guard `matchMedia` presence so jsdom (most ModalShell.test.tsx
  // cases) falls through to `false`, not throws.
  const isMobileViewport = useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return () => {};
      }
      const mql = window.matchMedia("(max-width: 1023px)");
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 1023px)").matches,
    () => false,
  );
  const sheetActive = mobilePresentation === "bottom-sheet" && isMobileViewport;

  const resolvedMotion: ModalShellMotion = motion ?? VARIANT_DEFAULT_MOTION[variant];

  const requestClose = useCallback(() => {
    if (closingRef.current) return; // double-dismiss guard
    const panel = panelRef.current;
    // jsdom / legacy engines: computed transition-duration is empty or 0s →
    // close synchronously (keeps ModalShell.test.tsx passing).
    const dur = panel ? parseFloat(getComputedStyle(panel).transitionDuration || "0") : 0;
    if (!panel || !dur) {
      closingRef.current = true; // guard against a second synchronous dismiss too
      closeRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
  }, []);

  // ── Drag-to-dismiss (bottom-sheet mode only) ──
  // Ref, not state: the drag is driven by an inline `transform` written directly to
  // the panel DOM node on every pointermove — going through React state would add a
  // render in the hot path and break 1:1 finger tracking.
  const dragRef = useRef({
    active: false,
    pointerId: null as number | null,
    startY: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0, // px/s, positive = moving down
    panelHeight: 0,
  });

  const handleGrabPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current.active) return; // ignore a second pointer while dragging
    const panel = panelRef.current;
    if (!panel) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastT: performance.now(),
      velocity: 0,
      panelHeight: panel.getBoundingClientRect().height,
    };
    panel.style.transition = "none"; // 1:1 tracking must not be smoothed
  }, []);

  const handleGrabPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    const panel = panelRef.current;
    if (!panel) return;
    const dy = event.clientY - drag.startY;
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      drag.velocity = ((event.clientY - drag.lastY) / dt) * 1000;
    }
    drag.lastY = event.clientY;
    drag.lastT = now;
    const translate = dy >= 0 ? dy : rubberband(dy, drag.panelHeight);
    panel.style.transform = `translateY(${translate}px)`;
  }, []);

  const settleDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, { dismiss }: { dismiss: boolean }) => {
      const drag = dragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const panel = panelRef.current;
      drag.active = false;
      drag.pointerId = null;
      if (!panel) return;
      panel.style.transition = ""; // hand control back to CSS
      panel.style.transform = ""; // let [data-closing] (dismiss) or the base rule (snap-back) own it
      if (dismiss) requestClose();
    },
    [requestClose],
  );

  const handleGrabPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const dy = event.clientY - drag.startY;
      const projected = projectEndpoint(dy, drag.velocity);
      const shouldDismiss = projected > drag.panelHeight / 2 && drag.velocity > -50;
      settleDrag(event, { dismiss: shouldDismiss });
    },
    [settleDrag],
  );

  const handleGrabPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      settleDrag(event, { dismiss: false });
    },
    [settleDrag],
  );

  // `sheetActive` can now flip mid-session (viewport crossing 1024px while the
  // modal is open). If a drag-to-dismiss gesture was in progress when the
  // presentation changed, clear it — otherwise a stale in-flight `transform`
  // survives the presentation swap on the panel node.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    dragRef.current.active = false;
    dragRef.current.pointerId = null;
    panel.style.transition = "";
    panel.style.transform = "";
  }, [sheetActive]);

  useEffect(() => {
    if (!closing) return;
    const panel = panelRef.current;
    if (!panel) {
      closeRef.current();
      return;
    }
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      closeRef.current();
    }
    function onTransitionEnd(event: TransitionEvent) {
      if (event.target !== panel) return;
      finish();
    }
    panel.addEventListener("transitionend", onTransitionEnd);
    const timeout = window.setTimeout(finish, EXIT_FALLBACK_MS);
    return () => {
      panel.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(timeout);
    };
  }, [closing]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const autofocusEl = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    autofocusEl.focus();

    const releaseScrollLock = lockViewportScroll();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!disableEscapeRef.current) {
          // This native listener is bound to the panel node. On the native
          // bubble path it sits BELOW (closer to the target than) the single
          // native listener React 17+ delegates all synthetic dispatch
          // through, which is attached at the app's root container — an
          // ancestor of `panel`. Calling `stopPropagation()` here
          // synchronously would therefore stop the native event before it
          // ever reaches that root listener, meaning React's own onKeyDown
          // handlers (e.g. a nested SuggestInput's) would never run at all —
          // not just "run later." (plan 305 — proved empirically: an earlier
          // draft called stopPropagation() here and the nested-interception
          // test below failed because SuggestInput's handler never fired.)
          // So: don't touch propagation here. Let the native bubble continue
          // so React's synthetic dispatch happens, then defer one microtask —
          // by the time it runs, the entire synchronous dispatch (including
          // any nested component's `event.preventDefault()`, which reflects
          // onto this same native event) has completed, so
          // `event.defaultPrevented` tells us whether a nested component
          // already consumed this Escape. If so, back off and let that
          // component's own effect (e.g. closing its dropdown) stand.
          // queueMicrotask (not setTimeout) keeps the deferral imperceptible
          // — it runs before the next paint, not after a timer tick.
          //
          // Window-listener overlays (e.g. QuickAdd, which is not wrapped in
          // a ModalShell) are unaffected: SuggestInput's own
          // `event.stopPropagation()` already shields them, and that call
          // happens synchronously during React's dispatch — well before the
          // native event would otherwise reach `window`.
          queueMicrotask(() => {
            if (event.defaultPrevented) return;
            requestClose();
          });
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getFocusable(panel!);
      if (focusables.length === 0) {
        event.preventDefault();
        panel!.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === panel || !panel!.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || active === panel || !panel!.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      releaseScrollLock();
      previouslyFocused?.focus?.();
    };
  }, [requestClose]);

  // In bottom-sheet mode, the call site's positional `panelStyle` keys are ignored —
  // the sheet is always pinned to the bottom of the viewport via `.ns-sheet-bottom`.
  let effectivePanelStyle: CSSProperties | undefined = panelStyle;
  if (sheetActive && panelStyle) {
    const rest = { ...panelStyle };
    for (const key of PANEL_POSITION_KEYS) delete rest[key];
    effectivePanelStyle = rest;
  }
  const effectiveDataMotion = sheetActive
    ? "sheet-bottom"
    : resolvedMotion === "none"
      ? undefined
      : resolvedMotion;

  return (
    <div
      className={[VARIANT_SCRIM_CLASS[variant], "ns-overlay-scrim", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        background: "var(--ns-scrim)",
        ...(closing ? { pointerEvents: "none" } : null),
        ...style,
      }}
      data-closing={closing || undefined}
      onClick={disableScrimClose ? undefined : requestClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledById ? undefined : title}
        aria-labelledby={labelledById}
        tabIndex={-1}
        className={[panelClassName, sheetActive ? "ns-sheet-bottom" : null, "ns-overlay-panel"]
          .filter(Boolean)
          .join(" ")}
        style={{ outline: "none", ...effectivePanelStyle }}
        data-motion={effectiveDataMotion}
        data-closing={closing || undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {sheetActive ? (
          <div
            className="ns-sheet-grab"
            aria-hidden="true"
            onPointerDown={handleGrabPointerDown}
            onPointerMove={handleGrabPointerMove}
            onPointerUp={handleGrabPointerUp}
            onPointerCancel={handleGrabPointerCancel}
          >
            <div className="ns-sheet-handle" />
          </div>
        ) : null}
        {/* react-hooks/refs (plan 274, Group C): the linter can't prove an
            arbitrary `children` function won't call `requestClose` (which
            reads closingRef/panelRef/closeRef) synchronously during this
            render. In practice every call site (24+ across the app) only
            ever wires the callback into a later event handler — e.g.
            `onClick={dismiss}` on a close button — never invokes it inline.
            This is the render-prop API's inherent shape: passing the
            animated-close callback to consumers requires handing them a
            function that reads these refs. Fixing it would mean redesigning
            ModalShell's public API (out of scope for plan 274; it's used on
            every screen). Suppressed, not fixed. */}
        {/* eslint-disable react-hooks/refs */}
        {typeof children === "function" ? children(requestClose) : children}
        {/* eslint-enable react-hooks/refs */}
      </div>
    </div>
  );
}
