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

export function parseLedgerCsv(text: string, accountIdFor: (nameOrId: string) => string | undefined): ImportPreview<LedgerDraft> {
  return previewRows(text, (row) => {
    const accountId = accountIdFor(required(row, "account"));
    if (!accountId) throw new Error("找不到帳戶");
    const amount = numberField(row, "amount");
    const entryType = parseEntryType(row.entryType, amount);
    return {
      date: required(row, "date"),
      accountId,
      name: row.name || row.merchant || row.category || "",
      amount,
      currency: required(row, "currency").toUpperCase(),
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
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const [headerLine, ...dataLines] = lines;
  if (!headerLine) return [];
  const headers = splitCsvLine(headerLine).map((header) => header.trim());
  return dataLines.map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
  });
}

function splitCsvLine(line: string) {
  const result: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      result.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  result.push(value);
  return result;
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
