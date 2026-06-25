import { describe, expect, it } from "vitest";
import { parseSitcaNavCsv } from "./sitcaFundProvider";

// Captured SITCA NAV CSV shape, prefixed with the UTF-8 BOM (﻿) exactly as
// the live file (first bytes EF BB BF). Columns:
//   日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號
const SAMPLE_CSV =
  "﻿日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號\n" +
  "20260624,A0001,某投信,12345678,DIE02,某全球債券基金,12.3456,0.0123,0.10,B,USD,TWDIE02\n" +
  "20260624,A0002,另一投信,87654321,FOO99,另一台股基金,45.6700,-0.5000,-1.08,A,TWD,TWFOO99\n";

describe("parseSitcaNavCsv", () => {
  it("strips the UTF-8 BOM so the first column is not corrupted", () => {
    const byCode = parseSitcaNavCsv(SAMPLE_CSV);
    // If the BOM leaked into the header, the 基金代號 lookup would miss entirely.
    expect(byCode.size).toBe(2);
    const fund = byCode.get("DIE02");
    expect(fund).toBeDefined();
    // The date column (col 1, right after the BOM) parses cleanly.
    expect(fund?.date).toBe("20260624");
  });

  it("reads NAV, currency, and name for a given 基金代號", () => {
    const byCode = parseSitcaNavCsv(SAMPLE_CSV);
    const fund = byCode.get("DIE02");
    expect(fund?.nav).toBe(12.3456);
    expect(fund?.currency).toBe("USD");
    expect(fund?.name).toBe("某全球債券基金");

    const twd = byCode.get("FOO99");
    expect(twd?.nav).toBe(45.67);
    expect(twd?.currency).toBe("TWD");
  });

  it("skips rows without a fund code or a numeric NAV", () => {
    const csv =
      "﻿日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號\n" +
      "20260624,A0001,某投信,12345678,,無代號基金,1.0000,0,0,B,TWD,X\n" +
      "20260624,A0002,某投信,12345678,BAD01,壞淨值基金,N/A,0,0,B,TWD,X\n";
    const byCode = parseSitcaNavCsv(csv);
    expect(byCode.size).toBe(0);
  });
});
