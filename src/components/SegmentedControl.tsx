import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "./coss/toggle-group";

export interface SegmentOption<TValue extends string> {
  value: TValue;
  label: string;
  icon?: ReactNode;
}

export function SegmentedControl<TValue extends string>({
  value,
  options,
  onChange,
  fullWidth = false,
}: {
  value: TValue;
  options: Array<SegmentOption<TValue>>;
  onChange: (value: TValue) => void;
  fullWidth?: boolean;
}) {
  return (
    <div
      className={fullWidth ? "flex w-full" : "inline-flex"}
      style={{
        background: "var(--ns-surface-strong)",
        padding: 4,
        borderRadius: "var(--ns-r-md)",
        border: "1px solid var(--ns-border)",
      }}
    >
      <ToggleGroup
        variant="outline"
        value={[value]}
        onValueChange={(next) => {
          const v = next[0] as TValue | undefined;
          if (v) onChange(v);
        }}
        className={fullWidth ? "w-full gap-1" : "gap-1"}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            size="sm"
            className={fullWidth ? "flex-1" : ""}
            style={
              value === option.value
                ? {
                    background: "var(--ns-surface-elevated)",
                    color: "var(--ns-fg)",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    border: "1px solid var(--ns-border)",
                  }
                : {
                    background: "transparent",
                    color: "var(--ns-fg-muted)",
                    border: "1px solid transparent",
                  }
            }
          >
            {option.icon}
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
