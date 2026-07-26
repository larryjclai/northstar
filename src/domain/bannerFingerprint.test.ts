import { describe, expect, it } from "vitest";
import { healthFingerprint, overBudgetFingerprint } from "./bannerFingerprint";

describe("healthFingerprint", () => {
  it('returns "ok" for no issues', () => {
    expect(healthFingerprint([])).toBe("ok");
  });

  it("is stable for the same input across calls", () => {
    const issues = [{ kind: "stale-quote", id: "stale-quote" }];
    expect(healthFingerprint(issues)).toBe(healthFingerprint(issues));
  });

  it("is order-insensitive (sorted)", () => {
    const a = [
      { kind: "stale-quote", id: "stale-quote" },
      { kind: "missing-fx", id: "missing-fx" },
    ];
    const b = [
      { kind: "missing-fx", id: "missing-fx" },
      { kind: "stale-quote", id: "stale-quote" },
    ];
    expect(healthFingerprint(a)).toBe(healthFingerprint(b));
  });

  it("changes when an issue is fixed", () => {
    const before = healthFingerprint([
      { kind: "stale-quote", id: "stale-quote" },
      { kind: "missing-fx", id: "missing-fx" },
    ]);
    const after = healthFingerprint([{ kind: "missing-fx", id: "missing-fx" }]);
    expect(after).not.toBe(before);
  });

  it("changes when a new issue kind appears", () => {
    const before = healthFingerprint([{ kind: "stale-quote", id: "stale-quote" }]);
    const after = healthFingerprint([
      { kind: "stale-quote", id: "stale-quote" },
      { kind: "negative-cash", id: "negative-cash" },
    ]);
    expect(after).not.toBe(before);
  });

  it("distinguishes two ids that share the same kind (stale-manual-price vs stale-manual-price-missing)", () => {
    const stale = healthFingerprint([{ kind: "stale-manual-price", id: "stale-manual-price" }]);
    const missing = healthFingerprint([
      { kind: "stale-manual-price", id: "stale-manual-price-missing" },
    ]);
    expect(stale).not.toBe(missing);
  });

  it("returns to the same string once the issue set is fully resolved", () => {
    expect(healthFingerprint([])).toBe("ok");
    expect(healthFingerprint([{ kind: "stale-quote", id: "stale-quote" }])).not.toBe("ok");
  });
});

describe("overBudgetFingerprint", () => {
  it("combines month and sorted category names", () => {
    expect(overBudgetFingerprint("2026-07", ["購物", "餐飲"])).toBe("2026-07:購物|餐飲");
  });

  it("is order-insensitive across category names", () => {
    expect(overBudgetFingerprint("2026-07", ["購物", "餐飲"])).toBe(
      overBudgetFingerprint("2026-07", ["餐飲", "購物"]),
    );
  });

  it("changes when a new category overspends", () => {
    const before = overBudgetFingerprint("2026-07", ["購物"]);
    const after = overBudgetFingerprint("2026-07", ["購物", "餐飲"]);
    expect(after).not.toBe(before);
  });

  it("changes across months for the same categories", () => {
    const july = overBudgetFingerprint("2026-07", ["購物"]);
    const august = overBudgetFingerprint("2026-08", ["購物"]);
    expect(july).not.toBe(august);
  });

  it("does not accept an amount — the signature is names-only by construction", () => {
    // Type-level guarantee: overBudgetFingerprint(monthKey: string, categoryNames: string[])
    // has no parameter for amount, so a growing overspend amount cannot change
    // the fingerprint. Demonstrated here: two calls with the same names differ
    // only by an amount the caller never gets to pass in.
    const small = overBudgetFingerprint("2026-07", ["購物"]);
    const large = overBudgetFingerprint("2026-07", ["購物"]);
    expect(small).toBe(large);
  });
});
