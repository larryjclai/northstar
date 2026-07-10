import type { AppSettings, DailyFxRate } from "./types";

/**
 * Pre-bucketed, per-pair-sorted view of a daily-FX array. Built once by
 * `createFxConverter` (or `buildDailyRateIndex`) so per-conversion lookups can
 * binary-search a single pair's rows instead of linear-scanning the whole
 * array. Keyed by `${from}→${to}`; each list is sorted ascending by date.
 */
export type DailyRateIndex = Map<string, DailyFxRate[]>;

export interface ConvertOptions {
  dailyRates?: DailyFxRate[];
  /**
   * Prebuilt index (see `buildDailyRateIndex`). When present it takes
   * precedence over `dailyRates` and resolves via binary search — producing
   * results bit-identical to the `dailyRates` linear scan.
   */
  dailyRateIndex?: DailyRateIndex;
  asOfDate?: string;
}

/**
 * Bucket a daily-FX array by currency pair and sort each bucket ascending by
 * date. Node's `Array.prototype.sort` is stable, so rows sharing a date keep
 * their original relative order — this is what lets the indexed lookup match
 * `pickDailyRate`'s tie-break exactly.
 */
export function buildDailyRateIndex(rates: DailyFxRate[]): DailyRateIndex {
  const ratesByPair: DailyRateIndex = new Map();
  for (const row of rates) {
    const key = `${row.from}→${row.to}`;
    const list = ratesByPair.get(key);
    if (list) list.push(row);
    else ratesByPair.set(key, [row]);
  }
  for (const list of ratesByPair.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  return ratesByPair;
}

export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  settings: AppSettings | undefined,
  options?: ConvertOptions,
): number | null {
  const source = from.toUpperCase();
  const target = to.toUpperCase();
  if (source === target) return amount;

  if (options?.asOfDate && options.dailyRateIndex) {
    const asOf = options.asOfDate.slice(0, 10);
    const daily = pickDailyRateFromIndex(options.dailyRateIndex, source, target, asOf);
    if (daily !== null) return amount * daily;
    const inverseDaily = pickDailyRateFromIndex(options.dailyRateIndex, target, source, asOf);
    if (inverseDaily !== null) return amount / inverseDaily;
  } else if (options?.dailyRates && options.dailyRates.length && options.asOfDate) {
    const asOf = options.asOfDate.slice(0, 10);
    const daily = pickDailyRate(options.dailyRates, source, target, asOf);
    if (daily !== null) return amount * daily;
    const inverseDaily = pickDailyRate(options.dailyRates, target, source, asOf);
    if (inverseDaily !== null) return amount / inverseDaily;
  }

  const rate = settings?.exchangeRates.find(
    (item) => item.from.toUpperCase() === source && item.to.toUpperCase() === target,
  );
  if (rate) return amount * rate.rate;
  const inverse = settings?.exchangeRates.find(
    (item) => item.from.toUpperCase() === target && item.to.toUpperCase() === source,
  );
  if (inverse) return amount / inverse.rate;
  return null;
}

function pickDailyRate(rates: DailyFxRate[], from: string, to: string, asOfDate: string): number | null {
  let best: DailyFxRate | null = null;
  for (const row of rates) {
    if (row.from !== from || row.to !== to) continue;
    if (row.date > asOfDate) continue;
    if (!best || row.date > best.date) best = row;
  }
  return best ? best.rate : null;
}

/**
 * Indexed equivalent of `pickDailyRate`: binary-searches the pre-sorted rows
 * for a pair for the latest date <= asOfDate. Bit-identical to `pickDailyRate`
 * — including its tie-break: when several rows share the max qualifying date,
 * the linear scan keeps the FIRST in original array order, so we walk back to
 * the first row of the max-date run (stable sort preserves that order).
 */
function pickDailyRateFromIndex(
  index: DailyRateIndex,
  from: string,
  to: string,
  asOfDate: string,
): number | null {
  const list = index.get(`${from}→${to}`);
  if (!list || list.length === 0) return null;
  let lo = 0;
  let hi = list.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid].date <= asOfDate) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  const bestDate = list[best].date;
  let i = best;
  while (i > 0 && list[i - 1].date === bestDate) i -= 1;
  return list[i].rate;
}

export function createFxConverter(
  settings: AppSettings | undefined,
  dailyRates: DailyFxRate[] | undefined,
) {
  const primary = settings?.primaryCurrency ?? "TWD";
  const rates = dailyRates ?? [];
  const dailyRateIndex = buildDailyRateIndex(rates);
  function toPrimary(amount: number, currency: string, asOfDate?: string) {
    return convertCurrency(amount, currency, primary, settings, {
      dailyRateIndex,
      asOfDate,
    }) ?? 0;
  }
  /**
   * Null-aware sibling of {@link toPrimary}: returns `null` (instead of silently
   * coercing to `0`) when no rate covers the pair, so aggregates can EXCLUDE and
   * COUNT the miss rather than understate a total. Same lookup口徑 as `toPrimary`.
   */
  function toPrimaryOrNull(amount: number, currency: string, asOfDate?: string): number | null {
    return convertCurrency(amount, currency, primary, settings, {
      dailyRateIndex,
      asOfDate,
    });
  }
  return { toPrimary, toPrimaryOrNull, primaryCurrency: primary };
}

// Module-level flag, kept in sync by `usePrivacySync` (see state/uiPreferences).
// We deliberately keep it as a plain variable rather than a hook so formatters
// can be called from any context. Components must subscribe to the zustand
// store to trigger re-renders; this flag is read at format time.
let __privacyMaskOn = false;
const MASKED_TEXT = "＊＊＊＊＊＊";
const MASKED_PERCENT = "＊＊.＊＊%";

// Typographic minus (U+2212) — same width as "+" in tabular figures, unlike
// the ASCII hyphen-minus (DESIGN.md §9). Applied to *display* strings only;
// parsing (NumberField etc.) keeps accepting ASCII input.
const MINUS = "−";

function typographicMinus(formatted: string): string {
  return formatted.replace(/-/g, MINUS);
}

export function setPrivacyMaskOn(value: boolean) {
  __privacyMaskOn = value;
}

// Locale used by the compact formatters below. Kept in sync from i18n (see
// i18n.ts) using the same module-global pattern as the privacy mask so the
// formatters stay callable from any context without a hook.
let __compactLocale: "zh-TW" | "en" = "zh-TW";

export function setCompactLocale(locale: string) {
  __compactLocale = locale.startsWith("en") ? "en" : "zh-TW";
}

/**
 * Abbreviate a large value so KPI tiles never clip, regardless of magnitude.
 * Chinese UI → 萬 / 億 (10^4 / 10^8); English UI → Intl compact (K / M / B).
 * Values below the abbreviation threshold render in full. The caller is
 * expected to expose the exact value (e.g. a `title` tooltip) alongside.
 */
export function formatCompactNumber(amount: number): string {
  if (__privacyMaskOn) return MASKED_TEXT;
  const abs = Math.abs(amount);
  const sign = amount < 0 ? MINUS : "";
  if (__compactLocale === "en") {
    if (abs < 1000) return typographicMinus(amount.toLocaleString("en", { maximumFractionDigits: 0 }));
    return typographicMinus(amount.toLocaleString("en", { notation: "compact", maximumFractionDigits: 2 }));
  }
  // zh-TW: switch to 萬 (10^4) then 億 (10^8).
  if (abs < 10_000) return typographicMinus(amount.toLocaleString("zh-TW", { maximumFractionDigits: 0 }));
  if (abs < 100_000_000) return `${sign}${trimUnit(abs / 10_000)}萬`;
  return `${sign}${trimUnit(abs / 100_000_000)}億`;
}

export function formatCompactMoney(amount: number, currency: string): string {
  if (__privacyMaskOn) return `${currency} ${MASKED_TEXT}`;
  return `${currency} ${formatCompactNumber(amount)}`;
}

// Keep up to two decimals but drop trailing zeros so "1485萬" not "1485.00萬"
// and "1.49億" reads cleanly.
function trimUnit(value: number): string {
  return value.toLocaleString(__compactLocale === "en" ? "en" : "zh-TW", { maximumFractionDigits: 2 });
}

export function isPrivacyMaskOn() {
  return __privacyMaskOn;
}

export function formatMoney(amount: number, currency: string) {
  if (__privacyMaskOn) return `${currency} ${MASKED_TEXT}`;
  return `${currency} ${typographicMinus(amount.toLocaleString("zh-TW", { maximumFractionDigits: 0 }))}`;
}

export function formatNumber(amount: number, options?: Intl.NumberFormatOptions) {
  if (__privacyMaskOn) return MASKED_TEXT;
  return typographicMinus(amount.toLocaleString("zh-TW", { maximumFractionDigits: 0, ...options }));
}

export function formatSignedMoney(amount: number, currency: string) {
  if (__privacyMaskOn) return `${currency} ${MASKED_TEXT}`;
  const sign = amount < 0 ? MINUS : "+";
  return `${sign}${currency} ${Math.abs(amount).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number, fractionDigits = 2) {
  if (__privacyMaskOn) return MASKED_PERCENT;
  return typographicMinus(`${(value * 100).toFixed(fractionDigits)}%`);
}

export function formatQuantity(amount: number) {
  if (__privacyMaskOn) return MASKED_TEXT;
  if (Number.isInteger(amount)) return typographicMinus(amount.toLocaleString("zh-TW"));
  // Up to 6 decimals (fractional shares / split-adjusted lots), trailing zeros
  // dropped so "10" never renders as "10.000000". See B18 precision policy.
  return typographicMinus(amount.toLocaleString("zh-TW", { maximumFractionDigits: 6 }));
}

export function formatPrice(value: number, fractionDigits?: number) {
  if (__privacyMaskOn) return MASKED_TEXT;
  // Default: 2–6 decimals. US fractional-share prices can carry up to 6
  // meaningful digits; normal prices still read as "100.00" because trailing
  // zeros beyond the 2-decimal minimum are dropped. Pass an explicit count to
  // pin a fixed number of decimals. See B18 precision policy.
  if (fractionDigits === undefined) {
    return typographicMinus(value.toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 6 }));
  }
  return typographicMinus(value.toLocaleString("zh-TW", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }));
}
