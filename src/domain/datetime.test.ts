import { describe, expect, it } from "vitest";
import {
  datetimeLocalToUtc,
  formatDateInTimezone,
  formatDateTimeInTimezone,
  isValidTimezone,
  nowAsDatetimeLocal,
  todayInTimezone,
  toDatetimeLocalValue,
} from "./datetime";

describe("datetime helpers", () => {
  // Pin "now" so the tests stay deterministic regardless of the host clock.
  // 2026-05-24T18:42:00Z = 2026-05-25 02:42 local in Taipei (UTC+8).
  const sampleNow = new Date("2026-05-24T18:42:00Z");

  it("todayInTimezone rolls forward across midnight", () => {
    expect(todayInTimezone("UTC", sampleNow)).toBe("2026-05-24");
    expect(todayInTimezone("Asia/Taipei", sampleNow)).toBe("2026-05-25");
    expect(todayInTimezone("America/Los_Angeles", sampleNow)).toBe("2026-05-24");
  });

  it("nowAsDatetimeLocal emits wall-clock for the chosen zone", () => {
    expect(nowAsDatetimeLocal("Asia/Taipei", sampleNow)).toBe("2026-05-25T02:42");
    expect(nowAsDatetimeLocal("UTC", sampleNow)).toBe("2026-05-24T18:42");
  });

  it("datetimeLocalToUtc round-trips with nowAsDatetimeLocal", () => {
    const wall = nowAsDatetimeLocal("Asia/Taipei", sampleNow);
    const restored = datetimeLocalToUtc(wall, "Asia/Taipei");
    expect(restored?.toISOString()).toBe("2026-05-24T18:42:00.000Z");
  });

  it("formats a calendar-only date as midnight in the zone", () => {
    expect(formatDateInTimezone("2026-05-24", "Asia/Taipei", { year: "numeric", month: "2-digit", day: "2-digit" })).toBe(
      "2026/05/24",
    );
    // Same string, different timezone: the calendar date should not flip
    // because we anchored to midnight-in-zone (see parseAsDate).
    expect(formatDateInTimezone("2026-05-24", "UTC", { year: "numeric", month: "2-digit", day: "2-digit" })).toBe(
      "2026/05/24",
    );
  });

  it("formats a full datetime in the chosen timezone", () => {
    const result = formatDateTimeInTimezone(sampleNow, "Asia/Taipei", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(result).toContain("2026/05/25");
    expect(result).toContain("02:42");
  });

  it("validates IANA identifiers", () => {
    expect(isValidTimezone("Asia/Taipei")).toBe(true);
    expect(isValidTimezone("America/Los_Angeles")).toBe(true);
    expect(isValidTimezone("Not/A_Real_Zone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
  });
});

describe("toDatetimeLocalValue", () => {
  it("appends midnight to a date-only string", () => {
    expect(toDatetimeLocalValue("2026-07-24")).toBe("2026-07-24T00:00");
  });
  it("passes a full datetime-local string through", () => {
    expect(toDatetimeLocalValue("2026-07-24T14:30")).toBe("2026-07-24T14:30");
  });
  it("passes an empty string through", () => {
    expect(toDatetimeLocalValue("")).toBe("");
  });
});
