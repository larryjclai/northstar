import { useUiPreferences } from "../state/uiPreferences";
import { SelectInput, TextInput } from "./Field";

/**
 * Replacement for `<input type="datetime-local">` that gives the user explicit
 * control over the time portion: 24h or 12h with AM/PM. Browsers honor the OS
 * locale for native datetime-local inputs, which leaves users in Asia stuck
 * either with the wrong clock convention or without an AM/PM picker.
 *
 * Value format follows the same `YYYY-MM-DDTHH:mm` shape as
 * `<input type="datetime-local">` so it slots into existing form state.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  /** ISO-ish `YYYY-MM-DDTHH:mm` string (`""` = unset). */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const clockMode = useUiPreferences((state) => state.clockMode);
  const toggleClockMode = useUiPreferences((state) => state.setClockMode);

  const parsed = parseDateTime(value);
  const datePart = parsed?.date ?? "";
  const hour24 = parsed?.hour ?? 0;
  const minute = parsed?.minute ?? 0;

  function update(next: { date?: string; hour?: number; minute?: number }) {
    const d = next.date ?? datePart;
    const h = clamp(next.hour ?? hour24, 0, 23);
    const m = clamp(next.minute ?? minute, 0, 59);
    if (!d) {
      onChange("");
      return;
    }
    onChange(`${d}T${pad2(h)}:${pad2(m)}`);
  }

  const { displayHour, period } = formatDisplayHour(hour24, clockMode);

  return (
    <div className="grid gap-1 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium" style={{ color: "var(--ns-muted)" }}>
          {label}
        </span>
        <button
          type="button"
          className="rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase outline-none transition hover:opacity-80"
          style={{ borderColor: "var(--ns-border)", color: "var(--ns-muted)" }}
          onClick={() => toggleClockMode(clockMode === "24h" ? "12h" : "24h")}
          title="切換 24 小時制 / AM-PM"
          aria-pressed={clockMode === "12h"}
        >
          {clockMode === "24h" ? "24h" : "AM/PM"}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
        <TextInput
          type="date"
          value={datePart}
          required={required}
          onChange={(event) => update({ date: event.target.value })}
        />
        <div
          className={`grid gap-2 ${clockMode === "12h" ? "grid-cols-[1fr_1fr_100px]" : "grid-cols-2"}`}
        >
          <SelectInput
            value={displayHour}
            onChange={(event) => {
              const next = Number(event.target.value);
              const nextHour24 = clockMode === "24h" ? next : convertTo24Hour(next, period);
              update({ hour: nextHour24 });
            }}
            aria-label="小時"
          >
            {(clockMode === "24h" ? rangeHours24() : rangeHours12()).map((h) => (
              <option key={h} value={h}>
                {clockMode === "24h" ? pad2(h) : h === 0 ? "12" : pad2(h)}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={minute}
            onChange={(event) => update({ minute: Number(event.target.value) })}
            aria-label="分鐘"
          >
            {Array.from({ length: 60 }, (_, i) => i).map((m) => (
              <option key={m} value={m}>
                {pad2(m)}
              </option>
            ))}
          </SelectInput>
          {clockMode === "12h" ? (
            <SelectInput
              value={period}
              onChange={(event) => {
                const nextPeriod = event.target.value as "AM" | "PM";
                update({ hour: convertTo24Hour(displayHour, nextPeriod) });
              }}
              aria-label="AM / PM"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </SelectInput>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function parseDateTime(value: string): { date: string; hour: number; minute: number } | null {
  if (!value) return null;
  const [date, time] = value.split("T");
  if (!date) return null;
  const [hourStr = "0", minuteStr = "0"] = (time ?? "").split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return { date, hour: 0, minute: 0 };
  return { date, hour, minute };
}

function formatDisplayHour(
  hour24: number,
  mode: "24h" | "12h",
): { displayHour: number; period: "AM" | "PM" } {
  if (mode === "24h") {
    return { displayHour: hour24, period: hour24 >= 12 ? "PM" : "AM" };
  }
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const h12 = hour24 % 12;
  return { displayHour: h12 === 0 ? 12 : h12, period };
}

function convertTo24Hour(displayHour: number, period: "AM" | "PM"): number {
  if (period === "AM") {
    return displayHour === 12 ? 0 : displayHour;
  }
  return displayHour === 12 ? 12 : displayHour + 12;
}

function rangeHours24() {
  return Array.from({ length: 24 }, (_, i) => i);
}

function rangeHours12() {
  // Display order: 12, 1, 2, ..., 11 — matches how people read AM/PM clocks.
  return [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
