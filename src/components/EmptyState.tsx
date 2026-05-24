import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-52 place-items-center rounded-lg border border-dashed p-6 text-center" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface)" }}>
      <div className="max-w-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-lg" style={{ background: "var(--ns-accent-soft)", color: "var(--ns-accent)" }}>
          {icon}
        </div>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--ns-muted)" }}>{description}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
