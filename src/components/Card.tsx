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
  const padding = density === "sm" ? "16px" : "var(--ns-pad-card)";
  const bg =
    variant === "muted" ? "var(--ns-bg)" : "var(--ns-bg-card)";
  const shadow =
    variant === "raised" ? "var(--ns-shadow-2)" : "var(--ns-shadow-1)";

  return (
    <section
      className="ns-card"
      style={{ padding, background: bg, boxShadow: shadow }}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title ? (
            <h2
              style={{
                fontFamily: "var(--ns-font-display)",
                fontSize: 15,
                fontWeight: 600,
                margin: 0,
                letterSpacing: -0.01,
              }}
            >
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action ? <div className="min-w-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
