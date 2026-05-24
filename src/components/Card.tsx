import type { PropsWithChildren, ReactNode } from "react";

export function Card({
  title,
  action,
  children,
}: PropsWithChildren<{ title?: string; action?: ReactNode }>) {
  return (
    <section className="rounded-lg border p-5 shadow-sm" style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold">{title}</h2> : <span />}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

