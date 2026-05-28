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
    <div className="ns-seg">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
