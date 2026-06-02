import { describe, expect, it } from "vitest";
import { parseLedgerCsv } from "./csv";

const accountFor = (value: string) => value === "Wallet" ? { id: "acct_wallet", currency: "TWD" } : undefined;

describe("ledger CSV preview", () => {
  it("supports quoted commas and multiline notes", () => {
    const csv = 'date,account,name,entryType,settlementStatus,amount,currency,category,subcategory,merchant,note\n2026-06-01,Wallet,"午餐, 咖啡",expense,settled,-180,TWD,餐飲,,星巴克,"第一行\n第二行"';
    const preview = parseLedgerCsv(csv, accountFor);
    expect(preview.invalid).toHaveLength(0);
    expect(preview.valid[0].value.note).toBe("第一行\n第二行");
    expect(preview.valid[0].value.name).toBe("午餐, 咖啡");
  });

  it("reports sign and currency errors without silently repairing rows", () => {
    const csv = "date,account,name,entryType,amount,currency\n2026-06-01,Wallet,Coffee,expense,180,TWD\n2026-06-01,Wallet,Salary,income,10,USD";
    const preview = parseLedgerCsv(csv, accountFor);
    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid.map((row) => row.reason)).toEqual([
      "支出 amount 必須為負數",
      "currency 必須與帳戶幣別 TWD 一致",
    ]);
  });
});
