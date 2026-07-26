import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MIN_EXPECTED_FUND_COUNT,
  SitcaFundProvider,
  buildFundSymbolIndex,
  countFundMatches,
  filterFunds,
  fundSymbol,
  isPlausibleFundList,
  parseSitcaNavCsv,
  resetSitcaFundCacheForTests,
} from "./sitcaFundProvider";

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
    {
      code: "AAA01",
      certCode: "T9901Y",
      nav: 10,
      currency: "TWD",
      name: "全球科技基金",
      company: "某投信",
      date: "20260624",
    },
    {
      code: "BBB02",
      certCode: "T9902Y",
      nav: 20,
      currency: "USD",
      name: "台灣債券基金",
      company: "某投信",
      date: "20260624",
    },
    {
      code: "CCC03",
      certCode: "T9903Y",
      nav: 30,
      currency: "TWD",
      name: "亞洲平衡基金",
      company: "某投信",
      date: "20260624",
    },
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
    const funds = [
      {
        code: "ZZZ09",
        certCode: "",
        nav: 1,
        currency: "TWD",
        name: "無憑證基金",
        company: "某投信",
        date: "20260624",
      },
    ];
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

// Reproduces the live failure (SITCA NAV CSV, 2026-07-25): 259 funds' names
// begin 「群益」 and the reported 「群益新興金鑽基金-新臺幣」 is the 151st of
// them in file order, so a file-ordered 20-result cap hid it entirely.
function makeBrandedFunds(count: number, targetIndex: number) {
  const funds = [];
  for (let i = 0; i < count; i++) {
    if (i === targetIndex) {
      funds.push({
        code: "DIO04",
        certCode: "T1605Y",
        nav: 14.16,
        currency: "TWD",
        name: "群益新興金鑽基金-新臺幣",
        company: "群益投信",
        date: "20260723",
      });
      continue;
    }
    const n = String(i).padStart(3, "0");
    funds.push({
      code: `DIO${n}`,
      certCode: `T9${n}Y`,
      nav: 10,
      currency: "TWD",
      name: `群益其他基金${n}`,
      company: "群益投信",
      date: "20260723",
    });
  }
  return funds;
}

describe("fund search ranking", () => {
  it("ranks an exact 受益憑證代號 match first", () => {
    const results = filterFunds(makeBrandedFunds(259, 150), "T1605Y");
    expect(results[0].symbol).toBe("SITCA:T1605Y");
  });

  it("surfaces the target fund for a full-name query even when it is 151st in file order", () => {
    const results = filterFunds(makeBrandedFunds(259, 150), "群益新興金鑽基金-新臺幣");
    expect(results[0].symbol).toBe("SITCA:T1605Y");
  });

  it("matches a name pasted from the fund company's site (spaces around the hyphen)", () => {
    // This is the exact string in the page title of
    // https://www.capitalfund.com.tw/fund/detail/019.
    const results = filterFunds(makeBrandedFunds(259, 150), "群益新興金鑽基金 - 新臺幣");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("SITCA:T1605Y");
  });

  it("folds 臺 and 台 so either spelling finds the fund", () => {
    const results = filterFunds(makeBrandedFunds(259, 150), "群益新興金鑽基金-新台幣");
    expect(results[0].symbol).toBe("SITCA:T1605Y");
  });

  it("prefers a prefix match over a mid-string match", () => {
    const funds = [
      {
        code: "AAA01",
        certCode: "T1111Y",
        nav: 10,
        currency: "TWD",
        name: "某某群益概念基金",
        company: "某投信",
        date: "20260723",
      },
      {
        code: "DIO04",
        certCode: "T1605Y",
        nav: 14.16,
        currency: "TWD",
        name: "群益新興金鑽基金-新臺幣",
        company: "群益投信",
        date: "20260723",
      },
    ];
    const results = filterFunds(funds, "群益");
    expect(results[0].symbol).toBe("SITCA:T1605Y");
  });

  it("counts every match even when the returned list is capped", () => {
    const funds = makeBrandedFunds(259, 150);
    expect(countFundMatches(funds, "群益")).toBe(259);
    expect(filterFunds(funds, "群益", 20)).toHaveLength(20);
  });

  it("normalizes full-width characters and stray whitespace", () => {
    const funds = makeBrandedFunds(259, 150);
    expect(filterFunds(funds, "  T1605Y  ")[0].symbol).toBe("SITCA:T1605Y");
    expect(filterFunds(funds, "Ｔ１６０５Ｙ")[0].symbol).toBe("SITCA:T1605Y");
    // `\s` already matches 全形空白 (U+3000), so ideographic spaces fold too.
    expect(filterFunds(funds, "群益新興金鑽基金　-　新臺幣")[0].symbol).toBe("SITCA:T1605Y");
  });

  it("matches by 公司名稱 even when the brand is spelled differently in the name", () => {
    // 112 live rows have exactly this mismatch: company is 滙豐投信 but the
    // fund name spells the brand 匯豐.
    const funds = [
      {
        code: "HSB01",
        certCode: "T2001Y",
        nav: 15,
        currency: "TWD",
        name: "匯豐中華平衡基金",
        company: "滙豐投信",
        date: "20260723",
      },
    ];
    const results = filterFunds(funds, "滙豐");
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe("SITCA:T2001Y");
  });

  it("tags fund results as 共同基金", () => {
    const results = filterFunds(makeFunds(), "科技");
    expect(results[0].assetType).toBe("mutual_fund");
    expect(results[0].currency).toBe("TWD");
  });
});

// Generate a syntactically valid SITCA CSV with `count` fund rows — the full
// live file has ~4,400 rows, the truncated failure mode ~37.
function makeCsv(count: number): string {
  const lines = [
    "﻿日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號",
  ];
  for (let i = 0; i < count; i++) {
    const n = String(i).padStart(4, "0");
    lines.push(`20260711,A0001,某投信,12345678,F${n},測試基金${n},10.5000,0,0,B,TWD,T${n}Y`);
  }
  return lines.join("\n") + "\n";
}

// Stub the non-Tauri fetch path (`/api/market-data?...`) so each call serves
// the next CSV in `bodies` (the last one repeats). Returns the mock so tests
// can count refetch attempts.
function stubMarketDataFetch(bodies: string[]) {
  let call = 0;
  const mock = vi.fn(async () => {
    const body = bodies[Math.min(call, bodies.length - 1)];
    call += 1;
    return { ok: true, text: async () => body };
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("isPlausibleFundList", () => {
  it("rejects a tiny parse (the truncated-file failure mode) and accepts the full universe", () => {
    expect(isPlausibleFundList(parseSitcaNavCsv(makeCsv(37)))).toBe(false);
    expect(isPlausibleFundList(parseSitcaNavCsv(makeCsv(MIN_EXPECTED_FUND_COUNT)))).toBe(true);
  });
});

describe("truncated-CSV cache guard", () => {
  afterEach(() => {
    resetSitcaFundCacheForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps serving the previous full cache when a refetch comes back truncated, even past the 1 h TTL", async () => {
    resetSitcaFundCacheForTests();
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = new Date("2026-07-11T08:00:00Z");
    vi.setSystemTime(t0);
    const mock = stubMarketDataFetch([makeCsv(MIN_EXPECTED_FUND_COUNT), makeCsv(37)]);
    const provider = new SitcaFundProvider();

    // First fetch: full universe, cached. T0999Y only exists in the full file.
    const before = await provider.fetchQuotes(["SITCA:T0999Y"]);
    expect(before["SITCA:T0999Y"]?.price).toBe(10.5);

    // 2 h later the cache is expired and the server serves the truncated file.
    vi.setSystemTime(new Date(t0.getTime() + 2 * 60 * 60 * 1000));
    const after = await provider.fetchQuotes(["SITCA:T0999Y"]);
    expect(mock).toHaveBeenCalledTimes(2); // the refetch was attempted…
    expect(after["SITCA:T0999Y"]?.price).toBe(10.5); // …but the stale full cache still prices the fund
  });

  it("serves a first-ever truncated fetch but does not pin it — the next call retries", async () => {
    resetSitcaFundCacheForTests();
    const mock = stubMarketDataFetch([makeCsv(37), makeCsv(37), makeCsv(MIN_EXPECTED_FUND_COUNT)]);
    const provider = new SitcaFundProvider();

    // No previous cache: the sliver is still served (fail-soft)…
    const sliver = await provider.fetchQuotes(["SITCA:T0001Y"]);
    expect(sliver["SITCA:T0001Y"]?.price).toBe(10.5);

    // …but not cached, so every call refetches until a full file arrives.
    await provider.fetchQuotes(["SITCA:T0001Y"]);
    expect(mock).toHaveBeenCalledTimes(2);

    // Third fetch returns the full universe — that one is cached again.
    const full = await provider.fetchQuotes(["SITCA:T0999Y"]);
    expect(full["SITCA:T0999Y"]?.price).toBe(10.5);
    await provider.fetchQuotes(["SITCA:T0999Y"]);
    expect(mock).toHaveBeenCalledTimes(3);
  });
});
