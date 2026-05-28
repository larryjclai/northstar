import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  return (
    <div
      className="grid min-h-56 place-items-center p-6 text-center"
      style={{
        border: "1px dashed var(--ns-border)",
        borderRadius: "var(--ns-r-lg)",
        background: "var(--ns-bg)",
      }}
    >
      <div className="max-w-sm">
        <div
          className="mx-auto grid size-12 place-items-center"
          style={{
            background: "var(--ns-accent-soft)",
            color: "var(--ns-accent)",
            borderRadius: "var(--ns-r-md)",
          }}
        >
          {icon}
        </div>
        <h3
          className="mt-4"
          style={{
            fontFamily: "var(--ns-font-display)",
            fontSize: 17,
            fontWeight: 600,
            margin: "16px 0 0",
          }}
        >
          {title}
        </h3>
        <p
          className="mt-2 text-sm leading-6"
          style={{ color: "var(--ns-fg-muted)", margin: "8px 0 0" }}
        >
          {description}
        </p>
        {action || secondaryAction ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {action}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    </div>
  );
}
