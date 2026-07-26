import type { NameLocalePreference } from "./assetName";

// Re-export the canonical (GICS-11) taxonomy resolution so callers have one
// sector-labels import surface for both the coarse canonical level and the fine
// TWSE/Yahoo industry level. The mapping itself lives in `canonicalSector.ts`.
export { resolveCanonicalSectorLabel, toCanonicalSector } from "./canonicalSector";

/**
 * Default bucket an ETF / fund lands in on the **sector** breakdown when no
 * per-holding sector weights are available (and no manual tag overrides it).
 * This replaces the old 「未知」 catch-all so a fund's value is attributed to an
 * explicit, explainable bucket instead of looking like missing data. The wording
 * is mirrored in the copy catalog (`investmentsAnalytics.etfBucket`) so it stays
 * editable via the copy.csv round-trip.
 */
export function etfBucketLabel(
  preference: NameLocalePreference = "auto",
  runtimeLocale: string = typeof navigator !== "undefined" ? navigator.language : "en",
): string {
  return prefersChinese(preference, runtimeLocale) ? "ETF / 基金" : "ETF / Fund";
}

/**
 * Sector / industry display labels.
 *
 * Two data sources feed `PortfolioAsset.sector` / `.industry`:
 * - TWSE/TPEx open data → a numeric **industry code** (e.g. "24"), not a name.
 * - Yahoo (US/intl) → an English GICS-ish name (e.g. "Technology").
 *
 * `resolveSectorLabel` localizes both at display time so existing stored codes
 * render correctly without a re-fetch, following the same locale preference as
 * `resolveAssetName`.
 */

/** TWSE/TPEx 產業別代碼 → localized name. Keyed by the numeric code (no zero pad). */
const TWSE_INDUSTRY: Record<string, { zh: string; en: string }> = {
  "1": { zh: "水泥工業", en: "Cement" },
  "2": { zh: "食品工業", en: "Food" },
  "3": { zh: "塑膠工業", en: "Plastics" },
  "4": { zh: "紡織纖維", en: "Textiles" },
  "5": { zh: "電機機械", en: "Electric Machinery" },
  "6": { zh: "電器電纜", en: "Electrical & Cable" },
  "7": { zh: "化學生技醫療", en: "Chemical / Biotech & Medical" },
  "8": { zh: "玻璃陶瓷", en: "Glass & Ceramics" },
  "9": { zh: "造紙工業", en: "Paper & Pulp" },
  "10": { zh: "鋼鐵工業", en: "Iron & Steel" },
  "11": { zh: "橡膠工業", en: "Rubber" },
  "12": { zh: "汽車工業", en: "Automobile" },
  "13": { zh: "電子工業", en: "Electronics" },
  "14": { zh: "建材營造", en: "Building Material & Construction" },
  "15": { zh: "航運業", en: "Shipping & Transportation" },
  "16": { zh: "觀光餐旅", en: "Tourism & Hospitality" },
  "17": { zh: "金融保險業", en: "Finance & Insurance" },
  "18": { zh: "貿易百貨", en: "Trading & Consumer Goods" },
  "19": { zh: "綜合", en: "Conglomerate" },
  "20": { zh: "其他業", en: "Other" },
  "21": { zh: "化學工業", en: "Chemical" },
  "22": { zh: "生技醫療業", en: "Biotech & Medical Care" },
  "23": { zh: "油電燃氣業", en: "Oil, Gas & Electricity" },
  "24": { zh: "半導體業", en: "Semiconductor" },
  "25": { zh: "電腦及週邊設備業", en: "Computer & Peripheral Equipment" },
  "26": { zh: "光電業", en: "Optoelectronics" },
  "27": { zh: "通信網路業", en: "Communications & Internet" },
  "28": { zh: "電子零組件業", en: "Electronic Components" },
  "29": { zh: "電子通路業", en: "Electronic Products Distribution" },
  "30": { zh: "資訊服務業", en: "Information Service" },
  "31": { zh: "其他電子業", en: "Other Electronics" },
  "32": { zh: "文化創意業", en: "Cultural & Creative" },
  "33": { zh: "農業科技業", en: "Agricultural Technology" },
  "34": { zh: "電子商務", en: "E-commerce" },
  "35": { zh: "綠能環保", en: "Green Energy & Environmental" },
  "36": { zh: "數位雲端", en: "Digital & Cloud" },
  "37": { zh: "運動休閒", en: "Sports & Leisure" },
  "38": { zh: "居家生活", en: "Home & Living" },
  "80": { zh: "管理股票", en: "Managed Stocks" },
};

/** English GICS sector (from Yahoo) → Chinese, for zh-locale display of US/intl stocks. */
const GICS_SECTOR_ZH: Record<string, string> = {
  technology: "資訊科技",
  "information technology": "資訊科技",
  "financial services": "金融服務",
  financials: "金融",
  healthcare: "醫療保健",
  "health care": "醫療保健",
  "consumer cyclical": "非必需消費",
  "consumer discretionary": "非必需消費",
  "consumer defensive": "必需消費",
  "consumer staples": "必需消費",
  "communication services": "通訊服務",
  energy: "能源",
  industrials: "工業",
  "basic materials": "原物料",
  materials: "原物料",
  "real estate": "房地產",
  utilities: "公用事業",
};

function prefersChinese(preference: NameLocalePreference, runtimeLocale: string): boolean {
  if (preference === "zh-Hant") return true;
  if (preference === "en") return false;
  return (runtimeLocale || "").toLowerCase().startsWith("zh");
}

/**
 * Localize a raw sector/industry value. TWSE numeric codes map to the
 * code table; English names map to Chinese under a zh locale (and pass through
 * under en). Unknown values pass through unchanged.
 */
export function resolveSectorLabel(
  raw: string | null | undefined,
  preference: NameLocalePreference = "auto",
  runtimeLocale: string = typeof navigator !== "undefined" ? navigator.language : "en",
): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const zh = prefersChinese(preference, runtimeLocale);

  // TWSE/TPEx industry code (pure digits, optionally zero-padded).
  if (/^\d{1,3}$/.test(value)) {
    const entry = TWSE_INDUSTRY[String(Number(value))];
    if (entry) return zh ? entry.zh : entry.en;
    return value; // unknown code → show as-is rather than hide it
  }

  // English sector name → Chinese under a zh locale.
  if (zh) {
    const mapped = GICS_SECTOR_ZH[value.toLowerCase()];
    if (mapped) return mapped;
  }
  return value;
}
