import type { InvestmentAction } from "../domain";
import type { ImportPreview } from "./csv";
import type { InvestmentDraft } from "./repositories";

// ─────── Field model ───────

export const INVESTMENT_FIELDS = [
  "date", "action", "ticker", "name", "quantity", "price", "fee", "currency", "note",
] as const;
export type InvestmentField = (typeof INVESTMENT_FIELDS)[number];

/** Fields that must be mapped for a row to be importable. */
export const REQUIRED_FIELDS: InvestmentField[] = ["date", "action", "ticker", "quantity", "price"];

export const FIELD_LABELS: Record<InvestmentField, string> = {
  date: "日期",
  action: "交易類別",
  ticker: "代號",
  name: "名稱",
  quantity: "數量",
  price: "價格",
  fee: "手續費",
  currency: "幣別",
  note: "備註",
};

export const ACTION_VALUES: InvestmentAction[] = [
  "buy", "sell", "cashDividend", "stockDividend", "capitalReduction", "stockSplit",
];

export const ACTION_LABELS: Record<InvestmentAction, string> = {
  buy: "買進",
  sell: "賣出",
  cashDividend: "現金股利",
  stockDividend: "股票股利",
  capitalReduction: "減資",
  stockSplit: "股票分割",
};

export type DateFormat = "auto" | "iso" | "mdy" | "dmy" | "ymd";

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  auto: "自動偵測",
  iso: "YYYY-MM-DD",
  ymd: "YYYY/MM/DD",
  mdy: "MM/DD/YYYY",
  dmy: "DD/MM/YYYY",
};

export interface InvestmentImportMapping {
  /** Target field → CSV header name. */
  fields: Partial<Record<InvestmentField, string>>;
  /** Raw value in the action column → canonical action (or "ignore" to skip the row). */
  activityMap: Record<string, InvestmentAction | "ignore">;
  dateFormat: DateFormat;
  /** If the quantity column carries a sign (negative = sell), treat magnitude as quantity. */
  signedQuantity?: boolean;
}

export function emptyMapping(): InvestmentImportMapping {
  return { fields: {}, activityMap: {}, dateFormat: "auto" };
}

// ─────── Auto-detection ───────

const FIELD_SYNONYMS: Record<InvestmentField, string[]> = {
  date: ["date", "日期", "交易日", "交易日期", "成交日", "trade date", "datetime"],
  action: ["action", "type", "交易類別", "交易種類", "類別", "活動", "activity", "side"],
  ticker: ["ticker", "symbol", "代號", "股票代號", "代碼", "證券代號"],
  name: ["name", "說明", "名稱", "描述", "description", "security", "證券名稱"],
  quantity: ["quantity", "qty", "數量", "股數", "shares", "成交數量"],
  price: ["price", "價格", "成交價", "單價", "unitprice", "unit price", "成交價格"],
  fee: ["fee", "手續費", "費用", "commission", "佣金", "交易費"],
  currency: ["currency", "幣別", "貨幣", "幣種"],
  note: ["note", "備註", "memo", "remark", "註記"],
};

const ACTION_SYNONYMS: Record<string, InvestmentAction> = {
  "買進": "buy", "買": "buy", "buy": "buy", "購入": "buy", "bought": "buy", "申購": "buy",
  "賣出": "sell", "賣": "sell", "sell": "sell", "sold": "sell", "贖回": "sell",
  "現金股利": "cashDividend", "股利": "cashDividend", "配息": "cashDividend", "dividend": "cashDividend", "cash dividend": "cashDividend", "div": "cashDividend",
  "股票股利": "stockDividend", "配股": "stockDividend", "stock dividend": "stockDividend",
  "減資": "capitalReduction", "capital reduction": "capitalReduction",
  "股票分割": "stockSplit", "分割": "stockSplit", "split": "stockSplit",
};

/** Guess field → header mapping from the CSV headers. */
export function autoDetectFields(headers: string[]): Partial<Record<InvestmentField, string>> {
  const fields: Partial<Record<InvestmentField, string>> = {};
  const used = new Set<string>();
  for (const field of INVESTMENT_FIELDS) {
    const synonyms = FIELD_SYNONYMS[field];
    const match = headers.find((header) => {
      if (used.has(header)) return false;
      const lower = header.toLowerCase();
      return synonyms.some((syn) => lower === syn.toLowerCase() || lower.includes(syn.toLowerCase()) || syn.toLowerCase().includes(lower));
    });
    if (match) { fields[field] = match; used.add(match); }
  }
  return fields;
}

/** Distinct non-empty values found in a column, preserving first-seen order. */
export function distinctValues(rows: Record<string, string>[], header: string | undefined): string[] {
  if (!header) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const value = (row[header] ?? "").trim();
    if (value && !seen.has(value)) { seen.add(value); out.push(value); }
  }
  return out;
}

/** Guess action mapping for the distinct values of the chosen action column. */
export function autoDetectActivityMap(values: string[]): Record<string, InvestmentAction | "ignore"> {
  const map: Record<string, InvestmentAction | "ignore"> = {};
  for (const value of values) {
    const lower = value.toLowerCase().trim();
    const guess = ACTION_SYNONYMS[value.trim()] ?? ACTION_SYNONYMS[lower];
    map[value] = guess ?? "ignore";
  }
  return map;
}

// ─────── Apply mapping → drafts ───────

export interface MappingContext {
  linkedAccountId: string;
  accountCurrency: string;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

function toIso(y: number, m: number, d: number): string {
  if (!(y >= 1900 && y <= 2999 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) throw new Error("日期格式無效");
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseImportDate(raw: string, fmt: DateFormat): string {
  const s = raw.trim();
  if (!s) throw new Error("缺少日期");
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (fmt === "iso") {
    if (!isoMatch) throw new Error("日期需為 YYYY-MM-DD");
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  if (fmt === "auto" && isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parts = s.split(/[/\-.]/).map((p) => parseInt(p, 10));
  if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
    if (fmt === "ymd") return toIso(parts[0], parts[1], parts[2]);
    if (fmt === "mdy") return toIso(parts[2], parts[0], parts[1]);
    if (fmt === "dmy") return toIso(parts[2], parts[1], parts[0]);
    // auto with separators
    if (parts[0] > 1000) return toIso(parts[0], parts[1], parts[2]); // leading year
    if (parts[0] > 12) return toIso(parts[2], parts[1], parts[0]); // must be DMY
    return toIso(parts[2], parts[0], parts[1]); // default to MDY (most broker exports)
  }
  const ts = Date.parse(s);
  if (!Number.isNaN(ts)) { const d = new Date(ts); return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  throw new Error("日期格式無效");
}

function parseNumber(raw: string, label: string, allowEmpty = false): number {
  const cleaned = raw.replace(/[,\s$＄]/g, "").trim();
  if (!cleaned) {
    if (allowEmpty) return 0;
    throw new Error(`缺少${label}`);
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`${label}必須是數字`);
  return n;
}

export function applyInvestmentMapping(
  rows: Record<string, string>[],
  mapping: InvestmentImportMapping,
  ctx: MappingContext,
): ImportPreview<InvestmentDraft> {
  const preview: ImportPreview<InvestmentDraft> = { valid: [], invalid: [] };
  const get = (row: Record<string, string>, field: InvestmentField): string => {
    const header = mapping.fields[field];
    return header ? (row[header] ?? "").trim() : "";
  };

  rows.forEach((row, index) => {
    const rowNum = index + 2; // 1-based + header row
    try {
      const rawAction = get(row, "action");
      if (!rawAction) throw new Error("缺少交易類別");
      const mapped = mapping.activityMap[rawAction];
      if (mapped === undefined) throw new Error(`未對應的交易類別「${rawAction}」`);
      if (mapped === "ignore") return; // intentionally skipped
      const action = mapped;

      const date = parseImportDate(get(row, "date"), mapping.dateFormat);

      const ticker = get(row, "ticker").toUpperCase();
      if (!ticker) throw new Error("缺少代號");

      const isDividend = action === "cashDividend";
      const quantity = Math.abs(parseNumber(get(row, "quantity"), "數量", isDividend));
      const price = parseNumber(get(row, "price"), "價格", isDividend);
      const feeRaw = get(row, "fee");
      const fee = feeRaw ? Math.abs(parseNumber(feeRaw, "手續費")) : 0;

      const csvCurrency = get(row, "currency").toUpperCase();
      if (csvCurrency && csvCurrency !== ctx.accountCurrency.toUpperCase()) {
        throw new Error(`幣別 ${csvCurrency} 與投資帳戶 ${ctx.accountCurrency} 不一致`);
      }

      preview.valid.push({
        row: rowNum,
        value: {
          ticker,
          name: get(row, "name") || ticker,
          currency: ctx.accountCurrency,
          linkedAccountId: ctx.linkedAccountId,
          date,
          action,
          price,
          quantity,
          fee,
          note: get(row, "note") || "",
        },
      });
    } catch (error) {
      preview.invalid.push({
        row: rowNum,
        raw: row,
        reason: error instanceof Error ? error.message : "無效資料",
      });
    }
  });

  return preview;
}

/** Which required fields are still unmapped. */
export function missingRequiredFields(mapping: InvestmentImportMapping): InvestmentField[] {
  return REQUIRED_FIELDS.filter((field) => !mapping.fields[field]);
}

/** Distinct action values that have no mapping yet (excluding explicit ignore). */
export function unmappedActions(values: string[], mapping: InvestmentImportMapping): string[] {
  return values.filter((value) => mapping.activityMap[value] === undefined);
}
