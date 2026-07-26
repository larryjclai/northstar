import { describe, expect, it, vi } from "vitest";
import { todayInTimezone } from "../domain/datetime";

// `HoldingDetailRoute.tsx` transitively imports `state/uiPreferences`, whose
// module-level `loadPersisted()` reads `window.localStorage` eagerly at
// import time. The repo's jsdom setup ships without `localStorage` (see
// project testing gotchas / useMarketRefresh.demo.test.ts for the same
// issue), so it must be stubbed before that import graph is evaluated — a
// `beforeEach` runs too late for a static import, so stub first and load the
// module under test via a dynamic import.
function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

vi.stubGlobal("localStorage", makeLocalStorageStub());

// vitest.config.ts now resolves the `@` alias (plan 275), so the coss/*
// component subtree HoldingDetailRoute.tsx pulls in for its rendered markup
// no longer fails module resolution — the nine `vi.mock` calls that used to
// stub those components out just to dodge that missing config are gone.
const { computeHoldingDays } = await import("./HoldingDetailRoute");

describe("computeHoldingDays (plan 274, react-hooks/purity)", () => {
  it("returns null when there is no holdingSince", () => {
    expect(computeHoldingDays(null, "2026-07-10")).toBeNull();
  });

  it("counts whole calendar days between holdingSince and todayIso", () => {
    expect(computeHoldingDays("2026-07-01", "2026-07-10")).toBe(9);
  });

  it("floors at 0 for a same-day holding", () => {
    expect(computeHoldingDays("2026-07-10", "2026-07-10")).toBe(0);
  });

  it("is derived from the caller's timezone-correct today, not UTC — 持倉天數 does not undercount for a UTC+ user during their morning", () => {
    // 2026-05-24T18:42:00Z is 2026-05-24 in UTC but already 2026-05-25 in
    // Taipei (UTC+8) — same instant, two different calendar dates. This is
    // exactly the window (local 00:00–08:00) where the old
    // `new Date().toISOString()` UTC derivation used to read as "yesterday".
    const sampleNow = new Date("2026-05-24T18:42:00Z");
    const holdingSince = "2026-05-24"; // bought "today" per UTC

    // Old (buggy) behaviour: today derived from UTC never rolls forward,
    // so a same-day purchase always reads as 0 days held.
    const utcToday = todayInTimezone("UTC", sampleNow);
    expect(computeHoldingDays(holdingSince, utcToday)).toBe(0);

    // Fixed behaviour: today derived from the user's timezone (Asia/Taipei)
    // has already rolled to the next calendar day at this instant, so the
    // same purchase correctly reads as 1 day held.
    const taipeiToday = todayInTimezone("Asia/Taipei", sampleNow);
    expect(taipeiToday).toBe("2026-05-25");
    expect(computeHoldingDays(holdingSince, taipeiToday)).toBe(1);
  });
});
