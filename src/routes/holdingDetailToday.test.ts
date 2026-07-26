import { describe, expect, it } from "vitest";
import {
  computeDayChange,
  type DayChangeCloseInput,
  type DayChangeQuoteInput,
} from "./holdingDetailToday";

function closes(...pairs: Array<[string, number]>): DayChangeCloseInput[] {
  return pairs.map(([date, close]) => ({ date, close }));
}

describe("computeDayChange", () => {
  it("live quote newer than the last recorded close → change vs. that close, correct sign", () => {
    const series = closes(["2026-07-09", 100], ["2026-07-10", 110]);
    const quote: DayChangeQuoteInput = { price: 121, marketTime: "2026-07-11T05:30:00Z" };
    const result = computeDayChange(series, quote, 10);
    expect(result).not.toBeNull();
    expect(result!.current).toBe(121);
    expect(result!.refClose).toBe(110);
    expect(result!.changeAbs).toBeCloseTo(11);
    expect(result!.changePercent).toBeCloseTo(10);
    expect(result!.impact).toBeCloseTo(110); // 11 * 10 qty
  });

  it("live quote same session as the last close → change vs. the prior close", () => {
    const series = closes(["2026-07-09", 100], ["2026-07-10", 110]);
    const quote: DayChangeQuoteInput = { price: 112, marketTime: "2026-07-10T13:30:00Z" };
    const result = computeDayChange(series, quote, 5);
    expect(result).not.toBeNull();
    expect(result!.current).toBe(112);
    expect(result!.refClose).toBe(100);
    expect(result!.changeAbs).toBeCloseTo(12);
  });

  it("only closes available (no quote) → last close vs. prior close", () => {
    const series = closes(["2026-07-09", 100], ["2026-07-10", 90]);
    const result = computeDayChange(series, undefined, 3);
    expect(result).not.toBeNull();
    expect(result!.current).toBe(90);
    expect(result!.refClose).toBe(100);
    expect(result!.changeAbs).toBeCloseTo(-10);
    expect(result!.changePercent).toBeCloseTo(-10);
    expect(result!.impact).toBeCloseTo(-30); // -10 * 3 qty, sign preserved
  });

  it("fewer than two closes and no quote → null (band hides)", () => {
    expect(computeDayChange(closes(["2026-07-10", 100]), undefined, 1)).toBeNull();
    expect(computeDayChange([], undefined, 1)).toBeNull();
  });

  it("a quote with no recorded close at all → null (nothing to reference)", () => {
    const quote: DayChangeQuoteInput = { price: 100, marketTime: "2026-07-11T05:30:00Z" };
    expect(computeDayChange([], quote, 1)).toBeNull();
  });

  it("invalid/zero-price quote is ignored, falling back to close-only logic", () => {
    const series = closes(["2026-07-09", 100], ["2026-07-10", 90]);
    const badQuote: DayChangeQuoteInput = { price: 0, marketTime: "2026-07-11T05:30:00Z" };
    const result = computeDayChange(series, badQuote, 1);
    expect(result).not.toBeNull();
    expect(result!.current).toBe(90);
    expect(result!.refClose).toBe(100);
  });

  it("impact sign matches change sign and scales with quantity", () => {
    const series = closes(["2026-07-09", 50], ["2026-07-10", 55]);
    const result = computeDayChange(series, undefined, 20);
    expect(result).not.toBeNull();
    expect(result!.changeAbs).toBeCloseTo(5);
    expect(result!.impact).toBeCloseTo(100); // 5 * 20
  });
});
