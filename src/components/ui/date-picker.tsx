// @ts-nocheck
import * as React from "react"
import { format, parseISO } from "date-fns"
import { CalendarBlank } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/coss/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DatePicker({
  value,
  onChange,
  className,
}: {
  value?: string
  onChange?: (value: string) => void
  className?: string
}) {
  const date = value ? parseISO(value) : undefined

  return (
    <Popover>
      <PopoverTrigger render={
        <button
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-[140px] justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarBlank className="mr-2 h-4 w-4" />
          {date ? format(date, "yyyy-MM") : <span>選擇月份</span>}
        </button>
      } />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => d && onChange?.(format(d, "yyyy-MM-dd"))}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Wealthfolio-style date-range picker: one calendar-icon trigger showing the
 * selected range, opening a two-month range calendar. Values are YYYY-MM-DD.
 */
export function DateRangePicker({
  start,
  end,
  onChange,
  align = "end",
  className,
}: {
  start?: string
  end?: string
  onChange: (range: { start: string; end: string }) => void
  align?: "start" | "end"
  className?: string
}) {
  const from = start ? parseISO(start) : undefined
  const to = end ? parseISO(end) : undefined
  const label = from && to
    ? start === end
      ? format(from, "yyyy/MM/dd")
      : `${format(from, "yyyy/MM/dd")} – ${format(to, "yyyy/MM/dd")}`
    : from
      ? `${format(from, "yyyy/MM/dd")} – …`
      : "選擇期間"

  return (
    <Popover>
      <PopoverTrigger render={
        <button
          className={cn(
            buttonVariants({ variant: "outline" }),
            "justify-start text-left font-normal whitespace-nowrap",
            !from && "text-muted-foreground",
            className
          )}
        >
          <CalendarBlank className="mr-2 h-4 w-4" />
          {label}
        </button>
      } />
      <PopoverContent className="w-auto p-0" align={align}>
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={from}
          selected={{ from, to }}
          onSelect={(range) => {
            if (!range?.from) return
            onChange({
              start: format(range.from, "yyyy-MM-dd"),
              // While the user is still picking the second day, mirror the
              // first so the resolved scope stays valid.
              end: format(range.to ?? range.from, "yyyy-MM-dd"),
            })
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
