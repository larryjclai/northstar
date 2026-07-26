import { describe, expect, it } from "vitest";
import { evaluateAmountExpression, looksLikeExpression } from "./amountExpression";

describe("amount expression", () => {
  it("evaluates addition and multiplication precedence", () => {
    expect(evaluateAmountExpression("120+85+30*2")).toBe(265);
  });

  it("supports parentheses and unary negative numbers", () => {
    expect(evaluateAmountExpression("-(100 + 50) / 3")).toBe(-50);
  });

  it("accepts comma decimal input", () => {
    expect(evaluateAmountExpression("12,5*2")).toBe(25);
  });

  it("detects expression-like inputs", () => {
    expect(looksLikeExpression("120+85")).toBe(true);
    expect(looksLikeExpression("120")).toBe(false);
  });

  it("rejects division by zero", () => {
    expect(() => evaluateAmountExpression("10/0")).toThrow("Division by zero");
  });
});
