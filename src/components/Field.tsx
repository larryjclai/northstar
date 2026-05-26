import type { InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ns-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-w-0 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${props.className ?? ""}`}
      style={{ background: "var(--ns-surface-elevated)", borderColor: "var(--ns-border)", ...props.style }}
    />
  );
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`min-w-0 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${props.className ?? ""}`}
      style={{ background: "var(--ns-surface-elevated)", borderColor: "var(--ns-border)", ...props.style }}
    />
  );
}

export function TextAreaInput(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-w-0 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${props.className ?? ""}`}
      style={{ background: "var(--ns-surface-elevated)", borderColor: "var(--ns-border)", ...props.style }}
    />
  );
}
