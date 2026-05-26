import type { PropsWithChildren, ReactNode } from "react";

export function Card({
  title,
  action,
  variant = "default",
  density = "md",
  children,
}: PropsWithChildren<{
  title?: string;
  action?: ReactNode;
  variant?: "default" | "muted" | "raised";
  density?: "sm" | "md";
}>) {
  const paddingClass = density === "sm" ? "p-4" : "p-5";
  const background =
    variant === "muted"
      ? "var(--ns-surface-subtle)"
      : "var(--ns-surface)";
  const shadow = variant === "raised" ? "var(--ns-shadow-strong)" : "var(--ns-shadow)";

  return (
    <section
      className={`rounded-xl border ${paddingClass}`}
      style={{ background, borderColor: "var(--ns-border)", boxShadow: shadow }}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="min-w-0 text-base font-semibold">{title}</h2> : <span />}
          {action ? <div className="min-w-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
