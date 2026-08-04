import { CheckCircle, Copy, Info, Warning, X, XCircle } from "@phosphor-icons/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { MarkdownText } from "./MarkdownText";

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastDescriptor {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /**
   * Long form, monospaced detail surfaced behind a "查看詳細" disclosure and
   * copy-to-clipboard button. Used for stack traces and verbose errors so the
   * user can paste them back to us without opening devtools.
   */
  detail?: string;
  /** Optional collapsible detail body (markdown). Hidden until the user expands. */
  details?: string;
  /** Milliseconds before auto-dismiss. Errors default to sticky (0). */
  durationMs?: number;
  /** Optional inline action like "Undo" / "重試". */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  show: (descriptor: Omit<ToastDescriptor, "id">) => string;
  dismiss: (id: string) => void;
  success: (
    title: string,
    options?: Partial<Omit<ToastDescriptor, "id" | "tone" | "title">>,
  ) => string;
  error: (
    title: string,
    options?: Partial<Omit<ToastDescriptor, "id" | "tone" | "title">>,
  ) => string;
  info: (
    title: string,
    options?: Partial<Omit<ToastDescriptor, "id" | "tone" | "title">>,
  ) => string;
  warning: (
    title: string,
    options?: Partial<Omit<ToastDescriptor, "id" | "tone" | "title">>,
  ) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;
function genId() {
  nextId += 1;
  return `toast_${Date.now().toString(36)}_${nextId}`;
}

const defaultDuration: Record<ToastTone, number> = {
  success: 4_000,
  info: 4_000,
  warning: 8_000,
  // Errors stick until dismissed so the user can read the detail and copy it.
  error: 0,
};

/** Internal-only state shape: adds a `leaving` flag for the two-phase exit
 * animation. Never exported — the public `ToastDescriptor` type is unchanged. */
type ToastState = ToastDescriptor & { leaving?: boolean };

/** Per-toast timer bookkeeping so a running auto-dismiss timer can be paused
 * (pointer over the stack, or the tab/window hidden) and resumed later
 * without losing track of how much time the toast had left. */
interface TimerEntry {
  remainingMs: number;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const timers = useRef(new Map<string, TimerEntry>());

  // Actually removes a toast from state once its exit transition has played.
  const remove = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    timers.current.delete(id);
  }, []);

  // Marks a toast as leaving (idempotent) so it plays its exit animation;
  // `remove` deletes it once that animation finishes. Also stops any
  // still-running auto-dismiss timer — it no longer matters once leaving.
  const dismiss = useCallback((id: string) => {
    setToasts((current) =>
      current.map((toast) =>
        toast.id === id && !toast.leaving ? { ...toast, leaving: true } : toast,
      ),
    );
    const entry = timers.current.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback<ToastContextValue["show"]>(
    (descriptor) => {
      const id = genId();
      const tone = descriptor.tone;
      const durationMs = descriptor.durationMs ?? defaultDuration[tone];
      const entry: ToastState = { ...descriptor, id };
      setToasts((current) => [...current, entry]);
      if (durationMs > 0) {
        timers.current.set(id, {
          remainingMs: durationMs,
          startedAt: Date.now(),
          timer: setTimeout(() => dismiss(id), durationMs),
        });
      }
      return id;
    },
    [dismiss],
  );

  // Pause every running auto-dismiss timer, remembering how much time was
  // left — used while the pointer hovers the stack and while the document is
  // hidden, so a toast never burns its duration unseen.
  const pauseAll = useCallback(() => {
    timers.current.forEach((entry) => {
      if (!entry.timer) return;
      clearTimeout(entry.timer);
      entry.remainingMs -= Date.now() - entry.startedAt;
      entry.timer = null;
    });
  }, []);

  const resumeAll = useCallback(() => {
    timers.current.forEach((entry, id) => {
      if (entry.timer) return; // already running (or never had one)
      if (entry.remainingMs <= 0) {
        dismiss(id);
        return;
      }
      entry.startedAt = Date.now();
      entry.timer = setTimeout(() => dismiss(id), entry.remainingMs);
    });
  }, [dismiss]);

  // Pause while the tab/window is hidden so a toast doesn't burn its
  // duration while the user can't see it.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden) pauseAll();
      else resumeAll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [pauseAll, resumeAll]);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (title, options) => show({ tone: "success", title, ...options }),
      error: (title, options) => show({ tone: "error", title, ...options }),
      info: (title, options) => show({ tone: "info", title, ...options }),
      warning: (title, options) => show({ tone: "warning", title, ...options }),
    }),
    [show, dismiss],
  );

  // Clean up dangling timers if provider unmounts mid-life (HMR, route swap).
  useEffect(
    () => () => {
      const map = timers.current;
      for (const entry of map.values()) {
        if (entry.timer) clearTimeout(entry.timer);
      }
      map.clear();
    },
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        toasts={toasts}
        onDismiss={dismiss}
        onRemove={remove}
        onPauseAll={pauseAll}
        onResumeAll={resumeAll}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be called inside <ToastProvider>");
  }
  return ctx;
}

interface ToastViewportProps {
  toasts: ToastState[];
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
}

function ToastViewport({
  toasts,
  onDismiss,
  onRemove,
  onPauseAll,
  onResumeAll,
}: ToastViewportProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      data-testid="toast-viewport"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+8px)] z-[60] flex flex-col items-center gap-2 px-4 lg:top-auto lg:bottom-6 lg:right-6 lg:left-auto lg:items-end lg:px-0"
      onPointerEnter={onPauseAll}
      onPointerLeave={onResumeAll}
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          leaving={!!toast.leaving}
          onDismiss={onDismiss}
          onRemove={onRemove}
          onPauseAll={onPauseAll}
          onResumeAll={onResumeAll}
        />
      ))}
    </div>
  );
}

const SWIPE_DISTANCE_THRESHOLD = 45; // px
const SWIPE_VELOCITY_THRESHOLD = 0.11; // px/ms
const SWIPE_HYSTERESIS = 10; // px, before we commit to a horizontal drag
const SWIPE_FADE_RANGE = 160; // px of drag over which opacity fades to its floor
const SWIPE_FADE_FLOOR = 0.6; // max opacity reduction while dragging
const EXIT_FALLBACK_MS = 250;

interface ToastItemProps {
  toast: ToastState;
  leaving: boolean;
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  dragging: boolean;
}

function ToastItem({
  toast,
  leaving,
  onDismiss,
  onRemove,
  onPauseAll,
  onResumeAll,
}: ToastItemProps) {
  const [showDetail, setShowDetail] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const removedRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);

  const palette = toneStyles(toast.tone);
  const icon = toneIcon(toast.tone);

  // Two-phase removal: once `leaving` flips true, wait for the exit
  // transition to finish (transitionend, with a fallback timer) before
  // actually deleting the toast from state. jsdom (and any engine reporting
  // a zero computed transition-duration) has no transitions to wait for, so
  // remove synchronously — this keeps tests deterministic and guarantees no
  // ghost toasts leak on engines that never fire transitionend.
  useEffect(() => {
    if (!leaving) return;
    const root = rootRef.current;
    function finish() {
      if (removedRef.current) return;
      removedRef.current = true;
      onRemove(toast.id);
    }
    const dur = root ? parseFloat(getComputedStyle(root).transitionDuration || "0") : 0;
    if (!root || !dur) {
      finish();
      return;
    }
    function onTransitionEnd(event: TransitionEvent) {
      if (event.target !== root) return;
      if (event.propertyName !== "opacity" && event.propertyName !== "transform") return;
      finish();
    }
    root.addEventListener("transitionend", onTransitionEnd);
    const timeout = window.setTimeout(finish, EXIT_FALLBACK_MS);
    return () => {
      root.removeEventListener("transitionend", onTransitionEnd);
      window.clearTimeout(timeout);
    };
  }, [leaving, onRemove, toast.id]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current) return; // a drag is already active (multi-touch guard)
    const target = event.target as HTMLElement;
    if (target.closest("button, a, pre")) return; // let interactive children behave normally
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Date.now(),
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.dragging) {
      if (Math.abs(dx) < SWIPE_HYSTERESIS || Math.abs(dx) <= Math.abs(dy)) return;
      drag.dragging = true;
      const root = rootRef.current;
      if (root) root.dataset.dragging = "true"; // disable the transition for 1:1 tracking
      onPauseAll();
    }
    const root = rootRef.current;
    if (root) {
      root.style.transform = `translateX(${dx}px)`;
      root.style.opacity = String(1 - Math.min(Math.abs(dx) / SWIPE_FADE_RANGE, SWIPE_FADE_FLOOR));
    }
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const root = rootRef.current;
    if (!drag.dragging) return;
    const dx = event.clientX - drag.startX;
    const elapsedMs = Math.max(1, Date.now() - drag.startTime);
    const velocity = Math.abs(dx) / elapsedMs;
    if (Math.abs(dx) >= SWIPE_DISTANCE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD) {
      if (root) {
        delete root.dataset.dragging; // re-enable the transition to animate the fling-out
        root.dataset.swiped = "true";
        root.style.transform = `translateX(${dx >= 0 ? 100 : -100}%)`;
        root.style.opacity = "0";
      }
      onDismiss(toast.id);
      return;
    }
    if (root) {
      delete root.dataset.dragging;
      root.style.transform = "";
      root.style.opacity = "";
    }
    onResumeAll();
  }

  async function copyDetail() {
    if (!toast.detail) return;
    try {
      await navigator.clipboard.writeText(toast.detail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable in some webview contexts, and
      // window.prompt is a no-op in Tauri. Fall back to a hidden textarea +
      // execCommand("copy"), which works in WKWebView/WebView2.
      try {
        const textarea = document.createElement("textarea");
        textarea.value = toast.detail;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Both clipboard paths failed — the detail stays expandable on screen.
        setShowDetail(true);
      }
    }
  }

  return (
    <div
      ref={rootRef}
      role={toast.tone === "error" ? "alert" : "status"}
      className="ns-toast pointer-events-auto w-full max-w-md rounded-lg border shadow-lg backdrop-blur"
      style={{ background: palette.bg, borderColor: palette.border, color: palette.fg }}
      data-leaving={leaving || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 shrink-0" style={{ color: palette.icon }}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5">{toast.title}</div>
          {toast.description ? (
            <div className="mt-1 text-xs leading-5" style={{ color: palette.muted }}>
              {toast.description}
            </div>
          ) : null}
          {toast.details ? (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="text-xs font-semibold underline-offset-2 hover:underline"
                style={{ color: palette.icon }}
              >
                {showDetails ? "更新內容 ▴" : "更新內容 ▾"}
              </button>
              {showDetails ? (
                <MarkdownText
                  text={toast.details}
                  className="mt-1 text-xs"
                  style={{ color: palette.muted, maxHeight: 200, overflowY: "auto" }}
                />
              ) : null}
            </div>
          ) : null}
          {toast.detail ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="text-xs font-semibold underline-offset-2 hover:underline"
                style={{ color: palette.icon }}
              >
                {showDetail ? "收合詳細" : "查看詳細"}
              </button>
              {showDetail ? (
                <pre
                  className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border p-2 text-[11px] leading-4"
                  style={{
                    borderColor: palette.border,
                    background: palette.detailBg,
                    color: palette.detailFg,
                  }}
                >
                  {toast.detail}
                </pre>
              ) : null}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  onDismiss(toast.id);
                }}
                className="text-xs font-semibold underline-offset-2 hover:underline"
                style={{ color: palette.icon }}
              >
                {toast.action.label}
              </button>
            ) : null}
            {toast.detail ? (
              <button
                type="button"
                onClick={copyDetail}
                className="inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: palette.muted }}
              >
                <Copy size={14} />
                {copied ? "已複製" : "複製詳細"}
              </button>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          aria-label="關閉通知"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 rounded-md p-1 outline-none transition hover:opacity-70"
          style={{ color: palette.muted }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function toneIcon(tone: ToastTone): ReactNode {
  switch (tone) {
    case "success":
      return <CheckCircle size={18} weight="fill" />;
    case "error":
      return <XCircle size={18} weight="fill" />;
    case "warning":
      return <Warning size={18} weight="fill" />;
    case "info":
    default:
      return <Info size={18} weight="fill" />;
  }
}

function toneStyles(tone: ToastTone) {
  // Pull CSS variables already used by the rest of the app so the toast
  // respects light/dark theming. The fallbacks keep things readable if a
  // theme forgets to define a variable.
  switch (tone) {
    case "success":
      return {
        bg: "var(--ns-surface, #ffffff)",
        border: "var(--ns-positive, #1aa37a)",
        fg: "var(--ns-fg, #0f172a)",
        muted: "var(--ns-muted, #64748b)",
        icon: "var(--ns-positive, #1aa37a)",
        detailBg: "var(--ns-surface-strong, #f1f5f9)",
        detailFg: "var(--ns-fg, #0f172a)",
      };
    case "error":
      return {
        bg: "var(--ns-surface, #ffffff)",
        border: "var(--ns-danger, #c0392b)",
        fg: "var(--ns-fg, #0f172a)",
        muted: "var(--ns-muted, #64748b)",
        icon: "var(--ns-danger, #c0392b)",
        detailBg: "var(--ns-danger-soft, #fdecea)",
        detailFg: "var(--ns-fg, #0f172a)",
      };
    case "warning":
      return {
        bg: "var(--ns-surface, #ffffff)",
        border: "var(--ns-warning, #d97706)",
        fg: "var(--ns-fg, #0f172a)",
        muted: "var(--ns-muted, #64748b)",
        icon: "var(--ns-warning, #d97706)",
        detailBg: "var(--ns-warning-soft, #fef3c7)",
        detailFg: "var(--ns-fg, #0f172a)",
      };
    case "info":
    default:
      return {
        bg: "var(--ns-surface, #ffffff)",
        border: "var(--ns-accent, #2563eb)",
        fg: "var(--ns-fg, #0f172a)",
        muted: "var(--ns-muted, #64748b)",
        icon: "var(--ns-accent, #2563eb)",
        detailBg: "var(--ns-surface-strong, #f1f5f9)",
        detailFg: "var(--ns-fg, #0f172a)",
      };
  }
}
