import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

export type ModalShellVariant = "center" | "sheet" | "drawer";

export interface ModalShellProps {
  /** Called when the user dismisses (scrim click, Escape). */
  onClose: () => void;
  /** Accessible name. Provide this OR `labelledById`. */
  title?: string;
  /** id of an element inside the panel that labels the dialog (wins over `title`). */
  labelledById?: string;
  /** Scrim layout preset. `center` centres a panel; `sheet`/`drawer` let the panel position itself. */
  variant?: ModalShellVariant;
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
  children: ReactNode;
}

const VARIANT_SCRIM_CLASS: Record<ModalShellVariant, string> = {
  center: "fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center",
  sheet: "fixed inset-0",
  drawer: "fixed inset-0",
};

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
  disableEscape = false,
  disableScrimClose = false,
  className,
  style,
  panelClassName,
  panelStyle,
  children,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest close/flags reachable from the mount-only listener without re-binding.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const disableEscapeRef = useRef(disableEscape);
  disableEscapeRef.current = disableEscape;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const autofocusEl = panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    autofocusEl.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!disableEscapeRef.current) {
          event.stopPropagation();
          closeRef.current();
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
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className={[VARIANT_SCRIM_CLASS[variant], className].filter(Boolean).join(" ")}
      style={{ background: "var(--ns-scrim)", ...style }}
      onClick={disableScrimClose ? undefined : onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledById ? undefined : title}
        aria-labelledby={labelledById}
        tabIndex={-1}
        className={panelClassName}
        style={{ outline: "none", ...panelStyle }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
