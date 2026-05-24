import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

export function ActionButton({
  children,
  variant = "primary",
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }>) {
  const styles =
    variant === "primary"
      ? { background: "var(--ns-accent)", color: "var(--ns-on-accent)", borderColor: "var(--ns-accent)" }
      : variant === "danger"
        ? { background: "transparent", color: "var(--ns-negative)", borderColor: "var(--ns-border)" }
        : variant === "ghost"
          ? { background: "transparent", color: "var(--ns-muted)", borderColor: "transparent" }
          : { background: "var(--ns-surface-strong)", color: "var(--ns-text)", borderColor: "var(--ns-border)" };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold leading-none transition disabled:cursor-not-allowed disabled:opacity-50 ${props.className ?? ""}`}
      style={{ ...styles, ...props.style }}
    >
      {children}
    </button>
  );
}
