import { describe, expect, it } from "vitest";
import { buildCurrencyExposure } from "./currencyExposure";

describe("buildCurrencyExposure", () => {
  it("groups by currency, computes shares summing to 100, sorts by value", () => {
    const r = buildCurrencyExposure([
      { currency: "TWD", value: 600 },
      { currency: "USD", value: 300 },
      { currency: "twd", value: 100 }, // case-insensitive merge
    ]);
    expect(r.total).toBe(1000);
    expect(r.currencyCount).toBe(2);
    expect(r.items[0]).toMatchObject({ currency: "TWD", value: 700, pct: 70 });
    expect(r.items[1]).toMatchObject({ currency: "USD", value: 300, pct: 30 });
    expect(r.items.reduce((s, i) => s + i.pct, 0)).toBeCloseTo(100, 6);
  });

  it("ignores non-positive values and reports single-currency", () => {
    const r = buildCurrencyExposure([
      { currency: "TWD", value: 500 },
      { currency: "USD", value: 0 },
      { currency: "JPY", value: -10 },
    ]);
    expect(r.currencyCount).toBe(1); // only TWD has positive value
    expect(r.items[0].pct).toBe(100);
  });

  it("is empty for no positive entries", () => {
    const r = buildCurrencyExposure([{ currency: "USD", value: 0 }]);
    expect(r.currencyCount).toBe(0);
    expect(r.total).toBe(0);
  });
});
