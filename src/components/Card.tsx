import type { PropsWithChildren, ReactNode } from "react";
import { Card as CossCard } from "./coss/card";

export function Card({
  title,
  action,
  variant = "default",
  density = "md",
  children,
}: PropsWithChildren<{
  title?: ReactNode;
  action?: ReactNode;
  variant?: "default" | "muted" | "raised";
  density?: "sm" | "md";
}>) {
  const padding = density === "sm" ? "16px" : "var(--ns-pad-card)";

  return (
    <CossCard
      render={<section />}
      style={{
        padding,
        // Default surface uses COSS Card's bg-card; muted/raised override.
        ...(variant === "muted" ? { background: "var(--ns-bg)" } : {}),
        ...(variant === "raised" ? { boxShadow: "var(--ns-shadow-2)" } : {}),
      }}
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
    </CossCard>
  );
}
