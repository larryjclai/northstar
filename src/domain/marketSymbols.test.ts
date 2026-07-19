import { describe, expect, it } from "vitest";
import { isTaiwanListedTicker, quoteLookupKeys } from "./marketSymbols";

describe("isTaiwanListedTicker", () => {
  it("recognizes bare 4-6 digit codes and .TW/.TWO suffixed tickers as Taiwan-listed", () => {
    expect(isTaiwanListedTicker("2330")).toBe(true);
    expect(isTaiwanListedTicker("2330.TW")).toBe(true);
    expect(isTaiwanListedTicker("00878.TW")).toBe(true);
    expect(isTaiwanListedTicker("6547.TWO")).toBe(true);
  });

  it("rejects non-Taiwan tickers", () => {
    expect(isTaiwanListedTicker("AAPL")).toBe(false);
    expect(isTaiwanListedTicker("VT")).toBe(false);
    expect(isTaiwanListedTicker("BRK.B")).toBe(false);
    expect(isTaiwanListedTicker("")).toBe(false);
  });
});

describe("quoteLookupKeys (characterization — unchanged shared heuristic)", () => {
  it("expands a bare numeric code to itself plus .TW/.TWO aliases", () => {
    expect(quoteLookupKeys("2330")).toEqual(["2330", "2330.TW", "2330.TWO"]);
  });

  it("returns the normalized symbol plus its stripped form for an explicit .TW suffix", () => {
    expect(quoteLookupKeys("2330.TW")).toEqual(["2330.TW", "2330"]);
  });

  it("returns a single normalized key for a non-Taiwan ticker", () => {
    expect(quoteLookupKeys("aapl")).toEqual(["AAPL"]);
  });
});
