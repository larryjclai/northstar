import { CaretUpDown, Check } from "@phosphor-icons/react";
import type React from "react";
import { useMemo, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export interface AppSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function AppSelect({
  value,
  onChange,
  options,
  placeholder = "選擇項目",
  searchPlaceholder = "搜尋…",
  emptyLabel = "找不到項目",
  className,
  style,
  contentClassName,
  positionerClassName,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  contentClassName?: string;
  positionerClassName?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const searchable = options.length > 8;

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
            className="ns-input"
            disabled={disabled}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 36,
              boxSizing: "border-box",
              padding: "0 10px",
              cursor: disabled ? "not-allowed" : "pointer",
              textAlign: "left",
              whiteSpace: "nowrap",
              opacity: disabled ? 0.55 : 1,
              ...style,
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: selected ? undefined : "var(--ns-fg-dim)",
              }}
            >
              {selected?.label ?? placeholder}
            </span>
            <CaretUpDown size={14} style={{ flexShrink: 0, color: "var(--ns-fg-dim)" }} />
          </button>
        }
      />
      <PopoverContent
        align="start"
        className={`p-0 ${contentClassName ?? ""}`}
        positionerClassName={positionerClassName}
        style={{ width: "min(320px, calc(100vw - 32px))" }}
      >
        <Command>
          {searchable ? <CommandInput placeholder={searchPlaceholder} /> : null}
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.description ?? ""} ${option.value}`}
                  disabled={option.disabled}
                  onSelect={() => select(option.value)}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {option.label}
                    </span>
                    {option.description ? (
                      <span className="muted text-caption">{option.description}</span>
                    ) : null}
                  </span>
                  {value === option.value ? <Check size={14} style={{ flexShrink: 0 }} /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
