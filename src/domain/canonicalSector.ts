/**
 * Canonical cross-market sector taxonomy (plan 070).
 *
 * The portfolio stores two *incompatible* raw sector taxonomies:
 * - TW stocks → `sector` holds a TWSE 產業別 numeric code (≈39 industries).
 * - US / international (and yfinance ETF data, plan 071) → a Yahoo GICS-ish name.
 *
 * To draw one coherent cross-market sector chart we collapse BOTH onto a single
 * canonical taxonomy = the **GICS 11 sectors** (the international standard, and
 * exactly what Yahoo/yfinance already emit, so US + ETF data need no remap). The
 * fine source detail is kept in `industry` for a future drill-down; this module
 * only owns the coarse canonical key.
 *
 * `toCanonicalSector` is the load-bearing, finance-correctness-sensitive artifact
 * — every bucket must be explainable. The TWSE→canonical table below is exhaustive
 * and tested; the judgment-call comments are intentional and must stay reviewable.
 */

import type { NameLocalePreference } from "./assetName";

/** The 11 canonical GICS sectors + an explicit `other` catch-all. */
export type CanonicalSectorKey =
  | "technology"
  | "financials"
  | "healthcare"
  | "consumer_cyclical"
  | "consumer_defensive"
  | "industrials"
  | "energy"
  | "materials"
  | "real_estate"
  | "utilities"
  | "communication"
  | "other";

/** Canonical key → zh-TW / en display label. */
export const CANONICAL_SECTOR_LABELS: Record<CanonicalSectorKey, { zh: string; en: string }> = {
  technology: { zh: "資訊科技", en: "Technology" },
  financials: { zh: "金融", en: "Financials" },
  healthcare: { zh: "醫療保健", en: "Healthcare" },
  consumer_cyclical: { zh: "非必需消費", en: "Consumer Cyclical" },
  consumer_defensive: { zh: "必需消費", en: "Consumer Defensive" },
  industrials: { zh: "工業", en: "Industrials" },
  energy: { zh: "能源", en: "Energy" },
  materials: { zh: "原物料", en: "Materials" },
  real_estate: { zh: "房地產", en: "Real Estate" },
  utilities: { zh: "公用事業", en: "Utilities" },
  communication: { zh: "通訊服務", en: "Communication Services" },
  other: { zh: "其他", en: "Other" },
};

export const CANONICAL_SECTOR_KEYS = Object.keys(CANONICAL_SECTOR_LABELS) as CanonicalSectorKey[];

/**
 * TWSE 產業別代碼 (numeric, no zero-pad) → canonical key.
 *
 * Codes/names follow `sectorLabels.ts#TWSE_INDUSTRY`. Documented judgment calls
 * (kept inline so they stay reviewable):
 *   - 7 化學生技醫療 → healthcare (its biotech/medical weight dominates), not materials.
 *   - 12 汽車 → consumer_cyclical (autos are GICS consumer discretionary), not industrials.
 *   - 23 油電燃氣 → utilities (regulated power/gas distribution), not energy.
 * TWSE has no clean real_estate or energy code in this list — those buckets only
 * ever come from Yahoo data, which is fine.
 */
const TWSE_CODE_TO_CANONICAL: Record<string, CanonicalSectorKey> = {
  // technology (electronics / semis / computing / IT)
  "13": "technology", // 電子工業
  "24": "technology", // 半導體
  "25": "technology", // 電腦及週邊
  "26": "technology", // 光電
  "28": "technology", // 電子零組件
  "29": "technology", // 電子通路
  "30": "technology", // 資訊服務
  "31": "technology", // 其他電子
  "36": "technology", // 數位雲端
  // communication
  "27": "communication", // 通信網路
  // financials
  "17": "financials", // 金融保險
  // healthcare
  "7": "healthcare", // 化學生技醫療 — judgment call: healthcare not materials
  "22": "healthcare", // 生技醫療
  // materials
  "1": "materials", // 水泥
  "3": "materials", // 塑膠
  "8": "materials", // 玻璃陶瓷
  "9": "materials", // 造紙
  "10": "materials", // 鋼鐵
  "11": "materials", // 橡膠
  "21": "materials", // 化學工業
  // industrials
  "5": "industrials", // 電機機械
  "6": "industrials", // 電器電纜
  "14": "industrials", // 建材營造
  "15": "industrials", // 航運
  "35": "industrials", // 綠能環保
  // consumer_cyclical
  "4": "consumer_cyclical", // 紡織
  "12": "consumer_cyclical", // 汽車 — judgment call: consumer_cyclical not industrials
  "16": "consumer_cyclical", // 觀光餐旅
  "18": "consumer_cyclical", // 貿易百貨
  "32": "consumer_cyclical", // 文化創意
  "34": "consumer_cyclical", // 電子商務
  "37": "consumer_cyclical", // 運動休閒
  "38": "consumer_cyclical", // 居家生活
  // consumer_defensive
  "2": "consumer_defensive", // 食品
  "33": "consumer_defensive", // 農業科技
  // utilities
  "23": "utilities", // 油電燃氣 — judgment call: utilities not energy
  // other
  "19": "other", // 綜合
  "20": "other", // 其他業
  "80": "other", // 管理股票
};

/**
 * Yahoo / yfinance GICS sector name (free text, any case) → canonical key.
 * Keyed by the lowercased, trimmed name. Covers the Yahoo `sectorDisp` variants
 * and the snake_case keys yfinance ETF `sectorWeights` emit (plan 071), so ETF
 * slices land in the same 11 buckets as direct holdings.
 */
const GICS_NAME_TO_CANONICAL: Record<string, CanonicalSectorKey> = {
  technology: "technology",
  "information technology": "technology",
  information_technology: "technology",
  "financial services": "financials",
  financial_services: "financials",
  financials: "financials",
  financial: "financials",
  healthcare: "healthcare",
  "health care": "healthcare",
  health_care: "healthcare",
  "consumer cyclical": "consumer_cyclical",
  consumer_cyclical: "consumer_cyclical",
  "consumer discretionary": "consumer_cyclical",
  consumer_discretionary: "consumer_cyclical",
  "consumer defensive": "consumer_defensive",
  consumer_defensive: "consumer_defensive",
  "consumer staples": "consumer_defensive",
  consumer_staples: "consumer_defensive",
  industrials: "industrials",
  industrial: "industrials",
  energy: "energy",
  "basic materials": "materials",
  basic_materials: "materials",
  materials: "materials",
  "real estate": "real_estate",
  real_estate: "real_estate",
  realestate: "real_estate",
  utilities: "utilities",
  "communication services": "communication",
  communication_services: "communication",
  communication: "communication",
  communications: "communication",
};

/**
 * Map a raw `sector` value (a TWSE numeric code OR a Yahoo GICS name) — with the
 * fine `industry` as a secondary signal — to a canonical key, or `null` when it
 * can't be classified (so callers can fall back to a 未知 bucket rather than
 * silently mislabel). A value already equal to a canonical key passes through.
 */
export function toCanonicalSector(input: {
  sector?: string | null;
  industry?: string | null;
}): CanonicalSectorKey | null {
  const fromValue = (raw: string | null | undefined): CanonicalSectorKey | null => {
    const value = (raw ?? "").trim();
    if (!value) return null;
    // Already a canonical key (e.g. re-deriving a stored value).
    if ((CANONICAL_SECTOR_LABELS as Record<string, unknown>)[value]) {
      return value as CanonicalSectorKey;
    }
    // TWSE numeric industry code (pure digits, optionally zero-padded).
    if (/^\d{1,3}$/.test(value)) {
      return TWSE_CODE_TO_CANONICAL[String(Number(value))] ?? null;
    }
    // Yahoo / yfinance GICS name.
    return GICS_NAME_TO_CANONICAL[value.toLowerCase()] ?? null;
  };
  // `sector` carries the taxonomy; `industry` is a backstop for odd rows where
  // only the fine value was stored.
  return fromValue(input.sector) ?? fromValue(input.industry);
}

/** Canonical key → localized label. Unknown keys pass through unchanged. */
export function resolveCanonicalSectorLabel(
  key: CanonicalSectorKey | string | null | undefined,
  preference: NameLocalePreference = "auto",
  runtimeLocale: string = typeof navigator !== "undefined" ? navigator.language : "en",
): string | null {
  const value = (key ?? "").trim();
  if (!value) return null;
  const entry = (CANONICAL_SECTOR_LABELS as Record<string, { zh: string; en: string }>)[value];
  if (!entry) return value;
  const zh =
    preference === "zh-Hant"
      ? true
      : preference === "en"
        ? false
        : (runtimeLocale || "").toLowerCase().startsWith("zh");
  return zh ? entry.zh : entry.en;
}
