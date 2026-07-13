import { describe, expect, it } from "vitest";
import {
  addSplitLeg,
  derivedSplitTotal,
  enterSplitMode,
  makeEmptySplitLeg,
  parseSplitLegAmount,
  removeSplitLeg,
  shouldExitSplitMode,
  splitLegsError,
  toSplitLegInputs,
  updateSplitLeg,
  type SplitLegDraftState,
} from "./splitEntryState";

function leg(amount: string, category = "餐飲", subcategory = ""): SplitLegDraftState {
  return { amount, category, subcategory };
}

describe("enterSplitMode", () => {
  it("seeds leg 1 from the current form values and adds a blank leg 2", () => {
    const legs = enterSplitMode({ category: "餐飲", subcategory: "午餐", amountExpression: "90" });
    expect(legs).toEqual([
      { amount: "90", category: "餐飲", subcategory: "午餐" },
      { amount: "", category: "", subcategory: "" },
    ]);
  });

  it("evaluates an arithmetic expression when seeding leg 1", () => {
    const legs = enterSplitMode({ category: "餐飲", subcategory: "", amountExpression: "60+30" });
    expect(legs[0].amount).toBe("90");
  });

  it("seeds a blank amount when the current amount is 0 or unparseable", () => {
    expect(enterSplitMode({ category: "餐飲", subcategory: "", amountExpression: "0" })[0].amount).toBe("");
    expect(enterSplitMode({ category: "餐飲", subcategory: "", amountExpression: "abc" })[0].amount).toBe("");
  });
});

describe("add / update / remove legs", () => {
  it("addSplitLeg appends a blank leg without mutating the input", () => {
    const legs = [leg("90")];
    const next = addSplitLeg(legs);
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual(makeEmptySplitLeg());
    expect(legs).toHaveLength(1);
  });

  it("updateSplitLeg patches only the targeted leg", () => {
    const legs = [leg("90"), leg("", "")];
    const next = updateSplitLeg(legs, 1, { category: "交通", amount: "45" });
    expect(next[0]).toEqual(legs[0]);
    expect(next[1]).toEqual({ amount: "45", category: "交通", subcategory: "" });
  });

  it("removeSplitLeg drops the targeted leg", () => {
    const legs = [leg("90"), leg("45", "交通"), leg("30", "娛樂")];
    expect(removeSplitLeg(legs, 1)).toEqual([legs[0], legs[2]]);
  });

  it("shouldExitSplitMode: true once fewer than 2 legs remain (exit-at-1-leg rule)", () => {
    expect(shouldExitSplitMode([leg("90")])).toBe(true);
    expect(shouldExitSplitMode([leg("90"), leg("45")])).toBe(false);
    expect(shouldExitSplitMode(removeSplitLeg([leg("90"), leg("45")], 1))).toBe(true);
  });
});

describe("parseSplitLegAmount", () => {
  it("parses plain and expression amounts, rounding to 2 decimals", () => {
    expect(parseSplitLegAmount("90")).toBe(90);
    expect(parseSplitLegAmount("60+30")).toBe(90);
    expect(parseSplitLegAmount("10/3")).toBe(3.33);
  });

  it("returns null for blank, invalid, zero, and negative inputs", () => {
    expect(parseSplitLegAmount("")).toBeNull();
    expect(parseSplitLegAmount("   ")).toBeNull();
    expect(parseSplitLegAmount("abc")).toBeNull();
    expect(parseSplitLegAmount("0")).toBeNull();
    expect(parseSplitLegAmount("-5")).toBeNull();
  });
});

describe("derivedSplitTotal", () => {
  it("sums parseable leg amounts (MOZE: Test 90 + 餐點 90 → 多類別 180)", () => {
    expect(derivedSplitTotal([leg("90"), leg("90", "餐點")])).toBe(180);
  });

  it("ignores blank and invalid legs instead of producing NaN", () => {
    expect(derivedSplitTotal([leg("90"), leg(""), leg("abc"), leg("-3")])).toBe(90);
  });

  it("rounds the sum to 2 decimals", () => {
    expect(derivedSplitTotal([leg("0.1"), leg("0.2")])).toBe(0.3);
  });
});

describe("splitLegsError", () => {
  it("requires at least 2 legs", () => {
    expect(splitLegsError([leg("90")])).toBe("拆分至少需要 2 筆明細。");
  });

  it("rejects a non-positive / blank amount before checking category", () => {
    expect(splitLegsError([leg("90"), leg("")])).toBe("拆分明細金額必須大於 0。");
    expect(splitLegsError([leg("90"), leg("0", "交通")])).toBe("拆分明細金額必須大於 0。");
  });

  it("rejects a leg with no category", () => {
    expect(splitLegsError([leg("90"), leg("45", " ")])).toBe("拆分明細必須選擇類別。");
  });

  it("returns null for a saveable set of legs", () => {
    expect(splitLegsError([leg("90"), leg("45", "交通", "捷運")])).toBeNull();
  });
});

describe("toSplitLegInputs", () => {
  it("maps editing state to positive-amount SplitLegInput rows, trimming names", () => {
    expect(toSplitLegInputs([leg("90", " 餐飲 ", " 午餐 "), leg("45+5", "交通")])).toEqual([
      { amount: 90, category: "餐飲", subcategory: "午餐" },
      { amount: 50, category: "交通", subcategory: "" },
    ]);
  });
});
