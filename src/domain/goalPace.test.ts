import { describe, expect, it } from "vitest";
import { goalPace } from "./goalPace";

describe("goalPace", () => {
  it("returns none when targetDate is null", () => {
    const result = goalPace({ startDate: "2025-01-01", targetDate: null, actualPct: 50 });
    expect(result.status).toBe("none");
    expect(result.expectedPct).toBeNull();
    expect(result.deltaPp).toBeNull();
  });

  it("returns none when startDate equals targetDate (zero-length range)", () => {
    const result = goalPace({ startDate: "2025-01-01", targetDate: "2025-01-01", actualPct: 50 });
    expect(result.status).toBe("none");
  });

  it("on-track when delta is within ±2pp", () => {
    // Midpoint: expected 50%, actual 51% → delta +1pp → onTrack
    const result = goalPace({
      startDate: "2025-01-01",
      targetDate: "2026-01-01",
      actualPct: 51,
      now: "2025-07-02", // ~half the year
    });
    expect(result.status).toBe("onTrack");
    expect(result.expectedPct).toBeGreaterThan(45);
    expect(result.expectedPct).toBeLessThan(55);
  });

  it("ahead when actual is ≥ +2pp above expected", () => {
    // At 25% of the time elapsed, expected 25%, actual 30% → delta +5pp → ahead
    const result = goalPace({
      startDate: "2025-01-01",
      targetDate: "2026-01-01",
      actualPct: 30,
      now: "2025-04-02", // ~25% of year
    });
    expect(result.status).toBe("ahead");
    expect(result.deltaPp).toBeGreaterThanOrEqual(2);
  });

  it("behind when actual is ≤ -2pp below expected", () => {
    // At 50% elapsed, expected ~50%, actual 40% → delta -10pp → behind
    const result = goalPace({
      startDate: "2025-01-01",
      targetDate: "2026-01-01",
      actualPct: 40,
      now: "2025-07-02",
    });
    expect(result.status).toBe("behind");
    expect(result.deltaPp).toBeLessThanOrEqual(-2);
  });

  it("behind when past targetDate and progress < 100%", () => {
    const result = goalPace({
      startDate: "2024-01-01",
      targetDate: "2025-01-01",
      actualPct: 80,
      now: "2025-06-01", // past target date
    });
    expect(result.status).toBe("behind");
    // expectedPct should be clamped to 100
    expect(result.expectedPct).toBe(100);
  });

  it("onTrack (not behind) when past targetDate but already 100%", () => {
    // The deadline passed but progress is 100 — it was completed
    const result = goalPace({
      startDate: "2024-01-01",
      targetDate: "2025-01-01",
      actualPct: 100,
      now: "2025-06-01",
    });
    // delta = 100 - 100 = 0 → onTrack
    expect(result.status).toBe("onTrack");
  });

  it("clamps expectedPct to [0, 100] when before startDate", () => {
    // now is before startDate → elapsed < 0 → ratio clamped to 0
    const result = goalPace({
      startDate: "2025-06-01",
      targetDate: "2026-06-01",
      actualPct: 0,
      now: "2025-01-01",
    });
    expect(result.expectedPct).toBe(0);
    // delta = 0 - 0 = 0 → onTrack
    expect(result.status).toBe("onTrack");
  });
});
