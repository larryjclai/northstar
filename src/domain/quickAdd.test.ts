import { describe, expect, it } from "vitest";
import { parseQuickAdd, type QuickAddContext } from "./quickAdd";
import { buildUserLexicon } from "./userLexicon";
import type { Account, AppSettings } from "./types";

const baseSettings: AppSettings = {
  primaryCurrency: "TWD",
  categories: [
    { name: "餐飲", children: ["飲料", "外食"] },
    { name: "交通", children: ["計程車", "捷運"] },
    { name: "居住", children: [] },
    { name: "收入", children: ["薪資"] },
  ],
  merchants: [],
  exchangeRates: [],
};

const accountRows: Account[] = ([
  { id: "a_cash",  name: "錢包",   type: "cash",   currency: "TWD" },
  { id: "a_card",  name: "信用卡", type: "credit", currency: "TWD" },
  { id: "a_fubon", name: "富邦證券", type: "investment", currency: "TWD" },
] as const).map((a) => ({
  ...a,
  openingBalance: 0, balance: 0, creditLimit: null, creditLimitGroup: "",
  statementDay: null, paymentDueDay: null, creditPaymentPaidUntil: null,
  isSharedToHousehold: false, loanStartDate: null, annualInterestRate: null,
  loanTerm: null, iconName: null, color: null, deletedAt: null,
  updatedAt: "2026-01-01", createdAt: "2026-01-01", revision: 1, spaceId: "s1",
}));

const lexicon = buildUserLexicon(accountRows, [], baseSettings);

const ctx: QuickAddContext = {
  accounts: accountRows,
  merchantCategory: new Map([["拿鐵", { category: "餐飲", subcategory: "咖啡" }]]),
  lexicon,
};

describe("parseQuickAdd", () => {
  it("parses an expense with a known merchant, amount, and matched account", () => {
    // 拿鐵 is in ctx.merchantCategory → known merchant → also kept as name
    // (the merchant was the only leftover text, so it doubles as display name).
    const r = parseQuickAdd("拿鐵 120 信用卡", ctx);
    expect(r).toEqual({
      kind: "ledger",
      entryType: "expense",
      amount: 120,
      accountId: "a_card",
      merchant: "拿鐵",
      name: "拿鐵",
      category: "餐飲",
      subcategory: "咖啡",
    });
  });

  it("parses an expense without an account (unknown merchant → name only)", () => {
    const r = parseQuickAdd("便當 90", ctx);
    expect(r).toMatchObject({ kind: "ledger", entryType: "expense", amount: 90, accountId: null, merchant: "", name: "便當" });
  });

  it("treats a leading + or 收入 as income", () => {
    expect(parseQuickAdd("+ 接案 5000 錢包", ctx)).toMatchObject({ kind: "ledger", entryType: "income", amount: 5000, accountId: "a_cash", merchant: "", name: "接案" });
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

  it("forces an investment parse without a 買/賣 verb in investment mode", () => {
    const r = parseQuickAdd("2330.TW 5股 @1042", { ...ctx, mode: "investment" });
    expect(r).toMatchObject({ kind: "investment", action: "buy", ticker: "2330.TW", quantity: 5, price: 1042 });
  });

  it("still reads 賣/sell as a sell in investment mode", () => {
    const r = parseQuickAdd("賣 AAPL 10 @180 富邦證券", { ...ctx, mode: "investment" });
    expect(r).toMatchObject({ kind: "investment", action: "sell", ticker: "AAPL", quantity: 10, price: 180, accountId: "a_fubon" });
  });

  it("never routes to investment in ledger mode, even with a 買 verb", () => {
    const r = parseQuickAdd("買 便當 90 錢包", { ...ctx, mode: "ledger" });
    expect(r).toMatchObject({ kind: "ledger", amount: 90, accountId: "a_cash" });
  });

  it("returns unknown when there is no amount", () => {
    expect(parseQuickAdd("拿鐵", ctx)).toEqual({ kind: "unknown", text: "拿鐵" });
    expect(parseQuickAdd("   ", ctx)).toEqual({ kind: "unknown", text: "" });
  });
});

// ---------------------------------------------------------------------------
// P4: Bilingual fixture table — covers the §1 known failure cases plus
// representative Chinese and English paths.
// ---------------------------------------------------------------------------
describe("parseQuickAdd – bilingual fixture table", () => {
  const TODAY = "2026-06-13T00:00";

  // ── Known §1 failure cases ──

  it("7-11 50 → name 7-11, amount 50 (no longer 7)", () => {
    // 7-11 is not a known merchant in this ctx → it stays in the name.
    const r = parseQuickAdd("7-11 50", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 50, merchant: "", name: "7-11" });
  });

  it("富邦 買 2330 5股 → account 富邦證券 via alias", () => {
    const r = parseQuickAdd("富邦 買 2330 5股", { ...ctx, mode: "investment" });
    expect(r).toMatchObject({ kind: "investment", accountId: "a_fubon" });
  });

  it("計程車 250 → 交通/計程車 from seed via the name path (cold start)", () => {
    // 計程車 is not a known merchant → lands in name; category still resolves
    // to the same 交通 value through the name-token seed lookup.
    const r = parseQuickAdd("計程車 250", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 250, merchant: "", name: "計程車", category: "交通" });
  });

  it("咖啡 一百二 → amount 120 from Chinese numeral", () => {
    const r = parseQuickAdd("咖啡 一百二", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 120, merchant: "", name: "咖啡" });
  });

  it("5萬 → 50000", () => {
    const r = parseQuickAdd("薪水 5萬 錢包", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 50000, accountId: "a_cash" });
  });

  it("1.2k → 1200", () => {
    const r = parseQuickAdd("星巴克 1.2k 信用卡", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 1200, accountId: "a_card" });
  });

  // ── English path: preposition cleaning ──

  it("lunch 90 at 信用卡 → name 'lunch', preposition stripped", () => {
    const r = parseQuickAdd("lunch 90 at 信用卡", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 90, accountId: "a_card" });
    if (r.kind === "ledger") expect(r.name).not.toMatch(/\bat\b/i);
  });

  it("coffee $4.50 paid with 錢包 → amount 4.5, account cash", () => {
    const r = parseQuickAdd("coffee $4.50 paid with 錢包", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 4.5, accountId: "a_cash" });
    if (r.kind === "ledger") {
      expect(r.name).not.toMatch(/\b(paid|with)\b/i);
    }
  });

  it("dinner from mcdonald's 150 信用卡 → prepositions stripped from name", () => {
    const r = parseQuickAdd("dinner from mcdonald's 150 信用卡", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 150, accountId: "a_card" });
    if (r.kind === "ledger") expect(r.name).not.toMatch(/\bfrom\b/i);
  });

  it("groceries using 錢包 200 → amount 200, cash account", () => {
    const r = parseQuickAdd("groceries using 錢包 200", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 200, accountId: "a_cash" });
    if (r.kind === "ledger") expect(r.name).not.toMatch(/\busing\b/i);
  });

  // ── English path: seed category ──

  it("uber 250 → 交通 from seed", () => {
    const r = parseQuickAdd("uber 250", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 250, category: "交通" });
  });

  it("taxi fare 300 → 交通 from seed", () => {
    const r = parseQuickAdd("taxi fare 300", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 300, category: "交通" });
  });

  // ── Date keyword integration (nowDatetimeLocal provided) ──

  it("昨天 拿鐵 120 → date is yesterday, merchant is 拿鐵", () => {
    const r = parseQuickAdd("昨天 拿鐵 120", { ...ctx, nowDatetimeLocal: TODAY });
    expect(r).toMatchObject({ kind: "ledger", amount: 120, merchant: "拿鐵" });
    if (r.kind === "ledger") {
      expect(r.date).toBe("2026-06-12T00:00");
    }
  });

  it("3/15 咖啡 80 → date is March 15, name is 咖啡", () => {
    const r = parseQuickAdd("3/15 咖啡 80", { ...ctx, nowDatetimeLocal: TODAY });
    expect(r).toMatchObject({ kind: "ledger", amount: 80, merchant: "", name: "咖啡" });
    if (r.kind === "ledger") expect(r.date).toBe("2026-03-15T00:00");
  });

  // ── Currency symbols ──

  it("NT$300 拿鐵 → amount 300", () => {
    const r = parseQuickAdd("拿鐵 NT$300 信用卡", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 300, accountId: "a_card" });
  });

  // ── No preposition stripping on Chinese text ──

  it("Chinese name with 'on'-like substring is not stripped", () => {
    // "信用卡" doesn't contain ASCII 'on' as a word boundary token
    const r = parseQuickAdd("晚餐 500 信用卡", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 500, merchant: "", name: "晚餐", accountId: "a_card" });
  });

  // ── Seed alias: cash / card ──

  it("cash alias → 錢包 account", () => {
    const r = parseQuickAdd("lunch 90 cash", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 90, accountId: "a_cash" });
  });

  it("卡 alias → 信用卡 account", () => {
    const r = parseQuickAdd("午餐 120 卡", ctx);
    expect(r).toMatchObject({ kind: "ledger", amount: 120, accountId: "a_card" });
  });

  // ── @merchant explicit syntax ──

  it("@merchant separates name (description) from store", () => {
    const r = parseQuickAdd("午餐 @添飯 525 信用卡", ctx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.amount).toBe(525);
    expect(r.merchant).toBe("添飯");
    expect(r.name).toBe("午餐");
    expect(r.accountId).toBe("a_card");
  });

  it("@merchant without account still sets name and merchant correctly", () => {
    const r = parseQuickAdd("午餐 @添飯 525", ctx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.merchant).toBe("添飯");
    expect(r.name).toBe("午餐");
    expect(r.amount).toBe(525);
    expect(r.accountId).toBeNull();
  });

  it("category fallback to name when merchant not in lexicon", () => {
    // "午餐" is a seed keyword → 餐飲; "添飯" is unknown
    const r = parseQuickAdd("午餐 @添飯 525", ctx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.category).toBe("餐飲");
  });

  it("without @ syntax, a known merchant doubles as the name when it is the only text", () => {
    const r = parseQuickAdd("拿鐵 120", ctx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.merchant).toBe("拿鐵");
    expect(r.name).toBe("拿鐵");
  });

  it("@price in investment does not collide with @merchant in ledger", () => {
    // Ledger mode: @1042 starts with a digit → treated as price, not matched as merchant tag
    const r = parseQuickAdd("便當 @1042", { ...ctx, mode: "ledger" });
    // @1042 is not a valid merchant tag (digit start), so no @ extraction;
    // amount should still fall through to the numeric parse
    if (r.kind === "ledger") {
      expect(r.name).toBeUndefined(); // no @ extraction happened
    }
  });

  it("@merchant at the start of string works", () => {
    const r = parseQuickAdd("@全聯 買菜 350", ctx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.merchant).toBe("全聯");
    expect(r.name).toBe("買菜");
    expect(r.amount).toBe(350);
  });
});

// ---------------------------------------------------------------------------
// Known-merchant extraction (no-@ path): a merchant the user has recorded
// before is pulled out of the free text; everything else stays in the name.
// ---------------------------------------------------------------------------
describe("parseQuickAdd – known-merchant extraction", () => {
  const knownCtx: QuickAddContext = {
    accounts: accountRows,
    merchantCategory: new Map([
      ["50嵐", { category: "餐飲", subcategory: "飲料" }],
      ["麥當勞", { category: "餐飲", subcategory: "外食" }],
      ["摩斯漢堡", { category: "餐飲", subcategory: "外食" }],
    ]),
    lexicon,
  };

  it("晚餐 50嵐 120 → merchant 50嵐 (exact token), name 晚餐, learned category", () => {
    const r = parseQuickAdd("晚餐 50嵐 120", knownCtx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.amount).toBe(120); // 50嵐's digits must not be read as the amount
    expect(r.merchant).toBe("50嵐");
    expect(r.name).toBe("晚餐");
    expect(r.category).toBe("餐飲");
    expect(r.subcategory).toBe("飲料");
  });

  it("花了 50 元在 50嵐吃晚餐 → merchant 50嵐 via substring split, amount 50", () => {
    const r = parseQuickAdd("花了 50 元在 50嵐吃晚餐", knownCtx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.amount).toBe(50);
    expect(r.merchant).toBe("50嵐");
    expect(r.name).toContain("晚餐");
    expect(r.name).not.toContain("50嵐");
  });

  it("拿鐵 120 with no known merchants → merchant empty, category via name seed path", () => {
    const emptyCtx: QuickAddContext = { accounts: accountRows, lexicon };
    const r = parseQuickAdd("拿鐵 120", emptyCtx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.merchant).toBe("");
    expect(r.name).toBe("拿鐵");
    expect(r.category).toBe("餐飲"); // seed keyword resolved through the name
  });

  it("@ syntax regression: 午餐 @添飯 120 unchanged even with known merchants present", () => {
    const r = parseQuickAdd("午餐 @添飯 120", knownCtx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.merchant).toBe("添飯");
    expect(r.name).toBe("午餐");
    expect(r.amount).toBe(120);
  });

  it("two known merchants both matching exactly → the longest token wins", () => {
    const r = parseQuickAdd("麥當勞 摩斯漢堡 100", knownCtx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.amount).toBe(100);
    expect(r.merchant).toBe("摩斯漢堡");
    expect(r.name).toBe("麥當勞");
  });

  it("known merchant as the only leftover text → it doubles as the name", () => {
    const r = parseQuickAdd("50嵐 60", knownCtx);
    if (r.kind !== "ledger") throw new Error("expected ledger");
    expect(r.amount).toBe(60);
    expect(r.merchant).toBe("50嵐");
    expect(r.name).toBe("50嵐");
  });
});
