import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export function ActionButton({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
}>) {
  const styles =
    variant === "primary"
      ? { background: "var(--ns-accent)", color: "var(--ns-on-accent)", borderColor: "var(--ns-accent)" }
      : variant === "danger"
        ? { background: "transparent", color: "var(--ns-negative)", borderColor: "var(--ns-border)" }
        : variant === "ghost"
          ? { background: "transparent", color: "var(--ns-muted)", borderColor: "transparent" }
          : { background: "var(--ns-surface-elevated)", color: "var(--ns-text)", borderColor: "var(--ns-border)" };
  const sizeClass = size === "sm" ? "min-h-8 px-2.5 py-1.5 text-xs" : "min-h-10 px-3.5 py-2 text-sm";

  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-semibold leading-none transition disabled:cursor-not-allowed disabled:opacity-50 ${sizeClass} ${props.className ?? ""}`}
      style={{ ...styles, ...props.style, boxShadow: "var(--ns-shadow)" }}
    >
      {loading ? "處理中…" : children}
    </button>
  );
}
