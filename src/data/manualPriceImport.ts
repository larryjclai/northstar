import type { ImportPreview } from "./csv";
import type { ManualPriceSnapshotDraft } from "./repositories";
import { DATE_FORMAT_LABELS, parseImportDate, type DateFormat } from "./investmentImport";

// ─────── Field model ───────
//
// Manual-price import is much simpler than the investment-activity import: every
// row is a (date, price[, note]) point logged against ONE target custom asset.
// The pure layer below mirrors investmentImport.ts (auto-detect → mapping →
// drafts) while the wizard UI lives in ManualPriceImportWizard.tsx.

export const MANUAL_PRICE_FIELDS = ["date", "price", "note"] as const;
export type ManualPriceField = (typeof MANUAL_PRICE_FIELDS)[number];

/** Fields that must be mapped for a row to be importable. */
export const MANUAL_PRICE_REQUIRED_FIELDS: ManualPriceField[] = ["date", "price"];

export const MANUAL_PRICE_FIELD_LABELS: Record<ManualPriceField, string> = {
  date: "日期",
  price: "價格",
  note: "備註",
};

export { DATE_FORMAT_LABELS, type DateFormat };

export interface ManualPriceImportMapping {
  /** Target field → CSV header name. */
  fields: Partial<Record<ManualPriceField, string>>;
  dateFormat: DateFormat;
}

export function emptyManualPriceMapping(): ManualPriceImportMapping {
  return { fields: {}, dateFormat: "auto" };
}

// ─────── Auto-detection ───────

const FIELD_SYNONYMS: Record<ManualPriceField, string[]> = {
  date: ["date", "日期", "估值日", "估值日期", "報價日", "valuation date", "datetime"],
  price: ["price", "價格", "淨值", "估值", "nav", "value", "單價", "市價", "報價"],
  note: ["comment", "note", "備註", "memo", "remark", "說明", "註記"],
};

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9一-鿿]/g, "");
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

/** Guess field → header mapping from the CSV headers. */
export function autoDetectManualPriceFields(
  headers: string[],
): Partial<Record<ManualPriceField, string>> {
  const fields: Partial<Record<ManualPriceField, string>> = {};
  const used = new Set<string>();
  for (const field of MANUAL_PRICE_FIELDS) {
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

/** Which required fields are still unmapped. */
export function missingManualPriceFields(mapping: ManualPriceImportMapping): ManualPriceField[] {
  return MANUAL_PRICE_REQUIRED_FIELDS.filter((field) => !mapping.fields[field]);
}

// ─────── Apply mapping → drafts ───────

function parsePrice(raw: string): number {
  const cleaned = raw.replace(/[,\s$＄]/g, "").trim();
  if (!cleaned) throw new Error("缺少價格");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error("價格必須是數字");
  if (n <= 0) throw new Error("價格必須大於 0");
  return n;
}

/**
 * Turn raw CSV rows into ManualPriceSnapshotDraft[] for a single asset.
 * Pure — no side effects. Returns one valid entry per parseable row and an
 * invalid entry (with a zh-TW reason) for each rejected row.
 */
export function applyManualPriceMapping(
  rows: Record<string, string>[],
  mapping: ManualPriceImportMapping,
  assetId: string,
): ImportPreview<ManualPriceSnapshotDraft> {
  const preview: ImportPreview<ManualPriceSnapshotDraft> = { valid: [], invalid: [] };
  const get = (row: Record<string, string>, field: ManualPriceField): string => {
    const header = mapping.fields[field];
    return header ? (row[header] ?? "").trim() : "";
  };

  rows.forEach((row, index) => {
    const rowNum = index + 2; // 1-based + header row
    try {
      const date = parseImportDate(get(row, "date"), mapping.dateFormat);
      const price = parsePrice(get(row, "price"));
      const note = get(row, "note");
      preview.valid.push({ row: rowNum, value: { assetId, date, price, note } });
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
