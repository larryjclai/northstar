import { describe, expect, it } from "vitest";
import { parseSecurityNames } from "./taiwanMarketDataProvider";

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
