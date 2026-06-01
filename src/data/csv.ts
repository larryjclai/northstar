import type { Account, InvestmentRecord, LedgerTransaction, PortfolioAsset } from "../domain";
import type { InvestmentDraft, LedgerDraft } from "./repositories";

export interface ImportPreview<T> {
  valid: Array<{ row: number; value: T }>;
  invalid: Array<{ row: number; reason: string; raw: Record<string, string> }>;
}

export function exportAccountsCsv(accounts: Account[]) {
  return toCsv(
    ["id", "name", "currency", "type", "openingBalance", "balance", "creditLimit", "creditLimitGroup"],
    accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      type: account.type,
      openingBalance: account.openingBalance,
      balance: account.balance,
      creditLimit: account.creditLimit ?? "",
      creditLimitGroup: account.creditLimitGroup,
    })),
  );
}

export function exportLedgerCsv(rows: LedgerTransaction[], accountName: (id: string) => string) {
  return toCsv(
    ["date", "account", "name", "entryType", "settlementStatus", "amount", "currency", "category", "subcategory", "merchant", "note"],
    rows.map((row) => ({
      date: row.date,
      account: accountName(row.accountId),
      name: row.name,
      entryType: row.entryType,
      settlementStatus: row.settlementStatus,
      amount: row.amount,
      currency: row.currency,
      category: row.category,
      subcategory: row.subcategory,
      merchant: row.merchant,
      note: row.note,
    })),
  );
}

export function exportInvestmentCsv(records: InvestmentRecord[], assetFor: (id: string) => PortfolioAsset | undefined) {
  return toCsv(
    ["date", "ticker", "name", "currency", "action", "price", "quantity", "fee", "note"],
    records.map((record) => {
      const asset = assetFor(record.assetId);
      return {
        date: record.date,
        ticker: asset?.ticker ?? record.assetId,
        name: asset?.name ?? "",
        currency: asset?.currency ?? "",
        action: record.action,
        price: record.price,
        quantity: record.quantity,
        fee: record.fee,
        note: record.note,
      };
    }),
  );
}

export function parseLedgerCsv(text: string, accountFor: (nameOrId: string) => Pick<Account, "id" | "currency"> | undefined): ImportPreview<LedgerDraft> {
  return previewRows(text, (row) => {
    const account = accountFor(required(row, "account"));
    if (!account) throw new Error("找不到帳戶");
    const amount = numberField(row, "amount");
    if (amount === 0) throw new Error("amount 不可為 0");
    const entryType = parseEntryType(row.entryType, amount);
    if (entryType === "transfer") throw new Error("CSV 暫不接受單列轉帳，請使用 App 的轉帳功能");
    if (entryType === "income" && amount < 0) throw new Error("收入 amount 必須為正數");
    if (entryType === "expense" && amount > 0) throw new Error("支出 amount 必須為負數");
    const date = required(row, "date");
    if (Number.isNaN(Date.parse(date))) throw new Error("date 格式無效");
    const currency = required(row, "currency").toUpperCase();
    if (currency !== account.currency.toUpperCase()) throw new Error(`currency 必須與帳戶幣別 ${account.currency} 一致`);
    return {
      date,
      accountId: account.id,
      name: row.name || row.merchant || row.category || "",
      amount,
      currency,
      category: row.category || "",
      subcategory: row.subcategory || "",
      merchant: row.merchant || "",
      entryType,
      settlementStatus: parseSettlementStatus(row.settlementStatus, entryType),
      note: row.note || "",
    };
  });
}

export function parseInvestmentCsv(text: string): ImportPreview<InvestmentDraft> {
  return previewRows(text, (row) => {
    const action = required(row, "action") as InvestmentDraft["action"];
    const quantityRaw = row.quantity?.trim() ?? "";
    const quantity = action === "cashDividend"
      ? (quantityRaw ? numberField(row, "quantity") : 0)
      : numberField(row, "quantity");
    return {
      date: required(row, "date"),
      ticker: required(row, "ticker").toUpperCase(),
      name: row.name || required(row, "ticker").toUpperCase(),
      currency: required(row, "currency").toUpperCase(),
      action,
      price: numberField(row, "price"),
      quantity,
      fee: row.fee ? numberField(row, "fee") : 0,
      note: row.note || "",
      linkedAccountId: null,
    };
  });
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function previewRows<T>(text: string, parse: (row: Record<string, string>) => T): ImportPreview<T> {
  const rows = parseCsv(text);
  const preview: ImportPreview<T> = { valid: [], invalid: [] };
  rows.forEach((row, index) => {
    try {
      preview.valid.push({ row: index + 2, value: parse(row) });
    } catch (error) {
      preview.invalid.push({
        row: index + 2,
        raw: row,
        reason: error instanceof Error ? error.message : "Invalid row",
      });
    }
  });
  return preview;
}

function parseCsv(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && text[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      record.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(value);
      if (record.some((cell) => cell.trim())) records.push(record);
      record = [];
      value = "";
    } else {
      value += char;
    }
  }
  record.push(value);
  if (record.some((cell) => cell.trim())) records.push(record);
  const [headers, ...rows] = records;
  if (!headers) return [];
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ""])),
  );
}

function toCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
  ].join("\n");
}

function escapeCsv(value: unknown) {
  const raw = String(value ?? "");
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function required(row: Record<string, string>, key: string) {
  const value = row[key]?.trim();
  if (!value) throw new Error(`缺少 ${key}`);
  return value;
}

function numberField(row: Record<string, string>, key: string) {
  const value = Number(required(row, key));
  if (!Number.isFinite(value)) throw new Error(`${key} 必須是數字`);
  return value;
}

function parseEntryType(value: string | undefined, amount: number): LedgerDraft["entryType"] {
  if (value === "income" || value === "收入") return "income";
  if (value === "transfer" || value === "轉帳") return "transfer";
  if (value === "expense" || value === "支出") return "expense";
  return amount >= 0 ? "income" : "expense";
}

function parseSettlementStatus(value: string | undefined, entryType: LedgerDraft["entryType"]): LedgerDraft["settlementStatus"] {
  if (value === "receivable" || value === "應收") return "receivable";
  if (value === "payable" || value === "應付") return "payable";
  if (value === "settled" || value === "已收付") return "settled";
  return entryType === "income" ? "settled" : "settled";
}
