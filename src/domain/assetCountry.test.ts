import { describe, expect, it } from "vitest";
import { resolveCountryLabel, resolveHoldingCountry } from "./assetCountry";

describe("resolveHoldingCountry", () => {
  it("maps market suffixes to countries", () => {
    expect(resolveHoldingCountry("2330.TW")).toBe("TW");
    expect(resolveHoldingCountry("6488.TWO")).toBe("TW");
    expect(resolveHoldingCountry("7203.T")).toBe("JP");
    expect(resolveHoldingCountry("0700.HK")).toBe("HK");
    expect(resolveHoldingCountry("VOD.L")).toBe("GB");
    expect(resolveHoldingCountry("600519.SS")).toBe("CN");
    expect(resolveHoldingCountry("000001.SZ")).toBe("CN");
  });

  it("treats suffix-less letter tickers as US", () => {
    expect(resolveHoldingCountry("AAPL")).toBe("US");
    expect(resolveHoldingCountry("brk.b")).toBe("US"); // case-insensitive, no market suffix
  });

  it("uses currency as a tiebreak for ambiguous symbols", () => {
    // Bare numeric ticker is ambiguous across .TW/.TWO/.HK — currency decides.
    expect(resolveHoldingCountry("2330", "TWD")).toBe("TW");
    expect(resolveHoldingCountry("0700", "HKD")).toBe("HK");
    // No-suffix letter symbol priced in a non-USD currency overrides the US default.
    expect(resolveHoldingCountry("NESN", "CHF")).toBe("CH");
    // No-suffix letter symbol in USD stays US.
    expect(resolveHoldingCountry("MSFT", "USD")).toBe("US");
  });

  it("falls back to currency for unknown suffixes and returns null when undeterminable", () => {
    expect(resolveHoldingCountry("FOO.ZZ", "JPY")).toBe("JP");
    expect(resolveHoldingCountry("FOO.ZZ")).toBeNull();
    expect(resolveHoldingCountry("2330")).toBeNull();
    expect(resolveHoldingCountry("")).toBeNull();
  });
});

describe("resolveCountryLabel", () => {
  it("localizes known codes", () => {
    expect(resolveCountryLabel("TW", "zh-Hant")).toBe("台灣");
    expect(resolveCountryLabel("TW", "en")).toBe("Taiwan");
    expect(resolveCountryLabel("US", "zh-Hant")).toBe("美國");
    expect(resolveCountryLabel("JP", "en")).toBe("Japan");
  });

  it("falls back to an explicit unknown placeholder", () => {
    expect(resolveCountryLabel(null, "zh-Hant")).toBe("未知地區");
    expect(resolveCountryLabel("ZZ", "en")).toBe("Unknown");
    expect(resolveCountryLabel(undefined, "zh-Hant")).toBe("未知地區");
  });
});
