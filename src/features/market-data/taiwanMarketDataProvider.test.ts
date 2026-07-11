import { describe, expect, it } from "vitest";
import { filterTaiwanSecurities, parseSecurityNames, type TaiwanCompany } from "./taiwanMarketDataProvider";

describe("parseSecurityNames", () => {
  it("maps both bare code and .TW-suffixed key to the Chinese name", () => {
    const result = parseSecurityNames([{ Code: "00878", Name: "國泰永續高股息" }]);
    expect(result.get("00878")).toBe("國泰永續高股息");
    expect(result.get("00878.TW")).toBe("國泰永續高股息");
  });

  it("handles multiple securities", () => {
    const result = parseSecurityNames([
      { Code: "0050", Name: "元大台灣50" },
      { Code: "00878", Name: "國泰永續高股息" },
    ]);
    expect(result.size).toBe(4);
    expect(result.get("0050")).toBe("元大台灣50");
    expect(result.get("0050.TW")).toBe("元大台灣50");
    expect(result.get("00878")).toBe("國泰永續高股息");
    expect(result.get("00878.TW")).toBe("國泰永續高股息");
  });

  it("skips rows with missing Code", () => {
    const result = parseSecurityNames([
      { Name: "缺少代號" },
      { Code: "0050", Name: "元大台灣50" },
    ]);
    expect(result.size).toBe(2);
    expect(result.has("undefined")).toBe(false);
  });

  it("skips rows with missing Name", () => {
    const result = parseSecurityNames([
      { Code: "9999" },
      { Code: "0050", Name: "元大台灣50" },
    ]);
    expect(result.size).toBe(2);
    expect(result.has("9999")).toBe(false);
  });

  it("returns an empty map for an empty array", () => {
    const result = parseSecurityNames([]);
    expect(result.size).toBe(0);
  });

  it("trims whitespace from Code and Name", () => {
    const result = parseSecurityNames([{ Code: " 0050 ", Name: " 元大台灣50 " }]);
    expect(result.get("0050")).toBe("元大台灣50");
    expect(result.get("0050.TW")).toBe("元大台灣50");
  });
});

describe("filterTaiwanSecurities", () => {
  const twseCompany: TaiwanCompany = {
    code: "2330",
    symbol: "2330.TW",
    nameZh: "台灣積體電路製造股份有限公司",
    nameShort: "台積電",
    industry: "半導體業",
    market: "TWSE",
  };
  const tpexCompany: TaiwanCompany = {
    code: "6488",
    symbol: "6488.TWO",
    nameZh: "環球晶圓股份有限公司",
    nameShort: "環球晶",
    industry: "半導體業",
    market: "TPEx",
  };
  const companies = [twseCompany, tpexCompany];

  it("matches a company by Chinese short name", () => {
    const results = filterTaiwanSecurities(companies, new Map(), "台積電");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ symbol: "2330.TW", name: "台積電" });
  });

  it("matches a company by code", () => {
    const results = filterTaiwanSecurities(companies, new Map(), "2330");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ symbol: "2330.TW", name: "台積電" });
  });

  it("matches a company by full legal name", () => {
    const results = filterTaiwanSecurities(companies, new Map(), "積體電路");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ symbol: "2330.TW", name: "台積電" });
  });

  it("returns the .TWO symbol with TPEx exchange for a TPEx company", () => {
    const results = filterTaiwanSecurities(companies, new Map(), "環球晶");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ symbol: "6488.TWO", name: "環球晶", exchange: "TPEx" });
  });

  it("includes a .TW security-name match exactly once, skipping the bare-code key", () => {
    const names = new Map([
      ["0050.TW", "元大台灣50"],
      ["0050", "元大台灣50"],
    ]);
    const results = filterTaiwanSecurities([], names, "元大台灣");
    const matches = results.filter((r) => r.symbol === "0050.TW");
    expect(matches).toHaveLength(1);
  });

  it("prefers the company match over the security-name match for the same symbol", () => {
    const names = new Map([
      ["2330.TW", "台積電"],
      ["2330", "台積電"],
    ]);
    const results = filterTaiwanSecurities(companies, names, "台積電");
    const matches = results.filter((r) => r.symbol === "2330.TW");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ typeLabel: "股票", assetType: "equity" });
  });

  it("caps the combined result count at max", () => {
    const names = new Map([
      ["0050.TW", "元大台灣50"],
      ["0051.TW", "元大台灣中型100"],
      ["0052.TW", "富邦台灣科技"],
    ]);
    const results = filterTaiwanSecurities([], names, "台灣", 2);
    expect(results).toHaveLength(2);
  });
});
