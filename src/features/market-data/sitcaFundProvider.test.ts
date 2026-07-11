import { describe, expect, it } from "vitest";
import { buildFundSymbolIndex, filterFunds, fundSymbol, parseSitcaNavCsv } from "./sitcaFundProvider";

// Captured SITCA NAV CSV shape, prefixed with the UTF-8 BOM (﻿) exactly as
// the live file (first bytes EF BB BF). Columns:
//   日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號
const SAMPLE_CSV =
  "﻿日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號\n" +
  "20260624,A0001,某投信,12345678,DIE02,某全球債券基金,12.3456,0.0123,0.10,B,USD,TWDIE02\n" +
  "20260624,A0002,另一投信,87654321,FOO99,另一台股基金,45.6700,-0.5000,-1.08,A,TWD,TWFOO99\n" +
  // Regression rows for the reported issue: 基金代號 is NOT unique across fund
  // companies (19 live rows share DIO04). A code-keyed map let 路博邁's DIO04
  // clobber 群益's, so 「T1605Y 群益新興金鑽基金-新臺幣」 was unfindable.
  "20260708,A0016,群益投信,48852561A,DIO04,群益新興金鑽基金-新臺幣,14.5,-0.24,-1.62822,AA2,TWD,T1605Y\n" +
  "20260708,A0021,路博邁投信,55667788A,DIO04,路博邁全球非投資等級債券基金T累積(美元),12.64,0.01,0.08,AH2,USD,T5002J\n";

describe("parseSitcaNavCsv", () => {
  it("strips the UTF-8 BOM so the first column is not corrupted", () => {
    const funds = parseSitcaNavCsv(SAMPLE_CSV);
    // If the BOM leaked into the header, the 基金代號 lookup would miss entirely.
    expect(funds).toHaveLength(4);
    const fund = funds.find((f) => f.code === "DIE02");
    expect(fund).toBeDefined();
    // The date column (col 1, right after the BOM) parses cleanly.
    expect(fund?.date).toBe("20260624");
  });

  it("reads NAV, currency, and name for a given 基金代號", () => {
    const funds = parseSitcaNavCsv(SAMPLE_CSV);
    const fund = funds.find((f) => f.code === "DIE02");
    expect(fund?.nav).toBe(12.3456);
    expect(fund?.currency).toBe("USD");
    expect(fund?.name).toBe("某全球債券基金");
    expect(fund?.certCode).toBe("TWDIE02");

    const twd = funds.find((f) => f.code === "FOO99");
    expect(twd?.nav).toBe(45.67);
    expect(twd?.currency).toBe("TWD");
  });

  it("keeps every row when 基金代號 repeats across fund companies", () => {
    const funds = parseSitcaNavCsv(SAMPLE_CSV);
    const dio04 = funds.filter((f) => f.code === "DIO04");
    expect(dio04).toHaveLength(2);
    expect(dio04.map((f) => f.certCode).sort()).toEqual(["T1605Y", "T5002J"]);
  });

  it("skips rows without a fund code or a numeric NAV", () => {
    const csv =
      "﻿日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號\n" +
      "20260624,A0001,某投信,12345678,,無代號基金,1.0000,0,0,B,TWD,X\n" +
      "20260624,A0002,某投信,12345678,BAD01,壞淨值基金,N/A,0,0,B,TWD,X\n";
    expect(parseSitcaNavCsv(csv)).toHaveLength(0);
  });
});

// Hand-built fund list for filterFunds tests.
function makeFunds() {
  return [
    { code: "AAA01", certCode: "T9901Y", nav: 10, currency: "TWD", name: "全球科技基金", date: "20260624" },
    { code: "BBB02", certCode: "T9902Y", nav: 20, currency: "USD", name: "台灣債券基金", date: "20260624" },
    { code: "CCC03", certCode: "T9903Y", nav: 30, currency: "TWD", name: "亞洲平衡基金", date: "20260624" },
  ];
}

describe("filterFunds", () => {
  it("matches by fund name (query '科技')", () => {
    const results = filterFunds(makeFunds(), "科技");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("SITCA:T9901Y");
    expect(results[0].name).toBe("全球科技基金");
    expect(results[0].exchange).toBe("SITCA");
  });

  it("matches by fund code but returns the cert-code symbol", () => {
    const results = filterFunds(makeFunds(), "BBB02");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("SITCA:T9902Y");
  });

  it("result symbol has SITCA: prefix and exchange is SITCA", () => {
    const results = filterFunds(makeFunds(), "CCC");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toMatch(/^SITCA:/);
    expect(results[0].exchange).toBe("SITCA");
  });

  it("caps results at max", () => {
    const results = filterFunds(makeFunds(), "基金", 2);
    expect(results).toHaveLength(2);
  });

  it("returns empty array for empty query", () => {
    expect(filterFunds(makeFunds(), "")).toEqual([]);
    expect(filterFunds(makeFunds(), "   ")).toEqual([]);
  });

  it("is case-insensitive for code matching", () => {
    const results = filterFunds(makeFunds(), "aaa01");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("SITCA:T9901Y");
  });

  it("returns empty array when nothing matches", () => {
    expect(filterFunds(makeFunds(), "不存在")).toEqual([]);
  });

  it("matches by 受益憑證代號 (customer-facing certificate code)", () => {
    const results = filterFunds(makeFunds(), "T9901Y");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("SITCA:T9901Y");
  });

  it("is case-insensitive for 受益憑證代號 matching", () => {
    const results = filterFunds(makeFunds(), "t9901y");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("SITCA:T9901Y");
  });

  it("falls back to the 基金代號 symbol when a fund has no cert code", () => {
    const funds = [{ code: "ZZZ09", certCode: "", nav: 1, currency: "TWD", name: "無憑證基金", date: "20260624" }];
    const results = filterFunds(funds, "ZZZ09");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("SITCA:ZZZ09");
  });

  it("finds the reported 群益新興金鑽基金-新臺幣 fund by its 受益憑證代號 T1605Y", () => {
    const funds = parseSitcaNavCsv(SAMPLE_CSV);
    const results = filterFunds(funds, "T1605Y");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("SITCA:T1605Y");
    expect(results[0].name).toBe("群益新興金鑽基金-新臺幣");
  });

  it("returns both funds sharing a 基金代號, each under its own cert-code symbol", () => {
    const funds = parseSitcaNavCsv(SAMPLE_CSV);
    const results = filterFunds(funds, "DIO04");
    expect(results.map((r) => r.symbol).sort()).toEqual(["SITCA:T1605Y", "SITCA:T5002J"]);
  });
});

describe("buildFundSymbolIndex", () => {
  it("resolves cert codes and unambiguous legacy 基金代號 tickers", () => {
    const index = buildFundSymbolIndex(parseSitcaNavCsv(SAMPLE_CSV));
    expect(index.get("T1605Y")?.name).toBe("群益新興金鑽基金-新臺幣");
    // Legacy `SITCA:DIE02` (unique code) keeps pricing.
    expect(index.get("DIE02")?.certCode).toBe("TWDIE02");
  });

  it("does not resolve an ambiguous 基金代號 to an arbitrary fund", () => {
    const index = buildFundSymbolIndex(parseSitcaNavCsv(SAMPLE_CSV));
    // Two companies share DIO04 — pricing either would be a silent wrong NAV.
    expect(index.get("DIO04")).toBeUndefined();
  });
});

describe("fundSymbol", () => {
  it("prefers the cert code and upper-cases it", () => {
    expect(fundSymbol({ code: "dio04", certCode: "t1605y" })).toBe("SITCA:T1605Y");
    expect(fundSymbol({ code: "dio04", certCode: "" })).toBe("SITCA:DIO04");
  });
});
