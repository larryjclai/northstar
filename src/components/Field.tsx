import type { InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes } from "react";

export function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium" style={{ color: "var(--ns-muted)" }}>
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
      className={`rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${props.className ?? ""}`}
      style={{ background: "var(--ns-surface-strong)", borderColor: "var(--ns-border)", ...props.style }}
    />
  );
}

export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${props.className ?? ""}`}
      style={{ background: "var(--ns-surface-strong)", borderColor: "var(--ns-border)", ...props.style }}
    />
  );
}

