import { todayInTimezone } from "./datetime";

export type DateScopePreset = "month" | "ytd" | "last12m" | "all" | "custom";

export interface DateScopeValue {
  preset: DateScopePreset;
  month: string;
  start: string;
  end: string;
}

export interface ResolvedDateScope {
  preset: DateScopePreset;
  start: string | null;
  end: string | null;
  label: string;
}

export function makeDefaultDateScope(timezone: string, preset: DateScopePreset = "month"): DateScopeValue {
  const today = todayInTimezone(timezone);
  return {
    preset,
    month: today.slice(0, 7),
    start: today,
    end: today,
  };
}

export function resolveDateScope(scope: DateScopeValue, timezone: string): ResolvedDateScope {
  const today = todayInTimezone(timezone);
  if (scope.preset === "all") return { preset: "all", start: null, end: null, label: "全部期間" };
  if (scope.preset === "ytd") {
    const year = today.slice(0, 4);
    return { preset: "ytd", start: `${year}-01-01`, end: today, label: `${year} YTD` };
  }
  if (scope.preset === "last12m") {
    return { preset: "last12m", start: shiftMonths(today, -12), end: today, label: "近 12 個月" };
  }
  if (scope.preset === "custom") {
    const start = scope.start || today;
    const end = scope.end || today;
    return start <= end
      ? { preset: "custom", start, end, label: `${start} → ${end}` }
      : { preset: "custom", start: end, end: start, label: `${end} → ${start}` };
  }

  const month = scope.month || today.slice(0, 7);
  return { preset: "month", start: `${month}-01`, end: lastDayOfMonth(month), label: month.replace("-", " / ") };
}

export function isWithinDateScope(date: string, scope: ResolvedDateScope) {
  const day = date.slice(0, 10);
  if (scope.start && day < scope.start) return false;
  if (scope.end && day > scope.end) return false;
  return true;
}

export function dateScopePresetLabel(preset: DateScopePreset) {
  if (preset === "month") return "本月";
  if (preset === "ytd") return "YTD";
  if (preset === "last12m") return "近 12 個月";
  if (preset === "all") return "全部";
  return "自訂";
}

function lastDayOfMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber, 0);
  return ymd(date);
}

function shiftMonths(dateString: string, delta: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, day);
  return ymd(date);
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
