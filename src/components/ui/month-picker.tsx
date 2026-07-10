import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { parseISO } from "date-fns";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Calendar } from "./calendar";
import { buttonVariants } from "../coss/button";
import { cn } from "../../lib/utils";

interface MonthPickerProps {
  value: string; // "YYYY-MM"
  onChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  /**
   * When provided, the popover offers a "選日" tab that drills into the month
   * and lets the user pick a single day (returned as YYYY-MM-DD). Selecting a
   * whole month still works via the "選月" tab and `onChange`.
   */
  onSelectDay?: (day: string) => void;
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function MonthPicker({ value, onChange, className, triggerClassName, onSelectDay }: MonthPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"month" | "day">("month");
  const [year, setYear] = React.useState(() => {
    return value ? parseInt(value.slice(0, 4), 10) : new Date().getFullYear();
  });

  const currentMonth = value ? parseInt(value.slice(5, 7), 10) : undefined;
  const currentYear = value ? parseInt(value.slice(0, 4), 10) : undefined;

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  function shiftMonth(delta: number) {
    const base = value ? new Date(`${value}-01T00:00:00`) : new Date();
    base.setMonth(base.getMonth() + delta);
    onChange(`${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1">
      <button type="button" className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="上一個月" onClick={() => shiftMonth(-1)}><CaretLeft size={15} /></button>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "gap-2",
          !value && "text-[var(--ns-fg-muted)]",
          triggerClassName
        )}
      >
        <CalendarBlank size={16} />
        <span style={{ fontSize: 14 }}>{value || "Select month"}</span>
      </PopoverTrigger>
      <button type="button" className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="下一個月" onClick={() => shiftMonth(1)}><CaretRight size={15} /></button>
      </div>
      <PopoverContent className={cn("w-64 p-3", className)} align="start">
        {onSelectDay ? (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-md bg-[var(--ns-surface-strong)] p-0.5">
            {(["month", "day"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "py-1 text-xs rounded transition-colors font-medium",
                  mode === m
                    ? "bg-[var(--ns-surface)] text-[var(--ns-fg)] shadow-sm"
                    : "text-[var(--ns-fg-muted)] hover:text-[var(--ns-fg)]"
                )}
              >
                {m === "month" ? "選月" : "選日"}
              </button>
            ))}
          </div>
        ) : null}

        {onSelectDay && mode === "day" ? (
          <Calendar
            mode="single"
            month={value ? parseISO(`${value}-01`) : undefined}
            selected={value && value.length === 10 ? parseISO(value) : undefined}
            onSelect={(d) => {
              if (!d) return;
              onSelectDay(ymd(d));
              setOpen(false);
            }}
            autoFocus
          />
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setYear((y) => y - 1)}
                aria-label="上一年"
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <CaretLeft size={18} />
              </button>
              <div className="font-semibold text-sm tabular-nums">{year}</div>
              <button
                onClick={() => setYear((y) => y + 1)}
                aria-label="下一年"
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <CaretRight size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {months.map((month, index) => {
                const isSelected = currentMonth === index + 1 && currentYear === year;
                return (
                  <button
                    key={month}
                    onClick={() => {
                      const mm = String(index + 1).padStart(2, "0");
                      onChange(`${year}-${mm}`);
                      setOpen(false);
                    }}
                    className={cn(
                      "p-2 text-sm rounded-md transition-colors font-medium",
                      isSelected
                        ? "bg-[var(--ns-accent)] text-white"
                        : "hover:bg-[var(--ns-surface-strong)] text-[var(--ns-fg)]"
                    )}
                  >
                    {month}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
