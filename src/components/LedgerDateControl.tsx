import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarBlank, CaretDown, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { dateScopePresetLabel, resolveDateScope, type DateScopePreset, type DateScopeValue } from "../domain/dateScope";
import { useUiPreferences } from "../state/uiPreferences";
import { SegmentedControl } from "./SegmentedControl";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Calendar } from "./ui/calendar";
import { cn } from "../lib/utils";

// Presets offered by the period popover. "all" is a valid DateScopePreset in
// the domain type but isn't surfaced here — mirrors DateScopeControl's
// default `presets` prop, so no domain change is needed (plan 168).
const PERIOD_PRESETS: DateScopePreset[] = ["month", "ytd", "last12m", "custom"];
const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function shiftMonthValue(month: string, delta: number) {
  const [year, mm] = month.split("-").map(Number);
  const date = new Date(year, mm - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Combined period control for 記帳 (plan 168, design `LgDateCtl` +
 * `NSLgDatePopover`): a single bordered pill — ‹ prev / center trigger /
 * next › — where the center trigger opens a popover holding the quick
 * presets plus a month-grid (or, for 自訂, a range calendar). Wraps the same
 * `DateScopeValue` contract as `DateScopeControl`; resolution stays in
 * `resolveDateScope` — this is presentation only.
 *
 * Kept as a separate component (rather than editing `DateScopeControl` in
 * place) so Dashboard/Investments — the other callers of `DateScopeControl`
 * — are untouched.
 */
export function LedgerDateControl({
  value,
  onChange,
  className,
}: {
  value: DateScopeValue;
  onChange: (value: DateScopeValue) => void;
  className?: string;
}) {
  const timezone = useUiPreferences((state) => state.timezone);
  const [open, setOpen] = useState(false);
  const [gridYear, setGridYear] = useState(() => Number(value.month.slice(0, 4)) || new Date().getFullYear());

  const resolved = resolveDateScope(value, timezone);
  const label =
    value.preset === "month"
      ? `本月 · ${value.month}`
      : value.preset === "custom"
        ? resolved.label
        : dateScopePresetLabel(value.preset);

  const canStep = value.preset === "month";

  function stepMonth(delta: number) {
    if (!canStep) return;
    onChange({ ...value, preset: "month", month: shiftMonthValue(value.month, delta) });
  }

  function selectPreset(preset: DateScopePreset) {
    if (preset === "custom" && value.preset !== "custom") {
      // Seed custom from whatever range is currently resolved (same as
      // DateScopeControl.enterCustom), so switching from YTD/近12個月 into
      // 自訂 starts from what's already on screen instead of a blank range.
      const fallback = resolveDateScope({ ...value, preset: "last12m" }, timezone);
      onChange({
        ...value,
        preset: "custom",
        start: resolved.start ?? fallback.start ?? value.start,
        end: resolved.end ?? fallback.end ?? value.end,
      });
      return;
    }
    onChange({ ...value, preset });
  }

  function selectMonth(monthIndex: number) {
    const mm = String(monthIndex + 1).padStart(2, "0");
    onChange({ ...value, preset: "month", month: `${gridYear}-${mm}` });
    setOpen(false);
  }

  const activeMonth = value.preset === "month" ? value.month : null;
  const rangeFrom = value.start ? parseISO(value.start) : undefined;
  const rangeTo = value.end ? parseISO(value.end) : undefined;

  return (
    <div className={cn("ns-ledger-date-ctl", className)}>
      <button
        type="button"
        className="ns-ledger-date-ctl__step"
        aria-label="上一個月"
        onClick={() => stepMonth(-1)}
        disabled={!canStep}
      >
        <CaretLeft size={14} />
      </button>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setGridYear(Number(value.month.slice(0, 4)) || new Date().getFullYear());
        }}
      >
        <PopoverTrigger className="ns-ledger-date-ctl__trigger" render={<button type="button" />}>
          <CalendarBlank size={15} />
          <span>{label}</span>
          <CaretDown size={12} />
        </PopoverTrigger>
        <PopoverContent align="center" className={cn("p-3", value.preset === "custom" ? "w-auto" : "w-72")}>
          <div className="mb-3">
            <div className="text-xs ns-field-label mb-1.5">快速預設</div>
            <SegmentedControl
              value={value.preset === "all" ? "custom" : value.preset}
              onChange={selectPreset}
              options={PERIOD_PRESETS.map((preset) => ({ value: preset, label: dateScopePresetLabel(preset) }))}
              fullWidth
            />
          </div>

          {value.preset === "custom" ? (
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={rangeFrom}
              selected={{ from: rangeFrom, to: rangeTo }}
              onSelect={(range) => {
                if (!range?.from) return;
                onChange({
                  ...value,
                  preset: "custom",
                  start: format(range.from, "yyyy-MM-dd"),
                  // While the user is still picking the second day, mirror
                  // the first so the resolved scope stays valid.
                  end: format(range.to ?? range.from, "yyyy-MM-dd"),
                });
              }}
              autoFocus
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-[var(--ns-bg-hover)] text-[var(--ns-fg-muted)] hover:text-[var(--ns-fg)] transition-colors"
                  aria-label="上一年"
                  onClick={() => setGridYear((y) => y - 1)}
                >
                  <CaretLeft size={16} />
                </button>
                <div className="text-sm font-semibold tabular-nums">{gridYear}</div>
                <button
                  type="button"
                  className="p-1 rounded-md hover:bg-[var(--ns-bg-hover)] text-[var(--ns-fg-muted)] hover:text-[var(--ns-fg)] transition-colors"
                  aria-label="下一年"
                  onClick={() => setGridYear((y) => y + 1)}
                >
                  <CaretRight size={16} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_LABELS.map((monthLabel, index) => {
                  const mm = String(index + 1).padStart(2, "0");
                  const isSelected = activeMonth === `${gridYear}-${mm}`;
                  return (
                    <button
                      key={monthLabel}
                      type="button"
                      onClick={() => selectMonth(index)}
                      className={cn(
                        "p-2 text-xs rounded-md transition-colors font-medium",
                        isSelected
                          ? "bg-[var(--ns-accent)] text-white"
                          : "hover:bg-[var(--ns-bg-hover)] text-[var(--ns-fg)]"
                      )}
                    >
                      {monthLabel}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        className="ns-ledger-date-ctl__step"
        aria-label="下一個月"
        onClick={() => stepMonth(1)}
        disabled={!canStep}
      >
        <CaretRight size={14} />
      </button>
    </div>
  );
}
