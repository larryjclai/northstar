import { CalendarBlank } from "@phosphor-icons/react";
import { dateScopePresetLabel, type DateScopePreset, type DateScopeValue } from "../domain/dateScope";
import { SegmentedControl } from "./SegmentedControl";
import { MonthPicker } from "./ui/month-picker";
import { TextInput } from "./Field";
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

      <div className="ns-date-scope__detail">
        {value.preset === "month" ? (
          <MonthPicker
            value={value.month}
            onChange={(month) => onChange({ ...value, month })}
            triggerClassName="h-[36px] min-w-[112px] whitespace-nowrap"
          />
        ) : value.preset === "custom" ? (
          <div className="ns-date-scope__custom">
            <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              <CalendarBlank size={14} />起訖
            </span>
            <TextInput
              type="date"
              value={value.start}
              onChange={(event) => onChange({ ...value, start: event.target.value })}
              style={{ width: 140, height: 36, fontSize: 13 }}
            />
            <span className="muted" style={{ fontSize: 12 }}>到</span>
            <TextInput
              type="date"
              value={value.end}
              onChange={(event) => onChange({ ...value, end: event.target.value })}
              style={{ width: 140, height: 36, fontSize: 13 }}
            />
          </div>
        ) : (
          <span className="ns-date-scope__summary">{dateScopeSummaryLabel(value)}</span>
        )}
      </div>
    </div>
  );
}

function dateScopeSummaryLabel(value: DateScopeValue) {
  if (value.preset === "ytd") return `${(value.month || new Date().toISOString()).slice(0, 4)} YTD`;
  if (value.preset === "last12m") return "近 12 個月";
  if (value.preset === "all") return "全部期間";
  return dateScopePresetLabel(value.preset);
}
