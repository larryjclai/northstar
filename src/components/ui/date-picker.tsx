// @ts-nocheck
import * as React from "react"
import { format, parseISO } from "date-fns"
import { CalendarIcon } from "lucide-react"

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
          <CalendarIcon className="mr-2 h-4 w-4" />
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
