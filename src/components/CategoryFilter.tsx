import { useState } from "react";
import { CaretUpDown, Check } from "@phosphor-icons/react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Glyph } from "../lib/icons";

type CategoryLike = { name: string; color?: string; iconName?: string };

function CategoryDot({ category }: { category: CategoryLike }) {
  return category.iconName ? (
    <Glyph name={category.iconName} size={16} color={category.color || "var(--ns-fg-muted)"} />
  ) : (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        flexShrink: 0,
        background: category.color || "var(--ns-fg-muted)",
      }}
    />
  );
}

/**
 * Searchable category picker styled like AccountFilter, replacing the native
 * <select> category filter (B8). `value` is "all" or a category name.
 */
export function CategoryFilter({
  categories,
  value,
  onChange,
  allLabel = "所有分類",
  className,
  style,
}: {
  categories: CategoryLike[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const selected = value === "all" ? null : (categories.find((c) => c.name === value) ?? null);

  function select(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={className}
        render={
          <button
            type="button"
            className="ns-input text-body"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minWidth: 116,
              maxWidth: 220,
              height: 36,
              boxSizing: "border-box",
              padding: "0 10px",
              cursor: "pointer",
              textAlign: "left",
              whiteSpace: "nowrap",
              ...style,
            }}
          >
            {selected ? <CategoryDot category={selected} /> : null}
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {selected ? selected.name : allLabel}
            </span>
            <CaretUpDown size={14} style={{ flexShrink: 0, color: "var(--ns-fg-dim)" }} />
          </button>
        }
      />
      <PopoverContent align="start" className="w-56 p-0" style={{ width: 224 }}>
        <Command>
          <CommandInput placeholder="搜尋分類…" />
          <CommandList>
            <CommandEmpty>找不到分類</CommandEmpty>
            <CommandGroup>
              <CommandItem value={`${allLabel} all`} onSelect={() => select("all")}>
                <span style={{ flex: 1 }}>{allLabel}</span>
                {value === "all" ? <Check size={14} /> : null}
              </CommandItem>
              {categories.map((c) => (
                <CommandItem key={c.name} value={c.name} onSelect={() => select(c.name)}>
                  <CategoryDot category={c} />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.name}
                  </span>
                  {value === c.name ? <Check size={14} style={{ flexShrink: 0 }} /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
