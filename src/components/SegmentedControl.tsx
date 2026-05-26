import type { ReactNode } from "react";

export interface SegmentOption<TValue extends string> {
  value: TValue;
  label: string;
  icon?: ReactNode;
}

export function SegmentedControl<TValue extends string>({
  value,
  options,
  onChange,
}: {
  value: TValue;
  options: Array<SegmentOption<TValue>>;
  onChange: (value: TValue) => void;
}) {
  return (
    <div className="inline-grid rounded-xl border p-1" style={{ borderColor: "var(--ns-border)", background: "var(--ns-surface-elevated)" }}>
      <div className="flex gap-1">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition"
              style={{
                background: selected ? "var(--ns-accent)" : "transparent",
                color: selected ? "var(--ns-on-accent)" : "var(--ns-muted)",
              }}
              onClick={() => onChange(option.value)}
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
