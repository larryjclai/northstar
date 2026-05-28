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
  const variantClass =
    variant === "primary"
      ? "ns-btn primary"
      : variant === "ghost"
        ? "ns-btn ghost"
        : variant === "danger"
          ? "ns-btn"
          : "ns-btn";

  const dangerStyle =
    variant === "danger"
      ? { color: "var(--ns-neg)", borderColor: "var(--ns-border)" }
      : {};

  const sizeStyle =
    size === "sm"
      ? { padding: "6px 10px", fontSize: 12 }
      : { padding: "9px 14px", fontSize: "var(--ns-t-ui)" };

  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading}
      className={`${variantClass} ${props.className ?? ""}`}
      style={{ ...sizeStyle, ...dangerStyle, ...props.style }}
    >
      {loading ? "處理中…" : children}
    </button>
  );
}
