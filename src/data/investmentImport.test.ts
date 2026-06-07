import { describe, expect, it } from "vitest";
import { parseCsvTable } from "./csv";
import {
  applyInvestmentMapping, autoDetectActivityMap, autoDetectFields, distinctValues,
  parseImportDate, type InvestmentImportMapping,
} from "./investmentImport";

// A Firstrade-style export with Chinese headers + 買進/賣出 values + MM/DD/YYYY dates.
const FIRSTRADE_CSV = [
  "日期,交易類別,數量,說明,代號,賬戶類別,價格,金額",
  "06/05/2026,買進,1,Vanguard Total Stock Market ETF,VTI,融資,368.0399,-368.04",
  "06/05/2026,賣出,-2,Bloom Energy Corporation Class A,BE,融資,268.4,536.79",
].join("\n");

describe("parseCsvTable", () => {
  it("parses headers + rows with comma delimiter", () => {
    const { headers, rows } = parseCsvTable(FIRSTRADE_CSV, ",");
    expect(headers).toContain("交易類別");
    expect(rows).toHaveLength(2);
    expect(rows[0]["代號"]).toBe("VTI");
  });
});

describe("autoDetectFields", () => {
  it("maps Chinese broker headers to canonical fields", () => {
    const { headers } = parseCsvTable(FIRSTRADE_CSV, ",");
    const fields = autoDetectFields(headers);
    expect(fields.date).toBe("日期");
    expect(fields.action).toBe("交易類別");
    expect(fields.ticker).toBe("代號");
    expect(fields.name).toBe("說明");
    expect(fields.quantity).toBe("數量");
    expect(fields.price).toBe("價格");
  });
});

describe("autoDetectActivityMap", () => {
  it("guesses 買進→buy and 賣出→sell", () => {
    const map = autoDetectActivityMap(["買進", "賣出", "不明"]);
    expect(map["買進"]).toBe("buy");
    expect(map["賣出"]).toBe("sell");
    expect(map["不明"]).toBe("ignore");
  });
});

describe("parseImportDate", () => {
  it("reads MM/DD/YYYY in auto mode", () => {
    expect(parseImportDate("06/05/2026", "auto")).toBe("2026-06-05");
  });
  it("respects explicit dmy", () => {
    expect(parseImportDate("13/06/2026", "dmy")).toBe("2026-06-13");
  });
  it("keeps ISO date part", () => {
    expect(parseImportDate("2026-06-05T10:00", "auto")).toBe("2026-06-05");
  });
  it("rejects garbage", () => {
    expect(() => parseImportDate("not-a-date", "iso")).toThrow();
  });
});

describe("applyInvestmentMapping", () => {
  const { headers, rows } = parseCsvTable(FIRSTRADE_CSV, ",");
  const baseMapping: InvestmentImportMapping = {
    fields: autoDetectFields(headers),
    activityMap: autoDetectActivityMap(distinctValues(rows, "交易類別")),
    dateFormat: "auto",
  };

  it("produces drafts with normalised dates, signs and account context", () => {
    const preview = applyInvestmentMapping(rows, baseMapping, { linkedAccountId: "acc1", accountCurrency: "USD" });
    expect(preview.invalid).toHaveLength(0);
    expect(preview.valid).toHaveLength(2);
    const buy = preview.valid[0].value;
    expect(buy).toMatchObject({ action: "buy", ticker: "VTI", quantity: 1, date: "2026-06-05", linkedAccountId: "acc1", currency: "USD" });
    const sell = preview.valid[1].value;
    expect(sell).toMatchObject({ action: "sell", ticker: "BE", quantity: 2 }); // -2 → magnitude
  });

  it("flags unmapped action values", () => {
    const mapping: InvestmentImportMapping = { ...baseMapping, activityMap: { 買進: "buy" } };
    const preview = applyInvestmentMapping(rows, mapping, { linkedAccountId: "acc1", accountCurrency: "USD" });
    expect(preview.valid).toHaveLength(1);
    expect(preview.invalid[0].reason).toContain("未對應的交易類別");
  });

  it("rejects rows whose currency disagrees with the account", () => {
    const mapping: InvestmentImportMapping = { ...baseMapping, fields: { ...baseMapping.fields } };
    const withCurrency = parseCsvTable(["日期,交易類別,數量,代號,價格,幣別", "06/05/2026,買進,1,VTI,368,USD"].join("\n"), ",");
    const m: InvestmentImportMapping = {
      fields: autoDetectFields(withCurrency.headers),
      activityMap: { 買進: "buy" },
      dateFormat: "auto",
    };
    const preview = applyInvestmentMapping(withCurrency.rows, m, { linkedAccountId: "acc1", accountCurrency: "TWD" });
    expect(preview.invalid[0].reason).toContain("不一致");
  });

  it("skips rows mapped to ignore", () => {
    const mapping: InvestmentImportMapping = { ...baseMapping, activityMap: { 買進: "ignore", 賣出: "sell" } };
    const preview = applyInvestmentMapping(rows, mapping, { linkedAccountId: "acc1", accountCurrency: "USD" });
    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0].value.action).toBe("sell");
    expect(preview.invalid).toHaveLength(0);
  });
});
