import { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { ListPlus } from "@phosphor-icons/react";

export function FilterPill({
  label,
  options,
  selected,
  onChange,
  icon,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  icon?: ReactNode;
}) {
  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }
  const count = selected.size;

  // Render selected labels. If multiple are selected, show count to prevent layout shift
  const displayLabel =
    count > 1
      ? `${count} 項已選`
      : count === 1
        ? options.find((o) => selected.has(o.value))?.label || label
        : label;

  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors"
        style={{
          borderColor: count ? "var(--ns-accent)" : "var(--ns-border)",
          background: count ? "var(--ns-accent-soft)" : "var(--ns-surface)",
          color: count ? "var(--ns-accent)" : "var(--ns-fg)",
        }}
      >
        {icon || <ListPlus size={14} />}
        <span className="truncate max-w-[120px]">{displayLabel}</span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-2 rounded-xl border border-[var(--ns-border)]"
        style={{ background: "var(--ns-surface-strong)", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}
      >
        <div
          className="mb-2 flex items-center justify-between px-2 text-xs"
          style={{ color: "var(--ns-fg-muted)", fontWeight: 500 }}
        >
          <span>{label}</span>
          {count > 0 && (
            <button
              className="hover:underline text-[var(--ns-neg)]"
              onClick={() => onChange(new Set())}
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
          {options.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[var(--ns-bg-hover)] transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={() => toggle(opt.value)}
                className="accent-[var(--ns-accent)] rounded-sm w-4 h-4 border-[var(--ns-border)]"
              />
              <span className="truncate flex-1">{opt.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
