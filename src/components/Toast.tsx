import { CheckCircle, Copy, Info, Warning, X, XCircle } from "@phosphor-icons/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";

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
  /** Milliseconds before auto-dismiss. Errors default to sticky (0). */
  durationMs?: number;
  /** Optional inline action like "Undo" / "重試". */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  show: (descriptor: Omit<ToastDescriptor, "id">) => string;
  dismiss: (id: string) => void;
  success: (title: string, options?: Partial<Omit<ToastDescriptor, "id" | "tone" | "title">>) => string;
  error: (title: string, options?: Partial<Omit<ToastDescriptor, "id" | "tone" | "title">>) => string;
  info: (title: string, options?: Partial<Omit<ToastDescriptor, "id" | "tone" | "title">>) => string;
  warning: (title: string, options?: Partial<Omit<ToastDescriptor, "id" | "tone" | "title">>) => string;
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

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastDescriptor[]>([]);
  const timeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timeouts.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeouts.current.delete(id);
    }
  }, []);

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

  const value = useMemo<ToastContextValue>(() => ({
    show,
    dismiss,
    success: (title, options) => show({ tone: "success", title, ...options }),
    error: (title, options) => show({ tone: "error", title, ...options }),
    info: (title, options) => show({ tone: "info", title, ...options }),
    warning: (title, options) => show({ tone: "warning", title, ...options }),
  }), [show, dismiss]);

  // Clean up dangling timers if provider unmounts mid-life (HMR, route swap).
  useEffect(() => () => {
    const timers = timeouts.current;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
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

function ToastViewport({ toasts, onDismiss }: { toasts: ToastDescriptor[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end sm:px-0">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastDescriptor; onDismiss: (id: string) => void }) {
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  const palette = toneStyles(toast.tone);
  const icon = toneIcon(toast.tone);

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
      role={toast.tone === "error" ? "alert" : "status"}
      className="pointer-events-auto w-full max-w-md rounded-lg border shadow-lg backdrop-blur"
      style={{ background: palette.bg, borderColor: palette.border, color: palette.fg }}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 shrink-0" style={{ color: palette.icon }}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5">{toast.title}</div>
          {toast.description ? (
            <div className="mt-1 text-xs leading-5" style={{ color: palette.muted }}>{toast.description}</div>
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
                  style={{ borderColor: palette.border, background: palette.detailBg, color: palette.detailFg }}
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
                onClick={() => { toast.action!.onClick(); onDismiss(toast.id); }}
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
                <Copy size={12} />{copied ? "已複製" : "複製詳細"}
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
