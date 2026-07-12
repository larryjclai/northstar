import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbStyle, setThumbStyle] = useState<{
    transform: string;
    width: string;
    opacity: number;
  }>({ transform: "translateX(0px)", width: "0px", opacity: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function measure() {
      if (!container) return;
      const active =
        container.querySelector<HTMLElement>("[data-pressed]") ??
        container.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!active) return;
      setThumbStyle({
        transform: `translateX(${active.offsetLeft}px)`,
        width: `${active.offsetWidth}px`,
        opacity: 1,
      });
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [value, options.length, fullWidth]);

  return (
    <div
      ref={containerRef}
      className={fullWidth ? "flex w-full" : "inline-flex"}
      style={{
        position: "relative",
        background: "var(--ns-surface-strong)",
        padding: 4,
        borderRadius: "var(--ns-r-md)",
        border: "1px solid var(--ns-border)",
      }}
    >
      <div
        aria-hidden
        className="ns-seg-thumb"
        style={{
          transform: thumbStyle.transform,
          width: thumbStyle.width,
          opacity: thumbStyle.opacity,
        }}
      />
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
            style={{
              position: "relative",
              background: "transparent",
              border: "1px solid transparent",
              color:
                value === option.value
                  ? "var(--ns-fg)"
                  : "var(--ns-fg-muted)",
            }}
          >
            {option.icon}
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
