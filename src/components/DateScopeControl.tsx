import { dateScopePresetLabel, type DateScopePreset, type DateScopeValue } from "../domain/dateScope";
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
  const detailMode = value.preset === "custom" ? "custom" : "compact";

  return (
    <div
      className={cn("ns-date-scope", className)}
      data-align={align}
      data-detail={detailMode}
    >
      <div className="ns-date-scope__presets">
        <SegmentedControl
          value={value.preset}
          onChange={(preset) => onChange({ ...value, preset })}
          options={presets.map((preset) => ({ value: preset, label: dateScopePresetLabel(preset) }))}
        />
      </div>

      {/* Detail control only when the preset needs input — the resolved range
          of ytd/last12m/all is self-evident from the active segment, so the
          old grey summary chip was noise (Wealthfolio-style cleanup). */}
      {value.preset === "month" ? (
        <div className="ns-date-scope__detail">
          <MonthPicker
            value={value.month}
            onChange={(month) => onChange({ ...value, month })}
            triggerClassName="h-[36px] min-w-[112px] whitespace-nowrap"
          />
        </div>
      ) : value.preset === "custom" ? (
        <div className="ns-date-scope__detail">
          <DateRangePicker
            start={value.start}
            end={value.end}
            align={align}
            className="h-[36px] text-[13px]"
            onChange={({ start, end }) => onChange({ ...value, start, end })}
          />
        </div>
      ) : null}
    </div>
  );
}
