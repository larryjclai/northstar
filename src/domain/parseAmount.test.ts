import { describe, expect, it } from "vitest";
import { parseAmount, parseChineseNumber } from "./parseAmount";

// ---------------------------------------------------------------------------
// parseChineseNumber
// ---------------------------------------------------------------------------
describe("parseChineseNumber", () => {
  it("parses simple digits", () => {
    expect(parseChineseNumber("三")).toBe(3);
    expect(parseChineseNumber("九")).toBe(9);
  });

  it("parses decade-level numbers", () => {
    expect(parseChineseNumber("十")).toBe(10);
    expect(parseChineseNumber("十二")).toBe(12);
    expect(parseChineseNumber("二十")).toBe(20);
    expect(parseChineseNumber("三十五")).toBe(35);
  });

  it("parses hundred-level numbers", () => {
    expect(parseChineseNumber("三百")).toBe(300);
    expect(parseChineseNumber("一百五十")).toBe(150);
  });

  it("parses colloquial abbreviated forms", () => {
    expect(parseChineseNumber("一百二")).toBe(120);   // 120, not 102
    expect(parseChineseNumber("兩千五")).toBe(2500);  // 2500, not 2005
    expect(parseChineseNumber("三千八")).toBe(3800);
  });

  it("parses thousand-level", () => {
    expect(parseChineseNumber("兩千")).toBe(2000);
    expect(parseChineseNumber("兩千五百")).toBe(2500);
    expect(parseChineseNumber("一千二百三十四")).toBe(1234);
  });

  it("returns null for non-Chinese-numeral strings", () => {
    expect(parseChineseNumber("拿鐵")).toBeNull();
    expect(parseChineseNumber("120")).toBeNull();
    expect(parseChineseNumber("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseAmount – currency prefix
// ---------------------------------------------------------------------------
describe("parseAmount – currency prefix", () => {
  it("strips $ prefix", () => {
    expect(parseAmount("coffee $4.50 cash")).toMatchObject({ value: 4.5 });
  });
  it("strips NT$ prefix", () => {
    expect(parseAmount("NT$300 lunch")).toMatchObject({ value: 300 });
  });
  it("strips ¥ prefix", () => {
    expect(parseAmount("¥500")).toMatchObject({ value: 500 });
  });
});

// ---------------------------------------------------------------------------
// parseAmount – unit suffix
// ---------------------------------------------------------------------------
describe("parseAmount – unit suffix", () => {
  it("handles 萬", () => {
    expect(parseAmount("5萬 房租")).toMatchObject({ value: 50000 });
  });
  it("handles 千", () => {
    expect(parseAmount("3千 購物")).toMatchObject({ value: 3000 });
  });
  it("handles k / K", () => {
    expect(parseAmount("1.2k 停車費")).toMatchObject({ value: 1200 });
    expect(parseAmount("2K")).toMatchObject({ value: 2000 });
  });
  it("handles 元 and 塊", () => {
    expect(parseAmount("50元 計程車")).toMatchObject({ value: 50 });
    expect(parseAmount("5塊 飲料")).toMatchObject({ value: 5 });
  });
  it("handles bucks", () => {
    expect(parseAmount("30 bucks lunch")).toMatchObject({ value: 30 });
  });
});

// ---------------------------------------------------------------------------
// parseAmount – Chinese numerals
// ---------------------------------------------------------------------------
describe("parseAmount – Chinese numerals", () => {
  it("parses 一百二", () => {
    expect(parseAmount("拿鐵 一百二 信用卡")).toMatchObject({ value: 120 });
  });
  it("parses 兩千五", () => {
    expect(parseAmount("兩千五 購物")).toMatchObject({ value: 2500 });
  });
  it("parses 三百", () => {
    expect(parseAmount("計程車 三百")).toMatchObject({ value: 300 });
  });
});

// ---------------------------------------------------------------------------
// parseAmount – exclusion rules (the 7-11 bug fix)
// ---------------------------------------------------------------------------
describe("parseAmount – exclusion rules", () => {
  it("does NOT treat the 7 in '7-11' as the amount", () => {
    const r = parseAmount("7-11 50");
    expect(r?.value).toBe(50);
  });
  it("skips @price and reads the plain amount", () => {
    // In ledger mode this text is unusual, but the parser should not return 1042
    const r = parseAmount("咖啡 120 @1042");
    expect(r?.value).toBe(120);
  });
  it("skips N股 / N張 quantities; @price also excluded → null for pure investment strings", () => {
    // Both 5股 (quantity) and @1042 (unit price) are non-ledger tokens.
    // parseAmount is for ledger amounts; investment price extraction uses its own patterns.
    expect(parseAmount("5股 @1042")).toBeNull();
  });
  it("skips 股 quantity but finds a plain ledger amount when present", () => {
    expect(parseAmount("5股 120")).toMatchObject({ value: 120 });
  });
  it("skips ticker+quantity+@price → null for a pure investment string", () => {
    // 2330.TW excluded as ticker, 5股 excluded as quantity, @1042 excluded as price.
    expect(parseAmount("2330.TW 5股 @1042")).toBeNull();
  });
  it("handles plain number when no exclusions apply", () => {
    expect(parseAmount("便當 90")).toMatchObject({ value: 90 });
    expect(parseAmount("拿鐵 120 信用卡")).toMatchObject({ value: 120 });
  });
  it("returns null when no amount is found", () => {
    expect(parseAmount("拿鐵")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseAmount – comma-separated numbers
// ---------------------------------------------------------------------------
describe("parseAmount – thousand-separator commas", () => {
  it("parses 1,200", () => {
    expect(parseAmount("購物 1,200")).toMatchObject({ value: 1200 });
  });
  it("parses 1,200.50", () => {
    expect(parseAmount("1,200.50")).toMatchObject({ value: 1200.5 });
  });
});
