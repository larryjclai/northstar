/**
 * Timezone-aware helpers. The browser's built-in Date class is always tied to
 * the host machine's timezone — which is wrong when the user has explicitly
 * chosen a different timezone for the app. These helpers route every
 * "now" / "today" / "format" through a configurable IANA timezone string
 * (e.g. "Asia/Taipei").
 *
 * We keep them pure: the caller (typically `state/uiPreferences`) is
 * responsible for plugging in the active timezone.
 */

/** Reasonable default if we have no preference and no host-resolved zone. */
export const FALLBACK_TIMEZONE = "Asia/Taipei";

export function resolveSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/**
 * Return today's calendar date (YYYY-MM-DD) as observed in `timezone`.
 * Built without depending on Temporal — uses Intl to split a Date into
 * timezone-local parts.
 */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const parts = getParts(now, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Return a `YYYY-MM-DDTHH:mm` string (datetime-local format) that represents
 * `now` as observed in `timezone`. Used to seed datetime-local inputs so the
 * user sees their wall-clock time instead of UTC.
 */
export function nowAsDatetimeLocal(timezone: string, now: Date = new Date()): string {
  const parts = getParts(now, timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * Coerce a stored date string into a value the `<input type="datetime-local">`
 * element can render. A date-only string (`YYYY-MM-DD`, 10 chars) is invalid
 * for datetime-local and the browser renders it as blank, so we append a
 * midnight time. Full datetime-local strings and empty strings pass through.
 */
export function toDatetimeLocalValue(value: string): string {
  return value.length === 10 ? `${value}T00:00` : value;
}

/**
 * Format a calendar date for display in the given timezone. Accepts either a
 * Date or an ISO string ("2026-05-24" or "2026-05-24T10:00:00Z"). When given a
 * date-only string we treat it as midnight in `timezone` (so "2026-05-24"
 * displays as 5/24, not 5/23 because of UTC rollover).
 */
export function formatDateInTimezone(
  value: Date | string | null | undefined,
  timezone: string,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric" },
  locale: string = "zh-TW",
): string {
  const date = parseAsDate(value, timezone);
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(date);
}

/**
 * Format a datetime (date + time) using the given timezone. Mirrors
 * `Date#toLocaleString` semantics but lets us thread our user-chosen zone.
 */
export function formatDateTimeInTimezone(
  value: Date | string | null | undefined,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  locale: string = "zh-TW",
): string {
  const date = parseAsDate(value, timezone);
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: timezone }).format(date);
}

/**
 * Given a string from an HTML <input type="datetime-local"> ("YYYY-MM-DDTHH:mm")
 * which represents a wall-clock time in `timezone`, return the matching UTC
 * Date. Inverse of `nowAsDatetimeLocal`.
 */
export function datetimeLocalToUtc(value: string, timezone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  // Strategy: treat the parts as if they were in UTC, then adjust by the
  // offset that timezone has at that wall-clock moment.
  const asUtc = Date.UTC(
    Number(yearStr),
    Number(monthStr) - 1,
    Number(dayStr),
    Number(hourStr),
    Number(minuteStr),
    secondStr ? Number(secondStr) : 0,
  );
  const offsetMinutes = getOffsetMinutes(new Date(asUtc), timezone);
  return new Date(asUtc - offsetMinutes * 60_000);
}

/** Detect whether a string looks like an IANA timezone identifier. */
export function isValidTimezone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Common IANA zones for the picker. Kept short on purpose — full IANA list
 * is overwhelming. Users in unusual zones can still paste an identifier in
 * the "其他" input (the picker accepts free text fall-through).
 */
export const COMMON_TIMEZONES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "Asia/Taipei", label: "Taipei (UTC+8)" },
  { id: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
  { id: "Asia/Hong_Kong", label: "Hong Kong (UTC+8)" },
  { id: "Asia/Shanghai", label: "Shanghai (UTC+8)" },
  { id: "Asia/Singapore", label: "Singapore (UTC+8)" },
  { id: "Asia/Seoul", label: "Seoul (UTC+9)" },
  { id: "Asia/Bangkok", label: "Bangkok (UTC+7)" },
  { id: "Australia/Sydney", label: "Sydney (UTC+10)" },
  { id: "Europe/London", label: "London (UTC+0)" },
  { id: "Europe/Paris", label: "Paris (UTC+1)" },
  { id: "America/New_York", label: "New York (UTC−5)" },
  { id: "America/Los_Angeles", label: "Los Angeles (UTC−8)" },
];

interface ZonedParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

function getParts(date: Date, timezone: string): ZonedParts {
  // `Intl.DateTimeFormat#formatToParts` is the canonical way to read a Date
  // through a specific timezone without depending on Temporal.
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const lookup: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type === "literal") continue;
    lookup[part.type] = part.value;
  }
  // `hour: "2-digit"` can emit "24" at midnight in some locales; normalize.
  if (lookup.hour === "24") lookup.hour = "00";
  return {
    year: lookup.year ?? "1970",
    month: lookup.month ?? "01",
    day: lookup.day ?? "01",
    hour: lookup.hour ?? "00",
    minute: lookup.minute ?? "00",
    second: lookup.second ?? "00",
  };
}

function getOffsetMinutes(date: Date, timezone: string): number {
  // Build a Date that holds the same wall-clock as `date` would have inside
  // `timezone`, but constructed using `Date.UTC`. The delta vs `date.getTime()`
  // is the timezone's offset at that instant.
  const parts = getParts(date, timezone);
  const asUtcMillis = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtcMillis - date.getTime()) / 60_000);
}

function parseAsDate(value: Date | string | null | undefined, timezone: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  // Calendar-only (YYYY-MM-DD) — treat as midnight in the user's zone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const utc = datetimeLocalToUtc(`${value}T00:00:00`, timezone);
    return utc;
  }

  // datetime-local (YYYY-MM-DDTHH:mm) — interpret as wall-clock in zone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return datetimeLocalToUtc(value, timezone);
  }

  // Anything else (e.g. ISO with offset) goes straight through native Date.
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
