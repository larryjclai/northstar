import type { InvestmentAction } from "../domain";
import type { Account } from "../domain/types";
import type { ImportPreview } from "./csv";
import type { InvestmentDraft, LedgerDraft } from "./repositories";

// ─────── Field model ───────

export const INVESTMENT_FIELDS = [
  "date",
  "action",
  "ticker",
  "name",
  "quantity",
  "price",
  "fee",
  "currency",
  "note",
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
  "buy",
  "sell",
  "cashDividend",
  "stockDividend",
  "capitalReduction",
  "stockSplit",
];
export const DEPOSIT_ACTION = "deposit";
export const WITHDRAW_ACTION = "withdraw";
export type ImportActivity = InvestmentAction | typeof DEPOSIT_ACTION | typeof WITHDRAW_ACTION;
export const IMPORT_ACTION_VALUES: ImportActivity[] = [
  ...ACTION_VALUES,
  DEPOSIT_ACTION,
  WITHDRAW_ACTION,
];

export const ACTION_LABELS: Record<InvestmentAction, string> = {
  buy: "買進",
  sell: "賣出",
  cashDividend: "現金股利",
  stockDividend: "股票股利",
  capitalReduction: "減資",
  stockSplit: "股票分割",
};
export const IMPORT_ACTION_LABELS: Record<ImportActivity, string> = {
  ...ACTION_LABELS,
  [DEPOSIT_ACTION]: "入金",
  [WITHDRAW_ACTION]: "出金",
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
  activityMap: Record<string, ImportActivity | "ignore">;
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
  action: [
    "activityType",
    "action",
    "type",
    "交易類別",
    "交易種類",
    "類別",
    "活動",
    "activity",
    "side",
  ],
  ticker: ["assetSymbol", "ticker", "symbol", "代號", "股票代號", "代碼", "證券代號"],
  name: ["assetName", "name", "說明", "名稱", "描述", "description", "security", "證券名稱"],
  quantity: ["quantity", "qty", "數量", "股數", "shares", "成交數量"],
  price: ["unitPrice", "price", "價格", "成交價", "單價", "unitprice", "unit price", "成交價格"],
  fee: ["fee", "手續費", "費用", "commission", "佣金", "交易費"],
  currency: ["currency", "幣別", "貨幣", "幣種"],
  note: ["comment", "note", "備註", "memo", "remark", "註記"],
};

const ACTION_SYNONYMS: Record<string, InvestmentAction> = {
  買進: "buy",
  買: "buy",
  buy: "buy",
  購入: "buy",
  bought: "buy",
  申購: "buy",
  賣出: "sell",
  賣: "sell",
  sell: "sell",
  sold: "sell",
  贖回: "sell",
  現金股利: "cashDividend",
  股利: "cashDividend",
  配息: "cashDividend",
  dividend: "cashDividend",
  "cash dividend": "cashDividend",
  div: "cashDividend",
  股票股利: "stockDividend",
  配股: "stockDividend",
  "stock dividend": "stockDividend",
  減資: "capitalReduction",
  "capital reduction": "capitalReduction",
  股票分割: "stockSplit",
  分割: "stockSplit",
  split: "stockSplit",
};
const IMPORT_ACTION_SYNONYMS: Record<string, ImportActivity> = {
  ...ACTION_SYNONYMS,
  入金: DEPOSIT_ACTION,
  存入: DEPOSIT_ACTION,
  存款: DEPOSIT_ACTION,
  deposit: DEPOSIT_ACTION,
  "transfer in": DEPOSIT_ACTION,
  transfer_in: DEPOSIT_ACTION,
  transferin: DEPOSIT_ACTION,
  出金: WITHDRAW_ACTION,
  提款: WITHDRAW_ACTION,
  提領: WITHDRAW_ACTION,
  withdraw: WITHDRAW_ACTION,
  withdrawal: WITHDRAW_ACTION,
  "transfer out": WITHDRAW_ACTION,
  transfer_out: WITHDRAW_ACTION,
  transferout: WITHDRAW_ACTION,
};

/** Guess field → header mapping from the CSV headers. */
export function autoDetectFields(headers: string[]): Partial<Record<InvestmentField, string>> {
  const northstar = detectNorthstarActivityFields(headers);
  if (northstar) return northstar;

  const fields: Partial<Record<InvestmentField, string>> = {};
  const used = new Set<string>();
  for (const field of INVESTMENT_FIELDS) {
    const synonyms = FIELD_SYNONYMS[field];
    const candidates = headers
      .filter((header) => !used.has(header))
      .map((header) => ({ header, score: headerScore(header, synonyms) }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);
    const match = candidates[0]?.header;
    if (match) {
      fields[field] = match;
      used.add(match);
    }
  }
  return fields;
}

function detectNorthstarActivityFields(
  headers: string[],
): Partial<Record<InvestmentField, string>> | null {
  const byLower = new Map(headers.map((header) => [header.toLowerCase(), header]));
  if (!byLower.has("activitytype") || !byLower.has("assetsymbol")) return null;
  const pick = (name: string) => byLower.get(name.toLowerCase());
  return {
    date: pick("date"),
    action: pick("activityType"),
    ticker: pick("assetSymbol"),
    name: pick("assetName"),
    quantity: pick("quantity"),
    price: pick("unitPrice"),
    fee: pick("fee"),
    currency: pick("currency"),
    note: pick("comment"),
  };
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
}

function headerScore(header: string, synonyms: string[]) {
  const lower = header.toLowerCase();
  const compactHeader = compact(header);
  let best = 0;
  for (const synonym of synonyms) {
    const lowerSyn = synonym.toLowerCase();
    const compactSyn = compact(synonym);
    if (lower === lowerSyn || compactHeader === compactSyn) best = Math.max(best, 100);
    else if (lower.includes(lowerSyn) || compactHeader.includes(compactSyn))
      best = Math.max(best, 70);
    else if (lowerSyn.includes(lower) || compactSyn.includes(compactHeader))
      best = Math.max(best, 40);
  }
  return best;
}

/** Distinct non-empty values found in a column, preserving first-seen order. */
export function distinctValues(
  rows: Record<string, string>[],
  header: string | undefined,
): string[] {
  if (!header) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const value = (row[header] ?? "").trim();
    if (value && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/** Guess action mapping for the distinct values of the chosen action column. */
export function autoDetectActivityMap(values: string[]): Record<string, ImportActivity | "ignore"> {
  const map: Record<string, ImportActivity | "ignore"> = {};
  for (const value of values) {
    const lower = value.toLowerCase().trim();
    const guess = IMPORT_ACTION_SYNONYMS[value.trim()] ?? IMPORT_ACTION_SYNONYMS[lower];
    map[value] = guess ?? "ignore";
  }
  return map;
}

// ─────── Apply mapping → drafts ───────

export interface MappingContext {
  linkedAccountId: string;
  accountCurrency: string;
  accounts?: Account[];
}

export type InvestmentImportValue =
  | { kind: "investment"; draft: InvestmentDraft; label: string }
  | { kind: "cash"; draft: LedgerDraft; label: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(y: number, m: number, d: number): string {
  if (!(y >= 1900 && y <= 2999 && m >= 1 && m <= 12 && d >= 1 && d <= 31))
    throw new Error("日期格式無效");
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
  if (!Number.isNaN(ts)) {
    const d = new Date(ts);
    return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
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
): ImportPreview<InvestmentImportValue> {
  const preview: ImportPreview<InvestmentImportValue> = { valid: [], invalid: [] };
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
      const targetAccount = resolveRowAccount(row, ctx);

      const date = parseImportDate(get(row, "date"), mapping.dateFormat);
      const csvCurrency = get(row, "currency").toUpperCase();
      if (csvCurrency && csvCurrency !== targetAccount.currency.toUpperCase()) {
        throw new Error(`幣別 ${csvCurrency} 與投資帳戶 ${targetAccount.currency} 不一致`);
      }

      if (action === DEPOSIT_ACTION || action === WITHDRAW_ACTION) {
        const amountRaw = row.amount?.trim() || get(row, "price");
        const amount = Math.abs(
          parseNumber(amountRaw, action === DEPOSIT_ACTION ? "入金金額" : "出金金額"),
        );
        const signedAmount = action === DEPOSIT_ACTION ? amount : -amount;
        const label = action === DEPOSIT_ACTION ? "入金" : "出金";
        preview.valid.push({
          row: rowNum,
          value: {
            kind: "cash",
            label: `${date} ${targetAccount.name} ${label} ${targetAccount.currency} ${amount}`,
            draft: {
              accountId: targetAccount.id,
              counterAccountId: null,
              date,
              name: `投資${label}`,
              amount: signedAmount,
              currency: targetAccount.currency,
              category: "投資",
              subcategory: label,
              merchant: "",
              entryType: "transfer",
              settlementStatus: "settled",
              note: get(row, "note") || rawAction,
              groupId: null,
            },
          },
        });
        return;
      }

      const ticker = get(row, "ticker").toUpperCase();
      if (!ticker) throw new Error("缺少代號");

      const isDividend = action === "cashDividend";
      const quantity = Math.abs(parseNumber(get(row, "quantity"), "數量", isDividend));
      const mappedPrice = parseNumber(get(row, "price"), "價格", isDividend);
      const fallbackAmount = row.amount ? Math.abs(parseNumber(row.amount, "金額", true)) : 0;
      const price =
        isDividend && mappedPrice === 0 && fallbackAmount > 0 ? fallbackAmount : mappedPrice;
      const feeRaw = get(row, "fee");
      const fee = feeRaw ? Math.abs(parseNumber(feeRaw, "手續費")) : 0;

      preview.valid.push({
        row: rowNum,
        value: {
          kind: "investment",
          label: `${date} ${targetAccount.name} ${ticker} ${IMPORT_ACTION_LABELS[action]}`,
          draft: {
            ticker,
            name: get(row, "name") || ticker,
            currency: targetAccount.currency,
            linkedAccountId: targetAccount.id,
            date,
            action,
            price,
            quantity,
            fee,
            note: get(row, "note") || "",
          },
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

function resolveRowAccount(row: Record<string, string>, ctx: MappingContext) {
  const accounts =
    ctx.accounts?.filter(
      (account) => account.type === "investment" && account.deletedAt === null,
    ) ?? [];
  const rawId = row.accountId?.trim();
  const rawName = row.accountName?.trim();
  const byId = rawId ? accounts.find((account) => account.id === rawId) : null;
  if (byId) return { id: byId.id, name: byId.name, currency: byId.currency };
  const byName = rawName
    ? accounts.find((account) => account.name.trim().toLowerCase() === rawName.toLowerCase())
    : null;
  if (byName) return { id: byName.id, name: byName.name, currency: byName.currency };
  if (ctx.linkedAccountId) {
    const fallback = accounts.find((account) => account.id === ctx.linkedAccountId);
    return {
      id: ctx.linkedAccountId,
      name: fallback?.name ?? "投資帳戶",
      currency: ctx.accountCurrency,
    };
  }
  throw new Error(rawName ? `找不到投資帳戶「${rawName}」` : "缺少投資帳戶");
}

/** Which required fields are still unmapped. */
export function missingRequiredFields(mapping: InvestmentImportMapping): InvestmentField[] {
  return REQUIRED_FIELDS.filter((field) => !mapping.fields[field]);
}

/** Distinct action values that have no mapping yet (excluding explicit ignore). */
export function unmappedActions(values: string[], mapping: InvestmentImportMapping): string[] {
  return values.filter((value) => mapping.activityMap[value] === undefined);
}
