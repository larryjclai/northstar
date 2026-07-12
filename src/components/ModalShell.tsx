import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { lockViewportScroll } from "../lib/scrollLock";

export type ModalShellVariant = "center" | "sheet" | "drawer";
export type ModalShellMotion = "drawer" | "center" | "none";

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
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const disableEscapeRef = useRef(disableEscape);
  disableEscapeRef.current = disableEscape;

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
          event.stopPropagation();
          requestClose();
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
        className={[panelClassName, "ns-overlay-panel"].filter(Boolean).join(" ")}
        style={{ outline: "none", ...panelStyle }}
        data-motion={resolvedMotion === "none" ? undefined : resolvedMotion}
        data-closing={closing || undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {typeof children === "function" ? children(requestClose) : children}
      </div>
    </div>
  );
}
