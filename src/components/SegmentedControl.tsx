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
}: {
  value: TValue;
  options: Array<SegmentOption<TValue>>;
  onChange: (value: TValue) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      value={[value]}
      onValueChange={(next) => {
        const v = next[0] as TValue | undefined;
        if (v) onChange(v);
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          size="sm"
          className="gap-1.5 data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground"
        >
          {option.icon}
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
