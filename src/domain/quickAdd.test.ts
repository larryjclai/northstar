import { describe, expect, it } from "vitest";
import { parseQuickAdd, type QuickAddContext } from "./quickAdd";

const ctx: QuickAddContext = {
  accounts: [
    { id: "a_cash", name: "錢包" },
    { id: "a_card", name: "信用卡" },
    { id: "a_fubon", name: "富邦證券" },
  ],
  merchantCategory: new Map([["拿鐵", { category: "餐飲", subcategory: "咖啡" }]]),
};

describe("parseQuickAdd", () => {
  it("parses an expense with merchant, amount, and matched account", () => {
    const r = parseQuickAdd("拿鐵 120 信用卡", ctx);
    expect(r).toEqual({
      kind: "ledger",
      entryType: "expense",
      amount: 120,
      accountId: "a_card",
      merchant: "拿鐵",
      category: "餐飲",
      subcategory: "咖啡",
    });
  });

  it("parses an expense without an account", () => {
    const r = parseQuickAdd("便當 90", ctx);
    expect(r).toMatchObject({ kind: "ledger", entryType: "expense", amount: 90, accountId: null, merchant: "便當" });
  });

  it("treats a leading + or 收入 as income", () => {
    expect(parseQuickAdd("+ 接案 5000 錢包", ctx)).toMatchObject({ kind: "ledger", entryType: "income", amount: 5000, accountId: "a_cash", merchant: "接案" });
    expect(parseQuickAdd("收入 利息 30", ctx)).toMatchObject({ kind: "ledger", entryType: "income", amount: 30 });
  });

  it("parses an investment buy with ticker, qty, price", () => {
    const r = parseQuickAdd("買 2330.TW 5股 @1042", ctx);
    expect(r).toEqual({ kind: "investment", action: "buy", ticker: "2330.TW", quantity: 5, price: 1042, accountId: null });
  });

  it("parses a sell and strips commas in price", () => {
    const r = parseQuickAdd("賣 AAPL 10 @1,200 富邦證券", ctx);
    expect(r).toMatchObject({ kind: "investment", action: "sell", ticker: "AAPL", quantity: 10, price: 1200, accountId: "a_fubon" });
  });

  it("returns unknown when there is no amount", () => {
    expect(parseQuickAdd("拿鐵", ctx)).toEqual({ kind: "unknown", text: "拿鐵" });
    expect(parseQuickAdd("   ", ctx)).toEqual({ kind: "unknown", text: "" });
  });
});
