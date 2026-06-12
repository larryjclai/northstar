import { describe, expect, it } from "vitest";
import { resolveBankBrand } from "./bankBrands";

describe("resolveBankBrand", () => {
  it("matches by Chinese keyword regardless of surrounding text", () => {
    expect(resolveBankBrand("國泰世華 數位帳戶")?.domain).toBe("cathaybk.com.tw");
    expect(resolveBankBrand("玉山 Pi 拍錢包卡")?.domain).toBe("esunbank.com");
    expect(resolveBankBrand("台新 Richart")?.domain).toBe("taishinbank.com.tw");
    expect(resolveBankBrand("街口支付")?.domain).toBe("jkos.com");
  });

  it("matches by English keyword and ignores spaces/case", () => {
    expect(resolveBankBrand("Firstrade")?.label).toBe("Firstrade");
    expect(resolveBankBrand("LINE BANK 帳戶")?.domain).toBe("linebank.com.tw");
    expect(resolveBankBrand("cathay united")?.domain).toBe("cathaybk.com.tw");
  });

  it("returns null for unknown or empty names", () => {
    expect(resolveBankBrand("我的小金庫")).toBeNull();
    expect(resolveBankBrand("")).toBeNull();
    expect(resolveBankBrand(null)).toBeNull();
  });

  it("uses a manual domain override before name matching", () => {
    expect(resolveBankBrand("我的小金庫", "esunbank.com")?.label).toBe("玉山銀行");
    expect(resolveBankBrand("國泰世華 數位帳戶", "taishinbank.com.tw")?.label).toBe("台新銀行");
  });

});
