import { CalendarBlank } from "@phosphor-icons/react";
import { dateScopePresetLabel, resolveDateScope, type DateScopePreset, type DateScopeValue } from "../domain/dateScope";
import { useUiPreferences } from "../state/uiPreferences";
import { SegmentedControl } from "./SegmentedControl";
import { MonthPicker } from "./ui/month-picker";
import { DateRangePicker } from "./ui/date-picker";
import { cn } from "../lib/utils";

export function DateScopeControl({
  value,
  onChange,
  presets = ["month", "ytd", "last12m", "custom"],
  className,
  align = "end",
}: {
  value: DateScopeValue;
  onChange: (value: DateScopeValue) => void;
  presets?: DateScopePreset[];
  className?: string;
  align?: "start" | "end";
}) {
  const timezone = useUiPreferences((state) => state.timezone);

  // Switch to custom seeded with the currently-resolved range, so opening the
  // calendar from YTD/近12個月/全部 starts from what's already on screen.
  function enterCustom() {
    const resolved = resolveDateScope(value, timezone);
    const fallback = resolveDateScope({ ...value, preset: "last12m" }, timezone);
    onChange({
      ...value,
      preset: "custom",
      start: resolved.start ?? fallback.start ?? value.start,
      end: resolved.end ?? fallback.end ?? value.end,
    });
  }

  return (
    <div className={cn("ns-date-scope", className)} data-align={align}>
      <div className="ns-date-scope__presets">
        <SegmentedControl
          value={value.preset}
          onChange={(preset) => onChange({ ...value, preset })}
          options={presets.map((preset) => ({ value: preset, label: dateScopePresetLabel(preset) }))}
        />
      </div>

      {/* Renders inline pickers when their preset is active. No fixed placeholder anymore so it collapses nicely. */}
      {(value.preset === "month" || value.preset === "custom") && (
        <div className="ns-date-scope__detail">
          {value.preset === "month" ? (
            <MonthPicker
              value={value.month}
              onChange={(month) => onChange({ ...value, month })}
              onSelectDay={(day) => onChange({ ...value, preset: "custom", start: day, end: day })}
              triggerClassName="h-[36px] min-w-[112px] whitespace-nowrap"
            />
          ) : (
            <DateRangePicker
              start={value.start}
              end={value.end}
              align={align}
              className="h-[36px] w-full text-[13px]"
              onChange={({ start, end }) => onChange({ ...value, start, end })}
            />
          )}
        </div>
      )}
    </div>
  );
}
