import type { NameLocalePreference } from "./assetName";

/**
 * Country / region of a *direct* holding, derived **locally — no fetch**.
 *
 * A direct stock/fund's listing country is implied by its ticker's market
 * suffix (`.TW` → Taiwan, `.T` → Japan, `.HK` → Hong Kong, …). US tickers carry
 * no suffix, so a suffix-less symbol made of letters defaults to the US; the
 * holding's currency is used only as a tiebreak when the symbol alone is
 * ambiguous (e.g. a bare numeric ticker, or a no-suffix symbol priced in a
 * non-USD currency).
 *
 * This is the zero-dependency half of plan 068's two-dimension breakdown: every
 * direct holding gets a country with no external data source. ETFs span many
 * countries and are handled by the analytics layer's 「ETF / 基金」 bucket (or a
 * manual tag / fetched weights), never by this map.
 *
 * Returned codes are ISO-3166 alpha-2 (`TW`, `US`, `JP`, …). `null` means the
 * country could not be determined; callers attribute those to an explicit
 * 「未知地區」 bucket rather than guessing.
 */

/** ISO alpha-2 → localized display name. Only the markets we actually map. */
const COUNTRY_LABELS: Record<string, { zh: string; en: string }> = {
  TW: { zh: "台灣", en: "Taiwan" },
  US: { zh: "美國", en: "United States" },
  JP: { zh: "日本", en: "Japan" },
  HK: { zh: "香港", en: "Hong Kong" },
  CN: { zh: "中國", en: "China" },
  GB: { zh: "英國", en: "United Kingdom" },
  KR: { zh: "南韓", en: "South Korea" },
  SG: { zh: "新加坡", en: "Singapore" },
  DE: { zh: "德國", en: "Germany" },
  FR: { zh: "法國", en: "France" },
  CA: { zh: "加拿大", en: "Canada" },
  AU: { zh: "澳洲", en: "Australia" },
  IN: { zh: "印度", en: "India" },
  NL: { zh: "荷蘭", en: "Netherlands" },
  CH: { zh: "瑞士", en: "Switzerland" },
};

/**
 * Ticker market suffix (after the final dot) → ISO alpha-2.
 * Keys are upper-cased, dot-stripped (e.g. "TW" matches `2330.TW`).
 */
const SUFFIX_COUNTRY: Record<string, string> = {
  TW: "TW", // 上市
  TWO: "TW", // 上櫃
  T: "JP", // Tokyo
  HK: "HK", // Hong Kong
  L: "GB", // London
  SS: "CN", // Shanghai
  SZ: "CN", // Shenzhen
  KS: "KR", // KOSPI
  KQ: "KR", // KOSDAQ
  SI: "SG", // Singapore
  DE: "DE", // XETRA
  F: "DE", // Frankfurt
  PA: "FR", // Paris
  TO: "CA", // Toronto
  V: "CA", // TSX Venture
  AX: "AU", // Australia
  NS: "IN", // NSE
  BO: "IN", // BSE
  AS: "NL", // Amsterdam
  SW: "CH", // Swiss
};

/** Currency → ISO alpha-2, used only as a tiebreak when the symbol is ambiguous. */
const CURRENCY_COUNTRY: Record<string, string> = {
  TWD: "TW",
  USD: "US",
  JPY: "JP",
  HKD: "HK",
  CNY: "CN",
  GBP: "GB",
  KRW: "KR",
  SGD: "SG",
  EUR: "DE", // ambiguous across the eurozone; not used unless symbol is bare
  CAD: "CA",
  AUD: "AU",
  INR: "IN",
  CHF: "CH",
};

/**
 * Derive the listing country (ISO alpha-2) of a *direct* holding from its ticker
 * and (as a tiebreak) currency. Returns `null` when undeterminable.
 */
export function resolveHoldingCountry(ticker: string, currency?: string | null): string | null {
  const normalized = (ticker ?? "").trim().toUpperCase();
  const code = (currency ?? "").trim().toUpperCase();
  const currencyCountry = code ? (CURRENCY_COUNTRY[code] ?? null) : null;

  if (!normalized) return currencyCountry;

  const dot = normalized.lastIndexOf(".");
  let base = normalized;
  if (dot >= 0) {
    const suffix = normalized.slice(dot + 1);
    const bySuffix = SUFFIX_COUNTRY[suffix];
    if (bySuffix) return bySuffix;
    // A single-letter unknown suffix is a US class-share marker (e.g. BRK.B) —
    // strip it and classify on the base symbol. A multi-character unknown suffix
    // is an exchange we don't map → fall back to currency rather than guessing.
    if (suffix.length === 1) base = normalized.slice(0, dot);
    else return currencyCountry;
  }

  // A bare numeric ticker is ambiguous (.TW/.TWO/.HK all use digits) — lean on
  // currency. A letters-led symbol is a US listing by convention, unless the
  // currency clearly says otherwise.
  if (/^\d+$/.test(base)) return currencyCountry;
  if (/^[A-Z][A-Z0-9-]*$/.test(base)) {
    if (currencyCountry && currencyCountry !== "US") return currencyCountry;
    return "US";
  }
  return currencyCountry;
}

function prefersChinese(preference: NameLocalePreference, runtimeLocale: string): boolean {
  if (preference === "zh-Hant") return true;
  if (preference === "en") return false;
  return (runtimeLocale || "").toLowerCase().startsWith("zh");
}

/**
 * Localized display name for an ISO alpha-2 country code. Unknown/`null` codes
 * render as the 「未知地區」 / "Unknown" placeholder so a holding is never dropped.
 */
export function resolveCountryLabel(
  code: string | null | undefined,
  preference: NameLocalePreference = "auto",
  runtimeLocale: string = typeof navigator !== "undefined" ? navigator.language : "en",
): string {
  const zh = prefersChinese(preference, runtimeLocale);
  const value = (code ?? "").trim().toUpperCase();
  const entry = value ? COUNTRY_LABELS[value] : undefined;
  if (entry) return zh ? entry.zh : entry.en;
  return zh ? "未知地區" : "Unknown";
}
