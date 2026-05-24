import type { Icon } from "@phosphor-icons/react";

export function EmptyState({ icon: IconComponent, title, body }: { icon: Icon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center" style={{ borderColor: "var(--ns-border)" }}>
      <IconComponent size={32} weight="duotone" style={{ color: "var(--ns-accent)" }} />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--ns-muted)" }}>
        {body}
      </p>
    </div>
  );
}

