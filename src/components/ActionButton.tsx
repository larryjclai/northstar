import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { Button } from "./coss/button";

export function ActionButton({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className,
  style,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
}>) {
  const cossVariant =
    variant === "primary"
      ? "default"
      : variant === "ghost"
        ? "ghost"
        : variant === "danger"
          ? "destructive-outline"
          : "outline";

  return (
    <Button
      {...props}
      variant={cossVariant}
      size={size === "sm" ? "sm" : "default"}
      loading={loading}
      className={className}
      style={style}
    >
      {children}
    </Button>
  );
}
