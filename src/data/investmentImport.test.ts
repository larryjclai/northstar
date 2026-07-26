import { describe, expect, it } from "vitest";
import { parseCsvTable } from "./csv";
import {
  applyInvestmentMapping,
  autoDetectActivityMap,
  autoDetectFields,
  distinctValues,
  parseImportDate,
  WITHDRAW_ACTION,
  type InvestmentImportMapping,
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

  it("recognizes Northstar activity export fields instead of the internal symbol id", () => {
    const { headers } = parseCsvTable(
      [
        "id,accountId,symbol,activityType,date,quantity,unitPrice,currency,fee,amount,accountName,assetSymbol,assetName,exchangeMic",
        "r1,a1,asset_uuid,BUY,2026-06-04T11:08:58.897+00:00,100,165,TWD,14,16500,KGI,5347,Vanguard International Semiconductor Corporation,XTAI_OTC",
      ].join("\n"),
      ",",
    );
    const fields = autoDetectFields(headers);
    expect(fields.action).toBe("activityType");
    expect(fields.ticker).toBe("assetSymbol");
    expect(fields.name).toBe("assetName");
    expect(fields.price).toBe("unitPrice");
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
    const preview = applyInvestmentMapping(rows, baseMapping, {
      linkedAccountId: "acc1",
      accountCurrency: "USD",
    });
    expect(preview.invalid).toHaveLength(0);
    expect(preview.valid).toHaveLength(2);
    const buy = preview.valid[0].value;
    expect(buy).toMatchObject({ kind: "investment" });
    if (buy.kind !== "investment") throw new Error("expected investment");
    expect(buy.draft).toMatchObject({
      action: "buy",
      ticker: "VTI",
      quantity: 1,
      date: "2026-06-05",
      linkedAccountId: "acc1",
      currency: "USD",
    });
    const sell = preview.valid[1].value;
    expect(sell).toMatchObject({ kind: "investment" });
    if (sell.kind !== "investment") throw new Error("expected investment");
    expect(sell.draft).toMatchObject({ action: "sell", ticker: "BE", quantity: 2 }); // -2 → magnitude
  });

  it("flags unmapped action values", () => {
    const mapping: InvestmentImportMapping = { ...baseMapping, activityMap: { 買進: "buy" } };
    const preview = applyInvestmentMapping(rows, mapping, {
      linkedAccountId: "acc1",
      accountCurrency: "USD",
    });
    expect(preview.valid).toHaveLength(1);
    expect(preview.invalid[0].reason).toContain("未對應的交易類別");
  });

  it("rejects rows whose currency disagrees with the account", () => {
    const mapping: InvestmentImportMapping = { ...baseMapping, fields: { ...baseMapping.fields } };
    const withCurrency = parseCsvTable(
      ["日期,交易類別,數量,代號,價格,幣別", "06/05/2026,買進,1,VTI,368,USD"].join("\n"),
      ",",
    );
    const m: InvestmentImportMapping = {
      fields: autoDetectFields(withCurrency.headers),
      activityMap: { 買進: "buy" },
      dateFormat: "auto",
    };
    const preview = applyInvestmentMapping(withCurrency.rows, m, {
      linkedAccountId: "acc1",
      accountCurrency: "TWD",
    });
    expect(preview.invalid[0].reason).toContain("不一致");
  });

  it("skips rows mapped to ignore", () => {
    const mapping: InvestmentImportMapping = {
      ...baseMapping,
      activityMap: { 買進: "ignore", 賣出: "sell" },
    };
    const preview = applyInvestmentMapping(rows, mapping, {
      linkedAccountId: "acc1",
      accountCurrency: "USD",
    });
    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0].value.kind).toBe("investment");
    if (preview.valid[0].value.kind !== "investment") throw new Error("expected investment");
    expect(preview.valid[0].value.draft.action).toBe("sell");
    expect(preview.invalid).toHaveLength(0);
  });

  it("imports Northstar activity exports with per-row accounts", () => {
    const csv = [
      "id,accountId,symbol,activityType,date,quantity,unitPrice,currency,fee,amount,accountName,assetSymbol,assetName,exchangeMic",
      "r1,old-kgi,asset_uuid,BUY,2026-06-04T11:08:58.897+00:00,100,165,TWD,14,16500,KGI,5347,Vanguard International Semiconductor Corporation,XTAI_OTC",
      "r2,old-kgi,,DEPOSIT,2026-06-04T11:08:21.084+00:00,,,TWD,,4000,KGI,,,",
      "r3,old-kgi,,WITHDRAW,2026-06-05T11:08:21.084+00:00,,,TWD,,1250,KGI,,,",
      "r4,old-first,asset_uuid2,SELL,2026-06-01T16:00:00+00:00,4,84.065,USD,,336.25,Firstrade,NFLX,Netflix Inc.,XNAS",
    ].join("\n");
    const { headers, rows } = parseCsvTable(csv, ",");
    const fields = autoDetectFields(headers);
    const mapping: InvestmentImportMapping = {
      fields,
      activityMap: autoDetectActivityMap(distinctValues(rows, fields.action)),
      dateFormat: "auto",
    };
    const preview = applyInvestmentMapping(rows, mapping, {
      linkedAccountId: "",
      accountCurrency: "",
      accounts: [
        { id: "local-kgi", name: "KGI", type: "investment", currency: "TWD", deletedAt: null },
        {
          id: "local-first",
          name: "Firstrade",
          type: "investment",
          currency: "USD",
          deletedAt: null,
        },
      ] as any,
    });
    expect(preview.invalid).toHaveLength(0);
    expect(preview.valid).toHaveLength(4);
    expect(preview.valid[0].value.kind).toBe("investment");
    if (preview.valid[0].value.kind !== "investment") throw new Error("expected investment");
    expect(preview.valid[0].value.draft).toMatchObject({
      action: "buy",
      ticker: "5347",
      linkedAccountId: "local-kgi",
      currency: "TWD",
    });
    expect(preview.valid[1].value.kind).toBe("cash");
    if (preview.valid[1].value.kind !== "cash") throw new Error("expected cash");
    expect(preview.valid[1].value.draft).toMatchObject({
      amount: 4000,
      accountId: "local-kgi",
      subcategory: "入金",
      entryType: "transfer",
    });
    expect(preview.valid[2].value.kind).toBe("cash");
    if (preview.valid[2].value.kind !== "cash") throw new Error("expected cash");
    expect(preview.valid[2].value.draft).toMatchObject({
      amount: -1250,
      accountId: "local-kgi",
      subcategory: "出金",
      entryType: "transfer",
    });
    expect(preview.valid[3].value.kind).toBe("investment");
    if (preview.valid[3].value.kind !== "investment") throw new Error("expected investment");
    expect(preview.valid[3].value.draft).toMatchObject({
      action: "sell",
      ticker: "NFLX",
      linkedAccountId: "local-first",
      currency: "USD",
    });
    expect(autoDetectActivityMap(["WITHDRAW"]).WITHDRAW).toBe(WITHDRAW_ACTION);
  });
});
