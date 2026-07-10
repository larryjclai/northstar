import type { RecurringFrequency } from "./types";

export function firstFutureRunDate(
  value: string,
  frequency: RecurringFrequency,
  dayOfMonth: number,
  today: string = new Date().toISOString().slice(0, 10),
): string {
  let next = value.slice(0, 10);
  let guard = 0;
  while (next < today && guard < 600) {
    next = nextRecurringDate(next, frequency, dayOfMonth);
    guard += 1;
  }
  return next;
}

export function nextRecurringDate(value: string, frequency: RecurringFrequency, dayOfMonth: number): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  switch (frequency) {
    case "weekly":
      date.setUTCDate(date.getUTCDate() + 7);
      return date.toISOString().slice(0, 10);
    case "biweekly":
      date.setUTCDate(date.getUTCDate() + 14);
      return date.toISOString().slice(0, 10);
    case "yearly":
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      return date.toISOString().slice(0, 10);
    case "monthly":
    default:
      return nextMonthlyDate(value, dayOfMonth);
  }
}

function nextMonthlyDate(value: string, dayOfMonth: number) {
  const [year, month] = value.slice(0, 10).split("-").map(Number); // month is 1-based
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthZeroBased = month % 12; // next month, 0-based
  const day = Math.min(dayOfMonth, daysInMonth(nextYear, nextMonthZeroBased));
  return new Date(Date.UTC(nextYear, nextMonthZeroBased, day)).toISOString().slice(0, 10);
}

function daysInMonth(year: number, zeroBasedMonth: number) {
  return new Date(Date.UTC(year, zeroBasedMonth + 1, 0)).getUTCDate();
}
